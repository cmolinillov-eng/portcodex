import test from "node:test";
import assert from "node:assert/strict";

function healthFactor(collateralUsd, debtUsd) {
  if (debtUsd <= 0) return null;
  return collateralUsd / debtUsd;
}

function roiPercent(currentPrice, averageEntryPrice) {
  if (averageEntryPrice <= 0) return 0;
  return ((currentPrice - averageEntryPrice) / averageEntryPrice) * 100;
}

function impermanentLossPercent(priceRatio) {
  if (!Number.isFinite(priceRatio) || priceRatio <= 0) return null;
  const il = (2 * (Math.sqrt(priceRatio) / (1 + priceRatio))) - 1;
  return il * 100;
}

function rebalanceTargetAmountFromUsd(usdValue, targetTokenPrice) {
  if (!Number.isFinite(usdValue) || usdValue <= 0) return 0;
  if (!Number.isFinite(targetTokenPrice) || targetTokenPrice <= 0) return 0;
  return usdValue / targetTokenPrice;
}

test("Health Factor básico: 1000/500 = 2.0", () => {
  assert.equal(healthFactor(1000, 500), 2);
});

test("ROI básico: de 100 a 120 = +20%", () => {
  assert.equal(roiPercent(120, 100), 20);
});

test("IL: ratio 1 => 0%", () => {
  const il = impermanentLossPercent(1);
  assert.ok(il !== null);
  assert.equal(Number(il.toFixed(8)), 0);
});

test("IL: ratio 4 => negativo (pérdida impermanente)", () => {
  const il = impermanentLossPercent(4);
  assert.ok(il !== null);
  assert.ok(il < 0);
});

test("Rebalance automático: 180 USD a BTC de 60k => 0.003 BTC", () => {
  const amount = rebalanceTargetAmountFromUsd(180, 60000);
  assert.equal(Number(amount.toFixed(6)), 0.003);
});

test("Rebalance automático: si precio destino inválido => 0", () => {
  assert.equal(rebalanceTargetAmountFromUsd(100, 0), 0);
});

// ── Rebalanceo a nueva posición: split LP ────────────────────────────────────

function lpSplitAmounts(totalUsd, splitPercentA, priceA, priceB) {
  const pct = Math.max(0, Math.min(100, splitPercentA));
  const usdA = (totalUsd * pct) / 100;
  const usdB = totalUsd - usdA;
  const amountA = priceA > 0 ? usdA / priceA : 0;
  const amountB = priceB > 0 ? usdB / priceB : 0;
  return { amountA, amountB };
}

function lpSplitUsdTotal(amountA, priceA, amountB, priceB) {
  return amountA * priceA + amountB * priceB;
}

test("Split 50/50: 200 USD, ETH 2000, USDC 1 => 0.05 ETH + 100 USDC", () => {
  const { amountA, amountB } = lpSplitAmounts(200, 50, 2000, 1);
  assert.equal(Number(amountA.toFixed(6)), 0.05);
  assert.equal(Number(amountB.toFixed(4)), 100);
});

test("Split 60/40: 200 USD, ETH 2000, USDC 1 => valor total conservado", () => {
  const { amountA, amountB } = lpSplitAmounts(200, 60, 2000, 1);
  const total = lpSplitUsdTotal(amountA, 2000, amountB, 1);
  assert.equal(Number(total.toFixed(6)), 200);
});

test("Split 40/60: montos reflejan el porcentaje correctamente", () => {
  const { amountA, amountB } = lpSplitAmounts(100, 40, 1000, 2);
  assert.equal(Number(amountA.toFixed(6)), 0.04);  // 40 USD / 1000
  assert.equal(Number(amountB.toFixed(6)), 30);     // 60 USD / 2
});

test("Split 0%: todo va a token B", () => {
  const { amountA, amountB } = lpSplitAmounts(100, 0, 2000, 1);
  assert.equal(amountA, 0);
  assert.equal(amountB, 100);
});

test("Split 100%: todo va a token A", () => {
  const { amountA, amountB } = lpSplitAmounts(100, 100, 2000, 1);
  assert.equal(Number(amountA.toFixed(6)), 0.05);
  assert.equal(amountB, 0);
});

test("Split con precio 0 en token B: amountB sale 0, no explota", () => {
  const { amountA, amountB } = lpSplitAmounts(100, 50, 2000, 0);
  assert.ok(Number.isFinite(amountA));
  assert.equal(amountB, 0);
});

