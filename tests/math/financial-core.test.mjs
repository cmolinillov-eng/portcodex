/**
 * NÚCLEO FINANCIERO — pruebas contra el código REAL de `src/`.
 *
 * Antes este fichero reimplementaba dentro de sí mismo cada fórmula que decía
 * comprobar: 67 pruebas en verde que solo demostraban que una copia del código
 * coincidía consigo misma. Pasaban igual estuviera el producto bien o mal —de
 * hecho pasaban con el producto mal—. Ahora todo lo que se afirma aquí se
 * importa de `src/`; si algo no es importable, no se prueba y se dice.
 *
 * QUÉ CUBRE (código real importado):
 *   1. `src/lib/lending/thresholds.ts` — Health Factor, LTV, LTV máximo y
 *      precios de liquidación con los liquidation thresholds por token.
 *   2. `src/lib/portfolio/valuation.ts` — harvest pendiente cuando la cesta
 *      reinvertida no coincide con la cosechada (saldos negativos por token).
 *   3. `src/lib/snapshots/metrics.ts` — P&L de la curva
 *      (valor − depositado + P&L realizado), TWR y máxima caída.
 *   4. `src/lib/portfolio/rebalance-split.ts` — reparto del importe de un
 *      rebalanceo entre los dos tokens del destino.
 *   5. `src/components/dashboard/sections/undo-mode.ts` — qué operaciones se
 *      pueden deshacer y con qué modo.
 *
 * QUÉ NO CUBRE (y por qué). Todo esto vive DENTRO de
 * `src/lib/dashboard/get-dashboard-data.ts`, en funciones privadas o en el
 * cuerpo de un bucle, así que no se puede importar suelto:
 *   · ROI (`calculateRoiPercent`) e impermanent loss
 *     (`calculateImpermanentLossPercent` / `...FromRatio`).
 *   · Coste medio de entrada tras una retirada parcial (el prorrateo de
 *     `costUsd`/`depositedAmount` está inline en el bucle de
 *     `txBalanceByTokenPosition`).
 *   · `computeClosureSnapshot` de `/api/positions/delete` y el snapshot de
 *     `auto-close`: funciones asíncronas que reciben un cliente de Supabase.
 * La vía para cubrirlo es `tests/helpers/supabase-stub.mjs` —base de datos
 * falsa en memoria que permite ejecutar `getDashboardData` y los route handlers
 * de verdad—, como ya hace `tests/portfolio/dashboard-token-fantasma.test.ts`.
 * Eso son pruebas de dashboard, no de aritmética pura, y por eso viven en
 * `tests/portfolio/`, no aquí.
 *
 * El ayudante `../helpers/ts-resolve.mjs` resuelve el alias `@/` y los imports
 * sin extensión; por eso los módulos se cargan con `await import` dinámico.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "../helpers/ts-resolve.mjs";

const {
  getLiquidationThreshold,
  calculateHealthFactor,
  calculateLtv,
  calculateMaxLtv,
  calculateLiquidationPrices,
  DEFAULT_THRESHOLD,
  HEALTH_FACTOR_ALERT,
  HEALTH_FACTOR_LIQUIDATION,
} = await import("../../src/lib/lending/thresholds.ts");
const { computePortfolioValuation } = await import("../../src/lib/portfolio/valuation.ts");
const { buildSnapshotSeries } = await import("../../src/lib/snapshots/metrics.ts");
const {
  rebalanceLpSplitAmounts,
  rebalanceTargetAmountFromUsd,
  normalizeSplitPercentA,
} = await import("../../src/lib/portfolio/rebalance-split.ts");
const { undoModeFor } = await import("../../src/components/dashboard/sections/undo-mode.ts");

// ─────────────────────────────────────────────────────────────────────────────
// 1) Riesgo de lending: thresholds, Health Factor, LTV y precio de liquidación
//    src/lib/lending/thresholds.ts
// ─────────────────────────────────────────────────────────────────────────────

test("threshold por token: los blue chips tienen el suyo, el resto el de por defecto", () => {
  assert.equal(getLiquidationThreshold("BTC"), 0.78);
  assert.equal(getLiquidationThreshold("ETH"), 0.83);
  assert.equal(getLiquidationThreshold("SOL"), 0.65);
  assert.equal(getLiquidationThreshold("USDC"), 0.87);
  assert.equal(getLiquidationThreshold("RANDOMSHITCOIN"), DEFAULT_THRESHOLD);
  assert.equal(DEFAULT_THRESHOLD, 0.5);
});

test("threshold: el símbolo se normaliza (espacios, minúsculas, vacío)", () => {
  assert.equal(getLiquidationThreshold("  weth "), 0.83);
  assert.equal(getLiquidationThreshold(""), DEFAULT_THRESHOLD);
});

test("HF: 1.000 $ de BTC con 500 $ de deuda = 1,56 (no 2,0)", () => {
  // Sin ponderar daría 2,0; el threshold de BTC (0,78) lo baja a 1,56.
  const hf = calculateHealthFactor(
    [{ symbol: "BTC", valueUsd: 1000 }],
    [{ symbol: "USDC", valueUsd: 500 }],
  );
  assert.equal(Number(hf.toFixed(4)), 1.56);
});

test("HF: 1.000 $ de ETH con 500 $ de deuda = 1,66", () => {
  const hf = calculateHealthFactor(
    [{ symbol: "ETH", valueUsd: 1000 }],
    [{ symbol: "USDC", valueUsd: 500 }],
  );
  assert.equal(Number(hf.toFixed(4)), 1.66);
});

test("HF con varios colaterales: se pondera cada uno con su threshold", () => {
  // 500×0,78 + 500×0,83 = 805 → 805/500 = 1,61
  const hf = calculateHealthFactor(
    [
      { symbol: "BTC", valueUsd: 500 },
      { symbol: "ETH", valueUsd: 500 },
    ],
    [{ symbol: "USDC", valueUsd: 500 }],
  );
  assert.equal(Number(hf.toFixed(4)), 1.61);
});

test("HF con varias deudas: suman sin ponderar (la deuda vale lo que vale)", () => {
  const hf = calculateHealthFactor(
    [{ symbol: "BTC", valueUsd: 1000 }],
    [
      { symbol: "USDC", valueUsd: 250 },
      { symbol: "DAI", valueUsd: 250 },
    ],
  );
  assert.equal(Number(hf.toFixed(4)), 1.56);
});

test("HF sin deuda es null (infinito), no 0", () => {
  assert.equal(calculateHealthFactor([{ symbol: "BTC", valueUsd: 1000 }], []), null);
});

test("HF con deuda pero sin colateral efectivo es 0 (el peor caso)", () => {
  assert.equal(calculateHealthFactor([], [{ symbol: "USDC", valueUsd: 500 }]), 0);
});

test("HF con token desconocido cae al threshold conservador (0,50)", () => {
  const hf = calculateHealthFactor(
    [{ symbol: "RANDOMSHITCOIN", valueUsd: 1000 }],
    [{ symbol: "USDC", valueUsd: 500 }],
  );
  assert.equal(Number(hf.toFixed(4)), 1);
});

test("HF: el mismo dinero en SOL da menos margen que en BTC", () => {
  const hfBtc = calculateHealthFactor(
    [{ symbol: "BTC", valueUsd: 1000 }],
    [{ symbol: "USDC", valueUsd: 500 }],
  );
  const hfSol = calculateHealthFactor(
    [{ symbol: "SOL", valueUsd: 1000 }],
    [{ symbol: "USDC", valueUsd: 500 }],
  );
  assert.ok(hfSol < hfBtc, `SOL (${hfSol}) debería dar menos margen que BTC (${hfBtc})`);
});

test("los umbrales de aviso son coherentes: se avisa antes de liquidar", () => {
  assert.equal(HEALTH_FACTOR_LIQUIDATION, 1);
  assert.ok(HEALTH_FACTOR_ALERT > HEALTH_FACTOR_LIQUIDATION);
});

test("LTV: 500 de deuda sobre 1.000 de colateral = 0,5", () => {
  assert.equal(calculateLtv([{ valueUsd: 1000 }], [{ valueUsd: 500 }]), 0.5);
});

test("LTV sin colateral es null; sin deuda es 0", () => {
  assert.equal(calculateLtv([], [{ valueUsd: 100 }]), null);
  assert.equal(calculateLtv([{ valueUsd: 1000 }], []), 0);
});

test("LTV máximo: con un solo colateral es su propio threshold", () => {
  assert.equal(calculateMaxLtv([{ symbol: "BTC", valueUsd: 1000 }]), 0.78);
});

test("LTV máximo mixto: media ponderada por valor", () => {
  // 500×0,78 + 500×0,87 = 825 → 0,825
  const v = calculateMaxLtv([
    { symbol: "BTC", valueUsd: 500 },
    { symbol: "USDC", valueUsd: 500 },
  ]);
  assert.equal(Number(v.toFixed(4)), 0.825);
});

test("LTV máximo sin colateral es null", () => {
  assert.equal(calculateMaxLtv([]), null);
});

test("precio de liquidación: 1 BTC a 40.000 con 20.000 de deuda liquida en 25.641", () => {
  // p_liq = deuda / (cantidad × threshold) = 20000 / (1 × 0,78)
  const out = calculateLiquidationPrices(
    [{ symbol: "BTC", amount: 1, valueUsd: 40000 }],
    [{ valueUsd: 20000 }],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].currentPrice, 40000);
  assert.equal(Math.round(out[0].liquidationPrice), 25641);
  assert.ok(out[0].dropPercent > 35 && out[0].dropPercent < 36.5);
});

test("precio de liquidación con stablecoin de colateral: mucho margen de caída", () => {
  // p_liq = 500 / (1000 × 0,87) = 0,5747
  const out = calculateLiquidationPrices(
    [{ symbol: "USDC", amount: 1000, valueUsd: 1000 }],
    [{ valueUsd: 500 }],
  );
  assert.equal(Number(out[0].liquidationPrice.toFixed(4)), 0.5747);
});

test("precio de liquidación: si el resto del colateral cubre la deuda, ese token puede irse a 0", () => {
  // 10.000 USDC × 0,87 = 8.700 > 5.000 de deuda → el BTC no liquida nunca solo.
  const out = calculateLiquidationPrices(
    [
      { symbol: "BTC", amount: 1, valueUsd: 40000 },
      { symbol: "USDC", amount: 10000, valueUsd: 10000 },
    ],
    [{ valueUsd: 5000 }],
  );
  const btc = out.find((o) => o.symbol === "BTC");
  assert.equal(btc.liquidationPrice, 0);
  assert.equal(btc.dropPercent, 100);
});

test("precio de liquidación sin deuda es null (no hay nada que liquidar)", () => {
  const out = calculateLiquidationPrices(
    [{ symbol: "BTC", amount: 1, valueUsd: 40000 }],
    [],
  );
  assert.equal(out[0].liquidationPrice, null);
  assert.equal(out[0].dropPercent, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2) Harvest pendiente con cesta reinvertida distinta de la cosechada
//    src/lib/portfolio/valuation.ts
//
//    Las filas tienen la forma EXACTA que escribe /api/transactions
//    (rama `operationType === "reinvest"`): el depósito de la reinversión lleva
//    metadata { source: "harvest_reinvest", sourcePositionId, sourceProtocol }.
// ─────────────────────────────────────────────────────────────────────────────

const HARVEST_PRICES = { USDC: 0.999875, SOL: 81.84 };
const harvestPriceOf = (symbol) => HARVEST_PRICES[symbol.toUpperCase()] ?? 0;

function valuationTx(fields) {
  return {
    type: null,
    token_in_symbol: null,
    token_in_amount: null,
    token_out_symbol: null,
    token_out_amount: null,
    spot_price: null,
    position_id: null,
    position_type: "Liquidity Pool",
    protocol: "Orca",
    metadata: null,
    notes: null,
    ...fields,
  };
}

/** Pool SOL/USDC que cosecha las dos monedas y reinvierte SOLO SOL, más SOL del
 *  que cobró: el SOL pendiente queda en negativo. */
