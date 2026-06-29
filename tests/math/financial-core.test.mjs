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

// ---------------- Cadenas de rebalanceo y full withdrawal ----------------

/**
 * Modelo simplificado de Total Depositado:
 * - Cada deposit "externo" suma al total
 * - Cada withdrawal "externo" resta al total
 * - Los rebalance_transfer son INTERNOS: no mueven el total
 * - Las metadata.depositedDelta de los rebalances se cancelan entre sí (source negativo + target positivo)
 *
 * Esta simulación replica la lógica de get-dashboard-data txBalanceByTokenPosition
 * + capitalIn/capitalOut + depositedDelta para rebalanceos.
 */

function simulateTotalDeposited(transactions) {
  let totalDeposited = 0;
  for (const tx of transactions) {
    if (tx.isInternal) {
      // Solo aplicar depositedDelta si lo hay (mantiene el total invariante en rebalances)
      if (typeof tx.depositedDelta === "number") {
        totalDeposited += tx.depositedDelta;
      }
      continue;
    }
    if (tx.type === "deposit") totalDeposited += tx.usd;
    else if (tx.type === "withdrawal") totalDeposited -= tx.usd;
  }
  return totalDeposited;
}

test("Cadena rebalanceo A→B→C: Total Depositado invariante", () => {
  // Usuario deposita $1000 en pool A. Luego rebalancea todo a B. Luego todo a C.
  const txs = [
    { type: "deposit", usd: 1000 },
    // Rebalance A → B: salida + entrada con deltas que se cancelan
    { isInternal: true, depositedDelta: -1000 }, // source A
    { isInternal: true, depositedDelta: +1000 }, // target B
    // Rebalance B → C
    { isInternal: true, depositedDelta: -1000 }, // source B
    { isInternal: true, depositedDelta: +1000 }, // target C
  ];
  assert.equal(simulateTotalDeposited(txs), 1000);
});

test("Cadena rebalanceo parcial: A→B (50%) → C", () => {
  // $1000 en A. Rebalance 50% a B (queda 500 en A, 500 en B). Luego B→C completo.
  const txs = [
    { type: "deposit", usd: 1000 },
    { isInternal: true, depositedDelta: -500 }, // 50% de A sale
    { isInternal: true, depositedDelta: +500 }, // 50% entra a B
    { isInternal: true, depositedDelta: -500 }, // 100% de B sale
    { isInternal: true, depositedDelta: +500 }, // 100% entra a C
  ];
  assert.equal(simulateTotalDeposited(txs), 1000);
});

test("Full withdrawal tras rebalance: Total Depositado se reduce correctamente", () => {
  // $1000 en A, rebalance completo a B, luego full withdrawal de B → $0 depositado
  const txs = [
    { type: "deposit", usd: 1000 },
    { isInternal: true, depositedDelta: -1000 },
    { isInternal: true, depositedDelta: +1000 },
    { type: "withdrawal", usd: 1000 },
  ];
  assert.equal(simulateTotalDeposited(txs), 0);
});

test("Withdrawal parcial tras rebalance: descuento correcto", () => {
  // $1000 en A, rebalance a B, retiro $400 de B → $600 depositado restante
  const txs = [
    { type: "deposit", usd: 1000 },
    { isInternal: true, depositedDelta: -1000 },
    { isInternal: true, depositedDelta: +1000 },
    { type: "withdrawal", usd: 400 },
  ];
  assert.equal(simulateTotalDeposited(txs), 600);
});

test("Múltiples depósitos + cadena rebalanceos: agregación correcta", () => {
  // $500 en A, $300 en B, $200 en C
  // Rebalance: 100% de A → D
  // Rebalance: 50% de C → D
  // Luego retiro de D parcial
  const txs = [
    { type: "deposit", usd: 500 },  // A
    { type: "deposit", usd: 300 },  // B
    { type: "deposit", usd: 200 },  // C
    // A → D completo
    { isInternal: true, depositedDelta: -500 },
    { isInternal: true, depositedDelta: +500 },
    // C → D 50%
    { isInternal: true, depositedDelta: -100 },
    { isInternal: true, depositedDelta: +100 },
    // Retiro de D parcial: $300
    { type: "withdrawal", usd: 300 },
  ];
  // Total invariante por los rebalances internos. Solo deposits/withdraws externos cuentan.
  // 500 + 300 + 200 - 300 = 700
  assert.equal(simulateTotalDeposited(txs), 700);
});

