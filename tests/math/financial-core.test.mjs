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

// ── Health Factor con liquidation thresholds (Aave V3 reference) ────────────

const THRESHOLDS = {
  BTC: 0.78,
  WBTC: 0.78,
  ETH: 0.83,
  WETH: 0.83,
  STETH: 0.79,
  USDC: 0.87,
  USDT: 0.86,
  DAI: 0.87,
  SOL: 0.65,
};
const DEFAULT_THRESHOLD = 0.50;

function thresholdFor(sym) {
  return THRESHOLDS[sym.toUpperCase()] ?? DEFAULT_THRESHOLD;
}

function healthFactorWithThresholds(collateral, debt) {
  const totalDebt = debt.reduce((s, d) => s + Math.max(0, d.valueUsd), 0);
  if (totalDebt <= 0) return null;
  const effectiveCollateral = collateral.reduce(
    (s, c) => s + Math.max(0, c.valueUsd) * thresholdFor(c.symbol),
    0,
  );
  if (effectiveCollateral <= 0) return 0;
  return effectiveCollateral / totalDebt;
}

test("HF con threshold: BTC $1000 colateral + USDC $500 deuda", () => {
  // sin threshold daría 2.0; con threshold 0.78 → 1.56
  const hf = healthFactorWithThresholds(
    [{ symbol: "BTC", valueUsd: 1000 }],
    [{ symbol: "USDC", valueUsd: 500 }],
  );
  assert.equal(Number(hf.toFixed(4)), 1.56);
});

test("HF con threshold: ETH $1000 colateral + USDC $500 deuda", () => {
  // threshold ETH 0.83 → HF = 830/500 = 1.66
  const hf = healthFactorWithThresholds(
    [{ symbol: "ETH", valueUsd: 1000 }],
    [{ symbol: "USDC", valueUsd: 500 }],
  );
  assert.equal(Number(hf.toFixed(4)), 1.66);
});

test("HF multi-token colateral: BTC $500 + ETH $500 + USDC deuda $500", () => {
  // effective = 500*0.78 + 500*0.83 = 805 → HF = 805/500 = 1.61
  const hf = healthFactorWithThresholds(
    [
      { symbol: "BTC", valueUsd: 500 },
      { symbol: "ETH", valueUsd: 500 },
    ],
    [{ symbol: "USDC", valueUsd: 500 }],
  );
  assert.equal(Number(hf.toFixed(4)), 1.61);
});

test("HF multi-token deuda: BTC $1000 colateral + USDC $250 + DAI $250", () => {
  // effective = 1000*0.78 = 780; deuda total = 500 → HF = 1.56
  const hf = healthFactorWithThresholds(
    [{ symbol: "BTC", valueUsd: 1000 }],
    [
      { symbol: "USDC", valueUsd: 250 },
      { symbol: "DAI", valueUsd: 250 },
    ],
  );
  assert.equal(Number(hf.toFixed(4)), 1.56);
});

test("HF sin deuda devuelve null (HF infinito)", () => {
  const hf = healthFactorWithThresholds(
    [{ symbol: "BTC", valueUsd: 1000 }],
    [],
  );
  assert.equal(hf, null);
});

test("HF con token desconocido usa fallback 0.50", () => {
  const hf = healthFactorWithThresholds(
    [{ symbol: "RANDOMSHITCOIN", valueUsd: 1000 }],
    [{ symbol: "USDC", valueUsd: 500 }],
  );
  assert.equal(Number(hf.toFixed(4)), 1); // 1000*0.5/500 = 1.0
});

test("HF threshold conservador vs simple: SOL es más volátil que BTC", () => {
  // Simple (sin threshold): ambos darían el mismo HF si el USD es igual.
  // Con thresholds: SOL (0.65) da peor HF que BTC (0.78).
  const hfBtc = healthFactorWithThresholds(
    [{ symbol: "BTC", valueUsd: 1000 }],
    [{ symbol: "USDC", valueUsd: 500 }],
  );
  const hfSol = healthFactorWithThresholds(
    [{ symbol: "SOL", valueUsd: 1000 }],
    [{ symbol: "USDC", valueUsd: 500 }],
  );
  assert.ok(hfSol < hfBtc, `SOL (${hfSol}) debería ser menos seguro que BTC (${hfBtc})`);
});


// ---------------- LTV / Max LTV / Liquidation Price ----------------

function ltv(collateral, debt) {
  const totalCollateral = collateral.reduce((s, c) => s + Math.max(0, c.valueUsd), 0);
  if (totalCollateral <= 0) return null;
  const totalDebt = debt.reduce((s, d) => s + Math.max(0, d.valueUsd), 0);
  return totalDebt / totalCollateral;
}

