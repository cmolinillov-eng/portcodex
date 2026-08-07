/**
 * Motor de categorización fiscal — pruebas contra el código REAL.
 *
 * QUÉ CUBRE: `categorizeTransaction` de `src/lib/tax/categorize.ts`, importado
 * de verdad. Se comprueba, para cada combinación (tipo de movimiento × tipo de
 * custodio), la categoría fiscal, si tributa, el valor y la base en euros, los
 * lotes FIFO que se crean o se consumen y los eventos fiscales emitidos.
 *
 * Antes este fichero traía dentro una versión reducida del motor —unas 200
 * líneas que imitaban a las 1.700 reales— «para no depender de TypeScript». Lo
 * que comprobaba era esa imitación: el motor de verdad podía romperse entero
 * sin que ninguna prueba se enterara. El ayudante `../helpers/ts-resolve.mjs`
 * quita esa dependencia y permite cargar el módulo real.
 *
 * QUÉ NO CUBRE: `categorizeTransactionsSequence` (encadenado de varias
 * transacciones con lotes vivos entre ellas), la resolución del custodio
 * (`wallet-classification.ts` consulta el catálogo en base de datos: aquí el
 * `walletProtocol` se pasa a mano) y la persistencia de lotes y eventos.
 *
 * Ejecutar: `node --test tests/tax/*.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import "../helpers/ts-resolve.mjs";

const { categorizeTransaction } = await import("../../src/lib/tax/categorize.ts");

const FECHA = "2026-01-15T00:00:00.000Z";
const RATE = 0.92; // USD → EUR

/** Custodio con la forma de `WalletProtocolMeta` (src/lib/tax/types.ts). */
function wallet(walletKind, name = "Protocolo") {
  return { name, walletKind, countryCode: null, isForeign: false, custodial: false };
}

/** Transacción con la forma de `CategorizeInput`. */
function tx(fields) {
  return {
    portfolioId: "p1",
    type: "deposit",
    protocol: "Protocolo",
    positionType: "Hold",
    tokenInSymbol: null,
    tokenInAmount: null,
    tokenOutSymbol: null,
    tokenOutAmount: null,
    spotPriceUsd: 0,
    transactionDate: FECHA,
    metadata: null,
    ...fields,
  };
}

/** Lote con la forma de `TaxLot`. */
function lote(id, token, amount, costEur, date) {
  return {
    id,
    portfolioId: "p1",
    tokenSymbol: token,
    amount,
    costBasisEur: costEur,
    originalAmount: amount,
    originalCostBasisEur: costEur,
    acquiredAt: date,
    acquiredViaTransactionId: null,
    acquiredViaEvent: "buy",
    exhaustedAt: null,
  };
}

const categorizar = (fields, { lots = [], walletKind = "dex" } = {}) =>
  categorizeTransaction(tx(fields), {
    fxRateUsdToEur: RATE,
    currentLots: lots,
    walletProtocol: walletKind === null ? null : wallet(walletKind),
  });

// ─── Entradas: depende de quién custodia ───────────────────────────────────

test("entrada en un exchange extranjero es una compra y crea lote", () => {
  const r = categorizar(
    { type: "deposit", tokenInSymbol: "BTC", tokenInAmount: 0.5, spotPriceUsd: 60000 },
    { walletKind: "cex_foreign" },
  );
  assert.equal(r.annotation.category, "buy");
  assert.equal(r.annotation.taxable, false, "comprar no genera ganancia");
  assert.equal(r.annotation.valueEur, 27600); // 0,5 × 60.000 × 0,92
  assert.equal(r.annotation.walletKind, "cex_foreign");
  assert.equal(r.newLots.length, 1, "la compra crea el lote FIFO");
  assert.equal(r.newLots[0].costBasisEur, 27600);
  assert.equal(r.newLots[0].tokenSymbol, "BTC");
});

test("entrada en un exchange español también es una compra", () => {
  const r = categorizar(
    { type: "deposit", tokenInSymbol: "BTC", tokenInAmount: 0.1, spotPriceUsd: 60000 },
    { walletKind: "cex_es" },
  );
  assert.equal(r.annotation.category, "buy");
  assert.equal(r.newLots.length, 1);
});

