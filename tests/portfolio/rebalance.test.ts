import test from "node:test";
import assert from "node:assert/strict";
import { computePortfolioValuation, positionKey, type ValuationTx } from "../../src/lib/portfolio/valuation.ts";

/**
 * REBALANCEO — conservación del capital y de la base de coste.
 *
 * Las filas de estos casos son EXACTAMENTE las que escribe
 * src/app/api/transactions/route.ts (rama `operationType === "rebalance"`):
 *   · salida del origen  → type de retirada, token en `token_out_*`,
 *                          metadata.reason = "rebalance_transfer",
 *                          metadata.depositedDelta NEGATIVO (prorrateado por
 *                          filas: un LP emite dos).
 *   · entrada al destino → type de depósito, token en `token_in_*`,
 *                          metadata.source = "rebalance_transfer",
 *                          metadata.depositedDelta POSITIVO.
 *   · harvest arrastrado → misma retirada pero
 *                          metadata.reason = "rebalance_harvest_out" y
 *                          depositedDelta 0 (el harvest no es capital).
 *
 * Lo que se comprueba es la regla contable del rebalanceo: el total depositado
 * de la cartera NO cambia, la base viaja de la posición origen a la destino, y
 * el valor total se conserva.
 */

const PRICES: Record<string, number> = { SOL: 100, USDC: 1, BTC: 60000 };
const priceOf = (s: string) => PRICES[s.toUpperCase()] ?? 0;

function tx(p: Partial<ValuationTx>): ValuationTx {
  return {
    type: null, token_in_symbol: null, token_in_amount: null,
    token_out_symbol: null, token_out_amount: null, spot_price: null,
    position_id: null, position_type: "Hold", protocol: "Wallet", metadata: null, notes: null,
    ...p,
  };
}

test("rebalanceo Hold→Hold: la base viaja, el total depositado no se mueve", () => {
  const v = computePortfolioValuation(
    [
      // 2 SOL comprados a 90 $ → 180 $ depositados.
      tx({ type: "deposit", token_in_symbol: "SOL", token_in_amount: 2, spot_price: 90, position_id: "sol-hold" }),
      // Se mueve 1 SOL (mitad de la posición) a un hold de BTC: 100 $ a precio
      // actual y, por tanto, la mitad de la base (90 $).
      tx({
        type: "withdrawal", token_out_symbol: "SOL", token_out_amount: 1, spot_price: 100,
        position_id: "sol-hold",
        metadata: { reason: "rebalance_transfer", depositedDelta: -90 },
      }),
      tx({
        type: "deposit", token_in_symbol: "BTC", token_in_amount: 100 / 60000, spot_price: 60000,
        position_id: "btc-hold",
        metadata: {
          source: "rebalance_transfer", usdValue: 100, depositedDelta: 90,
          sourcePositionId: "sol-hold", sourceProtocol: "Wallet",
          rebalanceSwapChecked: true,
          swapLegs: [{ soldSymbol: "SOL", soldAmount: 1, soldPriceUsd: 100, boughtSymbol: "BTC", boughtAmount: 100 / 60000, boughtPriceUsd: 60000 }],
        },
      }),
    ],
    priceOf,
  );

  // El rebalanceo no aporta ni retira capital: el depositado global es el de la
  // compra inicial.
  assert.equal(v.totalDepositedUsd, 180);
  // 1 SOL (100 $) + el BTC comprado (100 $).
  assert.equal(Math.round(v.totalValueUsd), 200);
  // La mitad de la base se quedó en el origen y la otra mitad viajó al destino.
  assert.equal(v.depositedByPosition.get(positionKey("Wallet", "sol-hold")), 90);
  assert.equal(v.depositedByPosition.get(positionKey("Wallet", "btc-hold")), 90);
  // Y la suma por posición cuadra con el total (no se duplica ni se pierde).
  const sumByPosition = [...v.depositedByPosition.values()].reduce((a, b) => a + b, 0);
  assert.equal(sumByPosition, v.totalDepositedUsd);
});

