import { NextResponse, type NextRequest } from "next/server";
import { getViewerAccess, ensurePortfolioAccess } from "@/lib/auth/viewer-access";
import { getSupabaseServiceClient, getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * ADOPCIÓN de una posición on-chain preexistente (migración).
 *
 * Para posiciones abiertas ANTES de usar la app no hay eventos que sellen el
 * depósito inicial. El gestor indica cuánto depositó en USD y se crea la
 * posición contable con esa base (invariante: el depositado se fija aquí y no
 * se toca), repartida entre los tokens actuales en proporción a su valor.
 * A partir de ahí, la posición queda enlazada con auto_ingest y todo lo
 * siguiente (harvests, depósitos, retiradas) se contabiliza solo.
 */

type AdoptToken = { symbol: string; amount: number; valueUsd?: number | null };

function getClient() {
  return getSupabaseServiceClient() ?? getSupabaseServerClient();
}

// Tipo contable de la transacción de adopción según el tipo de posición viva.
const TX_TYPE_BY_KIND: Record<string, { txType: string; positionType: string }> = {
  liquidity: { txType: "lp_deposit", positionType: "Liquidity Pool" },
  lending_supply: { txType: "lending_supply", positionType: "Lending" },
  staking: { txType: "staking_deposit", positionType: "Staking" },
  reward: { txType: "staking_deposit", positionType: "Staking" },
  wallet: { txType: "deposit", positionType: "Hold" },
};

export async function POST(request: NextRequest) {
  let body: {
    portfolioId?: string;
    onchainId?: string;
    protocol?: string | null;
    label?: string | null;
    kind?: string;
    tokens?: AdoptToken[];
    /** Total depositado en USD que indica el gestor (la base de la posición). */
    depositedUsd?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const portfolioId = (body.portfolioId ?? "").trim();
  const onchainId = (body.onchainId ?? "").trim();
  const kind = (body.kind ?? "").trim();
  const depositedUsd = Number(body.depositedUsd);
  const tokens = (body.tokens ?? []).filter((t) => t.symbol && Number(t.amount) > 0);

  const access = await getViewerAccess();
  const check = ensurePortfolioAccess(access, portfolioId, true);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  if (!onchainId || !kind) return NextResponse.json({ error: "Faltan onchainId/kind." }, { status: 400 });
  if (!Number.isFinite(depositedUsd) || depositedUsd <= 0) {
    return NextResponse.json({ error: "Indica el depositado en USD (> 0)." }, { status: 400 });
  }

  const client = getClient();

  // EDICIÓN: si la posición ya está enlazada, el gestor corrige la base.
  const { data: linked } = await client
    .from("position_links")
    .select("id, position_id")
    .eq("portfolio_id", portfolioId)
    .eq("onchain_id", onchainId)
    .maybeSingle();
  if (linked) {
    // ¿La base viene de una ADOPCIÓN manual (no de eventos reales)? Entonces
    // el depositado corregido debe REEMPLAZAR esas filas para que fluya al
    // Total Depositado del portfolio, al % y al P&L global — como pide el
    // cliente. Si no hay filas de adopción (la base son eventos reales
    // on-chain), no reescribimos el libro: guardamos solo el override de vista.
    const { data: adoptRows } = await client
      .from("transactions")
      .select("id, token_in_symbol, token_in_amount, metadata")
      .eq("portfolio_id", portfolioId)
      .eq("position_id", linked.position_id as string)
      .is("deleted_at", null)
      .contains("metadata", { source: "onchain_adopt" });

    if (adoptRows && adoptRows.length > 0) {
      // Reparto proporcional a las cantidades ya registradas (los tokens no
      // cambian; solo se re-sella el precio de entrada implícito).
      const totalAmt = adoptRows.reduce((s, r) => s + Math.abs(Number(r.token_in_amount ?? 0)), 0);
      const nowIso = new Date().toISOString();
      const newGroup = crypto.randomUUID();
      const rows = adoptRows.map((r) => {
        const amt = Math.abs(Number(r.token_in_amount ?? 0));
        const share = totalAmt > 0 ? amt / totalAmt : 1 / adoptRows.length;
        const entryPrice = amt > 0 ? (depositedUsd * share) / amt : 0;
        return {
          portfolio_id: portfolioId,
          type: (TX_TYPE_BY_KIND[kind] ?? TX_TYPE_BY_KIND.wallet).txType,
          operation_group_id: newGroup,
          token_in_symbol: r.token_in_symbol,
          token_in_amount: amt,
          token_out_symbol: null,
          token_out_amount: null,
          spot_price: entryPrice,
          fee_amount: 0,
          notes: `Corrección de depositado (${depositedUsd.toFixed(2)}$) — base re-sellada por el gestor.`,
          transaction_date: nowIso,
          protocol: (body.protocol ?? "Wallet").trim() || "Wallet",
          position_id: linked.position_id as string,
          position_type: (TX_TYPE_BY_KIND[kind] ?? TX_TYPE_BY_KIND.wallet).positionType,
          metadata: { source: "onchain_adopt", onchainId, depositedUsd },
        };
      });
      // Soft-delete de las filas de adopción anteriores + alta de las nuevas.
      await client.from("transactions").update({ deleted_at: nowIso }).in("id", adoptRows.map((r) => r.id));
      const { error: insErr } = await client.from("transactions").insert(rows);
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    // Override de vista (mejor esfuerzo; para posiciones de eventos reales es
    // el único efecto). Si la columna no existe aún, no rompe la edición.
    await client
      .from("position_links")
      .update({ deposited_override_usd: depositedUsd })
      .eq("portfolio_id", portfolioId)
      .eq("onchain_id", onchainId)
      .then(() => undefined, () => undefined);
    return NextResponse.json({ ok: true, updated: true, depositedUsd, rewroteBase: (adoptRows?.length ?? 0) > 0 });
  }

  if (!tokens.length) return NextResponse.json({ error: "La posición no tiene tokens que adoptar." }, { status: 400 });

  const mapping = TX_TYPE_BY_KIND[kind] ?? TX_TYPE_BY_KIND.wallet;
  const protocol = (body.protocol ?? "Wallet").trim() || "Wallet";
  const label = (body.label ?? "posicion").toString();
  const positionId = `${label.replace(/[^\w/.-]+/g, "-")}-${onchainId.slice(-24).replace(/[^\w-]+/g, "-")}`;

  // Reparto del depositado entre tokens: proporcional a su valor actual
  // (o a partes iguales si no hay valores). El precio de entrada implícito
  // de cada token = su parte del depositado / cantidad.
  const totalValue = tokens.reduce((s, t) => s + Math.max(0, Number(t.valueUsd ?? 0)), 0);
  const operationGroupId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  const rows = tokens.map((t) => {
    const share = totalValue > 0 ? Math.max(0, Number(t.valueUsd ?? 0)) / totalValue : 1 / tokens.length;
    const tokenDeposited = depositedUsd * share;
    const amount = Number(t.amount);
    const entryPrice = tokenDeposited / amount;
    return {
      portfolio_id: portfolioId,
      type: mapping.txType,
      operation_group_id: operationGroupId,
      token_in_symbol: t.symbol.replace(/^-/, "").toUpperCase(),
      token_in_amount: amount,
      token_out_symbol: null,
      token_out_amount: null,
      spot_price: entryPrice,
      fee_amount: 0,
      notes: `Adopción de posición existente (${label}). Depositado indicado por el gestor: ${depositedUsd.toFixed(2)}$ — base sellada.`,
      transaction_date: nowIso,
      protocol,
      position_id: positionId,
      position_type: mapping.positionType,
      metadata: { source: "onchain_adopt", onchainId, depositedUsd },
    };
  });

  const { error: txErr } = await client.from("transactions").insert(rows);
  if (txErr) return NextResponse.json({ error: `No se pudo crear la posición: ${txErr.message}` }, { status: 500 });

  // Enlace con auto_ingest: desde ya, sus eventos se contabilizan solos. No
  // guardamos deposited_override_usd aquí: la base ya vive en las
  // transacciones de adopción (fluye al Total Depositado del portfolio), y la
  // columna override podría no existir todavía (migración phase27).
  const { error: linkErr } = await client.from("position_links").upsert(
    {
      portfolio_id: portfolioId,
      onchain_id: onchainId,
      protocol,
      position_id: positionId,
      position_type: mapping.positionType,
      auto_ingest: true,
    },
    { onConflict: "portfolio_id,onchain_id" },
  );
  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, positionId, rows: rows.length });
}