test("entrada en wallet propia es una transferencia interna, no una compra", () => {
  for (const kind of ["hot_wallet", "cold_wallet", "smart_contract_wallet"]) {
    const r = categorizar(
      { type: "deposit", tokenInSymbol: "BTC", tokenInAmount: 0.5, spotPriceUsd: 60000 },
      { walletKind: kind },
    );
    assert.equal(r.annotation.category, "non_taxable_transfer", `fallo con ${kind}`);
    assert.equal(r.annotation.taxable, false);
    assert.equal(r.newLots.length, 0, `${kind}: el lote real vive en el origen, no se duplica aquí`);
  }
});

// ─── Salidas ───────────────────────────────────────────────────────────────

test("salida de un exchange se trata como venta con ganancia patrimonial", () => {
  const r = categorizar(
    { type: "withdrawal", tokenOutSymbol: "BTC", tokenOutAmount: 0.5, spotPriceUsd: 70000 },
    { lots: [lote("L1", "BTC", 1, 50000, "2024-01-01")], walletKind: "cex_foreign" },
  );
  assert.equal(r.annotation.category, "sell");
  assert.equal(r.annotation.taxable, true);
  assert.equal(r.annotation.incomeType, "ganancia_patrimonial");
  assert.equal(r.annotation.valueEur, 32200);      // 0,5 × 70.000 × 0,92
  assert.equal(r.annotation.costBasisEur, 25000);  // la mitad del lote por FIFO
  assert.equal(r.annotation.realizedGainEur, 7200);
  assert.equal(r.taxEvents.length, 1);
  assert.equal(r.taxEvents[0].eventType, "sell");
  assert.equal(r.taxEvents[0].taxYear, 2026, "el ejercicio sale de la fecha del movimiento");
});

test("salida hacia wallet propia o DEX no es una venta", () => {
  for (const kind of ["cold_wallet", "hot_wallet", "dex"]) {
    const r = categorizar(
      { type: "withdrawal", tokenOutSymbol: "BTC", tokenOutAmount: 0.5, spotPriceUsd: 70000 },
      { lots: [lote("L1", "BTC", 1, 50000, "2024-01-01")], walletKind: kind },
    );
    assert.equal(r.annotation.category, "non_taxable_transfer", `fallo con ${kind}`);
    assert.equal(r.annotation.taxable, false);
    assert.equal(r.annotation.realizedGainEur, 0);
    assert.equal(r.taxEvents.length, 0);
  }
});

test("salida sin custodio catalogado asume venta (criterio conservador)", () => {
  const r = categorizar(
    { type: "withdrawal", tokenOutSymbol: "BTC", tokenOutAmount: 0.5, spotPriceUsd: 70000 },
    { lots: [lote("L1", "BTC", 1, 50000, "2024-01-01")], walletKind: null },
  );
  assert.equal(r.annotation.category, "sell");
  assert.equal(r.annotation.walletKind, null);
});

// ─── Rendimientos ──────────────────────────────────────────────────────────

test("el harvest se clasifica según dónde se genera", () => {
  const casos = [
    { positionType: "Staking", esperado: "staking_reward" },
    { positionType: "Lending", esperado: "lending_interest" },
    { positionType: "Liquidity Pool", esperado: "lp_reward" },
  ];
  for (const { positionType, esperado } of casos) {
    const r = categorizar(
      { type: "harvest", tokenInSymbol: "USDC", tokenInAmount: 100, spotPriceUsd: 1, positionType },
      { walletKind: "dex" },
    );
    assert.equal(r.annotation.category, esperado, `fallo con ${positionType}`);
    assert.equal(r.annotation.incomeType, "rendimiento_capital_mobiliario");
    assert.equal(r.annotation.taxable, true);
    assert.equal(r.annotation.valueEur, 92);
    assert.equal(r.annotation.realizedGainEur, 92, "la recompensa tributa por su valor íntegro");
  }
});

test("la recompensa cobrada crea lote con base igual a su valor", () => {
  // Si no creara lote, al venderla después se declararía otra vez entera.
  const r = categorizar(
    { type: "harvest", tokenInSymbol: "ADA", tokenInAmount: 10, spotPriceUsd: 0.5, positionType: "Staking" },
    { walletKind: "hot_wallet" },
  );
  assert.equal(r.annotation.valueEur, 4.6);
  assert.equal(r.newLots.length, 1);
  assert.equal(r.newLots[0].costBasisEur, 4.6);
  assert.equal(r.newLots[0].acquiredViaEvent, "staking_reward");
});

