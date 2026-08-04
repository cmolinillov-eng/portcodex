import test from "node:test";
import assert from "node:assert/strict";
// Registra la resolución de "@/..." y de los imports sin extensión ANTES de
// cargar el motor fiscal: los módulos que se prueban son los de producción,
// no una reimplementación (ver tests/helpers/ts-resolve.mjs).
import "../helpers/ts-resolve.mjs";

const { categorizeTransactionsSequence } = await import("../../src/lib/tax/categorize.ts");
const { getAeatClassification } = await import("../../src/lib/tax/aeat-mapping.ts");

/**
 * PERMUTA EN EL REBALANCEO — art. 37.1.h LIRPF / criterio DGT.
 *
 * Un rebalanceo que CAMBIA de token es una permuta cripto-cripto: hecho
 * imponible. Un rebalanceo que mueve el MISMO token entre posiciones no lo es
 * (no hay transmisión de un bien por otro).
 *
 * Las filas de estos casos son EXACTAMENTE las que escriben:
 *   · src/app/api/transactions/route.ts (rama `operationType === "rebalance"`):
 *       - salida  → retirada con metadata.reason   = "rebalance_transfer"
 *       - entrada → depósito con metadata.source   = "rebalance_transfer",
 *                   metadata.rebalanceSwapChecked  = true
 *                   y metadata.swapLegs = [{ soldSymbol, soldAmount,
 *                   soldPriceUsd, boughtSymbol, boughtAmount, boughtPriceUsd }]
 *                   SOLO cuando la cesta destino difiere de la de origen.
 *   · src/app/api/onchain/events/route.ts (permuta detectada on-chain):
 *       - entrega  → retirada con metadata.source = "onchain_swap"
 *       - recepción→ depósito con metadata.source = "onchain_swap"
 *
 * FX fijo 0,9 USD→EUR en todos los casos (sin fxRateByDate).
 */

const FX = 0.9;

type Row = Parameters<typeof categorizeTransactionsSequence>[0][number];

function row(p: Partial<Row> & { id: string; type: string }): Row {
  return {
    portfolioId: "pf-test",
    protocol: "Wallet",
    positionType: "Hold",
    tokenInSymbol: null,
    tokenInAmount: null,
    tokenOutSymbol: null,
    tokenOutAmount: null,
    spotPriceUsd: 0,
    transactionDate: "2026-03-01T12:00:00Z",
    metadata: null,
    ...p,
  } as Row;
}

/** Compra inicial: 1 BTC a 50.000 $ → lote FIFO de 45.000 € (FX 0,9). */
const COMPRA_BTC = row({
  id: "tx-compra",
  type: "deposit",
  protocol: "Binance",
  tokenInSymbol: "BTC",
  tokenInAmount: 1,
  spotPriceUsd: 50000,
  transactionDate: "2026-01-10T10:00:00Z",
});

/** Rebalanceo 1 BTC (60.000 $) → 600 SOL (100 $). Filas literales de route.ts. */
const REBALANCE_OUT = row({
  id: "tx-reb-out",
  type: "withdrawal",
  positionType: "Hold",
  tokenOutSymbol: "BTC",
  tokenOutAmount: 1,
  spotPriceUsd: 60000,
  metadata: { reason: "rebalance_transfer", depositedDelta: -50000 },
});

const REBALANCE_IN = row({
  id: "tx-reb-in",
  type: "deposit",
  positionType: "Hold",
  tokenInSymbol: "SOL",
  tokenInAmount: 600,
  spotPriceUsd: 100,
  metadata: {
    source: "rebalance_transfer",
    usdValue: 60000,
    depositedDelta: 50000,
    sourcePositionId: "btc-hold",
    sourceProtocol: "Wallet",
    sourceToken: "BTC",
    sourceAmount: 1,
    rebalanceSwapChecked: true,
    swapLegs: [
      {
        soldSymbol: "BTC",
        soldAmount: 1,
        soldPriceUsd: 60000,
        boughtSymbol: "SOL",
        boughtAmount: 600,
        boughtPriceUsd: 100,
      },
    ],
  },
});

function run(rows: Row[]) {
  const { results, finalLots } = categorizeTransactionsSequence(rows, {
    fxRateUsdToEur: FX,
    initialLots: [],
  });
  const byId = new Map(results.map((r) => [rows[r.txIndex].id as string, r]));
  const taxEvents = results.flatMap((r) => r.taxEvents);
  return { results, finalLots, byId, taxEvents };
}

// ───────────────────────────────────────────────────────────────────────────
// (a) Rebalanceo CON cambio de token → permuta tributable
// ───────────────────────────────────────────────────────────────────────────