const POOL_CON_SOBRE_REINVERSION = [
  valuationTx({ type: "lp_deposit", token_in_symbol: "USDC", token_in_amount: 1000, spot_price: 1, position_id: "pool" }),
  valuationTx({ type: "harvest", token_in_symbol: "USDC", token_in_amount: 157.6240695792492, spot_price: 0.999875, position_id: "pool" }),
  valuationTx({ type: "harvest", token_in_symbol: "SOL", token_in_amount: 0.8595, spot_price: 81.84, position_id: "pool" }),
  valuationTx({
    type: "lp_deposit", token_in_symbol: "SOL", token_in_amount: 1.414426761, spot_price: 81.84, position_id: "pool",
    metadata: { source: "harvest_reinvest", sourcePositionId: "pool", sourceProtocol: "Orca" },
  }),
];

test("reinvertir un harvest no suma capital depositado", () => {
  const v = computePortfolioValuation(POOL_CON_SOBRE_REINVERSION, harvestPriceOf);
  assert.equal(v.totalDepositedUsd, 1000);
});

test(
  "harvest pendiente: el token sobre-reinvertido descuenta a precio de mercado",
  () => {
    // Cosechado 157,624 USDC + 0,8595 SOL; reinvertido 1,414427 SOL.
    // Pendiente por token: USDC +157,624 y SOL −0,554927.
    // Neto a precio de mercado: 157,604 − 45,414 = 112,19 $.
    const v = computePortfolioValuation(POOL_CON_SOBRE_REINVERSION, harvestPriceOf);
    assert.ok(
      Math.abs(v.pendingHarvestUsd - 112.19) < 0.01,
      `pendiente esperado ~112,19 $; obtenido ${v.pendingHarvestUsd}`,
    );
  },
);