// ─── Pools de liquidez: la base viaja, no se duplica ───────────────────────

test("aportar a un pool no genera ganancia (solo trazabilidad)", () => {
  const r = categorizar(
    { type: "lp_deposit", tokenInSymbol: "ETH", tokenInAmount: 1, spotPriceUsd: 2200, positionType: "Liquidity Pool" },
    { lots: [lote("L1", "ETH", 1, 1500, "2024-01-01")], walletKind: "dex" },
  );
  assert.equal(r.annotation.category, "lp_provide");
  assert.equal(r.annotation.taxable, false);
  assert.equal(r.annotation.realizedGainEur, 0);
  assert.equal(r.annotation.valueEur, 2024, "el valor sí se informa");
  assert.equal(r.newLots.length, 0, "aportar no crea lote: el original sigue vivo");
});

test("retirar de un pool rota el lote: consume el original y traslada su base", () => {
  const r = categorizar(
    { type: "lp_withdraw", tokenInSymbol: "ETH", tokenInAmount: 1, spotPriceUsd: 2173.91, positionType: "Liquidity Pool" },
    { lots: [lote("L1", "ETH", 1, 1000, "2024-01-01")], walletKind: "dex" },
  );
  assert.equal(r.annotation.category, "lp_remove");
  assert.equal(r.annotation.taxable, false);
  assert.equal(r.newLots.length, 1);
  assert.equal(r.newLots[0].costBasisEur, 1000, "la base viaja; no se revaloriza a precio de mercado");
  assert.equal(r.consumedLotUpdates.length, 1, "el lote original se consume");
  assert.equal(r.consumedLotUpdates[0].lotId, "L1");
  assert.equal(r.consumedLotUpdates[0].newAmount, 0);
});

test("retirar de un pool sin lote previo valora a precio de mercado", () => {
  // Token aparecido por impermanent loss o cuya base llegó por un rebalanceo.
  const r = categorizar(
    { type: "lp_withdraw", tokenInSymbol: "USDC", tokenInAmount: 500, spotPriceUsd: 1, positionType: "Liquidity Pool" },
    { lots: [], walletKind: "dex" },
  );
  assert.equal(r.annotation.category, "lp_remove");
  assert.equal(r.newLots[0].costBasisEur, 460, "sin lote previo la única base disponible es el mercado");
  assert.match(r.annotation.notes, /revisar si procede/, "queda anotado para revisión");
});

test("ciclo comprar → aportar → retirar: la base total no se duplica", () => {
  const lots = [lote("L1", "ETH", 1, 1000, "2024-01-01")];
  const aportar = categorizar(
    { type: "lp_deposit", tokenInSymbol: "ETH", tokenInAmount: 1, spotPriceUsd: 1500, positionType: "Liquidity Pool" },
    { lots, walletKind: "dex" },
  );
  assert.equal(aportar.newLots.length, 0);
  const retirar = categorizar(
    { type: "lp_withdraw", tokenInSymbol: "ETH", tokenInAmount: 1, spotPriceUsd: 2000, positionType: "Liquidity Pool" },
    { lots, walletKind: "dex" },
  );
  // El lote original queda consumido y el nuevo hereda su base: 1.000 €, no 2.000.
  assert.equal(retirar.newLots[0].costBasisEur, 1000);
  assert.equal(retirar.consumedLotUpdates[0].newAmount, 0);
});

test("la retirada de pool se entiende venga en token_in (manual) o token_out (on-chain)", () => {
  const porTokenOut = categorizar(
    { type: "lp_withdraw", tokenOutSymbol: "ETH", tokenOutAmount: 1, spotPriceUsd: 2000, positionType: "Liquidity Pool" },
    { lots: [lote("L1", "ETH", 1, 1000, "2024-01-01")], walletKind: "dex" },
  );
  assert.equal(porTokenOut.annotation.category, "lp_remove");
  assert.equal(porTokenOut.newLots[0].costBasisEur, 1000, "sin esto la base no se trasladaría");
});

// ─── Movimientos internos ──────────────────────────────────────────────────