test("rebalanceo con cambio de token: permuta tributable con ganancia FIFO", () => {
  const { byId, finalLots } = run([COMPRA_BTC, REBALANCE_OUT, REBALANCE_IN]);

  const entrada = byId.get("tx-reb-in")!;
  assert.equal(entrada.annotation.category, "swap_out");
  assert.equal(entrada.annotation.taxable, true);
  assert.equal(entrada.annotation.incomeType, "ganancia_patrimonial");
  // FMV entregado 1 BTC × 60.000 $ × 0,9 = 54.000 €; base FIFO 45.000 €.
  assert.equal(entrada.annotation.valueEur, 54000);
  assert.equal(entrada.annotation.costBasisEur, 45000);
  assert.equal(entrada.annotation.realizedGainEur, 9000);

  // Un único evento fiscal, en el lado ENTREGADO (BTC).
  assert.equal(entrada.taxEvents.length, 1);
  const ev = entrada.taxEvents[0];
  assert.equal(ev.eventType, "swap_out");
  assert.equal(ev.tokenSymbol, "BTC");
  assert.equal(ev.tokenAmount, 1);
  assert.equal(ev.proceedsEur, 54000);
  assert.equal(ev.costBasisEur, 45000);
  assert.equal(ev.realizedGainEur, 9000);
  assert.equal(ev.incomeType, "ganancia_patrimonial");

  // La fila de SALIDA no puede volver a tributar (doble imposición).
  const salida = byId.get("tx-reb-out")!;
  assert.equal(salida.annotation.taxable, false);
  assert.equal(salida.annotation.realizedGainEur, 0);
  assert.equal(salida.taxEvents.length, 0);

  // Casilla AEAT: GP permuta, base del ahorro.
  const aeat = getAeatClassification(
    entrada.annotation.category,
    entrada.annotation.incomeType,
    entrada.annotation.realizedGainEur,
  );
  assert.equal(aeat.badge, "GP permuta");
  assert.equal(aeat.casilla, "1800-1814");
  assert.equal(aeat.base, "ahorro");
  assert.equal(aeat.countsTowardTax, true);

  // BASE DE COSTE DEL TOKEN NUEVO = valor de mercado en la permuta (54.000 €),
  // no la base heredada del BTC (45.000 €): si no, la plusvalía se contaría
  // dos veces al vender los SOL.
  const solLot = finalLots.find((l) => l.tokenSymbol === "SOL" && l.exhaustedAt === null);
  assert.ok(solLot, "debe existir lote de SOL");
  assert.equal(solLot!.amount, 600);
  assert.equal(solLot!.costBasisEur, 54000);
  // El lote de BTC queda consumido por FIFO.
  const btcVivo = finalLots.filter((l) => l.tokenSymbol === "BTC" && l.exhaustedAt === null && l.amount > 1e-9);
  assert.equal(btcVivo.length, 0);
});

test("la base nueva a FMV evita contar la plusvalía dos veces al vender después", () => {
  // Venta posterior de los 600 SOL a 120 $ en un CEX.
  const venta = row({
    id: "tx-venta",
    type: "withdrawal",
    protocol: "Binance",
    tokenOutSymbol: "SOL",
    tokenOutAmount: 600,
    spotPriceUsd: 120,
    transactionDate: "2026-06-01T10:00:00Z",
  });
  const { taxEvents } = run([COMPRA_BTC, REBALANCE_OUT, REBALANCE_IN, venta]);

  const permuta = taxEvents.filter((e) => e.eventType === "swap_out");
  const ventas = taxEvents.filter((e) => e.eventType === "sell");
  assert.equal(permuta.length, 1);
  assert.equal(ventas.length, 1);
  assert.equal(permuta[0].realizedGainEur, 9000);
  // 600 × 120 × 0,9 = 64.800 € − base 54.000 € = 10.800 €.
  assert.equal(ventas[0].realizedGainEur, 10800);
  // Total del recorrido = (72.000 − 50.000) $ × 0,9 = 19.800 €. Ni más ni menos.
  const total = taxEvents.reduce((s, e) => s + e.realizedGainEur, 0);
  assert.equal(total, 19800);
});

// ───────────────────────────────────────────────────────────────────────────
// (b) Rebalanceo SIN cambio de token → NO tributa
// ───────────────────────────────────────────────────────────────────────────

