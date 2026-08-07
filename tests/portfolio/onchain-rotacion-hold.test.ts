import test from "node:test";
import assert from "node:assert/strict";
// Registra la base de datos falsa y la resolución de "@/…" ANTES de cargar el
// route handler: lo que se prueba es el código REAL de la ingesta on-chain.
import { setFakeDb, setFakeViewer, tableOf } from "../helpers/supabase-stub.mjs";

const { PATCH } = await import("../../src/app/api/onchain/events/route.ts");
const { computePortfolioValuation } = await import("../../src/lib/portfolio/valuation.ts");
const { getDashboardData } = await import("../../src/lib/dashboard/get-dashboard-data.ts");

/**
 * ROTACIÓN WALLET → POOL: el capital que entra en un pool SALE de la wallet.
 *
 * El worker emite la LLEGADA al hold cuando se retira de un pool
 * (`emitHoldArrivals` en scripts/onchain-cache.mjs, eventos `${clave}:in:SÍMBOLO`)
 * y la ingesta la contabiliza. Al DEPOSITAR no hay emisor equivalente: el
 * `lp_deposit` entraba solo, el hold conservaba su saldo, y el mismo capital se
 * veía en los dos sitios a la vez.
 *
 * Las cadenas literales de este fixture son las que escriben los ficheros
 * reales:
 *   · enlace del hold  → scripts/onchain-cache.mjs (emitHoldArrivals):
 *       onchain_id  = `solana:hold:${mint}`
 *       position_id = `${SÍMBOLO}-${onchain_id.slice(-24)}` (no-\w → "-")
 *       protocol "Wallet", position_type "Hold"
 *   · evento de depósito → scripts/onchain-harvests.mjs (escáner de Solana):
 *       event_key = `solana:${firma}:deposit`, kind "deposit",
 *       position_ref = LivePosition.id completo del pool
 */

const PORTFOLIO = "11111111-1111-4111-8111-111111111111";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const HOLD_OID = `solana:hold:${USDC_MINT}`;
// Mismo formato que emitHoldArrivals (scripts/onchain-cache.mjs).
const HOLD_POSITION_ID = `USDC-${HOLD_OID.slice(-24).replace(/[^\w-]+/g, "-")}`;
const POOL_OID = "solana:orca:9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const POOL_POSITION_ID = "SOL/USDC-9WzDXwBbmkg8ZTbNMqUx";

const PRECIOS: Record<string, number> = { USDC: 1, SOL: 100 };
const precioDe = (s: string) => PRECIOS[s.toUpperCase()] ?? 0;

const LP_META = {
  lp: { tokenA: "SOL", tokenB: "USDC", rangeLower: 80, rangeUpper: 140, entryPriceRatio: 100 },
};

type Fila = Record<string, unknown>;

