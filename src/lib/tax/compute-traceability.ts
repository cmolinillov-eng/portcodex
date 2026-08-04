import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { categorizeTransactionsSequence } from "@/lib/tax/categorize";
import { getWalletProtocolMetaSync, preloadWalletCatalog } from "@/lib/tax/wallet-classification";
import { fetchCurrentEurRate, fetchEurRatesByDate } from "@/lib/tax/eur-conversion";
import type { CategorizeInput, FiscalAnnotation, WalletKind } from "@/lib/tax/types";

export interface TraceabilityEntry {
  id: string;
  transactionDate: string;
  type: string;
  protocol: string;
  walletKind: WalletKind | null;
  positionType: string;
  tokenInSymbol: string | null;
  tokenInAmount: number | null;
  tokenOutSymbol: string | null;
  tokenOutAmount: number | null;
  notes: string | null;
  fiscal: FiscalAnnotation;
}

export interface WalletSummaryEntry {
  name: string;
  kind: WalletKind | null;
  count: number;
}

export interface TraceabilityResult {
  entries: TraceabilityEntry[];
  walletSummary: WalletSummaryEntry[];
  eurRate: number;
  total: number;
  /** Origen del tipo de cambio: histórico por fecha (BCE), actual, o
   *  constante de emergencia (mostrar aviso en la UI si es "fallback"). */
  fxSource: "historical" | "current" | "fallback";
  /** Operaciones con valor (venta/retirada/depósito/harvest con cantidad) que
   *  NO se pudieron valorar por falta de precio → quedan fuera del cómputo
   *  fiscal. Si > 0, la UI avisa para que no desaparezcan en silencio. */
  unpricedCount: number;
  /** Operaciones cuya ganancia sale sobrevalorada por faltar lotes FIFO. */
  uncoveredCount: number;
}

function getClient(): SupabaseClient {
  return getSupabaseServiceClient() ?? getSupabaseServerClient();
}

/**
 * Carga todas las transacciones de un portfolio y las enriquece con la
 * categorización fiscal calculada en tiempo real (FIFO sobre la marcha).
 *
 * No persiste nada — las anotaciones son siempre recomputables. Función
 * compartida por la ruta API y las páginas servidor del módulo fiscal.
 *
 * NO comprueba permisos: el caller debe haber validado el acceso al portfolio.
 */