test("rebalanceo sin cambio de token: movimiento interno, no tributa", () => {
  const compraUsdc = row({
    id: "tx-compra-usdc",
    type: "deposit",
    protocol: "Binance",
    tokenInSymbol: "USDC",
    tokenInAmount: 1000,
    spotPriceUsd: 1,
    transactionDate: "2026-01-10T10:00:00Z",
  });
  // Salida de un LP y entrada en otro, mismo token: route.ts marca
  // rebalanceSwapChecked SIN swapLegs (la cesta no cambió).
  const salida = row({
    id: "tx-reb-out-usdc",
    type: "lp_withdraw",
    positionType: "Liquidity Pool",
    tokenOutSymbol: "USDC",
    tokenOutAmount: 1000,
    spotPriceUsd: 1,
    metadata: { reason: "rebalance_transfer", depositedDelta: -1000 },
  });
  const entrada = row({
    id: "tx-reb-in-usdc",
    type: "deposit",
    positionType: "Hold",
    tokenInSymbol: "USDC",
    tokenInAmount: 1000,
    spotPriceUsd: 1,
    metadata: {
      source: "rebalance_transfer",
      usdValue: 1000,
      depositedDelta: 1000,
      rebalanceSwapChecked: true,
    },
  });

  const { byId, taxEvents, finalLots } = run([compraUsdc, salida, entrada]);

  assert.equal(byId.get("tx-reb-in-usdc")!.annotation.taxable, false);
  assert.equal(byId.get("tx-reb-in-usdc")!.annotation.category, "non_taxable_transfer");
  assert.equal(byId.get("tx-reb-in-usdc")!.annotation.realizedGainEur, 0);
  assert.equal(byId.get("tx-reb-out-usdc")!.annotation.taxable, false);
  // Ni un solo evento fiscal en todo el rebalanceo.
  assert.equal(taxEvents.filter((e) => e.eventType === "swap_out").length, 0);

  // El lote original sigue vivo con su base intacta (ni duplicado ni re-sellado).
  const usdcLots = finalLots.filter((l) => l.tokenSymbol === "USDC" && l.exhaustedAt === null);
  assert.equal(usdcLots.length, 1);
  assert.equal(usdcLots[0].costBasisEur, 900);
});

// ───────────────────────────────────────────────────────────────────────────
// (c) Coherencia: rebalanceo vs swap on-chain equivalente
// ───────────────────────────────────────────────────────────────────────────

test("rebalanceo BTC→SOL y swap on-chain BTC→SOL dan el MISMO resultado fiscal", () => {
  const onchainOut = row({
    id: "tx-swap-out",
    type: "withdrawal",
    tokenOutSymbol: "BTC",
    tokenOutAmount: 1,
    spotPriceUsd: 60000,
    metadata: { source: "onchain_swap", swapBought: "600 SOL", swapSold: "1 BTC" },
  });
  const onchainIn = row({
    id: "tx-swap-in",
    type: "deposit",
    tokenInSymbol: "SOL",
    tokenInAmount: 600,
    spotPriceUsd: 100,
    metadata: { source: "onchain_swap", swapBought: "600 SOL", swapSold: "1 BTC" },
  });

  const reb = run([COMPRA_BTC, REBALANCE_OUT, REBALANCE_IN]);
  const onc = run([COMPRA_BTC, onchainOut, onchainIn]);

  const resumen = (r: ReturnType<typeof run>) => {
    const ev = r.taxEvents;
    assert.equal(ev.length, 1, "una sola permuta");
    const sol = r.finalLots.find((l) => l.tokenSymbol === "SOL" && l.exhaustedAt === null)!;
    const anot = r.results.find((x) => x.taxEvents.length > 0)!.annotation;
    const aeat = getAeatClassification(anot.category, anot.incomeType, anot.realizedGainEur);
    return {
      eventType: ev[0].eventType,
      tokenSymbol: ev[0].tokenSymbol,
      tokenAmount: ev[0].tokenAmount,
      proceedsEur: ev[0].proceedsEur,
      costBasisEur: ev[0].costBasisEur,
      realizedGainEur: ev[0].realizedGainEur,
      incomeType: ev[0].incomeType,
      categoria: anot.category,
      badge: aeat.badge,
      casilla: aeat.casilla,
      base: aeat.base,
      baseSolEur: sol.costBasisEur,
      solAmount: sol.amount,
    };
  };

  assert.deepEqual(resumen(reb), resumen(onc));
  // …y el resultado concreto es el esperado, no dos ceros iguales.
  assert.equal(resumen(reb).realizedGainEur, 9000);
  assert.equal(resumen(reb).baseSolEur, 54000);
});

// ───────────────────────────────────────────────────────────────────────────
// (d) Origen LP: dos tokens entregados en la misma permuta
// ───────────────────────────────────────────────────────────────────────────