test("harvest pendiente nunca queda negativo", () => {
  const v = computePortfolioValuation(
    [
      valuationTx({ type: "lp_deposit", token_in_symbol: "USDC", token_in_amount: 1000, spot_price: 1, position_id: "pool" }),
      valuationTx({ type: "harvest", token_in_symbol: "SOL", token_in_amount: 0.5, spot_price: 81.84, position_id: "pool" }),
      valuationTx({
        type: "lp_deposit", token_in_symbol: "SOL", token_in_amount: 1, spot_price: 81.84, position_id: "pool",
        metadata: { source: "harvest_reinvest", sourcePositionId: "pool", sourceProtocol: "Orca" },
      }),
    ],
    harvestPriceOf,
  );
  assert.ok(v.pendingHarvestUsd >= 0, `el pendiente no puede ser negativo: ${v.pendingHarvestUsd}`);
});

test("reinversión parcial: el pendiente baja justo por lo reinvertido", () => {
  const v = computePortfolioValuation(
    [
      valuationTx({ type: "lp_deposit", token_in_symbol: "USDC", token_in_amount: 1000, spot_price: 1, position_id: "pool" }),
      valuationTx({ type: "harvest", token_in_symbol: "USDC", token_in_amount: 100, spot_price: 1, position_id: "pool" }),
      valuationTx({
        type: "lp_deposit", token_in_symbol: "USDC", token_in_amount: 40, spot_price: 1, position_id: "pool",
        metadata: { source: "harvest_reinvest", sourcePositionId: "pool", sourceProtocol: "Orca" },
      }),
    ],
    harvestPriceOf,
  );
  // Quedan 60 USDC pendientes a 0,999875 $.
  assert.equal(Number(v.pendingHarvestUsd.toFixed(4)), Number((60 * 0.999875).toFixed(4)));
});

