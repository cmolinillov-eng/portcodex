import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Auto-cierre de posición cuando el balance final cae a ≤ 0.
 *
 * Cuando una operación (edit, lending adjust, withdrawal explícito) deja
 * el balance neto de una posición en 0 o negativo, queremos registrar
 * automáticamente una fila `position_closed` para que:
 *   - El PnL realizado se capture en `totalRealizedPnl` del dashboard.
 *   - El historial muestre el cierre con su valor de salida.
 *
 * No se ejecuta para rebalance ni positions/delete porque ya generan su
 * propio position_closed con metadata más rica (destino, balances, etc).
 *
 * Reglas:
 *   - Lee transactions activas de la posición.
 *   - Excluye rebalance_transfer y harvest_reinvest del cómputo de cost basis
 *     (consistente con el dashboard).
 *   - Si el balance total ≤ tolerancia y NO existe ya un position_closed
 *     reciente, emite uno con realizedPnl = valueAtClose - totalDeposited.
 *
 * Si el enum transaction_type no soporta "position_closed" (BD legacy), el
 * insert se intenta pero no se propaga el error. La operación principal
 * ya está confirmada.
 */

type CloseInput = {
  client: SupabaseClient;
  portfolioId: string;
  protocol: string;
  positionId: string;
  positionType: string;
  /**
   * Precio spot por símbolo en el momento del cierre. Usar la misma fuente
   * que usó la operación que disparó el cierre, para coherencia contable.
   */
  spotPriceFor: (symbol: string) => number;
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

function parseMetadataObject(value: unknown): Record<string, unknown> | null {
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

function readFlag(metadata: unknown, notes: string | null, key: string): string | null {
  const fromMeta = parseMetadataObject(metadata);
  if (fromMeta && typeof fromMeta[key] === "string") return String(fromMeta[key]);
  const fromNotes = parseMetadataObject(notes);
  if (fromNotes && typeof fromNotes[key] === "string") return String(fromNotes[key]);
  return null;
}

export async function autoClosePositionIfEmpty({
  client,
  portfolioId,
  protocol,
  positionId,
  positionType,
  spotPriceFor,
}: CloseInput): Promise<{ closed: boolean; reason?: string; realizedPnl?: number }> {
  const { data: txs, error } = await client
    .from("transactions")
    .select("type, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount, spot_price, metadata, notes")
    .eq("portfolio_id", portfolioId)
    .eq("protocol", protocol)
    .eq("position_id", positionId)
    .is("deleted_at", null);

  if (error) return { closed: false, reason: "read_error" };

  // Si ya hay un position_closed entre las activas, no creamos otro.
  const hasAlreadyClosed = (txs ?? []).some(
    (tx) => ((tx.type ?? "") as string).trim() === "position_closed",
  );
  if (hasAlreadyClosed) return { closed: false, reason: "already_closed" };

  // Computar balances por símbolo y cost basis acumulado, excluyendo
  // movimientos internos (rebalance/harvest_reinvest) del cost basis.
  const balances: Record<string, number> = {};
  let totalDeposited = 0;
  for (const tx of txs ?? []) {
    const txType = ((tx.type ?? "") as string).trim();
    if (txType === "position_closed") continue;
    const inSymbol = ((tx.token_in_symbol ?? "") as string).toUpperCase();
    const outSymbol = ((tx.token_out_symbol ?? "") as string).toUpperCase();
    const inAmount = toNumber(tx.token_in_amount);
    const outAmount = toNumber(tx.token_out_amount);
    const spotPrice = toNumber(tx.spot_price);

    const reason = readFlag(tx.metadata, tx.notes, "reason");
    const source = readFlag(tx.metadata, tx.notes, "source");
    const isInternal =
      reason === "harvest_reinvest" ||
      source === "harvest_reinvest" ||
      reason === "rebalance_transfer" ||
      source === "rebalance_transfer";

    if (CAPITAL_IN.has(txType)) {
      if (inSymbol) balances[inSymbol] = (balances[inSymbol] ?? 0) + inAmount;
      if (!isInternal) totalDeposited += inAmount * spotPrice;
    } else if (CAPITAL_OUT.has(txType)) {
      if (outSymbol) balances[outSymbol] = (balances[outSymbol] ?? 0) - outAmount;
      if (!isInternal) totalDeposited -= outAmount * spotPrice;
    }
  }

  // ¿La posición quedó vacía? (todos los balances ≤ tolerancia)
  const TOLERANCE = 1e-9;
  let totalAbsBalance = 0;
  let valueAtClose = 0;
  for (const symbol of Object.keys(balances)) {
    const bal = balances[symbol] ?? 0;
    totalAbsBalance += Math.abs(bal);
    if (bal > 0) valueAtClose += bal * spotPriceFor(symbol);
  }

  if (totalAbsBalance > TOLERANCE) return { closed: false, reason: "still_open" };

  // Emitimos position_closed. Si el enum no acepta el tipo, ignoramos.
  const realizedPnl = valueAtClose - totalDeposited;
  const closureRow = {
    portfolio_id: portfolioId,
    type: "position_closed",
    operation_group_id: randomUUID(),
    token_in_symbol: null,
    token_in_amount: 0,
    token_out_symbol: null,
    token_out_amount: null,
    spot_price: 0,
    fee_amount: 0,
    notes: `Cierre automático (balance = 0)`,
    transaction_date: new Date().toISOString(),
    protocol,
    position_id: positionId,
    position_type: positionType,
    metadata: {
      closure: {
        totalDeposited,
        valueAtClose,
        realizedPnl,
        reason: "auto_closed",
        closedAt: new Date().toISOString(),
        balances,
      },
    },
  };

  const insert = await client.from("transactions").insert([closureRow]);
  if (insert.error) {
    const msg = insert.error.message.toLowerCase();
    const isEnumIssue = msg.includes("invalid input value for enum") && msg.includes("position_closed");
    if (!isEnumIssue && process.env.NODE_ENV !== "production") {
      console.error("auto-close insert failed:", insert.error.message);
    }
    return { closed: false, reason: isEnumIssue ? "enum_unsupported" : "insert_error" };
  }

  return { closed: true, realizedPnl };
}
