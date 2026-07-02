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
  if (!tokens.length) return NextResponse.json({ error: "La posición no tiene tokens que adoptar." }, { status: 400 });

  const mapping = TX_TYPE_BY_KIND[kind] ?? TX_TYPE_BY_KIND.wallet;
  const protocol = (body.protocol ?? "Wallet").trim() || "Wallet";
  const label = (body.label ?? "posicion").toString();
  const positionId = `${label.replace(/[^\w/.-]+/g, "-")}-${onchainId.slice(-24).replace(/[^\w-]+/g, "-")}`;

  const client = getClient();

  // Evitar adopciones duplicadas: si ya existe enlace para este onchain_id, fuera.
  const { data: existing } = await client
    .from("position_links")
    .select("id")
    .eq("portfolio_id", portfolioId)
    .eq("onchain_id", onchainId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "Esta posición ya está enlazada a la contabilidad." }, { status: 409 });
  }

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

  // Enlace con auto_ingest: desde ya, sus eventos se contabilizan solos.
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