// ─────────────────────────────────────────────────────────────────────────────
// 3) P&L de la curva y métricas de la serie
//    src/lib/snapshots/metrics.ts
//
//    Los snapshots tienen la forma que guarda capturePortfolioSnapshot:
//    realizedPnlUsd es la SUMA de metadata.closure.realizedPnl de las filas
//    position_closed vivas.
// ─────────────────────────────────────────────────────────────────────────────

const snapshot = (fields) => ({
  capturedAt: "2026-01-01",
  totalValueUsd: 0,
  totalDepositedUsd: 0,
  pendingHarvestUsd: 0,
  realizedPnlUsd: 0,
  ...fields,
});

test("P&L de un punto = valor − depositado + P&L realizado", () => {
  const { points } = buildSnapshotSeries([
    snapshot({ totalValueUsd: 1200, totalDepositedUsd: 1000, realizedPnlUsd: 50 }),
  ]);
  assert.equal(points[0].pnl, 250);
  assert.equal(Number(points[0].pnlPercent.toFixed(4)), 25);
});

test("cierre automático: con realizedPnl = 0 el P&L no se cuenta dos veces", () => {
  // Depositó 800, la posición valía 1.000 y se retiró todo: la retirada a precio
  // de salida deja el depositado neto en −200, así que el P&L ya está ahí.
  // auto-close.ts deja las transacciones activas y por eso escribe realizedPnl 0.
  const { points } = buildSnapshotSeries([
    snapshot({ totalValueUsd: 0, totalDepositedUsd: -200, realizedPnlUsd: 0 }),
  ]);
  assert.equal(points[0].pnl, 200);
});

test("borrado manual: las transacciones desaparecen y el P&L lo lleva el cierre", () => {
  // /api/positions/delete hace soft-delete de las transacciones (depositado 0)
  // y guarda el resultado en metadata.closure.realizedPnl.
  const { points } = buildSnapshotSeries([
    snapshot({ totalValueUsd: 0, totalDepositedUsd: 0, realizedPnlUsd: 200 }),
  ]);
  assert.equal(points[0].pnl, 200);
});

