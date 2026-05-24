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