test("Rebalance con deltas mal balanceados causa drift detectable", () => {
  // Si por bug los deltas no suman 0, el total deposit se distorsiona.
  // Este test SIRVE PARA DEFENDER: cualquier futuro cambio que rompa la
  // invariante source.delta + target.delta = 0 lo hace evidente.
  const txs = [
    { type: "deposit", usd: 1000 },
    { isInternal: true, depositedDelta: -1000 },
    { isInternal: true, depositedDelta: +900 }, // ¡falta $100!
  ];
  // Detecta el drift
  assert.notEqual(simulateTotalDeposited(txs), 1000);
  assert.equal(simulateTotalDeposited(txs), 900);
});

test("LP costBasisUsd: agregado desde balance × avgPrice cuando individuales tienen costo", () => {
  // Simula el fix de "LP sin costBasisUsd": antes individuales=null, agregado=0, roi=0.
  // Ahora individuales=balance × avg, agregado suma → roi real.
  const individuals = [
    { tokenSymbol: "WETH", balance: 1, avgPrice: 3000, currentValue: 3500 },
    { tokenSymbol: "USDC", balance: 3000, avgPrice: 1, currentValue: 3000 },
  ];
  const totalCurrent = individuals.reduce((s, i) => s + i.currentValue, 0);
  // costBasisUsd ahora viene del histórico tx (simulamos = balance * avgPrice)
  const totalCost = individuals.reduce((s, i) => s + i.balance * i.avgPrice, 0);
  const roi = totalCost > 0 ? ((totalCurrent - totalCost) / totalCost) * 100 : 0;
  assert.equal(totalCost, 6000);
  assert.equal(totalCurrent, 6500);
  // ROI esperado: +8.33%
  assert.ok(roi > 8 && roi < 9, `ROI esperado ~8.33%, got ${roi}`);
});

// ---------------- Regresiones de la auditoría 2026-06 ----------------
//
// Estas pruebas blindan tres fallos detectados en la revisión de lógica:
//   1) rebalance_harvest_out NO debe restar al Total Depositado
//      (get-dashboard-data.ts + snapshots/capture.ts)
//   2) El cierre debe contar el P&L realizado una sola vez
//      (auto-close.ts deja las txns activas → realizedPnl=0;
//       positions/delete soft-borra las txns → realizedPnl lleva el P&L)
//   3) El snapshot de cierre debe valorar con precio de mercado real
//      (positions/delete leía columnas inexistentes de cached_prices)

// ── 1) Clasificación de movimientos: harvest vs capital vs interno ───────────

const CAPITAL_IN = new Set(["deposit", "staking_deposit", "lp_deposit", "lending_supply"]);
const CAPITAL_OUT = new Set(["withdrawal", "staking_withdrawal", "lp_withdraw", "lending_withdraw"]);
const INTERNAL_REASONS = new Set([
  "harvest_reinvest",
  "rebalance_transfer",
  "rebalance_harvest_out",
]);

/**
 * Replica de get-dashboard-data / snapshots-capture:
 * - harvest → suma a totalHarvest (rendimiento), nunca a totalDeposited
 * - capital in/out externos → mueven totalDeposited
 * - movimientos internos → no tocan totalDeposited
 */
function simulateDashboardTotals(transactions) {
  let totalDeposited = 0;
  let totalHarvest = 0;
  for (const tx of transactions) {
    const isInternal = INTERNAL_REASONS.has(tx.reason);
    if (tx.type === "harvest") {
      totalHarvest += tx.usd;
      continue;
    }
    if (CAPITAL_IN.has(tx.type)) {
      if (!isInternal) totalDeposited += tx.usd;
      continue;
    }
    if (CAPITAL_OUT.has(tx.type)) {
      if (!isInternal) totalDeposited -= tx.usd;
    }
  }
  return { totalDeposited, totalHarvest };
}

