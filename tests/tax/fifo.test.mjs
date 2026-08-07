/**
 * FIFO obligatorio (Art. 37.2 LIRPF) — pruebas contra el código REAL.
 *
 * QUÉ CUBRE: `applyFifo`, `getActiveBalance` y `getActiveCostBasis` de
 * `src/lib/tax/fifo.ts`, importados de verdad.
 *
 * Antes este fichero copiaba el algoritmo dentro de sí mismo «para no depender
 * de TypeScript». La copia ya se había quedado atrás respecto al original —le
 * faltaban el parámetro `consumedAt` (que hace el cómputo reproducible) y el
 * orden determinista de las fechas inválidas—, así que estaba en verde
 * comprobando una versión del algoritmo que ya no existe. El ayudante
 * `../helpers/ts-resolve.mjs` resuelve el alias `@/` y los imports sin
 * extensión, de modo que la excusa de «no depender de TypeScript» ya no aplica.
 *
 * QUÉ NO CUBRE: la persistencia de los `lotUpdates` (quién los escribe en la
 * base de datos) ni el reparto de comisiones; eso vive en la capa que invoca a
 * FIFO (`categorize.ts` y `compute-traceability.ts`).
 *
 * Ejecutar: `node --test tests/tax/*.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import "../helpers/ts-resolve.mjs";

const { applyFifo, getActiveBalance, getActiveCostBasis } = await import("../../src/lib/tax/fifo.ts");
const { roundEur } = await import("../../src/lib/tax/eur-conversion.ts");

/** Lote con la forma exacta de `TaxLot` (src/lib/tax/types.ts). */
function makeLot({ id, token, amount, costEur, date, eventType = "buy" }) {
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
    acquiredViaEvent: eventType,
    exhaustedAt: null,
  };
}

const CONSUMIDO_EL = "2026-03-01T10:00:00.000Z";

// ─── Tests ─────────────────────────────────────────────────────────────────

test("FIFO: consume el lote más antiguo primero", () => {
  const lots = [
    makeLot({ id: "L2", token: "BTC", amount: 0.1, costEur: 6000, date: "2025-06-01" }),
    makeLot({ id: "L1", token: "BTC", amount: 0.1, costEur: 5000, date: "2024-01-15" }),
  ];
  const r = applyFifo("BTC", 0.1, lots, CONSUMIDO_EL);
  assert.equal(r.consumedAmount, 0.1);
  assert.equal(r.consumedCostEur, 5000);
  assert.equal(r.lotsConsumed[0].lotId, "L1", "Debe consumir el lote más antiguo (L1)");
});

test("FIFO: retirada parcial deja el resto del lote con su coste pro-rata", () => {
  const lots = [makeLot({ id: "L1", token: "BTC", amount: 1, costEur: 60000, date: "2024-01-01" })];
  const r = applyFifo("BTC", 0.3, lots, CONSUMIDO_EL);
  assert.equal(r.consumedCostEur, 18000, "30 % de la base de coste");
  assert.equal(r.lotUpdates[0].newAmount, 0.7);
  assert.equal(roundEur(r.lotUpdates[0].newCostBasisEur), 42000, "el 70 % restante");
  assert.equal(r.lotUpdates[0].exhaustedAt, null);
});

test("FIFO: cadena de 3 lotes, se consumen en orden", () => {
  const lots = [
    makeLot({ id: "L1", token: "ETH", amount: 1, costEur: 1500, date: "2024-01-01" }),
    makeLot({ id: "L2", token: "ETH", amount: 1, costEur: 2000, date: "2024-06-01" }),
    makeLot({ id: "L3", token: "ETH", amount: 1, costEur: 3000, date: "2025-01-01" }),
  ];
  const r = applyFifo("ETH", 2.5, lots, CONSUMIDO_EL);
  // L1 entero (1.500) + L2 entero (2.000) + 0,5 de L3 → 1.500
  assert.equal(r.consumedCostEur, 5000);
  assert.equal(r.consumedAmount, 2.5);
  assert.equal(r.lotsConsumed.length, 3);
  assert.equal(r.lotUpdates[2].newAmount, 0.5, "a L3 le quedan 0,5 ETH");
});

test("FIFO: con lotes insuficientes marca el aviso y consume lo que hay", () => {
  const lots = [makeLot({ id: "L1", token: "BTC", amount: 0.5, costEur: 30000, date: "2024-01-01" })];
  const r = applyFifo("BTC", 1.0, lots, CONSUMIDO_EL);
  assert.equal(r.insufficientLots, true);
  assert.equal(r.consumedAmount, 0.5, "solo se pudo consumir el balance disponible");
  assert.equal(r.consumedCostEur, 30000);
});

test("FIFO: sin ningún lote del token avisa de insuficiencia", () => {
  const r = applyFifo("BTC", 0.1, [makeLot({ id: "E1", token: "ETH", amount: 1, costEur: 1500, date: "2024-01-01" })], CONSUMIDO_EL);
  assert.equal(r.insufficientLots, true);
  assert.equal(r.consumedAmount, 0);
  assert.equal(r.consumedCostEur, 0);
});