function baseDb(opciones: { conHold?: boolean; eventos?: Fila[]; transacciones?: Fila[] } = {}) {
  const conHold = opciones.conHold !== false;
  return {
    position_links: [
      {
        portfolio_id: PORTFOLIO,
        onchain_id: POOL_OID,
        protocol: "Orca",
        position_id: POOL_POSITION_ID,
        position_type: "Liquidity Pool",
        auto_ingest: true,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      ...(conHold
        ? [
            {
              portfolio_id: PORTFOLIO,
              onchain_id: HOLD_OID,
              protocol: "Wallet",
              position_id: HOLD_POSITION_ID,
              position_type: "Hold",
              auto_ingest: true,
              created_at: "2026-01-01T00:00:00.000Z",
            },
          ]
        : []),
    ],
    transactions: [
      // Entrada del capital a la wallet (así es como el hold tiene saldo).
      {
        id: "tx-hold-in",
        portfolio_id: PORTFOLIO,
        type: "deposit",
        token_in_symbol: "USDC",
        token_in_amount: 6000,
        token_out_symbol: null,
        token_out_amount: null,
        spot_price: 1,
        protocol: "Wallet",
        position_id: HOLD_POSITION_ID,
        position_type: "Hold",
        transaction_date: "2026-02-01T10:00:00.000Z",
        metadata: { source: "onchain_ingest", onchainIngest: true, eventId: "ev-previo" },
        notes: null,
        deleted_at: null,
      },
      // Depósito LP anterior: de aquí hereda la metadata.lp la ingesta.
      {
        id: "tx-lp-previo",
        portfolio_id: PORTFOLIO,
        type: "lp_deposit",
        token_in_symbol: "USDC",
        token_in_amount: 10,
        token_out_symbol: null,
        token_out_amount: null,
        spot_price: 1,
        protocol: "Orca",
        position_id: POOL_POSITION_ID,
        position_type: "Liquidity Pool",
        transaction_date: "2026-02-02T10:00:00.000Z",
        metadata: { ...LP_META, source: "onchain_adopt" },
        notes: null,
        deleted_at: null,
      },
      ...(opciones.transacciones ?? []),
    ],
    onchain_events: [
      {
        id: "ev-deposito",
        portfolio_id: PORTFOLIO,
        event_key: "solana:5xQd7fakeSignature:deposit",
        kind: "deposit",
        chain: "solana",
        protocol: "Orca",
        wallet_address: "wallet-1",
        position_ref: POOL_OID,
        label: "SOL/USDC",
        tokens: [{ symbol: "USDC", amount: 4840.123978, priceUsd: 1, valueUsd: 4840.123978 }],
        value_usd: 4840.123978,
        block_time: "2026-03-01T12:00:00.000Z",
        tx_hash: "5xQd7fakeSignature",
        includes_principal: true,
        status: "pending",
        ingested_at: null,
      },
      ...(opciones.eventos ?? []),
    ],
  };
}

async function ingerir(eventId = "ev-deposito") {
  const request = {
    json: async () => ({ portfolioId: PORTFOLIO, eventId, action: "ingest" }),
    // La ruta valida CSRF por cabecera Origin (src/lib/security/csrf.ts).
    headers: new Headers({ origin: "http://localhost:3000" }),
    nextUrl: new URL("http://localhost:3000/api/onchain/events"),
  } as unknown as Parameters<typeof PATCH>[0];
  return PATCH(request);
}

const filasNuevas = (cliente: ReturnType<typeof setFakeDb>) =>
  tableOf(cliente, "transactions").filter(
    (r: Fila) => (r.metadata as { eventId?: string } | null)?.eventId === "ev-deposito",
  );

test("el depósito on-chain emite la SALIDA del hold: el capital no se cuenta dos veces", async () => {
  const cliente = setFakeDb(baseDb());
  setFakeViewer([PORTFOLIO]);

  const res = await ingerir();
  assert.equal(res.status, 200, JSON.stringify(await res.json()));

  const nuevas = filasNuevas(cliente);
  const deposito = nuevas.find((r: Fila) => r.type === "lp_deposit");
  assert.ok(deposito, "debe registrarse el depósito en el pool");
  assert.equal(deposito!.token_in_amount, 4840.123978);

  const salida = nuevas.find(
    (r: Fila) => r.type === "withdrawal" && r.position_id === HOLD_POSITION_ID,
  );
  assert.ok(salida, "el hold debe emitir la salida del capital que entró al pool");
  assert.equal(salida!.token_out_symbol, "USDC");
  assert.equal(salida!.token_out_amount, 4840.123978);
  assert.equal(salida!.spot_price, 1);
  assert.equal(salida!.protocol, "Wallet");
  assert.equal(salida!.position_type, "Hold");
  // Mismo grupo de operación → "Deshacer" revierte la rotación ENTERA.
  assert.equal(salida!.operation_group_id, deposito!.operation_group_id);
});

test("la salida del hold es movimiento INTERNO: el Total Depositado no cambia", async () => {
  const cliente = setFakeDb(baseDb());
  setFakeViewer([PORTFOLIO]);
  await ingerir();

  const txs = tableOf(cliente, "transactions").map((r: Fila) => ({
    type: r.type,
    token_in_symbol: r.token_in_symbol,
    token_in_amount: r.token_in_amount,
    token_out_symbol: r.token_out_symbol,
    token_out_amount: r.token_out_amount,
    spot_price: r.spot_price,
    position_id: r.position_id,
    position_type: r.position_type,
    protocol: r.protocol,
    metadata: r.metadata,
    notes: r.notes,
  })) as Parameters<typeof computePortfolioValuation>[0];

  const v = computePortfolioValuation(txs, precioDe);
  // 6.000 USDC entraron a la wallet + 10 USDC de la adopción del pool.
  assert.equal(Math.round(v.totalDepositedUsd), 6010);
  // Patrimonio: 6.000 − 4.840,123978 en el hold + 4.850,123978 en el pool.
  // Sin la salida del hold saldría 10.850 (el capital rotado, contado dos veces).
  assert.equal(Math.round(v.totalValueUsd), 6010);
});

test("el dashboard tampoco resta dos veces: el Total Depositado se queda igual", async () => {
  // El dashboard ya compensaba la rotación por su cuenta (`isRotationDeposit`
  // acredita el destino y debita el hold de origen). Si la nueva salida contara
  // ADEMÁS como retirada de capital, el depositado se hundiría por el doble del
  // importe rotado. Por eso la fila va marcada como movimiento interno.
  const db = baseDb() as Record<string, unknown>;
  db.portfolios = [{ id: PORTFOLIO, name: "Cartera", owner: null, manager: null }];
  db.cached_prices = [
    { token_symbol: "USDC", price: 1, last_updated: new Date().toISOString() },
    { token_symbol: "SOL", price: 100, last_updated: new Date().toISOString() },
  ];
  // El dashboard parte de las posiciones VIVAS de la vista: sin ellas no lee
  // ninguna transacción.
  const filaVista = (positionId: string, protocol: string, positionType: string, symbol: string, balance: number) => ({
    portfolio_id: PORTFOLIO,
    token_symbol: symbol,
    protocol,
    position_id: positionId,
    position_type: positionType,
    current_balance: balance,
    average_entry_price: 1,
    total_harvested: 0,
    is_active: true,
  });
  db.defi_positions_analytics = [
    filaVista(HOLD_POSITION_ID, "Wallet", "Hold", "USDC", 6000),
    filaVista(POOL_POSITION_ID, "Orca", "Liquidity Pool", "USDC", 10),
  ];
  setFakeDb(db as never);
  setFakeViewer([PORTFOLIO]);

  const antes = await getDashboardData();
  await ingerir();
  const despues = await getDashboardData();

  assert.equal(Math.round(antes.summary.totalDepositedUsd), 6010);
  assert.equal(Math.round(despues.summary.totalDepositedUsd), 6010);
});

test("sin hold contable del token, el depósito es capital NUEVO: no se emite salida", async () => {
  const cliente = setFakeDb(baseDb({ conHold: false }));
  setFakeViewer([PORTFOLIO]);
  await ingerir();

  const salidas = filasNuevas(cliente).filter((r: Fila) => r.type === "withdrawal");
  assert.equal(salidas.length, 0, "sin hold de origen no se inventa una salida");
});

test("la ingesta es idempotente: reprocesar el evento no duplica la rotación", async () => {
  const cliente = setFakeDb(baseDb());
  setFakeViewer([PORTFOLIO]);
  await ingerir();
  const trasPrimera = tableOf(cliente, "transactions").length;

  // El evento vuelve a 'pending' (deshacer parcial, reintento del worker) y se
  // reprocesa: la guarda por eventId de performIngest no debe insertar nada.
  const evento = tableOf(cliente, "onchain_events").find((e: Fila) => e.id === "ev-deposito")!;
  evento.status = "pending";
  await ingerir();

  assert.equal(tableOf(cliente, "transactions").length, trasPrimera);
});

test("reinversión de harvest: lo reinvertido NO sale del hold (nunca entró)", async () => {
  // Harvest cobrado del mismo pool minutos antes y por el mismo valor: la
  // ingesta lo empareja y marca el depósito como reinversión.
  const cliente = setFakeDb(
    baseDb({
      eventos: [
        {
          id: "ev-harvest",
          portfolio_id: PORTFOLIO,
          event_key: "solana:meteora-claim:pool:1",
          kind: "harvest",
          chain: "solana",
          protocol: "Orca",
          wallet_address: "wallet-1",
          position_ref: POOL_OID,
          label: "SOL/USDC",
          tokens: [{ symbol: "USDC", amount: 4840.123978, priceUsd: 1, valueUsd: 4840.123978 }],
          value_usd: 4840.123978,
          block_time: "2026-03-01T11:30:00.000Z",
          tx_hash: null,
          includes_principal: false,
          status: "ingested",
          ingested_at: "2026-03-01T11:30:00.000Z",
        },
      ],
    }),
  );
  setFakeViewer([PORTFOLIO]);
  await ingerir();

  const nuevas = filasNuevas(cliente);
  const reinversion = nuevas.find(
    (r: Fila) => (r.metadata as { source?: string }).source === "harvest_reinvest",
  );
  assert.ok(reinversion, "el depósito debe registrarse como reinversión de harvest");
  const salidas = nuevas.filter((r: Fila) => r.type === "withdrawal");
  assert.equal(salidas.length, 0, "el yield reinvertido no salió del hold");
});