test("Harvest arrastrado en rebalance NO resta al Total Depositado", () => {
  // Deposita $1000, cobra $50 de harvest, y al rebalancear arrastra ese harvest
  // como salida (rebalance_harvest_out). Ese harvest entró como rendimiento,
  // nunca como capital → el Total Depositado debe seguir en 1000.
  const txs = [
    { type: "deposit", usd: 1000 },
    { type: "harvest", usd: 50 },
    { type: "lp_withdraw", usd: 50, reason: "rebalance_harvest_out" },
  ];
  const { totalDeposited, totalHarvest } = simulateDashboardTotals(txs);
  assert.equal(totalDeposited, 1000);
  assert.equal(totalHarvest, 50);
});

test("Modo de fallo: si harvest_out no se marca interno, el total se distorsiona", () => {
  // Documenta el bug que el fix evita: sin la marca interna, la salida del
  // harvest restaría al Total Depositado (950 en vez de 1000).
  const txs = [
    { type: "deposit", usd: 1000 },
    { type: "harvest", usd: 50 },
    { type: "lp_withdraw", usd: 50, reason: "unmarked" },
  ];
  assert.equal(simulateDashboardTotals(txs).totalDeposited, 950);
});

// ── 2) P&L de cierre sin doble conteo ───────────────────────────────────────

/**
 * pnl = Σ valor actual − Total Depositado + Σ realizedPnl de cierres.
 * Las txns activas (deposits/withdrawals a precio de salida) ya capturan el
 * P&L realizado vía el neto depositado, así que sólo deben sumar realizedPnl
 * los cierres cuyas txns YA NO están activas (borrado manual).
 */
function portfolioPnl({ activeTransactions, closures, currentValue }) {
  let totalDeposited = 0;
  for (const tx of activeTransactions) {
    if (tx.type === "deposit") totalDeposited += tx.usd;
    else if (tx.type === "withdrawal") totalDeposited -= tx.usd;
  }
  const realized = closures.reduce((s, c) => s + c.realizedPnl, 0);
  return currentValue - totalDeposited + realized;
}

test("Auto-cierre: realizedPnl=0 evita doble conteo (txns siguen activas)", () => {
  // Depositó 800, la posición valió 1000 y retiró todo. La retirada a precio
  // de salida ya deja el neto depositado en -200 → pnl correcto = +200.
  const pnl = portfolioPnl({
    activeTransactions: [
      { type: "deposit", usd: 800 },
      { type: "withdrawal", usd: 1000 },
    ],
    closures: [{ realizedPnl: 0 }],
    currentValue: 0,
  });
  assert.equal(pnl, 200);
});

test("Modo de fallo: auto-cierre con realizedPnl≠0 duplica el P&L", () => {
  const pnl = portfolioPnl({
    activeTransactions: [
      { type: "deposit", usd: 800 },
      { type: "withdrawal", usd: 1000 },
    ],
    closures: [{ realizedPnl: 200 }],
    currentValue: 0,
  });
  assert.equal(pnl, 400); // el doble conteo que el fix evita
});

test("Borrado manual: txns retiradas, realizedPnl lleva el P&L completo", () => {
  const pnl = portfolioPnl({
    activeTransactions: [], // soft-borradas por la ruta de delete
    closures: [{ realizedPnl: 200 }],
    currentValue: 0,
  });
  assert.equal(pnl, 200);
});

test("Ambos caminos de cierre dan el mismo P&L correcto (+200)", () => {
  const auto = portfolioPnl({
    activeTransactions: [
      { type: "deposit", usd: 800 },
      { type: "withdrawal", usd: 1000 },
    ],
    closures: [{ realizedPnl: 0 }],
    currentValue: 0,
  });
  const del = portfolioPnl({
    activeTransactions: [],
    closures: [{ realizedPnl: 200 }],
    currentValue: 0,
  });
  assert.equal(auto, del);
  assert.equal(auto, 200);
});

// ── 3) Snapshot de cierre valorado a precio de mercado ──────────────────────

/**
 * Replica de positions/delete computeClosureSnapshot:
 * valueAtClose = Σ balance×precio_actual ; realizedPnl = valueAtClose − totalDeposited.
 * Depende de resolver el precio actual desde cached_prices (token_symbol/price).
 */
