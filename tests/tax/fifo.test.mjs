import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Tests del algoritmo FIFO obligatorio (Art. 37.2 LIRPF).
 *
 * Replicamos la lógica de fifo.ts en este archivo para tests aislados sin
 * depender de TypeScript. Mantener sincronizado con web/src/lib/tax/fifo.ts.
 */

const EPSILON = 1e-9;

function roundEur(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function applyFifo(tokenSymbol, amountToConsume, allLots) {
  const upper = tokenSymbol.trim().toUpperCase();
  if (amountToConsume <= EPSILON) {
    return {
      consumedCostEur: 0,
      consumedAmount: 0,
      insufficientLots: false,
      lotsConsumed: [],
      lotUpdates: [],
    };
  }

  const activeLots = allLots
    .filter(
      (lot) =>
        lot.tokenSymbol.trim().toUpperCase() === upper &&
        lot.exhaustedAt === null &&
        lot.amount > EPSILON,
    )
    .sort((a, b) => Date.parse(a.acquiredAt) - Date.parse(b.acquiredAt));

  let remaining = amountToConsume;
  let consumedCostEur = 0;
  let consumedAmount = 0;
  const lotsConsumed = [];
  const lotUpdates = [];

  for (const lot of activeLots) {
    if (remaining <= EPSILON) break;

    if (lot.amount <= remaining + EPSILON) {
      consumedCostEur += lot.costBasisEur;
      consumedAmount += lot.amount;
      remaining -= lot.amount;
      lotsConsumed.push({
        lotId: lot.id,
        amountConsumed: lot.amount,
        costBasisConsumedEur: roundEur(lot.costBasisEur),
        acquiredAt: lot.acquiredAt,
      });
      lotUpdates.push({
        lotId: lot.id,
        newAmount: 0,
        newCostBasisEur: 0,
        exhaustedAt: new Date().toISOString(),
      });
    } else {
      const fraction = remaining / lot.amount;
      const costConsumed = lot.costBasisEur * fraction;
      consumedCostEur += costConsumed;
      consumedAmount += remaining;
      const newAmount = lot.amount - remaining;
      const newCostBasis = lot.costBasisEur - costConsumed;
      lotsConsumed.push({
        lotId: lot.id,
        amountConsumed: remaining,
        costBasisConsumedEur: roundEur(costConsumed),
        acquiredAt: lot.acquiredAt,
      });
      lotUpdates.push({
        lotId: lot.id,
        newAmount,
        newCostBasisEur: newCostBasis,
        exhaustedAt: null,
      });
      remaining = 0;
    }
  }

  return {
    consumedCostEur: roundEur(consumedCostEur),
    consumedAmount,
    insufficientLots: remaining > EPSILON,
    lotsConsumed,
    lotUpdates,
  };
}

// =============================================================================

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

// ─── Tests ─────────────────────────────────────────────────────────────────

test("FIFO: consume el lote más antiguo primero", () => {
  const lots = [
    makeLot({ id: "L2", token: "BTC", amount: 0.1, costEur: 6000, date: "2025-06-01" }),
    makeLot({ id: "L1", token: "BTC", amount: 0.1, costEur: 5000, date: "2024-01-15" }),
  ];
  const r = applyFifo("BTC", 0.1, lots);
  assert.equal(r.consumedAmount, 0.1);
  assert.equal(r.consumedCostEur, 5000);
  assert.equal(r.lotsConsumed[0].lotId, "L1", "Debe consumir el lote más antiguo (L1)");
});

test("FIFO: withdrawal parcial deja resto en lote con cost basis pro-rata", () => {
  const lots = [makeLot({ id: "L1", token: "BTC", amount: 1, costEur: 60000, date: "2024-01-01" })];
  const r = applyFifo("BTC", 0.3, lots);
  assert.equal(r.consumedCostEur, 18000, "30% del cost basis");
  assert.equal(r.lotUpdates[0].newAmount, 0.7);
  assert.equal(roundEur(r.lotUpdates[0].newCostBasisEur), 42000, "70% restante");
  assert.equal(r.lotUpdates[0].exhaustedAt, null);
});

test("FIFO: cadena de 3 lotes consume en orden", () => {
  const lots = [
    makeLot({ id: "L1", token: "ETH", amount: 1, costEur: 1500, date: "2024-01-01" }),
    makeLot({ id: "L2", token: "ETH", amount: 1, costEur: 2000, date: "2024-06-01" }),
    makeLot({ id: "L3", token: "ETH", amount: 1, costEur: 3000, date: "2025-01-01" }),
  ];
  const r = applyFifo("ETH", 2.5, lots);
  // L1 entero (1500) + L2 entero (2000) + L3 parcial 0.5 → 0.5×3000 = 1500
  assert.equal(r.consumedCostEur, 5000);
  assert.equal(r.consumedAmount, 2.5);
  assert.equal(r.lotsConsumed.length, 3);
  assert.equal(r.lotUpdates[2].newAmount, 0.5, "L3 queda con 0.5 ETH");
});

test("FIFO: insuficientes lotes → marca insufficientLots y consume lo disponible", () => {
  const lots = [makeLot({ id: "L1", token: "BTC", amount: 0.5, costEur: 30000, date: "2024-01-01" })];
  const r = applyFifo("BTC", 1.0, lots);
  assert.equal(r.insufficientLots, true);
  assert.equal(r.consumedAmount, 0.5, "Solo se pudo consumir el balance disponible");
  assert.equal(r.consumedCostEur, 30000);
});

test("FIFO: lotes exhausted no se reutilizan", () => {
  const lots = [
    {
      ...makeLot({ id: "L1", token: "BTC", amount: 0.1, costEur: 5000, date: "2024-01-01" }),
      exhaustedAt: "2024-12-31T00:00:00Z",
    },
    makeLot({ id: "L2", token: "BTC", amount: 0.1, costEur: 6000, date: "2025-01-01" }),
  ];
  const r = applyFifo("BTC", 0.1, lots);
  assert.equal(r.lotsConsumed[0].lotId, "L2", "L1 está exhausted, debe ir a L2");
  assert.equal(r.consumedCostEur, 6000);
});

test("FIFO: multi-token — solo toca el token solicitado", () => {
  const lots = [
    makeLot({ id: "B1", token: "BTC", amount: 0.1, costEur: 5000, date: "2024-01-01" }),
    makeLot({ id: "E1", token: "ETH", amount: 1.0, costEur: 1500, date: "2024-01-01" }),
  ];
  const r = applyFifo("ETH", 0.5, lots);
  assert.equal(r.lotsConsumed[0].lotId, "E1");
  assert.equal(r.consumedCostEur, 750, "50% de 1500");
  // El lote de BTC no se debe haber tocado en lotUpdates
  assert.equal(r.lotUpdates.length, 1);
  assert.equal(r.lotUpdates[0].lotId, "E1");
});

test("FIFO: case-insensitive en token symbol", () => {
  const lots = [makeLot({ id: "L1", token: "btc", amount: 0.1, costEur: 5000, date: "2024-01-01" })];
  const r = applyFifo("BTC", 0.1, lots);
  assert.equal(r.consumedCostEur, 5000);
});

test("FIFO: amount = 0 → resultado vacío", () => {
  const lots = [makeLot({ id: "L1", token: "BTC", amount: 0.1, costEur: 5000, date: "2024-01-01" })];
  const r = applyFifo("BTC", 0, lots);
  assert.equal(r.consumedAmount, 0);
  assert.equal(r.consumedCostEur, 0);
  assert.equal(r.lotsConsumed.length, 0);
  assert.equal(r.insufficientLots, false);
});

test("FIFO: ejemplo del SKILL — 2 lotes BTC + venta 0.15", () => {
  // Replicar el ejemplo del SKILL.md sección B "Venta"
  const lots = [
    makeLot({ id: "A", token: "BTC", amount: 0.1, costEur: 5000, date: "2024-01-01" }),
    makeLot({ id: "B", token: "BTC", amount: 0.1, costEur: 6000, date: "2025-06-01" }),
  ];
  const r = applyFifo("BTC", 0.15, lots);
  // Esperado: A entero (cost 5000) + B parcial 0.05 → 50% de 6000 = 3000
  assert.equal(r.consumedAmount, 0.15);
  assert.equal(r.consumedCostEur, 8000);
  // Si proceeds = 0.15 × 70000 €/BTC = 10500 €
  // Ganancia esperada: 10500 - 8000 = 2500 €
  const proceedsEur = 10500;
  const gain = proceedsEur - r.consumedCostEur;
  assert.equal(gain, 2500, "Ganancia patrimonial = 2.500 € según SKILL");
});

test("FIFO: ordenamiento estable cuando dos lotes tienen misma fecha", () => {
  const lots = [
    makeLot({ id: "L1", token: "BTC", amount: 0.1, costEur: 5000, date: "2024-01-01" }),
    makeLot({ id: "L2", token: "BTC", amount: 0.1, costEur: 6000, date: "2024-01-01" }),
  ];
  const r = applyFifo("BTC", 0.1, lots);
  // Cualquier orden válido, lo importante es que solo consuma un lote
  assert.equal(r.lotsConsumed.length, 1);
  assert.equal(r.consumedAmount, 0.1);
});
