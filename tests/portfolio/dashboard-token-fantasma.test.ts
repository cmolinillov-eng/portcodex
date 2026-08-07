import test from "node:test";
import assert from "node:assert/strict";
// Base de datos falsa + resolución de "@/…" ANTES de cargar el núcleo del
// dashboard: se prueba el módulo REAL, no una reimplementación.
import { setFakeDb, setFakeViewer } from "../helpers/supabase-stub.mjs";

const { getDashboardData } = await import("../../src/lib/dashboard/get-dashboard-data.ts");

/**
 * TOKENS FANTASMA EN UN LP.
 *
 * El saldo de una posición se calcula desde las transacciones. Cuando una
 * posición tiene transacciones de capital, un token SUYO que no aparezca en
 * ellas no es principal: es un residual que la vista `defi_positions_analytics`
 * arrastra (la recompensa cobrada, que entra como token_in de un `harvest`).
 * Ese token debe valer 0, no caer al saldo de la vista — si no, el pool enseña
 * un tercer token que no es capital y el patrimonio de la posición sale
 * inflado.
 *
 * La guarda existía desde hacía tiempo pero NUNCA se ejecutaba: construía la
 * clave partiendo por el primer "::" de `cartera::protocolo::posición::SÍMBOLO`
 * —o sea, se quedaba con el UUID de la cartera— y luego preguntaba con la clave
 * de tres segmentos. Nunca acertaba.
 */

const PORTFOLIO = "22222222-2222-4222-8222-222222222222";
const POOL_POSITION_ID = "SOL/USDC-9WzDXwBbmkg8ZTbNMqUx";

function tx(p: Record<string, unknown>) {
  return {
    portfolio_id: PORTFOLIO,
    protocol: "Orca",
    position_id: POOL_POSITION_ID,
    position_type: "Liquidity Pool",
    transaction_date: "2026-02-01T10:00:00.000Z",
    token_in_symbol: null,
    token_in_amount: null,
    token_out_symbol: null,
    token_out_amount: null,
    spot_price: 0,
    metadata: null,
    notes: null,
    deleted_at: null,
    ...p,
  };
}

function vista(tokenSymbol: string, balance: number, precioEntrada: number) {
  return {
    portfolio_id: PORTFOLIO,
    token_symbol: tokenSymbol,
    protocol: "Orca",
    position_id: POOL_POSITION_ID,
    position_type: "Liquidity Pool",
    current_balance: balance,
    average_entry_price: precioEntrada,
    total_harvested: 0,
    is_active: true,
  };
}

function baseDb() {
  return {
    portfolios: [{ id: PORTFOLIO, name: "Cartera de prueba", owner: null, manager: null }],
    profiles: [],
    position_tags: [],
    position_links: [],
    onchain_cache: [],
    cached_prices: [
      { token_symbol: "SOL", price: 100, last_updated: new Date().toISOString() },
      { token_symbol: "USDC", price: 1, last_updated: new Date().toISOString() },
      { token_symbol: "JTO", price: 3, last_updated: new Date().toISOString() },
    ],
    // La vista arrastra un TERCER token (la recompensa cobrada) con saldo.
    defi_positions_analytics: [vista("SOL", 10, 100), vista("USDC", 1000, 1), vista("JTO", 50, 3)],
    transactions: [
      tx({
        id: "tx-1",
        type: "lp_deposit",
        token_in_symbol: "SOL",
        token_in_amount: 10,
        spot_price: 100,
        metadata: { lp: { tokenA: "SOL", tokenB: "USDC", rangeLower: 80, rangeUpper: 140, entryPriceRatio: 100 } },
      }),
      tx({
        id: "tx-2",
        type: "lp_deposit",
        token_in_symbol: "USDC",
        token_in_amount: 1000,
        spot_price: 1,
        metadata: { lp: { tokenA: "SOL", tokenB: "USDC", rangeLower: 80, rangeUpper: 140, entryPriceRatio: 100 } },
      }),
      // La recompensa: un `harvest` NO es capital, así que el token JTO no tiene
      // saldo transaccional en el pool.
      tx({ id: "tx-3", type: "harvest", token_in_symbol: "JTO", token_in_amount: 50, spot_price: 3 }),
    ],
  };
}

test("un token de recompensa sin capital NO cuenta como saldo del pool", async () => {
  setFakeDb(baseDb());
  setFakeViewer([PORTFOLIO]);

  const data = await getDashboardData();
  const posiciones = data.sections.flatMap((s) => s.positions);
  const pool = posiciones.find((p) => p.positionId === POOL_POSITION_ID);
  assert.ok(pool, "el pool debe estar en el dashboard");

  // 10 SOL × 100 + 1.000 USDC × 1 = 2.000. Con el token fantasma serían 2.150.
  assert.equal(Math.round(pool!.currentValue), 2000);
  assert.deepEqual(
    pool!.valueBreakdown.map((v) => v.tokenSymbol).sort(),
    ["SOL", "USDC"],
    "el residual de harvest no es saldo del pool",
  );
  // Un LP con tres tokens con saldo se marcaba además como dato corrupto.
  assert.equal(pool!.dataQualityIssue, null);
});

test("una posición SIN transacciones de capital sigue usando el saldo de la vista", async () => {
  // Nada debe romperse en el caso contrario: si la posición no tiene ninguna
  // transacción de capital (posición histórica sin libro), el saldo de la vista
  // es la única fuente y debe seguir usándose.
  const db = baseDb();
  db.transactions = [db.transactions[2]]; // solo el harvest
  setFakeDb(db);
  setFakeViewer([PORTFOLIO]);

  const data = await getDashboardData();
  const pool = data.sections.flatMap((s) => s.positions).find((p) => p.positionId === POOL_POSITION_ID);
  assert.ok(pool);
  // 10 SOL × 100 + 1.000 USDC × 1 + 50 JTO × 3 = 2.150, todo desde la vista.
  assert.equal(Math.round(pool!.currentValue), 2150);
});