function computeClosureSnapshot({ deposits, balances, priceMap }) {
  let totalDeposited = 0;
  for (const d of deposits) totalDeposited += d.amount * d.spotPrice;
  let valueAtClose = 0;
  for (const [sym, bal] of Object.entries(balances)) {
    const price = priceMap[sym] ?? 0;
    valueAtClose += Math.max(0, bal) * price;
  }
  return { totalDeposited, valueAtClose, realizedPnl: valueAtClose - totalDeposited };
}

test("Cierre valora con precio de mercado: 0.01 BTC 80k→100k = +200 P&L", () => {
  const snap = computeClosureSnapshot({
    deposits: [{ amount: 0.01, spotPrice: 80000 }],
    balances: { BTC: 0.01 },
    priceMap: { BTC: 100000 },
  });
  assert.equal(snap.totalDeposited, 800);
  assert.equal(snap.valueAtClose, 1000);
  assert.equal(snap.realizedPnl, 200);
});

test("Modo de fallo: sin precios (columnas mal) el cierre registra pérdida total", () => {
  // El bug original: cached_prices leído con columnas inexistentes → priceMap
  // vacío → valueAtClose=0 → realizedPnl=-totalDeposited (perdía todo el basis).
  const broken = computeClosureSnapshot({
    deposits: [{ amount: 0.01, spotPrice: 80000 }],
    balances: { BTC: 0.01 },
    priceMap: {},
  });
  assert.equal(broken.valueAtClose, 0);
  assert.equal(broken.realizedPnl, -800);
});

// ── 4) Composición de tokens de un LP: residuales de harvest no son principal ──

/**
 * Replica de get-dashboard-data: selección de balance por token-posición.
 * - Si el token tiene capital-in/out (txData) → usa ese balance transaccional.
 * - Si NO lo tiene pero la posición SÍ tiene cobertura transaccional → 0
 *   (token residual de harvest que la vista suma como token_in).
 * - Si la posición no tiene ninguna cobertura → fallback al balance de la vista.
 */
function resolveTokenBalance({ tokenTxBalance, positionHasTxCoverage, viewBalance }) {
  if (tokenTxBalance != null) return Math.max(0, tokenTxBalance);
  return positionHasTxCoverage ? 0 : viewBalance;
}

function lpTokenComposition(tokens) {
  return tokens
    .filter((t) => resolveTokenBalance(t) > 1e-9)
    .map((t) => t.symbol);
}

test("LP con harvest USDC no muestra un tercer token (BTC/ETH, no USDC)", () => {
  // BTC y ETH tienen lp_deposit (txData); USDC solo viene de harvest (sin txData)
  // en una posición con cobertura → debe quedar fuera de la composición.
  const composition = lpTokenComposition([
    { symbol: "BTC", tokenTxBalance: 0.0001, positionHasTxCoverage: true, viewBalance: 0.0001 },
    { symbol: "ETH", tokenTxBalance: 0.2109, positionHasTxCoverage: true, viewBalance: 0.2109 },
    { symbol: "USDC", tokenTxBalance: null, positionHasTxCoverage: true, viewBalance: 8.56 },
  ]);
  assert.deepEqual(composition, ["BTC", "ETH"]);
});

test("Modo de fallo: sin el guard, el harvest USDC inflaba el LP a 3 tokens", () => {
  // Comportamiento antiguo: token sin txData caía al viewBalance contaminado.
  const oldResolve = ({ tokenTxBalance, viewBalance }) =>
    tokenTxBalance != null ? Math.max(0, tokenTxBalance) : viewBalance;
  const tokens = [
    { symbol: "BTC", tokenTxBalance: 0.0001, viewBalance: 0.0001 },
    { symbol: "ETH", tokenTxBalance: 0.2109, viewBalance: 0.2109 },
    { symbol: "USDC", tokenTxBalance: null, viewBalance: 8.56 },
  ];
  const composition = tokens.filter((t) => oldResolve(t) > 1e-9).map((t) => t.symbol);
  assert.deepEqual(composition, ["BTC", "ETH", "USDC"]);
});

