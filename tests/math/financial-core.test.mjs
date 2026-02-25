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