test("los dos caminos de cierre dan el mismo P&L", () => {
  const auto = buildSnapshotSeries([snapshot({ totalDepositedUsd: -200, realizedPnlUsd: 0 })]);
  const borrado = buildSnapshotSeries([snapshot({ totalDepositedUsd: 0, realizedPnlUsd: 200 })]);
  assert.equal(auto.points[0].pnl, borrado.points[0].pnl);
  assert.equal(auto.points[0].pnl, 200);
});

test("P&L en porcentaje: sin depositado no se divide por cero", () => {
  const { points } = buildSnapshotSeries([
    snapshot({ totalValueUsd: 500, totalDepositedUsd: 0, realizedPnlUsd: 0 }),
  ]);
  assert.equal(points[0].pnlPercent, 0);
});

test("TWR: meter capital nuevo no cuenta como rentabilidad", () => {
  // El valor se dobla, pero solo porque entró otro tanto de capital.
  const { metrics } = buildSnapshotSeries([
    snapshot({ capturedAt: "2026-01-01", totalValueUsd: 1000, totalDepositedUsd: 1000 }),
    snapshot({ capturedAt: "2026-01-02", totalValueUsd: 2000, totalDepositedUsd: 2000 }),
  ]);
  assert.equal(metrics.twr, 0);
});

test("TWR: la revalorización sin aportaciones sí cuenta", () => {
  const { metrics } = buildSnapshotSeries([
    snapshot({ capturedAt: "2026-01-01", totalValueUsd: 1000, totalDepositedUsd: 1000 }),
    snapshot({ capturedAt: "2026-01-02", totalValueUsd: 1100, totalDepositedUsd: 1000 }),
  ]);
  assert.equal(metrics.twr, 10);
});

test("máxima caída: la mayor bajada de pico a valle", () => {
  const { metrics } = buildSnapshotSeries([
    snapshot({ capturedAt: "2026-01-01", totalValueUsd: 1000, totalDepositedUsd: 1000 }),
    snapshot({ capturedAt: "2026-01-02", totalValueUsd: 1200, totalDepositedUsd: 1000 }),
    snapshot({ capturedAt: "2026-01-03", totalValueUsd: 900, totalDepositedUsd: 1000 }),
    snapshot({ capturedAt: "2026-01-04", totalValueUsd: 1100, totalDepositedUsd: 1000 }),
  ]);
  assert.equal(metrics.maxDrawdown, 25); // (1200 − 900) / 1200
  assert.equal(metrics.totalDays, 4);
  assert.equal(metrics.firstDate, "2026-01-01");
  assert.equal(metrics.lastDate, "2026-01-04");
});

