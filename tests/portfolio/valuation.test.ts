import test from "node:test";
import assert from "node:assert/strict";
import { computePortfolioValuation, positionKey, type ValuationTx } from "../../src/lib/portfolio/valuation.ts";

// Precios fijos para las aserciones.
const PRICES: Record<string, number> = { SOL: 100, USDC: 1, USDS: 1, WETH: 2000, BTC: 60000, HYPE: 40 };
const priceOf = (s: string) => PRICES[s.toUpperCase()] ?? 0;

function tx(p: Partial<ValuationTx>): ValuationTx {
  return {
    type: null, token_in_symbol: null, token_in_amount: null,
    token_out_symbol: null, token_out_amount: null, spot_price: null,
    position_id: null, position_type: "Hold", protocol: "Wallet", metadata: null, notes: null,
    ...p,
  };
}

test("depósito simple: valor = balance × precio, depositado = coste", () => {
  const v = computePortfolioValuation([
    tx({ type: "deposit", token_in_symbol: "SOL", token_in_amount: 2, spot_price: 90, position_id: "sol-hold", protocol: "Wallet" }),
  ], priceOf);
  assert.equal(v.totalDepositedUsd, 180); // 2 × 90 (precio de entrada)
  assert.equal(v.totalValueUsd, 200);     // 2 × 100 (precio actual)
  assert.equal(v.pendingHarvestUsd, 0);
});

test("harvest sin reinvertir suma a pendiente, NO a depositado", () => {
  const v = computePortfolioValuation([
    tx({ type: "lp_deposit", token_in_symbol: "USDC", token_in_amount: 1000, spot_price: 1, position_id: "pool1", protocol: "Orca", position_type: "Liquidity Pool" }),
    tx({ type: "harvest", token_in_symbol: "USDC", token_in_amount: 50, spot_price: 1, position_id: "pool1", protocol: "Orca", position_type: "Liquidity Pool" }),
  ], priceOf);
  assert.equal(v.totalDepositedUsd, 1000);
  assert.equal(v.pendingHarvestUsd, 50);
  assert.equal(v.totalValueUsd, 1050); // 1000 balance + 50 pending
});

test("harvest reinvertido: pendiente vuelve a 0, valor sube, depositado NO", () => {
  const v = computePortfolioValuation([
    tx({ type: "lp_deposit", token_in_symbol: "USDC", token_in_amount: 1000, spot_price: 1, position_id: "pool1", protocol: "Orca", position_type: "Liquidity Pool" }),
    tx({ type: "harvest", token_in_symbol: "USDC", token_in_amount: 50, spot_price: 1, position_id: "pool1", protocol: "Orca", position_type: "Liquidity Pool" }),
    tx({ type: "lp_deposit", token_in_symbol: "USDC", token_in_amount: 50, spot_price: 1, position_id: "pool1", protocol: "Orca", position_type: "Liquidity Pool", metadata: { source: "harvest_reinvest", sourcePositionId: "pool1", sourceProtocol: "Orca" } }),
  ], priceOf);
  assert.equal(v.totalDepositedUsd, 1000);       // la reinversión NO es capital nuevo
  assert.equal(v.pendingHarvestUsd, 0);          // 50 cobrado − 50 reinvertido
  assert.equal(v.totalValueUsd, 1050);           // 1050 balance (1000+50), 0 pending
});

test("harvest histórico (posición nula) suma al total pero NO al pendiente ni valor", () => {
  const v = computePortfolioValuation([
    tx({ type: "deposit", token_in_symbol: "SOL", token_in_amount: 1, spot_price: 100, position_id: "sol-hold" }),
    tx({ type: "harvest", token_in_symbol: "USDC", token_in_amount: 300, spot_price: 1, position_id: null }),
  ], priceOf);
  assert.equal(v.pendingHarvestUsd, 0);   // posición nula → no pending
  assert.equal(v.totalValueUsd, 100);     // solo el SOL
});

test("lending: el valor neto resta la deuda", () => {
  const v = computePortfolioValuation([
    tx({ type: "lending_supply", token_in_symbol: "WETH", token_in_amount: 1, spot_price: 2000, position_id: "aave1", protocol: "Aave V3", position_type: "Lending" }),
    tx({ type: "lending_borrow", token_in_symbol: "USDC", token_in_amount: 500, spot_price: 1, position_id: "aave1", protocol: "Aave V3", position_type: "Lending" }),
  ], priceOf);
  assert.equal(v.debtUsd, 500);
  assert.equal(v.totalValueUsd, 1500);            // 2000 colateral − 500 deuda
  assert.equal(v.totalDepositedUsd, 2000 - 500);  // supply 2000, borrow extrae 500
});

test("retirada reduce balance y depositado pro-rata implícito", () => {
  const v = computePortfolioValuation([
    tx({ type: "deposit", token_in_symbol: "BTC", token_in_amount: 1, spot_price: 60000, position_id: "btc-hold" }),
    tx({ type: "withdrawal", token_out_symbol: "BTC", token_out_amount: 0.5, spot_price: 60000, position_id: "btc-hold" }),
  ], priceOf);
  assert.equal(v.totalValueUsd, 30000);       // 0.5 BTC restante
  assert.equal(v.totalDepositedUsd, 30000);   // 60000 − 30000
});

test("clave de posición incluye protocolo (no colisiona)", () => {
  assert.equal(positionKey("Orca", "p1"), "Orca::p1");
  assert.notEqual(positionKey("Orca", "p1"), positionKey("Kamino", "p1"));
});

test("COHERENCIA: total = Σ posiciones − deuda + pendiente", () => {
  const txs = [
    tx({ type: "deposit", token_in_symbol: "SOL", token_in_amount: 3, spot_price: 95, position_id: "sol-hold" }),
    tx({ type: "lp_deposit", token_in_symbol: "USDC", token_in_amount: 2000, spot_price: 1, position_id: "pool1", protocol: "Kamino", position_type: "Liquidity Pool" }),
    tx({ type: "harvest", token_in_symbol: "USDC", token_in_amount: 40, spot_price: 1, position_id: "pool1", protocol: "Kamino", position_type: "Liquidity Pool" }),
    tx({ type: "lending_supply", token_in_symbol: "WETH", token_in_amount: 1, spot_price: 2000, position_id: "aave1", protocol: "Aave V3", position_type: "Lending" }),
    tx({ type: "lending_borrow", token_in_symbol: "USDC", token_in_amount: 300, spot_price: 1, position_id: "aave1", protocol: "Aave V3", position_type: "Lending" }),
  ];
  const v = computePortfolioValuation(txs, priceOf);
  const sumPositions = v.byPosition.reduce((s, p) => s + p.valueUsd, 0);
  assert.equal(Number((sumPositions - v.debtUsd + v.pendingHarvestUsd).toFixed(6)), Number(v.totalValueUsd.toFixed(6)));
  // composición cuadra con el total menos pendiente
  const compSum = Object.values(v.composition).reduce((s, x) => s + x, 0);
  assert.equal(Number(compSum.toFixed(6)), Number((v.totalValueUsd - v.pendingHarvestUsd).toFixed(6)));
});