test("FIFO: los lotes agotados no se reutilizan", () => {
  const lots = [
    {
      ...makeLot({ id: "L1", token: "BTC", amount: 0.1, costEur: 5000, date: "2024-01-01" }),
      exhaustedAt: "2024-12-31T00:00:00Z",
    },
    makeLot({ id: "L2", token: "BTC", amount: 0.1, costEur: 6000, date: "2025-01-01" }),
  ];
  const r = applyFifo("BTC", 0.1, lots, CONSUMIDO_EL);
  assert.equal(r.lotsConsumed[0].lotId, "L2", "L1 está agotado, debe ir a L2");
  assert.equal(r.consumedCostEur, 6000);
});

test("FIFO: solo toca el token solicitado", () => {
  const lots = [
    makeLot({ id: "B1", token: "BTC", amount: 0.1, costEur: 5000, date: "2024-01-01" }),
    makeLot({ id: "E1", token: "ETH", amount: 1.0, costEur: 1500, date: "2024-01-01" }),
  ];
  const r = applyFifo("ETH", 0.5, lots, CONSUMIDO_EL);
  assert.equal(r.lotsConsumed[0].lotId, "E1");
  assert.equal(r.consumedCostEur, 750, "el 50 % de 1.500");
  assert.equal(r.lotUpdates.length, 1);
  assert.equal(r.lotUpdates[0].lotId, "E1");
});

test("FIFO: el símbolo no distingue mayúsculas ni espacios", () => {
  const lots = [makeLot({ id: "L1", token: " btc ", amount: 0.1, costEur: 5000, date: "2024-01-01" })];
  const r = applyFifo("BTC", 0.1, lots, CONSUMIDO_EL);
  assert.equal(r.consumedCostEur, 5000);
});

test("FIFO: consumir 0 devuelve un resultado vacío", () => {
  const lots = [makeLot({ id: "L1", token: "BTC", amount: 0.1, costEur: 5000, date: "2024-01-01" })];
  const r = applyFifo("BTC", 0, lots, CONSUMIDO_EL);
  assert.equal(r.consumedAmount, 0);
  assert.equal(r.consumedCostEur, 0);
  assert.equal(r.lotsConsumed.length, 0);
  assert.equal(r.insufficientLots, false);
});

test("FIFO: venta de 0,15 BTC sobre dos lotes → base de coste 8.000 €", () => {
  const lots = [
    makeLot({ id: "A", token: "BTC", amount: 0.1, costEur: 5000, date: "2024-01-01" }),
    makeLot({ id: "B", token: "BTC", amount: 0.1, costEur: 6000, date: "2025-06-01" }),
  ];
  const r = applyFifo("BTC", 0.15, lots, CONSUMIDO_EL);
  // A entero (5.000) + la mitad de B (3.000)
  assert.equal(r.consumedAmount, 0.15);
  assert.equal(r.consumedCostEur, 8000);
  // Con un valor de transmisión de 10.500 €, la ganancia patrimonial es 2.500 €.
  assert.equal(10500 - r.consumedCostEur, 2500);
});

test("FIFO: con la misma fecha en dos lotes solo se consume uno", () => {
  const lots = [
    makeLot({ id: "L1", token: "BTC", amount: 0.1, costEur: 5000, date: "2024-01-01" }),
    makeLot({ id: "L2", token: "BTC", amount: 0.1, costEur: 6000, date: "2024-01-01" }),
  ];
  const r = applyFifo("BTC", 0.1, lots, CONSUMIDO_EL);
  assert.equal(r.lotsConsumed.length, 1);
  assert.equal(r.consumedAmount, 0.1);
});

test("FIFO: la fecha de agotamiento es la de la operación, no la del reloj", () => {
  // Sin esto el mismo informe daba resultados distintos en cada ejecución.
  const lots = [makeLot({ id: "L1", token: "BTC", amount: 0.1, costEur: 5000, date: "2024-01-01" })];
  const r = applyFifo("BTC", 0.1, lots, CONSUMIDO_EL);
  assert.equal(r.lotUpdates[0].exhaustedAt, CONSUMIDO_EL);
});

test("FIFO: un lote con fecha ilegible se consume el último", () => {
  const lots = [
    makeLot({ id: "MALA", token: "BTC", amount: 0.1, costEur: 9999, date: "fecha-rota" }),
    makeLot({ id: "L1", token: "BTC", amount: 0.1, costEur: 5000, date: "2024-01-01" }),
  ];
  const r = applyFifo("BTC", 0.1, lots, CONSUMIDO_EL);
  assert.equal(r.lotsConsumed[0].lotId, "L1");
  assert.equal(r.consumedCostEur, 5000);
});

test("balance y coste activos: suman solo los lotes vivos del token", () => {
  const lots = [
    makeLot({ id: "L1", token: "BTC", amount: 0.1, costEur: 5000, date: "2024-01-01" }),
    makeLot({ id: "L2", token: "BTC", amount: 0.2, costEur: 12000, date: "2025-01-01" }),
    { ...makeLot({ id: "L3", token: "BTC", amount: 1, costEur: 60000, date: "2023-01-01" }), exhaustedAt: "2024-01-01T00:00:00Z" },
    makeLot({ id: "E1", token: "ETH", amount: 3, costEur: 4500, date: "2024-01-01" }),
  ];
  assert.equal(Number(getActiveBalance("BTC", lots).toFixed(8)), 0.3);
  assert.equal(getActiveCostBasis("BTC", lots), 17000);
  assert.equal(getActiveBalance("ETH", lots), 3);
});
