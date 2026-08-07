import { NextResponse, type NextRequest } from "next/server";
import { getViewerAccess, ensurePortfolioAccess } from "@/lib/auth/viewer-access";
import { getSupabaseServiceClient, getSupabaseServerClient } from "@/lib/supabase/server";
import { validateCsrf } from "@/lib/security/csrf";

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
type AdoptRange = { lower?: number | null; upper?: number | null; current?: number | null } | null;

// Stablecoins (~$1): al sellar la base de una adopción se anclan a su valor de
// mercado en vez de repartirles una parte del depositado, que les inventaba un
// precio unitario (p.ej. USDC@1,35) y generaba pérdidas/ganancias FICTICIAS en
// permutas stable→stable por FIFO. El ajuste del depositado va a las volátiles.
const STABLE_SYMBOLS = new Set([
  "USDC", "USDT", "USDS", "DAI", "PYUSD", "EURC", "USDE", "SUSDE", "FDUSD",
  "TUSD", "GUSD", "USDP", "SUSD", "CRVUSD", "GHO", "LUSD", "FRAX", "USDG",
  "USDbC", "USDC.E", "AUSD", "RLUSD",
].map((s) => s.toUpperCase()));

/**
 * metadata.lp para las filas lp_deposit de la adopción. El trigger
 * validate_transaction_integrity la exige (tokenA/B, rango > 0, ratio > 0):
 * sin ella el INSERT falla y la adopción de pools era imposible. Se usa el
 * rango real leído on-chain; si la posición no expone rango (correlacionada,
 * full-range), se sintetiza uno amplio alrededor del ratio y se marca
 * isCorrelated para que la UI no pinte una barra de rango falsa.
 */