test("Posición legacy sin transacciones conserva el balance de la vista", () => {
  // Sin cobertura transaccional, el fallback a la vista se mantiene.
  const composition = lpTokenComposition([
    { symbol: "SOL", tokenTxBalance: null, positionHasTxCoverage: false, viewBalance: 10 },
    { symbol: "USDC", tokenTxBalance: null, positionHasTxCoverage: false, viewBalance: 5 },
  ]);
  assert.deepEqual(composition, ["SOL", "USDC"]);
});

// ── 5) Shape del snapshot de cierre cumple los CHECK de la tabla ─────────────

/**
 * La tabla transactions impone CHECK: token_in_amount > 0, spot_price > 0 y
 * "cada movimiento debe tener token_in_symbol o token_out_symbol". Un snapshot
 * position_closed con 0/0/null fallaba SIEMPRE → el cierre nunca se guardaba y
 * el P&L realizado de la posición desaparecía del portfolio.
 */
function closureRowIsValid(row) {
  const hasSymbol = Boolean(row.token_in_symbol) || Boolean(row.token_out_symbol);
  return Number(row.token_in_amount) > 0 && Number(row.spot_price) > 0 && hasSymbol;
}

test("Snapshot de cierre (delete route) cumple los constraints de la BD", () => {
  const row = { token_in_symbol: "BTC/ETH", token_in_amount: 1, spot_price: 1, token_out_symbol: null };
  assert.equal(closureRowIsValid(row), true);
});

test("Snapshot de auto-cierre cumple los constraints (símbolo no nulo)", () => {
  const row = { token_in_symbol: "SOL/ETH", token_in_amount: 1, spot_price: 1, token_out_symbol: null };
  assert.equal(closureRowIsValid(row), true);
});

test("Modo de fallo: el shape antiguo (0/0/null) viola los constraints", () => {
  const oldDelete = { token_in_symbol: "BTC/ETH", token_in_amount: 0, spot_price: 0, token_out_symbol: null };
  const oldAuto = { token_in_symbol: null, token_in_amount: 0, spot_price: 0, token_out_symbol: null };
  assert.equal(closureRowIsValid(oldDelete), false); // spot_price/token_in_amount = 0
  assert.equal(closureRowIsValid(oldAuto), false);   // además sin símbolo
});

// ── 6) Deshacer: qué operaciones son deshacibles y con qué modo ──────────────

/**
 * Replica de undoModeFor (RecentActivity): decide si una fila de actividad se
 * puede deshacer y cómo:
 *  - "restore": borrado de posición (position_closed con reason "deleted").
 *  - "operation": operación de usuario con grupo (alta, rebalanceo, harvest…).
 *  - null: no deshacible (auto-cierre, o sin grupo).
 */
function undoModeFor(item) {
  if (item.type === "position_closed") {
    return item.reason === "deleted" ? "restore" : null;
  }
  if (item.reason === "auto_closed") return null;
  if (item.operationGroupId) return "operation";
  return null;
}

test("Alta de posición (con grupo) es deshacible en modo operation", () => {
  assert.equal(undoModeFor({ type: "deposit", operationGroupId: "g1", reason: "" }), "operation");
  assert.equal(undoModeFor({ type: "lp_deposit", operationGroupId: "g2", reason: "" }), "operation");
});

test("Borrado de posición es deshacible en modo restore", () => {
  assert.equal(undoModeFor({ type: "position_closed", operationGroupId: "", reason: "deleted" }), "restore");
});

test("Rebalanceo (cierre con reason rebalanced) NO se restaura como borrado", () => {
  // El cierre del rebalanceo se deshace vía su grupo (modo operation en las
  // filas source/target), no como restauración. La propia fila position_closed
  // con reason rebalanced no ofrece restore.
  assert.equal(undoModeFor({ type: "position_closed", operationGroupId: "g3", reason: "rebalanced" }), null);
});

test("Auto-cierre NO es deshacible (no es acción del gestor)", () => {
  assert.equal(undoModeFor({ type: "position_closed", operationGroupId: "g4", reason: "auto_closed" }), null);
  assert.equal(undoModeFor({ type: "deposit", operationGroupId: "g4", reason: "auto_closed" }), null);
});

test("Operación legacy sin grupo no ofrece deshacer (evita borrados amplios)", () => {
  assert.equal(undoModeFor({ type: "deposit", operationGroupId: "", reason: "" }), null);
});
