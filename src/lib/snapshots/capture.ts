import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Captura un snapshot del estado actual del portfolio.
 *
 * Lee transactions activas + precios cached y calcula:
 *   - total_value_usd:        valor actual de mercado
 *   - total_deposited_usd:    cost basis acumulado (excluye movimientos internos)
 *   - pending_harvest_usd:    harvest cobrado pero no reinvertido
 *   - realized_pnl_usd:       suma de closure.realizedPnl de filas position_closed
 *   - composition:            descomposición por tipo de posición (Hold/Staking/Lending/LP)
 *
 * Si la tabla portfolio_snapshots aún no existe (fase no aplicada),
 * devuelve { ok: false, reason: "table_missing" } sin romper.
 */

type CaptureInput = {
  client: SupabaseClient;
  portfolioId: string;
  trigger?: "manual" | "daily_cron" | "post_operation";
  notes?: string | null;
};

type CaptureResult = {
  ok: boolean;
  reason?: string;
  snapshotId?: string;
  totalValueUsd?: number;
  totalDepositedUsd?: number;
  pendingHarvestUsd?: number;
  realizedPnlUsd?: number;
};

const CAPITAL_IN = new Set(["deposit", "staking_deposit", "lp_deposit", "lending_supply"]);
const CAPITAL_OUT = new Set(["withdrawal", "staking_withdrawal", "lp_withdraw", "lending_withdraw"]);

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseObj(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function readFlag(meta: unknown, notes: string | null, key: string): string | null {
  const m = parseObj(meta);
  if (m && typeof m[key] === "string") return String(m[key]);
  const n = parseObj(notes);
  if (n && typeof n[key] === "string") return String(n[key]);
  return null;
}

function readNumber(meta: unknown, notes: string | null, key: string): number | null {
  const m = parseObj(meta);
  if (m && typeof m[key] === "number" && Number.isFinite(m[key])) return Number(m[key]);
  const n = parseObj(notes);
  if (n && typeof n[key] === "number" && Number.isFinite(n[key])) return Number(n[key]);
  return null;
}

export async function capturePortfolioSnapshot({
  client,
  portfolioId,
  trigger = "manual",
  notes = null,
}: CaptureInput): Promise<CaptureResult> {
  // 1. Leer transactions activas del portfolio
  const { data: txs, error: txError } = await client
    .from("transactions")
    .select("type, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount, spot_price, metadata, notes, position_id, position_type, protocol")
    .eq("portfolio_id", portfolioId)
    .is("deleted_at", null);

  if (txError) return { ok: false, reason: `read_error: ${txError.message}` };

  // 2. Leer precios cacheados
  const { data: pricesRows, error: priceError } = await client
    .from("cached_prices")
    .select("token_symbol, price");

  const priceMap = new Map<string, number>();
  if (!priceError && pricesRows) {
    for (const row of pricesRows as Array<{ token_symbol: string | null; price: number | string | null }>) {
      const sym = (row.token_symbol ?? "").toUpperCase();
      const price = toNumber(row.price);
      if (sym && price > 0) priceMap.set(sym, price);
    }
  }

  const spotPriceFor = (symbol: string): number => priceMap.get(symbol.toUpperCase()) ?? 0;

  // 3. Acumular balances por (positionKey, symbol), totalDeposited, pendingHarvest, realizedPnl
  const balanceByPositionSymbol = new Map<string, { symbol: string; balance: number; positionType: string }>();
  let totalDepositedUsd = 0;
  let pendingHarvestUsd = 0;
  let realizedPnlUsd = 0;
  const harvestPendingByKey = new Map<string, number>();

  for (const tx of (txs ?? []) as Array<{
    type: string | null;
    token_in_symbol: string | null;
    token_in_amount: string | number | null;
    token_out_symbol: string | null;
    token_out_amount: string | number | null;
    spot_price: string | number | null;
    metadata: unknown;
    notes: string | null;
    position_id: string | null;
    position_type: string | null;
    protocol: string | null;
  }>) {
    const txType = (tx.type ?? "").trim();
    if (!txType) continue;

    const positionId = tx.position_id ?? "";
    const positionType = (tx.position_type ?? "Hold").trim();
    const inSymbol = (tx.token_in_symbol ?? "").toUpperCase();
    const outSymbol = (tx.token_out_symbol ?? "").toUpperCase();
    const inAmount = toNumber(tx.token_in_amount);
    const outAmount = toNumber(tx.token_out_amount);
    const spotPrice = toNumber(tx.spot_price);

    const reason = readFlag(tx.metadata, tx.notes, "reason");
    const source = readFlag(tx.metadata, tx.notes, "source");
    const isInternal =
      reason === "harvest_reinvest" || source === "harvest_reinvest" ||
      reason === "rebalance_transfer" || source === "rebalance_transfer" ||
      // La salida del harvest arrastrado en un rebalance entró como rendimiento,
      // nunca como capital depositado: no debe restar al total depositado.
      reason === "rebalance_harvest_out" || source === "rebalance_harvest_out";

    // Capital in/out → ajustan balance y totalDeposited (si no es internal)
    if (CAPITAL_IN.has(txType)) {
      if (positionId && inSymbol) {
        const key = `${positionId}::${inSymbol}`;
        const cur = balanceByPositionSymbol.get(key) ?? { symbol: inSymbol, balance: 0, positionType };
        cur.balance += inAmount;
        cur.positionType = positionType;
        balanceByPositionSymbol.set(key, cur);
      }
      if (!isInternal) totalDepositedUsd += inAmount * spotPrice;
      // Si es harvest_reinvest, descuenta del pending acumulado
      if (source === "harvest_reinvest" && inSymbol && inAmount > 0) {
        const srcPositionId = readFlag(tx.metadata, tx.notes, "sourcePositionId") ?? positionId;
        const srcKey = `${srcPositionId}::${inSymbol}`;
        harvestPendingByKey.set(srcKey, (harvestPendingByKey.get(srcKey) ?? 0) - inAmount);
        // Permuta implícita dentro de la reinversión (metadata.swapLegs):
        // lo vendido sale del pending y lo comprado entra — misma semántica
        // que en get-dashboard-data.ts.
        const legsRaw = parseObj(tx.metadata)?.swapLegs;
        if (Array.isArray(legsRaw)) {
          for (const item of legsRaw) {
            const leg = (item ?? {}) as Record<string, unknown>;
            const soldSymbol = typeof leg.soldSymbol === "string" ? leg.soldSymbol.trim().toUpperCase() : "";
            const boughtSymbol = typeof leg.boughtSymbol === "string" ? leg.boughtSymbol.trim().toUpperCase() : "";
            const soldAmount = typeof leg.soldAmount === "number" && Number.isFinite(leg.soldAmount) ? leg.soldAmount : 0;
            const boughtAmount = typeof leg.boughtAmount === "number" && Number.isFinite(leg.boughtAmount) ? leg.boughtAmount : 0;
            if (!soldSymbol || !boughtSymbol || soldAmount <= 0 || boughtAmount <= 0) continue;
            const soldKey = `${srcPositionId}::${soldSymbol}`;
            const boughtKey = `${srcPositionId}::${boughtSymbol}`;
            harvestPendingByKey.set(soldKey, (harvestPendingByKey.get(soldKey) ?? 0) - soldAmount);
            harvestPendingByKey.set(boughtKey, (harvestPendingByKey.get(boughtKey) ?? 0) + boughtAmount);
          }
        }
      }
      // Rebalance deposited delta no afecta a snapshots globales (es cost basis)
      continue;
    }

    if (CAPITAL_OUT.has(txType)) {
      if (positionId && outSymbol) {
        const key = `${positionId}::${outSymbol}`;
        const cur = balanceByPositionSymbol.get(key) ?? { symbol: outSymbol, balance: 0, positionType };
        cur.balance -= outAmount;
        cur.positionType = positionType;
        balanceByPositionSymbol.set(key, cur);
      }
      if (!isInternal) totalDepositedUsd -= outAmount * spotPrice;
      // Harvest arrastrado al destino de un rebalance: sale del pending del
      // origen (su valor pasa a la posición destino) — misma semántica que
      // en get-dashboard-data.ts; sin esto se contaría doble.
      if ((reason === "rebalance_harvest_out" || source === "rebalance_harvest_out") && positionId && outSymbol && outAmount > 0) {
        const key = `${positionId}::${outSymbol}`;
        harvestPendingByKey.set(key, (harvestPendingByKey.get(key) ?? 0) - outAmount);
      }
      continue;
    }

    if (txType === "harvest") {
      pendingHarvestUsd += inAmount * spotPrice;
      if (positionId && inSymbol) {
        const key = `${positionId}::${inSymbol}`;
        harvestPendingByKey.set(key, (harvestPendingByKey.get(key) ?? 0) + inAmount);
      }
      continue;
    }

    if (txType === "position_closed") {
      const closureMeta = parseObj(tx.metadata)?.closure;
      if (closureMeta && typeof closureMeta === "object" && !Array.isArray(closureMeta)) {
        const pnl = (closureMeta as Record<string, unknown>).realizedPnl;
        if (typeof pnl === "number" && Number.isFinite(pnl)) realizedPnlUsd += pnl;
      } else {
        // Fallback al campo directo
        const pnl = readNumber(tx.metadata, tx.notes, "realizedPnl");
        if (pnl !== null) realizedPnlUsd += pnl;
      }
      continue;
    }
  }

  // 4. Calcular total_value_usd sumando balances * precio actual + ajustar pendingHarvest neto
  let totalValueUsd = 0;
  const composition: Record<string, number> = {};
  for (const entry of balanceByPositionSymbol.values()) {
    if (entry.balance <= 0) continue;
    const price = spotPriceFor(entry.symbol);
    const value = entry.balance * price;
    if (value <= 0) continue;
    totalValueUsd += value;
    const bucket = entry.positionType.includes("Lending")
      ? "Lending"
      : entry.positionType.includes("Staking")
        ? "Staking"
        : entry.positionType.includes("Liquidity") || entry.positionType.includes("Pool") || entry.positionType.includes("LP")
          ? "Liquidity Pool"
          : "Hold";
    composition[bucket] = (composition[bucket] ?? 0) + value;
  }
  // Pending harvest neto (≥ 0): suma de pendientes por símbolo a precio actual
  let netPendingHarvest = 0;
  const aggregatePendingByToken = new Map<string, number>();
  for (const [key, amount] of harvestPendingByKey.entries()) {
    const symbol = key.split("::")[1] ?? "";
    aggregatePendingByToken.set(symbol, (aggregatePendingByToken.get(symbol) ?? 0) + amount);
  }
  for (const [symbol, amount] of aggregatePendingByToken.entries()) {
    if (amount <= 0) continue;
    netPendingHarvest += amount * spotPriceFor(symbol);
  }

  // 5. Insertar snapshot
  const insert = await client.from("portfolio_snapshots").insert({
    portfolio_id: portfolioId,
    total_value_usd: Number(totalValueUsd.toFixed(2)),
    total_deposited_usd: Number(totalDepositedUsd.toFixed(2)),
    pending_harvest_usd: Number(netPendingHarvest.toFixed(2)),
    realized_pnl_usd: Number(realizedPnlUsd.toFixed(2)),
    composition,
    trigger,
    notes,
  }).select("id").maybeSingle();

  if (insert.error) {
    const msg = insert.error.message.toLowerCase();
    const tableMissing =
      msg.includes("portfolio_snapshots") &&
      (msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache"));
    return {
      ok: false,
      reason: tableMissing ? "table_missing" : `insert_error: ${insert.error.message}`,
    };
  }

  return {
    ok: true,
    snapshotId: insert.data?.id,
    totalValueUsd,
    totalDepositedUsd,
    pendingHarvestUsd: netPendingHarvest,
    realizedPnlUsd,
  };
}

/**
 * Lee snapshots de un portfolio en un rango temporal.
 * Devuelve ordenados ascendentemente por captured_at (gráficas).
 */
export async function getPortfolioSnapshots(
  client: SupabaseClient,
  portfolioId: string,
  options?: { fromDate?: string; toDate?: string; limit?: number },
): Promise<Array<{
  id: string;
  capturedAt: string;
  totalValueUsd: number;
  totalDepositedUsd: number;
  pendingHarvestUsd: number;
  realizedPnlUsd: number;
  composition: Record<string, number> | null;
  trigger: string;
}>> {
  let query = client
    .from("portfolio_snapshots")
    .select("id, captured_at, total_value_usd, total_deposited_usd, pending_harvest_usd, realized_pnl_usd, composition, trigger")
    .eq("portfolio_id", portfolioId)
    .order("captured_at", { ascending: true });

  if (options?.fromDate) query = query.gte("captured_at", options.fromDate);
  if (options?.toDate) query = query.lte("captured_at", options.toDate);
  if (options?.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as Array<{
    id: string;
    captured_at: string;
    total_value_usd: number | string | null;
    total_deposited_usd: number | string | null;
    pending_harvest_usd: number | string | null;
    realized_pnl_usd: number | string | null;
    composition: Record<string, number> | null;
    trigger: string;
  }>).map((row) => ({
    id: row.id,
    capturedAt: row.captured_at,
    totalValueUsd: toNumber(row.total_value_usd),
    totalDepositedUsd: toNumber(row.total_deposited_usd),
    pendingHarvestUsd: toNumber(row.pending_harvest_usd),
    realizedPnlUsd: toNumber(row.realized_pnl_usd),
    composition: row.composition ?? null,
    trigger: row.trigger ?? "manual",
  }));
}
