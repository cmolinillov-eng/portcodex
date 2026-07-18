// Estado agregado por token de una posición, para el flujo de EDICIÓN
// (positions/edit). Extraído del route file para poder verificarlo con
// scripts (los route files de Next solo pueden exportar handlers).

export const CAPITAL_IN = new Set(["deposit", "staking_deposit", "lp_deposit", "lending_supply"]);
export const CAPITAL_OUT = new Set(["withdrawal", "staking_withdrawal", "lp_withdraw", "lending_withdraw"]);

export function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

// depositedUsd sigue las MISMAS reglas que el Total Depositado del dashboard
// (Σ in·spot − Σ out·spot, excluyendo movimientos internos): es lo que la
// retirada de reset debe poner a CERO. costUsd es el coste medio restante
// (informativo, para previousState/avgPrice) — ambos divergen si hubo
// retiradas previas a un precio distinto del medio.
export type TokenState = { balance: number; costUsd: number; depositedUsd: number };

export type EditStateTx = {
  type: string | null;
  token_in_symbol: string | null;
  token_in_amount: string | number | null;
  token_out_symbol: string | null;
  token_out_amount: string | number | null;
  spot_price: string | number | null;
  metadata?: Record<string, unknown> | null;
};

export function applyTxToState(state: Map<string, TokenState>, tx: EditStateTx) {
  const txType = (tx.type ?? "").trim();
  const inSymbol = (tx.token_in_symbol ?? "").toUpperCase();
  const outSymbol = (tx.token_out_symbol ?? "").toUpperCase();
  const inAmount = toNumber(tx.token_in_amount);
  const outAmount = toNumber(tx.token_out_amount);
  const spotPrice = toNumber(tx.spot_price);

  const isIn = CAPITAL_IN.has(txType);
  const isOut = CAPITAL_OUT.has(txType);
  if (!isIn && !isOut) return;

  const symbol = isIn ? inSymbol : outSymbol;
  if (!symbol) return;

  if (!state.has(symbol)) state.set(symbol, { balance: 0, costUsd: 0, depositedUsd: 0 });
  const entry = state.get(symbol)!;

  // Reglas del dashboard para el depositado: internos no cuentan, el
  // rebalanceo aporta su depositedDelta, y las rotaciones on-chain (capital
  // que ya entró por hold) tampoco cuentan.
  const meta = (tx.metadata ?? {}) as Record<string, unknown>;
  const src = typeof meta.source === "string" ? meta.source : "";
  const reason = typeof meta.reason === "string" ? meta.reason : "";
  const isInternal = /harvest_reinvest|rebalance_transfer|rebalance_harvest_out/.test(src + reason);
  const isRebalance = src === "rebalance_transfer" || reason === "rebalance_transfer";
  const isRotationDeposit = src === "onchain_ingest" && isIn;
  const depositedDelta = typeof meta.depositedDelta === "number" ? meta.depositedDelta : null;

  if (isIn) {
    entry.balance += inAmount;
    entry.costUsd += inAmount * spotPrice;
    if (!isInternal && !isRotationDeposit) entry.depositedUsd += inAmount * spotPrice;
    if (isRebalance && depositedDelta !== null) entry.depositedUsd += depositedDelta;
  } else {
    if (entry.balance > 0 && outAmount > 0) {
      const fraction = Math.min(1, outAmount / entry.balance);
      entry.costUsd -= entry.costUsd * fraction;
    }
    entry.balance -= outAmount;
    if (entry.balance < 0) entry.balance = 0;
    if (!isInternal) entry.depositedUsd -= outAmount * spotPrice;
    if (isRebalance && depositedDelta !== null) entry.depositedUsd += depositedDelta;
  }
}
