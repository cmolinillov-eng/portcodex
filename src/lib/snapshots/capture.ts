import type { SupabaseClient } from "@supabase/supabase-js";
import { computePortfolioValuation, type ValuationTx } from "@/lib/portfolio/valuation";

/**
 * Captura un snapshot del estado actual del portfolio.
 *
 * Valor/depositado/pendiente/composición salen del MOTOR CANÓNICO
 * (lib/portfolio/valuation) — el mismo que alimenta la cabecera del dashboard,
 * para que la curva de evolución y el total del header nunca divergan. Aquí
 * solo se añade realized_pnl (de las filas position_closed) y se persiste.
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

  // 3. Valor/depositado/pendiente/composición del MOTOR CANÓNICO (misma
  //    fuente que la cabecera del dashboard → la curva nunca diverge).
  const valuation = computePortfolioValuation((txs ?? []) as ValuationTx[], spotPriceFor);
  const totalValueUsd = valuation.totalValueUsd;
  const totalDepositedUsd = valuation.totalDepositedUsd;
  const netPendingHarvest = valuation.pendingHarvestUsd;
  const composition = valuation.composition;

  // 4. Realized P&L: suma de closure.realizedPnl de las filas position_closed
  //    (histórico, no estado actual → fuera del motor de valoración).
  let realizedPnlUsd = 0;
  for (const tx of (txs ?? []) as Array<{ type: string | null; metadata: unknown; notes: string | null }>) {
    if ((tx.type ?? "").trim() !== "position_closed") continue;
    const closureMeta = parseObj(tx.metadata)?.closure;
    if (closureMeta && typeof closureMeta === "object" && !Array.isArray(closureMeta)) {
      const pnl = (closureMeta as Record<string, unknown>).realizedPnl;
      if (typeof pnl === "number" && Number.isFinite(pnl)) realizedPnlUsd += pnl;
    } else {
      const pnl = readNumber(tx.metadata, tx.notes, "realizedPnl");
      if (pnl !== null) realizedPnlUsd += pnl;
    }
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