export async function computeTraceability(portfolioId: string): Promise<TraceabilityResult> {
  const client = getClient();

  const { data: rows, error } = await client
    .from("transactions")
    .select(
      "id, type, protocol, position_id, position_type, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount, spot_price, fee_amount, transaction_date, metadata, notes",
    )
    .eq("portfolio_id", portfolioId)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  if (!rows || rows.length === 0) {
    return { entries: [], walletSummary: [], eurRate: (await fetchCurrentEurRate()) ?? 0.92, total: 0, fxSource: "current", unpricedCount: 0, uncoveredCount: 0 };
  }

  // Catálogo fiscal de custodios desde BD (las clasificaciones hechas por el
  // gestor en wallet_protocols mandan sobre el catálogo embebido).
  await preloadWalletCatalog(client);

  // Tipo de cambio: HISTÓRICO por fecha de operación (BCE vía Frankfurter).
  // El tipo actual queda como aproximación para fechas sin cotización y como
  // fallback si la API falla (comportamiento anterior, ahora señalizado).
  const currentRate = await fetchCurrentEurRate();
  const eurRate = currentRate ?? 0.92;
  const rateByDate = await fetchEurRatesByDate(rows.map((r) => r.transaction_date as string));
  const fxSource: TraceabilityResult["fxSource"] =
    rateByDate.size > 0 ? "historical" : currentRate != null ? "current" : "fallback";

  const inputs: CategorizeInput[] = (rows as Array<{
    id: string;
    type: string | null;
    protocol: string | null;
    position_id: string | null;
    position_type: string | null;
    token_in_symbol: string | null;
    token_in_amount: number | string | null;
    token_out_symbol: string | null;
    token_out_amount: number | string | null;
    spot_price: number | string | null;
    fee_amount: number | string | null;
    transaction_date: string;
    metadata: Record<string, unknown> | null;
    notes: string | null;
  }>).map((row) => ({
    id: row.id,
    portfolioId,
    type: (row.type ?? "").trim(),
    protocol: (row.protocol ?? "Wallet").trim(),
    positionType: (row.position_type ?? "Hold").trim(),
    tokenInSymbol: row.token_in_symbol,
    tokenInAmount: row.token_in_amount !== null ? Number(row.token_in_amount) : null,
    tokenOutSymbol: row.token_out_symbol,
    tokenOutAmount: row.token_out_amount !== null ? Number(row.token_out_amount) : null,
    spotPriceUsd: row.spot_price !== null ? Number(row.spot_price) : 0,
    feeUsd: row.fee_amount !== null && row.fee_amount !== undefined ? Number(row.fee_amount) : 0,
    transactionDate: row.transaction_date,
    metadata: row.metadata,
  }));

  const { results } = categorizeTransactionsSequence(inputs, {
    fxRateUsdToEur: eurRate,
    initialLots: [],
    walletProtocolResolver: (protocol) => getWalletProtocolMetaSync(protocol),
    fxRateByDate: rateByDate,
  });

  const entries: TraceabilityEntry[] = results
    .map((res, i) => {
      const original = inputs[res.txIndex] ?? inputs[i];
      return {
        id: original.id ?? `${original.transactionDate}-${i}`,
        transactionDate: original.transactionDate,
        type: original.type,
        protocol: original.protocol,
        walletKind: res.annotation.walletKind,
        positionType: original.positionType,
        tokenInSymbol: original.tokenInSymbol,
        tokenInAmount: original.tokenInAmount,
        tokenOutSymbol: original.tokenOutSymbol,
        tokenOutAmount: original.tokenOutAmount,
        notes: (rows[res.txIndex]?.notes as string | null) ?? null,
        fiscal: res.annotation,
      };
    })
    .sort((a, b) => Date.parse(b.transactionDate) - Date.parse(a.transactionDate));

  const walletCounter = new Map<string, WalletSummaryEntry>();
  for (const e of entries) {
    const key = `${e.protocol}::${e.walletKind ?? "other"}`;
    const cur = walletCounter.get(key);
    if (cur) cur.count += 1;
    else walletCounter.set(key, { name: e.protocol, kind: e.walletKind, count: 1 });
  }
  const walletSummary = Array.from(walletCounter.values()).sort((a, b) => b.count - a.count);

  // Operaciones con cantidad pero sin precio → no valorables (fuera del cómputo).
  const VALUE_TYPES = new Set(["deposit", "withdrawal", "staking_deposit", "staking_withdrawal", "lending_supply", "lending_withdraw", "lp_deposit", "lp_withdraw", "harvest"]);
  const unpricedCount = inputs.filter((t) => {
    const amount = Math.abs(Number(t.tokenInAmount ?? t.tokenOutAmount ?? 0));
    return VALUE_TYPES.has((t.type ?? "").trim().toLowerCase()) && amount > 0 && Number(t.spotPriceUsd ?? 0) <= 0;
  }).length;

  /*
   * Operaciones cuya ganancia sale SOBREVALORADA por falta de histórico.
   *
   * Cuando se transmite un token del que no hay lotes FIFO suficientes —porque
   * faltan compras por registrar—, el coste de adquisición que se le puede
   * imputar es menor del real, y en el peor caso cero: entonces se declara como
   * ganancia el importe ÍNTEGRO de la transmisión. El motor ya lo marca con «⚠️
   * Lotes FIFO insuficientes» en la nota de esa operación.
   *
   * Ese aviso vivía SOLO en el texto de la nota, que no se enseña en ninguna
   * pantalla. Así que alguien podía leer una base del ahorro inflada sin nada
   * que se lo advirtiera. Desde que el rebalanceo con cambio de token tributa
   * como permuta, además, muchas más operaciones pasan por este camino, así que
   * el aviso tiene que subir a la superficie.
   *
   * Se cuenta por la marca de la nota y no por un campo nuevo a propósito: la
   * marca la ponen ya los tres sitios que consumen lotes (venta, permuta y
   * permuta implícita), y un campo obligaría a tocar el motor en los tres.
   */
  const uncoveredCount = entries.filter((e) =>
    (e.fiscal.notes ?? "").includes("Lotes FIFO insuficientes"),
  ).length;

  return {
    entries,
    walletSummary,
    eurRate,
    total: entries.length,
    fxSource,
    unpricedCount,
    uncoveredCount,
  };
}