test("rebalanceo desde LP (dos tokens entregados): un evento por token entregado", () => {
  const compraUsdc = row({
    id: "tx-compra-usdc",
    type: "deposit",
    protocol: "Binance",
    tokenInSymbol: "USDC",
    tokenInAmount: 10000,
    spotPriceUsd: 1,
    transactionDate: "2026-01-10T10:00:00Z",
  });
  // Destino Hold SOL con la cesta completa del LP origen (1 BTC + 10.000 USDC
  // = 70.000 $ → 700 SOL): route.ts anota los dos legs en la misma fila.
  const entrada = row({
    id: "tx-reb-in-lp",
    type: "deposit",
    tokenInSymbol: "SOL",
    tokenInAmount: 700,
    spotPriceUsd: 100,
    metadata: {
      source: "rebalance_transfer",
      usdValue: 70000,
      depositedDelta: 60000,
      rebalanceSwapChecked: true,
      swapLegs: [
        { soldSymbol: "BTC", soldAmount: 1, soldPriceUsd: 60000, boughtSymbol: "SOL", boughtAmount: 600, boughtPriceUsd: 100 },
        { soldSymbol: "USDC", soldAmount: 10000, soldPriceUsd: 1, boughtSymbol: "SOL", boughtAmount: 100, boughtPriceUsd: 100 },
      ],
    },
  });

  const { byId, finalLots } = run([COMPRA_BTC, compraUsdc, entrada]);
  const r = byId.get("tx-reb-in-lp")!;
  assert.equal(r.taxEvents.length, 2);
  const btc = r.taxEvents.find((e) => e.tokenSymbol === "BTC")!;
  const usdc = r.taxEvents.find((e) => e.tokenSymbol === "USDC")!;
  assert.equal(btc.realizedGainEur, 9000); // 54.000 − 45.000
  assert.equal(usdc.realizedGainEur, 0); // 9.000 − 9.000
  assert.equal(r.annotation.realizedGainEur, 9000);
  assert.equal(r.annotation.costBasisEur, 54000);
  assert.equal(r.annotation.valueEur, 63000);

  // Lote único de SOL con base = FMV de TODO lo entregado.
  const solLot = finalLots.find((l) => l.tokenSymbol === "SOL" && l.exhaustedAt === null)!;
  assert.equal(solLot.amount, 700);
  assert.equal(solLot.costBasisEur, 63000);
});

// ───────────────────────────────────────────────────────────────────────────
// (e) Criterio único: la reinversión de harvest con permuta también tributa
// ───────────────────────────────────────────────────────────────────────────

test("reinversión de harvest con cambio de token: tributa, con ganancia ≈ 0", () => {
  const harvest = row({
    id: "tx-harvest",
    type: "harvest",
    protocol: "Orca",
    positionType: "Liquidity Pool",
    tokenInSymbol: "USDC",
    tokenInAmount: 100,
    spotPriceUsd: 1,
    transactionDate: "2026-04-01T09:00:00Z",
  });
  // Fila literal del flujo manual de reinversión (route.ts, reinvestSwapLegsFor).
  const reinversion = row({
    id: "tx-reinv",
    type: "deposit",
    protocol: "Wallet",
    positionType: "Hold",
    tokenInSymbol: "SOL",
    tokenInAmount: 1,
    spotPriceUsd: 100,
    transactionDate: "2026-04-01T09:00:00Z",
    metadata: {
      source: "harvest_reinvest",
      sourcePositionId: "orca-lp",
      sourceProtocol: "Orca",
      swapLegs: [
        {
          soldSymbol: "USDC",
          soldAmount: 100,
          soldPriceUsd: 1,
          boughtSymbol: "SOL",
          boughtAmount: 1,
          boughtPriceUsd: 100,
        },
      ],
    },
  });

  const { byId, finalLots } = run([harvest, reinversion]);
  const r = byId.get("tx-reinv")!;
  assert.equal(r.annotation.category, "swap_out");
  assert.equal(r.annotation.taxable, true);
  // El lote del harvest nació a FMV (90 €) y se permuta al mismo precio: 0 €.
  assert.equal(r.annotation.realizedGainEur, 0);
  assert.equal(r.taxEvents.length, 1);
  assert.equal(r.taxEvents[0].realizedGainEur, 0);
  assert.equal(r.taxEvents[0].tokenSymbol, "USDC");

  const solLot = finalLots.find((l) => l.tokenSymbol === "SOL" && l.exhaustedAt === null)!;
  assert.equal(solLot.costBasisEur, 90);
});