function buildAdoptLpMetadata(tokens: AdoptToken[], label: string, range: AdoptRange): Record<string, unknown> {
  // Par del label ("WETH/cbBTC 0.01%" → WETH, CBBTC) como respaldo: la
  // posición puede estar 100% en un solo token (fuera de rango) y el trigger
  // exige ambos símbolos.
  const pair = label
    .split(/[/+·]/)
    .map((s) => s.trim().split(/\s+/)[0]?.toUpperCase())
    .filter((s): s is string => Boolean(s));
  const tokenA = tokens[0]?.symbol.replace(/^-/, "").toUpperCase() || pair[0] || "TOKENA";
  const tokenB =
    tokens[1]?.symbol.replace(/^-/, "").toUpperCase() ||
    pair.find((s) => s !== tokenA) ||
    tokenA;

  const amountA = Number(tokens[0]?.amount ?? 0);
  const amountB = Number(tokens[1]?.amount ?? 0);
  const current = Number(range?.current ?? 0);
  const entryPriceRatio =
    amountA > 0 && amountB > 0 ? amountB / amountA : current > 0 ? current : 1;

  const lower = Number(range?.lower ?? 0);
  const upper = Number(range?.upper ?? 0);
  const hasRange = lower > 0 && upper > lower;
  return {
    lp: {
      tokenA,
      tokenB,
      rangeLower: hasRange ? lower : entryPriceRatio / 1e6,
      rangeUpper: hasRange ? upper : entryPriceRatio * 1e6,
      entryPriceRatio,
      isCorrelated: !hasRange,
    },
  };
}

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
  const csrfCheck = validateCsrf(request);
  if (!csrfCheck.ok) return NextResponse.json({ error: csrfCheck.error }, { status: csrfCheck.status });

  let body: {
    portfolioId?: string;
    onchainId?: string;
    protocol?: string | null;
    label?: string | null;
    kind?: string;
    tokens?: AdoptToken[];
    /** Rango on-chain de la posición (pools concentrados) para metadata.lp. */
    range?: AdoptRange;
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
  // Solo patas de ACTIVO: la deuda de lending llega con valueUsd negativo y
  // NO forma parte de la base depositada (su pata saldría a precio 0 y el
  // check spot_price_positive de la BD rechazaría el alta entera).
  const tokens = (body.tokens ?? []).filter(
    (t) => t.symbol && Number(t.amount) > 0 && !(t.valueUsd != null && Number(t.valueUsd) <= 0),
  );

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
      .select("id, token_in_symbol, token_in_amount, spot_price, transaction_date, metadata")
      .eq("portfolio_id", portfolioId)
      .eq("position_id", linked.position_id as string)
      .is("deleted_at", null)
      .contains("metadata", { source: "onchain_adopt" });

    if (adoptRows && adoptRows.length > 0) {
      // Reparto proporcional al VALOR original de cada fila (amount × precio
      // sellado), no a la cantidad: repartir por cantidad mezclaría unidades
      // de tokens distintos (0.2 WETH vs 1.000 USDC) y corrompería la base.
      // Igual que en el alta: las stablecoins se anclan a la par ($1) y el
      // ajuste del depositado va a las volátiles, para no re-inventar precios
      // de stables (que corromperían el FIFO en permutas stable→stable).
      const rowStable = (r: { token_in_symbol: unknown }) =>
        STABLE_SYMBOLS.has(String(r.token_in_symbol ?? "").replace(/^-/, "").toUpperCase());
      const rowValue = (r: { token_in_amount: unknown; spot_price: unknown }) =>
        Math.abs(Number(r.token_in_amount ?? 0)) * Math.max(0, Number(r.spot_price ?? 0));
      const stableBaseUsd = adoptRows
        .filter(rowStable)
        .reduce((s, r) => s + Math.abs(Number(r.token_in_amount ?? 0)), 0); // a la par
      const volatileRows = adoptRows.filter((r) => !rowStable(r));
      const volatileValue = volatileRows.reduce((s, r) => s + rowValue(r), 0);
      const volatileBaseUsd = Math.max(0, depositedUsd - stableBaseUsd);
      const nowIso = new Date().toISOString();
      const newGroup = crypto.randomUUID();
      const rows = adoptRows.map((r) => {
        const amt = Math.abs(Number(r.token_in_amount ?? 0));
        let entryPrice = 0;
        if (amt <= 0) entryPrice = 0;
        else if (rowStable(r)) entryPrice = 1; // stablecoin a la par
        else if (volatileValue > 0 && volatileBaseUsd > 0) entryPrice = (volatileBaseUsd * (rowValue(r) / volatileValue)) / amt;
        else entryPrice = (depositedUsd / adoptRows.length) / amt; // último recurso
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
          // La fecha de adquisición FIFO original se conserva: re-sellar la
          // base no convierte los lotes en "recién comprados".
          transaction_date: (r.transaction_date as string) ?? nowIso,
          protocol: (body.protocol ?? "Wallet").trim() || "Wallet",
          position_id: linked.position_id as string,
          position_type: (TX_TYPE_BY_KIND[kind] ?? TX_TYPE_BY_KIND.wallet).positionType,
          // Conserva metadata.lp (obligatoria en lp_deposit) y demás claves.
          // replacesTransactionIds: ids de las filas de adopción que esta
          // corrección soft-borró. El undo de la corrección las revive — sin
          // esto, deshacer borraba las nuevas y dejaba la posición con base 0.
          metadata: {
            ...((r.metadata as Record<string, unknown>) ?? {}),
            source: "onchain_adopt",
            onchainId,
            depositedUsd,
            replacesTransactionIds: adoptRows.map((a) => a.id),
          },
        };
      });
      // Soft-delete de las filas de adopción anteriores + alta de las nuevas.
      await client.from("transactions").update({ deleted_at: nowIso }).in("id", adoptRows.map((r) => r.id));
      const { error: insErr } = await client.from("transactions").insert(rows);
      if (insErr) {
        // Restaurar las filas anteriores: la base no puede quedar en cero.
        await client.from("transactions").update({ deleted_at: null }).in("id", adoptRows.map((r) => r.id));
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
    }

    // Override de vista (mejor esfuerzo; para posiciones de eventos reales es
    // el único efecto). set_at (phase28) ancla el override en el tiempo: los
    // flujos posteriores se le suman en el dashboard en vez de quedar
    // congelado. Si esa columna no existe aún, reintenta solo con el valor.
    const overrideUpdate = await client
      .from("position_links")
      .update({ deposited_override_usd: depositedUsd, deposited_override_set_at: new Date().toISOString() })
      .eq("portfolio_id", portfolioId)
      .eq("onchain_id", onchainId)
      .then((r) => r, () => ({ error: { message: "unreachable" } }));
    if (overrideUpdate.error) {
      await client
        .from("position_links")
        .update({ deposited_override_usd: depositedUsd })
        .eq("portfolio_id", portfolioId)
        .eq("onchain_id", onchainId)
        .then(() => undefined, () => undefined);
    }
    return NextResponse.json({ ok: true, updated: true, depositedUsd, rewroteBase: (adoptRows?.length ?? 0) > 0 });
  }

  if (!tokens.length) return NextResponse.json({ error: "La posición no tiene tokens que adoptar." }, { status: 400 });

  const mapping = TX_TYPE_BY_KIND[kind] ?? TX_TYPE_BY_KIND.wallet;
  const protocol = (body.protocol ?? "Wallet").trim() || "Wallet";
  const label = (body.label ?? "posicion").toString();
  const positionId = `${label.replace(/[^\w/.-]+/g, "-")}-${onchainId.slice(-24).replace(/[^\w-]+/g, "-")}`;

  // Reparto del depositado entre tokens. Las STABLECOINS se anclan a su FMV
  // de mercado (~$1): repartir el depositado por valor actual les inventaba
  // un precio unitario (p.ej. USDC@1,35) que luego generaba pérdidas/ganancias
  // FICTICIAS en permutas stable→stable por FIFO. El ajuste del depositado
  // (deposited vs valor actual) se concentra en las patas VOLÁTILES, donde un
  // precio de entrada medio distinto del de mercado sí es defendible.
  const operationGroupId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const fmv = (t: { amount: number; valueUsd?: number | null }) => {
    const a = Number(t.amount);
    const v = Number(t.valueUsd ?? 0);
    return a > 0 && v > 0 ? v / a : 0;
  };
  const isStable = (t: { symbol: string }) => STABLE_SYMBOLS.has(t.symbol.replace(/^-/, "").toUpperCase());
  const stableBaseUsd = tokens.filter(isStable).reduce((s, t) => s + fmv(t) * Number(t.amount), 0);
  const volatileTokens = tokens.filter((t) => !isStable(t));
  const volatileValue = volatileTokens.reduce((s, t) => s + Math.max(0, Number(t.valueUsd ?? 0)), 0);
  // Lo que queda del depositado tras cubrir las stablecoins a la par → volátiles.
  const volatileBaseUsd = Math.max(0, depositedUsd - stableBaseUsd);
  const totalValue = tokens.reduce((s, t) => s + Math.max(0, Number(t.valueUsd ?? 0)), 0);

  // Las filas lp_deposit necesitan metadata.lp (el trigger de integridad la
  // exige); sin ella la adopción de pools fallaba con 500 siempre.
  const lpMeta = mapping.txType === "lp_deposit" ? buildAdoptLpMetadata(tokens, label, body.range ?? null) : {};

  const rows = tokens.flatMap((t) => {
    const amount = Number(t.amount);
    let entryPrice: number;
    if (isStable(t)) {
      // Ancla al precio de mercado (~$1); si no hay FMV, $1 por defecto.
      entryPrice = fmv(t) || 1;
    } else if (volatileValue > 0 && volatileBaseUsd > 0) {
      // Base restante repartida entre volátiles por su valor actual.
      const share = Math.max(0, Number(t.valueUsd ?? 0)) / volatileValue;
      entryPrice = (volatileBaseUsd * share) / amount;
    } else if (totalValue > 0) {
      // Sin base para volátiles (deposited ≤ valor de stables): FMV real.
      entryPrice = fmv(t);
    } else {
      // Sin valores conocidos: reparto a partes iguales (último recurso).
      entryPrice = (depositedUsd / tokens.length) / amount;
    }
    // Pata sin valor dentro de una cesta con valores (share 0): fuera — una
    // fila a precio 0 viola el check de integridad y tumbaría el alta entera.
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) return [];
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
      metadata: { ...lpMeta, source: "onchain_adopt", onchainId, depositedUsd },
    };
  });

  if (!rows.length) {
    return NextResponse.json(
      { error: "La lectura on-chain no trae valor de los tokens todavía — pulsa Actualizar y reinténtalo." },
      { status: 400 },
    );
  }
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