function maxLtv(collateral) {
  const total = collateral.reduce((s, c) => s + Math.max(0, c.valueUsd), 0);
  if (total <= 0) return null;
  const weighted = collateral.reduce(
    (s, c) => s + Math.max(0, c.valueUsd) * thresholdFor(c.symbol),
    0,
  );
  return weighted / total;
}

function liquidationPrices(collateral, debt) {
  const totalDebt = debt.reduce((s, d) => s + Math.max(0, d.valueUsd), 0);
  const enriched = collateral.map((c) => {
    const threshold = thresholdFor(c.symbol);
    const currentPrice = c.amount > 0 ? c.valueUsd / c.amount : 0;
    return { ...c, threshold, currentPrice, effective: c.valueUsd * threshold };
  });
  const totalEffective = enriched.reduce((s, e) => s + e.effective, 0);
  return enriched.map((e) => {
    if (totalDebt <= 0 || e.amount <= 0 || e.threshold <= 0) {
      return { symbol: e.symbol, liquidationPrice: null, dropPercent: null };
    }
    const otherEffective = totalEffective - e.effective;
    const required = totalDebt - otherEffective;
    if (required <= 0) {
      return { symbol: e.symbol, liquidationPrice: 0, dropPercent: 100 };
    }
    const liquidationPrice = required / (e.amount * e.threshold);
    const dropPercent = ((e.currentPrice - liquidationPrice) / e.currentPrice) * 100;
    return { symbol: e.symbol, liquidationPrice, dropPercent };
  });
}

test("LTV: 500 deuda / 1000 colateral = 0.5 (50%)", () => {
  const v = ltv(
    [{ valueUsd: 1000 }],
    [{ valueUsd: 500 }],
  );
  assert.equal(v, 0.5);
});

test("LTV: sin colateral → null", () => {
  assert.equal(ltv([], [{ valueUsd: 100 }]), null);
});

test("LTV: sin deuda → 0", () => {
  assert.equal(ltv([{ valueUsd: 1000 }], []), 0);
});

test("MaxLTV: 100% BTC = threshold de BTC (0.78)", () => {
  assert.equal(maxLtv([{ symbol: "BTC", valueUsd: 1000 }]), 0.78);
});

test("MaxLTV mixto: 50/50 BTC/USDC = media ponderada", () => {
  // 500*0.78 + 500*0.87 = 390 + 435 = 825 → /1000 = 0.825
  const v = maxLtv([
    { symbol: "BTC", valueUsd: 500 },
    { symbol: "USDC", valueUsd: 500 },
  ]);
  assert.equal(Number(v.toFixed(4)), 0.825);
});

test("Liquidation price: 1 BTC@40000 con deuda 20000 USDC → liq @ 25641", () => {
  // p_liq = debt / (amount * threshold) = 20000 / (1 * 0.78) = 25641.0256...
  const out = liquidationPrices(
    [{ symbol: "BTC", amount: 1, valueUsd: 40000 }],
    [{ valueUsd: 20000 }],
  );
  assert.equal(out.length, 1);
  assert.equal(Math.round(out[0].liquidationPrice), 25641);
  // dropPercent: (40000 - 25641) / 40000 = 35.9%
  assert.ok(out[0].dropPercent > 35 && out[0].dropPercent < 36.5);
});

test("Liquidation price: stablecoin como colateral → drop alto", () => {
  // USDC threshold 0.87, mucha holgura
  const out = liquidationPrices(
    [{ symbol: "USDC", amount: 1000, valueUsd: 1000 }],
    [{ valueUsd: 500 }],
  );
  // p_liq = 500 / (1000 * 0.87) = 0.5747
  assert.equal(Number(out[0].liquidationPrice.toFixed(4)), 0.5747);
});

test("Liquidation price multi-collateral: otros activos cubren la deuda → liq=0", () => {
  // 1 BTC @40000 + 10000 USDC, deuda 5000 → USDC sola ya cubre con margen
  const out = liquidationPrices(
    [
      { symbol: "BTC", amount: 1, valueUsd: 40000 },
      { symbol: "USDC", amount: 10000, valueUsd: 10000 },
    ],
    [{ valueUsd: 5000 }],
  );
  const btc = out.find((o) => o.symbol === "BTC");
  // El BTC puede caer a 0 sin liquidar porque USDC*0.87 = 8700 > 5000
  assert.equal(btc.liquidationPrice, 0);
  assert.equal(btc.dropPercent, 100);
});

test("Liquidation price: sin deuda → null", () => {
  const out = liquidationPrices(
    [{ symbol: "BTC", amount: 1, valueUsd: 40000 }],
    [],
  );
  assert.equal(out[0].liquidationPrice, null);
});