test("rebalanceo parcial de LP arrastrando harvest: no se resta dos veces", () => {
  const v = computePortfolioValuation(
    [
      // Pool de 1.000 USDC + 10 SOL = 2.000 $ depositados.
      tx({ type: "lp_deposit", token_in_symbol: "USDC", token_in_amount: 1000, spot_price: 1, position_id: "pool", protocol: "Orca", position_type: "Liquidity Pool" }),
      tx({ type: "lp_deposit", token_in_symbol: "SOL", token_in_amount: 10, spot_price: 100, position_id: "pool", protocol: "Orca", position_type: "Liquidity Pool" }),
      // 1 SOL de recompensa cobrada y sin reinvertir (100 $ pendientes).
      tx({ type: "harvest", token_in_symbol: "SOL", token_in_amount: 1, spot_price: 100, position_id: "pool", protocol: "Orca", position_type: "Liquidity Pool" }),
      // Se mueve la MITAD del pool (500 USDC + 5 SOL) más el harvest pendiente.
      tx({
        type: "lp_withdraw", token_out_symbol: "USDC", token_out_amount: 500, spot_price: 1,
        position_id: "pool", protocol: "Orca", position_type: "Liquidity Pool",
        metadata: { reason: "rebalance_transfer", depositedDelta: -500 },
      }),
      tx({
        type: "lp_withdraw", token_out_symbol: "SOL", token_out_amount: 5, spot_price: 100,
        position_id: "pool", protocol: "Orca", position_type: "Liquidity Pool",
        metadata: { reason: "rebalance_transfer", depositedDelta: -500 },
      }),
      tx({
        type: "lp_withdraw", token_out_symbol: "SOL", token_out_amount: 1, spot_price: 100,
        position_id: "pool", protocol: "Orca", position_type: "Liquidity Pool",
        metadata: { reason: "rebalance_harvest_out", depositedDelta: 0 },
      }),
      // Entra en el hold: 500 + 500 + 100 (harvest) = 1.100 $.
      tx({
        type: "deposit", token_in_symbol: "USDC", token_in_amount: 1100, spot_price: 1,
        position_id: "usdc-hold", protocol: "Wallet",
        metadata: { source: "rebalance_transfer", usdValue: 1100, depositedDelta: 1000 },
      }),
    ],
    priceOf,
  );

  // El pool conserva la mitad que no se movió: 500 USDC + 5 SOL. El SOL del
  // harvest NO puede descontarse aquí (nunca formó parte del capital del pool);
  // si se descontara, el pool valdría 900 $ y la cartera perdería 100 $ de la
  // nada.
  const pool = v.byPosition.find((p) => p.positionId === "pool");
  assert.ok(pool, "el pool debe seguir vivo tras un rebalanceo parcial");
  assert.equal(pool!.valueUsd, 1000);

  // El harvest pendiente se materializó en el destino: ya no queda pendiente.
  assert.equal(v.pendingHarvestUsd, 0);
  // Valor total: 1.000 $ en el pool + 1.100 $ en el hold. Los 100 $ del harvest
  // no se han evaporado, solo han cambiado de sitio.
  assert.equal(v.totalValueUsd, 2100);
  // El depositado global sigue siendo el capital aportado (el harvest es
  // rendimiento, nunca capital).
  assert.equal(v.totalDepositedUsd, 2000);
  assert.equal(v.depositedByPosition.get(positionKey("Orca", "pool")), 1000);
  assert.equal(v.depositedByPosition.get(positionKey("Wallet", "usdc-hold")), 1000);
});

test("rebalanceo total de un hold: el origen se queda sin base ni saldo", () => {
  const v = computePortfolioValuation(
    [
      tx({ type: "deposit", token_in_symbol: "SOL", token_in_amount: 5, spot_price: 80, position_id: "sol-hold" }),
      tx({
        type: "withdrawal", token_out_symbol: "SOL", token_out_amount: 5, spot_price: 100,
        position_id: "sol-hold",
        metadata: { reason: "rebalance_transfer", depositedDelta: -400 },
      }),
      tx({
        type: "deposit", token_in_symbol: "USDC", token_in_amount: 500, spot_price: 1,
        position_id: "usdc-hold",
        metadata: { source: "rebalance_transfer", usdValue: 500, depositedDelta: 400 },
      }),
    ],
    priceOf,
  );

  assert.equal(v.byPosition.find((p) => p.positionId === "sol-hold"), undefined);
  assert.equal(v.depositedByPosition.get(positionKey("Wallet", "sol-hold")), 0);
  assert.equal(v.depositedByPosition.get(positionKey("Wallet", "usdc-hold")), 400);
  assert.equal(v.totalDepositedUsd, 400);
  // 5 SOL comprados a 80 $ y vendidos (internamente) a 100 $: la plusvalía
  // latente viaja con la posición, no se realiza.
  assert.equal(v.totalValueUsd, 500);
});