test("Split preserva valor total con precios no redondos", () => {
  const priceA = 63478.5;
  const priceB = 1.0002;
  const { amountA, amountB } = lpSplitAmounts(500, 70, priceA, priceB);
  const total = lpSplitUsdTotal(amountA, priceA, amountB, priceB);
  assert.ok(Math.abs(total - 500) < 0.01, `Expected ~500, got ${total}`);
});

// ── Withdrawal parcial: avgPrice debe quedar invariante ─────────────────────
//
// Modelo del dashboard (get-dashboard-data.ts):
//   - cada par {posición, token} acumula { balance, costUsd, depositedAmount }
//   - en depósito: balance += inAmount, costUsd += inAmount × spotPrice, depositedAmount += inAmount
//   - en withdrawal: reducir balance, costUsd y depositedAmount pro-rata para mantener
//     el average entry price del balance restante.
// avgPrice = costUsd / depositedAmount

function applyDeposit(entry, amount, spotPrice) {
  entry.balance += amount;
  entry.costUsd += amount * spotPrice;
  entry.depositedAmount += amount;
}

function applyWithdrawalProRata(entry, outAmount) {
  if (entry.balance > 0 && outAmount > 0) {
    const fraction = Math.min(1, outAmount / entry.balance);
    entry.costUsd -= entry.costUsd * fraction;
    entry.depositedAmount -= entry.depositedAmount * fraction;
  }
  entry.balance -= outAmount;
  if (entry.balance < 0) entry.balance = 0;
}

function avgPrice(entry) {
  return entry.depositedAmount > 0 ? entry.costUsd / entry.depositedAmount : 0;
}

test("Withdrawal parcial mantiene el avgPrice del remanente", () => {
  const entry = { balance: 0, costUsd: 0, depositedAmount: 0 };
  applyDeposit(entry, 1, 60000);             // 1 BTC a 60k
  applyWithdrawalProRata(entry, 0.5);        // saca 0.5 BTC
  assert.equal(entry.balance, 0.5);
  assert.equal(entry.costUsd, 30000);
  assert.equal(entry.depositedAmount, 0.5);
  assert.equal(avgPrice(entry), 60000);
});

test("Withdrawal con varios depósitos a distintos precios", () => {
  const entry = { balance: 0, costUsd: 0, depositedAmount: 0 };
  applyDeposit(entry, 1, 60000);             // 1 BTC a 60k → cost 60k
  applyDeposit(entry, 1, 80000);             // 1 BTC a 80k → cost 80k, total 140k, avg 70k
  assert.equal(avgPrice(entry), 70000);
  applyWithdrawalProRata(entry, 1);          // saca 1 BTC, debería conservar avg = 70k sobre lo que queda
  assert.equal(entry.balance, 1);
  assert.equal(entry.costUsd, 70000);
  assert.equal(avgPrice(entry), 70000);
});

test("Withdrawal total deja entry vacío y avgPrice = 0", () => {
  const entry = { balance: 0, costUsd: 0, depositedAmount: 0 };
  applyDeposit(entry, 2, 1500);
  applyWithdrawalProRata(entry, 2);
  assert.equal(entry.balance, 0);
  assert.ok(Math.abs(entry.costUsd) < 1e-9);
  assert.equal(avgPrice(entry), 0);
});

test("Withdrawal mayor que balance se trunca a balance (no negativo)", () => {
  const entry = { balance: 0, costUsd: 0, depositedAmount: 0 };
  applyDeposit(entry, 1, 100);
  applyWithdrawalProRata(entry, 5);           // intenta sacar 5 con 1 de balance
  assert.equal(entry.balance, 0);
  assert.ok(entry.costUsd <= 1e-9);
});

test("Withdrawal y re-depósito: avgPrice se promedia con el balance restante", () => {
  const entry = { balance: 0, costUsd: 0, depositedAmount: 0 };
  applyDeposit(entry, 1, 60000);            // 1 BTC a 60k
  applyWithdrawalProRata(entry, 0.5);       // queda 0.5 BTC a 60k
  applyDeposit(entry, 0.5, 80000);          // re-añade 0.5 BTC a 80k
  // Ahora: balance 1, costUsd 30k+40k=70k, deposited 1 → avg = 70k
  assert.equal(entry.balance, 1);
  assert.equal(entry.costUsd, 70000);
  assert.equal(avgPrice(entry), 70000);
});