test("serie vacía: métricas nulas, sin reventar", () => {
  const { points, metrics } = buildSnapshotSeries([]);
  assert.equal(points.length, 0);
  assert.equal(metrics.twr, null);
  assert.equal(metrics.maxDrawdown, null);
  assert.equal(metrics.totalDays, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4) Reparto del rebalanceo entre los tokens del destino
//    src/lib/portfolio/rebalance-split.ts
// ─────────────────────────────────────────────────────────────────────────────

test("split 50/50: 200 $ a ETH 2.000 y USDC 1 → 0,05 ETH + 100 USDC", () => {
  const { amountA, amountB } = rebalanceLpSplitAmounts(200, 50, 2000, 1);
  assert.equal(Number(amountA.toFixed(6)), 0.05);
  assert.equal(Number(amountB.toFixed(4)), 100);
});

test("split 60/40: el valor total se conserva", () => {
  const { amountA, amountB } = rebalanceLpSplitAmounts(200, 60, 2000, 1);
  assert.equal(Number((amountA * 2000 + amountB * 1).toFixed(6)), 200);
});

test("split 40/60: cada cantidad refleja su porcentaje", () => {
  const { amountA, amountB } = rebalanceLpSplitAmounts(100, 40, 1000, 2);
  assert.equal(Number(amountA.toFixed(6)), 0.04); // 40 $ / 1.000
  assert.equal(Number(amountB.toFixed(6)), 30);   // 60 $ / 2
});

test("split 0 %: todo va al token B; split 100 %: todo al token A", () => {
  const cero = rebalanceLpSplitAmounts(100, 0, 2000, 1);
  assert.equal(cero.amountA, 0);
  assert.equal(cero.amountB, 100);
  const cien = rebalanceLpSplitAmounts(100, 100, 2000, 1);
  assert.equal(Number(cien.amountA.toFixed(6)), 0.05);
  assert.equal(cien.amountB, 0);
});

test("split sin precio para el token B: cantidad 0, no infinito", () => {
  const { amountA, amountB } = rebalanceLpSplitAmounts(100, 50, 2000, 0);
  assert.ok(Number.isFinite(amountA));
  assert.equal(amountB, 0);
});

test("split con precios no redondos: el valor total se conserva", () => {
  const priceA = 63478.5;
  const priceB = 1.0002;
  const { amountA, amountB } = rebalanceLpSplitAmounts(500, 70, priceA, priceB);
  const total = amountA * priceA + amountB * priceB;
  assert.ok(Math.abs(total - 500) < 0.01, `esperado ~500 $, obtenido ${total}`);
});

test("porcentaje fuera de rango se recorta; texto no numérico cae al 50/50", () => {
  assert.equal(normalizeSplitPercentA(150), 100);
  assert.equal(normalizeSplitPercentA(-20), 0);
  assert.equal(normalizeSplitPercentA(Number("no-es-un-numero")), 50);
  // El campo vacío es Number("") = 0, que sí es finito: reparte 0/100.
  assert.equal(normalizeSplitPercentA(Number("")), 0);
});

test("destino de un solo token: 180 $ a BTC de 60.000 → 0,003 BTC", () => {
  assert.equal(Number(rebalanceTargetAmountFromUsd(180, 60000).toFixed(6)), 0.003);
});

test("destino sin precio: cantidad 0 en vez de dividir por cero", () => {
  assert.equal(rebalanceTargetAmountFromUsd(100, 0), 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5) Qué se puede deshacer
//    src/components/dashboard/sections/undo-mode.ts
// ─────────────────────────────────────────────────────────────────────────────

const actividad = (fields) => ({
  transactionDate: "2026-01-01T00:00:00.000Z",
  type: "deposit",
  movementOrigin: "standard",
  operationGroupId: "",
  portfolioId: "p1",
  reason: "",
  protocol: "Wallet",
  positionId: "sol-hold",
  positionType: "Hold",
  tokenInSymbol: "SOL",
  tokenInAmount: 1,
  tokenOutSymbol: "",
  tokenOutAmount: 0,
  spotPrice: 100,
  ...fields,
});

test("un alta con grupo se deshace como operación", () => {
  assert.equal(undoModeFor(actividad({ type: "deposit", operationGroupId: "g1" })), "operation");
  assert.equal(undoModeFor(actividad({ type: "lp_deposit", operationGroupId: "g2" })), "operation");
});

test("un borrado de posición se deshace restaurando", () => {
  assert.equal(
    undoModeFor(actividad({ type: "position_closed", reason: "deleted" })),
    "restore",
  );
});

test("el cierre de un rebalanceo no se restaura como si fuera un borrado", () => {
  assert.equal(
    undoModeFor(actividad({ type: "position_closed", operationGroupId: "g3", reason: "rebalanced" })),
    null,
  );
});

test("un cierre automático no se deshace (no es una acción del gestor)", () => {
  assert.equal(
    undoModeFor(actividad({ type: "position_closed", operationGroupId: "g4", reason: "auto_closed" })),
    null,
  );
  assert.equal(
    undoModeFor(actividad({ type: "deposit", operationGroupId: "g4", reason: "auto_closed" })),
    null,
  );
});

test("una operación antigua sin grupo no ofrece deshacer", () => {
  assert.equal(undoModeFor(actividad({ type: "deposit", operationGroupId: "" })), null);
});

/*
 * AVISO SOBRE LA RAMA "restore"
 * -----------------------------
 * Las pruebas de arriba comprueban el contrato de `undoModeFor`, pero la rama
 * "restore" no se alcanza hoy en producción: `get-dashboard-data.ts` rellena
 * `reason` con `getMetadataFlag(metadata, notes, "reason")`, que solo mira
 * `metadata.reason`, mientras que los tres sitios que escriben un cierre
 * —`/api/positions/delete`, `auto-close.ts` y el rebalanceo de
 * `/api/transactions`— lo guardan en `metadata.closure.reason`. Para las filas
 * `position_closed` el campo llega siempre vacío, así que la Actividad reciente
 * nunca ofrece restaurar un borrado (el modal de histórico sí, porque lee
 * `metadata.closure` por su cuenta). Se reporta, no se arregla aquí:
 * get-dashboard-data.ts lo está tocando otro agente.
 */