test("aportar a staking o a lending nunca tributa", () => {
  for (const type of ["staking_deposit", "lending_supply"]) {
    const r = categorizar(
      { type, tokenInSymbol: "ETH", tokenInAmount: 1, spotPriceUsd: 2000, positionType: "Staking" },
      { walletKind: "cex_foreign" },
    );
    assert.equal(r.annotation.category, "non_taxable_transfer", `fallo con ${type}`);
    assert.equal(r.annotation.taxable, false);
    assert.equal(r.taxEvents.length, 0);
  }
});

test("un movimiento detectado on-chain nunca es compra ni venta, aunque el protocolo no esté catalogado", () => {
  // El escáner ve salir BTC de una wallet propia: el protocolo "Bitcoin" no
  // está en el catálogo y cae en "other". Sin esta regla se declaraba una venta
  // imponible que nunca ocurrió.
  const salida = categorizar(
    {
      type: "withdrawal", tokenOutSymbol: "BTC", tokenOutAmount: 0.5, spotPriceUsd: 60000,
      metadata: { source: "onchain_ingest" },
    },
    { lots: [lote("L1", "BTC", 0.5, 10000, "2024-01-01")], walletKind: "other" },
  );
  assert.equal(salida.annotation.category, "non_taxable_transfer");
  assert.equal(salida.annotation.taxable, false);
  assert.equal(salida.taxEvents.length, 0);

  const entrada = categorizar(
    {
      type: "deposit", tokenInSymbol: "BTC", tokenInAmount: 0.01, spotPriceUsd: 60000,
      metadata: { source: "onchain_ingest" },
    },
    { walletKind: "other" },
  );
  assert.equal(entrada.annotation.category, "non_taxable_transfer");
  assert.equal(entrada.newLots.length, 0);
});

// ─── Invariantes de la anotación ───────────────────────────────────────────

test("toda anotación se marca como inferida y arrastra el tipo de custodio", () => {
  const casos = [
    { type: "deposit", tokenInSymbol: "BTC", tokenInAmount: 0.5, spotPriceUsd: 60000 },
    { type: "withdrawal", tokenOutSymbol: "BTC", tokenOutAmount: 0.5, spotPriceUsd: 70000 },
    { type: "harvest", tokenInSymbol: "ADA", tokenInAmount: 10, spotPriceUsd: 0.5, positionType: "Staking" },
    { type: "lp_deposit", tokenInSymbol: "ETH", tokenInAmount: 1, spotPriceUsd: 2000, positionType: "Liquidity Pool" },
  ];
  const lots = [lote("L1", "BTC", 1, 50000, "2024-01-01"), lote("L2", "ETH", 1, 1500, "2024-01-01")];
  for (const caso of casos) {
    const r = categorizar(caso, { lots, walletKind: "cex_foreign" });
    assert.equal(r.annotation.inferred, true, `${caso.type} debe quedar marcado para revisión`);
    assert.equal(r.annotation.walletKind, "cex_foreign", `${caso.type} debe arrastrar el custodio`);
    assert.ok(r.annotation.humanLabel.length > 0, `${caso.type} necesita etiqueta legible`);
    assert.ok(r.annotation.humanDescription.length > 0, `${caso.type} necesita descripción legible`);
  }
});

test("escenario real: comprar en un exchange y mover a un hardware wallet", () => {
  const compra = categorizar(
    { type: "deposit", tokenInSymbol: "BTC", tokenInAmount: 1, spotPriceUsd: 50000 },
    { walletKind: "cex_foreign" },
  );
  assert.equal(compra.annotation.category, "buy");
  assert.equal(compra.newLots[0].costBasisEur, 46000);

  const lots = [lote("L1", "BTC", 1, 46000, "2025-01-01")];

  // La salida del exchange se asume venta (el motor no sabe a dónde va)…
  const salidaExchange = categorizar(
    { type: "withdrawal", tokenOutSymbol: "BTC", tokenOutAmount: 1, spotPriceUsd: 50000 },
    { lots, walletKind: "cex_foreign" },
  );
  assert.equal(salidaExchange.annotation.category, "sell");

  // …y la entrada en el hardware wallet como transferencia interna. El gestor
  // ve las dos filas y puede recategorizar la salida a mano.
  const entradaLedger = categorizar(
    { type: "deposit", tokenInSymbol: "BTC", tokenInAmount: 1, spotPriceUsd: 50000 },
    { lots, walletKind: "cold_wallet" },
  );
  assert.equal(entradaLedger.annotation.category, "non_taxable_transfer");
  assert.equal(entradaLedger.annotation.realizedGainEur, 0);
});
