import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Tests del motor de categorización fiscal.
 *
 * Replicamos la lógica esencial de categorize.ts en este archivo para tests
 * aislados sin depender de TypeScript. Verifica que cada combinación
 * (txType, walletKind) se mapea correctamente.
 */

const EPSILON = 1e-9;

function roundEur(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function usdToEur(usd, rate) {
  if (!Number.isFinite(usd) || !Number.isFinite(rate) || rate <= 0) return 0;
  return usd * rate;
}

function applyFifo(token, amountToConsume, lots) {
  const upper = token.trim().toUpperCase();
  if (amountToConsume <= EPSILON) {
    return { consumedCostEur: 0, consumedAmount: 0, insufficientLots: false, lotsConsumed: [], lotUpdates: [] };
  }
  const active = lots
    .filter((l) => l.tokenSymbol.toUpperCase() === upper && l.exhaustedAt === null && l.amount > EPSILON)
    .sort((a, b) => Date.parse(a.acquiredAt) - Date.parse(b.acquiredAt));
  let remaining = amountToConsume;
  let consumedCostEur = 0;
  let consumedAmount = 0;
  const lotsConsumed = [];
  for (const lot of active) {
    if (remaining <= EPSILON) break;
    if (lot.amount <= remaining + EPSILON) {
      consumedCostEur += lot.costBasisEur;
      consumedAmount += lot.amount;
      remaining -= lot.amount;
      lotsConsumed.push({ lotId: lot.id, amountConsumed: lot.amount, costBasisConsumedEur: roundEur(lot.costBasisEur) });
    } else {
      const fraction = remaining / lot.amount;
      const cost = lot.costBasisEur * fraction;
      consumedCostEur += cost;
      consumedAmount += remaining;
      lotsConsumed.push({ lotId: lot.id, amountConsumed: remaining, costBasisConsumedEur: roundEur(cost) });
      remaining = 0;
    }
  }
  return {
    consumedCostEur: roundEur(consumedCostEur),
    consumedAmount,
    insufficientLots: remaining > EPSILON,
    lotsConsumed,
  };
}

// ─── Decisiones por tipo de wallet ─────────────────────────────────────────

function decideDepositCategory(walletKind) {
  if (walletKind === null) return "buy";
  switch (walletKind) {
    case "cex_es": case "cex_foreign":
    case "broker_es": case "broker_foreign":
    case "payment_app":
      return "buy";
    case "hot_wallet": case "cold_wallet":
    case "paper_wallet": case "smart_contract_wallet":
    case "dex":
      return "non_taxable_transfer";
    case "other":
    default:
      return "buy";
  }
}

function decideWithdrawalCategory(walletKind) {
  if (walletKind === null) return "sell";
  switch (walletKind) {
    case "cex_es": case "cex_foreign":
    case "broker_es": case "broker_foreign":
    case "payment_app":
      return "sell";
    case "hot_wallet": case "cold_wallet":
    case "paper_wallet": case "smart_contract_wallet":
    case "dex":
      return "non_taxable_transfer";
    case "other":
    default:
      return "sell";
  }
}

// ─── Categorizador simplificado ───────────────────────────────────────────

function categorize(tx, { rate, lots, walletKind }) {
  const t = (tx.type ?? "").trim().toLowerCase();
  const positionType = (tx.positionType ?? "").trim().toLowerCase();

  if (t === "deposit") {
    const symbol = tx.tokenInSymbol?.toUpperCase();
    const amount = tx.tokenInAmount ?? 0;
    const valueEur = roundEur(usdToEur(amount * tx.spotPriceUsd, rate));
    const category = decideDepositCategory(walletKind);
    if (category === "buy") {
      return {
        category: "buy",
        incomeType: "none",
        taxable: false,
        valueEur,
        realizedGainEur: 0,
        inferred: true,
        walletKind,
        newLot: { tokenSymbol: symbol, amount, costBasisEur: valueEur },
      };
    }
    return {
      category: "non_taxable_transfer",
      incomeType: "none",
      taxable: false,
      valueEur,
      realizedGainEur: 0,
      inferred: true,
      walletKind,
    };
  }

  if (t === "withdrawal") {
    const symbol = tx.tokenOutSymbol?.toUpperCase();
    const amount = tx.tokenOutAmount ?? 0;
    const valueEur = roundEur(usdToEur(amount * tx.spotPriceUsd, rate));
    const category = decideWithdrawalCategory(walletKind);
    if (category === "sell") {
      const fifo = applyFifo(symbol, amount, lots);
      const gain = roundEur(valueEur - fifo.consumedCostEur);
      return {
        category: "sell",
        incomeType: gain >= 0 ? "ganancia_patrimonial" : "perdida_patrimonial",
        taxable: true,
        valueEur,
        costBasisEur: fifo.consumedCostEur,
        realizedGainEur: gain,
        inferred: true,
        walletKind,
      };
    }
    return {
      category: "non_taxable_transfer",
      incomeType: "none",
      taxable: false,
      valueEur,
      realizedGainEur: 0,
      inferred: true,
      walletKind,
    };
  }

  if (t === "lp_deposit") {
    // NUEVO COMPORTAMIENTO: LP deposit es solo trazabilidad.
    // NO calculamos ganancia/pérdida — el usuario no entiende ver +200€ sobre
    // un simple depósito. Se materializa en lp_withdraw.
    const symbol = tx.tokenInSymbol?.toUpperCase();
    const amount = tx.tokenInAmount ?? 0;
    const valueEur = roundEur(usdToEur(amount * tx.spotPriceUsd, rate));
    return {
      category: "lp_provide",
      incomeType: "none",
      taxable: false,
      valueEur,
      costBasisEur: 0,
      realizedGainEur: 0,
      inferred: true,
      walletKind,
    };
  }

  if (t === "lp_withdraw") {
    const symbol = tx.tokenInSymbol?.toUpperCase();
    const amount = tx.tokenInAmount ?? 0;
    const valueEur = roundEur(usdToEur(amount * tx.spotPriceUsd, rate));
    return {
      category: "lp_remove",
      incomeType: "none",
      taxable: false,
      valueEur,
      realizedGainEur: 0,
      inferred: true,
      walletKind,
      newLot: { tokenSymbol: symbol, amount, costBasisEur: valueEur },
    };
  }

  if (t === "harvest") {
    const symbol = tx.tokenInSymbol?.toUpperCase();
    const amount = tx.tokenInAmount ?? 0;
    let category;
    if (positionType.includes("lending")) category = "lending_interest";
    else if (positionType.includes("liquidity") || positionType.includes("pool") || positionType.includes("lp"))
      category = "lp_reward";
    else category = "staking_reward";
    const valueEur = roundEur(usdToEur(amount * tx.spotPriceUsd, rate));
    return {
      category,
      incomeType: "rendimiento_capital_mobiliario",
      taxable: true,
      valueEur,
      realizedGainEur: valueEur,
      inferred: true,
      walletKind,
      newLot: { tokenSymbol: symbol, amount, costBasisEur: valueEur },
    };
  }

  if (t === "staking_deposit" || t === "staking_withdrawal" || t === "lending_supply" || t === "lending_withdraw" || t === "lending_borrow") {
    return { category: "non_taxable_transfer", incomeType: "none", taxable: false, valueEur: 0, realizedGainEur: 0, inferred: true, walletKind };
  }

  return { category: "non_taxable_technical", incomeType: "none", taxable: false, valueEur: 0, realizedGainEur: 0, inferred: true, walletKind };
}

function makeLot(id, token, amount, costEur, date) {
  return { id, portfolioId: "p1", tokenSymbol: token, amount, costBasisEur: costEur, acquiredAt: date, exhaustedAt: null };
}

// ─── Tests por tipo de wallet ──────────────────────────────────────────────

test("Deposit en CEX (Binance) → buy, crea lote, marca inferred", () => {
  const r = categorize(
    { type: "deposit", tokenInSymbol: "BTC", tokenInAmount: 0.5, spotPriceUsd: 60000, positionType: "Hold" },
    { rate: 0.92, lots: [], walletKind: "cex_foreign" },
  );
  assert.equal(r.category, "buy");
  assert.equal(r.taxable, false);
  assert.equal(r.valueEur, 27600);
  assert.equal(r.inferred, true);
  assert.equal(r.walletKind, "cex_foreign");
  assert.ok(r.newLot, "Debe crear un lote nuevo (compra real)");
});

test("Deposit en Hot Wallet (MetaMask) → non_taxable_transfer, NO crea lote", () => {
  const r = categorize(
    { type: "deposit", tokenInSymbol: "BTC", tokenInAmount: 0.5, spotPriceUsd: 60000, positionType: "Hold" },
    { rate: 0.92, lots: [], walletKind: "hot_wallet" },
  );
  assert.equal(r.category, "non_taxable_transfer", "Entrada en wallet self-custody = transferencia interna, NO compra");
  assert.equal(r.taxable, false);
  assert.equal(r.realizedGainEur, 0);
  assert.ok(!r.newLot, "No debe crear lote (el lote real vive en la wallet de origen)");
});

test("Deposit en Cold Wallet (Ledger) → non_taxable_transfer", () => {
  const r = categorize(
    { type: "deposit", tokenInSymbol: "BTC", tokenInAmount: 0.1, spotPriceUsd: 60000, positionType: "Hold" },
    { rate: 0.92, lots: [], walletKind: "cold_wallet" },
  );
  assert.equal(r.category, "non_taxable_transfer");
  assert.equal(r.taxable, false);
});

test("Deposit en CEX España (Bit2Me) → buy", () => {
  const r = categorize(
    { type: "deposit", tokenInSymbol: "EUR", tokenInAmount: 1000, spotPriceUsd: 1.08, positionType: "Hold" },
    { rate: 0.92, lots: [], walletKind: "cex_es" },
  );
  assert.equal(r.category, "buy");
});

test("Deposit en Smart Contract Wallet (Safe) → non_taxable_transfer", () => {
  const r = categorize(
    { type: "deposit", tokenInSymbol: "ETH", tokenInAmount: 1, spotPriceUsd: 2000, positionType: "Hold" },
    { rate: 0.92, lots: [], walletKind: "smart_contract_wallet" },
  );
  assert.equal(r.category, "non_taxable_transfer");
});

test("Withdrawal en CEX → sell, tributa, ganancia patrimonial", () => {
  const lots = [makeLot("L1", "BTC", 1, 50000, "2024-01-01")];
  const r = categorize(
    { type: "withdrawal", tokenOutSymbol: "BTC", tokenOutAmount: 0.5, spotPriceUsd: 70000, positionType: "Hold" },
    { rate: 0.92, lots, walletKind: "cex_foreign" },
  );
  assert.equal(r.category, "sell");
  assert.equal(r.taxable, true);
  assert.equal(r.incomeType, "ganancia_patrimonial");
  assert.equal(r.valueEur, 32200);
  assert.equal(r.costBasisEur, 25000);
  assert.equal(r.realizedGainEur, 7200);
});

test("Withdrawal en Cold Wallet → non_taxable_transfer (transferencia interna)", () => {
  const lots = [makeLot("L1", "BTC", 1, 50000, "2024-01-01")];
  const r = categorize(
    { type: "withdrawal", tokenOutSymbol: "BTC", tokenOutAmount: 0.5, spotPriceUsd: 70000, positionType: "Hold" },
    { rate: 0.92, lots, walletKind: "cold_wallet" },
  );
  assert.equal(r.category, "non_taxable_transfer", "Salida de cold wallet = transferencia, no venta");
  assert.equal(r.taxable, false);
  assert.equal(r.realizedGainEur, 0, "No hay ganancia patrimonial en transferencia interna");
});

test("Withdrawal en DEX → non_taxable_transfer", () => {
  const lots = [makeLot("L1", "ETH", 1, 1500, "2024-01-01")];
  const r = categorize(
    { type: "withdrawal", tokenOutSymbol: "ETH", tokenOutAmount: 0.5, spotPriceUsd: 2000, positionType: "Hold" },
    { rate: 0.92, lots, walletKind: "dex" },
  );
  assert.equal(r.category, "non_taxable_transfer");
});

test("Withdrawal sin walletKind (null) → fallback a sell", () => {
  const lots = [makeLot("L1", "BTC", 1, 50000, "2024-01-01")];
  const r = categorize(
    { type: "withdrawal", tokenOutSymbol: "BTC", tokenOutAmount: 0.5, spotPriceUsd: 70000, positionType: "Hold" },
    { rate: 0.92, lots, walletKind: null },
  );
  assert.equal(r.category, "sell", "Sin wallet clasificado: fallback conservador → asume venta");
});

test("Harvest staking en cualquier wallet → staking_reward (rendimiento)", () => {
  const r = categorize(
    { type: "harvest", tokenInSymbol: "ADA", tokenInAmount: 10, spotPriceUsd: 0.5, positionType: "Staking" },
    { rate: 0.92, lots: [], walletKind: "hot_wallet" },
  );
  assert.equal(r.category, "staking_reward");
  assert.equal(r.incomeType, "rendimiento_capital_mobiliario");
  assert.equal(r.valueEur, 4.6);
});

test("Harvest en posición lending → lending_interest", () => {
  const r = categorize(
    { type: "harvest", tokenInSymbol: "USDC", tokenInAmount: 100, spotPriceUsd: 1, positionType: "Lending" },
    { rate: 0.92, lots: [], walletKind: "dex" },
  );
  assert.equal(r.category, "lending_interest");
  assert.equal(r.valueEur, 92);
});

test("LP deposit → lp_provide, SOLO trazabilidad (sin ganancia ficticia)", () => {
  // Decisión: aunque DGT considera permuta, NO calculamos ganancia ficticia
  // sobre un simple depósito. Se materializa al hacer lp_withdraw.
  const lots = [makeLot("L1", "ETH", 1.0, 1500, "2024-01-01")];
  const r = categorize(
    { type: "lp_deposit", tokenInSymbol: "ETH", tokenInAmount: 1.0, spotPriceUsd: 2200, positionType: "Liquidity Pool" },
    { rate: 0.92, lots, walletKind: "dex" },
  );
  assert.equal(r.category, "lp_provide");
  assert.equal(r.taxable, false, "LP deposit NO tributa en el momento del depósito");
  assert.equal(r.realizedGainEur, 0, "NO debe mostrarse ganancia patrimonial sobre un simple depósito");
  assert.equal(r.valueEur, 2024, "El valor EUR sí se informa");
});

test("Harvest sobre LP → lp_reward (NO staking_reward)", () => {
  // Orca, Uniswap farms, Raydium no tienen staking — tienen LP rewards.
  const r = categorize(
    { type: "harvest", tokenInSymbol: "ORCA", tokenInAmount: 10, spotPriceUsd: 1.5, positionType: "Liquidity Pool" },
    { rate: 0.92, lots: [], walletKind: "dex" },
  );
  assert.equal(r.category, "lp_reward", "Harvest sobre LP debe ser lp_reward, NO staking_reward");
  assert.equal(r.incomeType, "rendimiento_capital_mobiliario");
});

test("Harvest sobre Staking nativo → staking_reward", () => {
  const r = categorize(
    { type: "harvest", tokenInSymbol: "SOL", tokenInAmount: 2, spotPriceUsd: 100, positionType: "Staking" },
    { rate: 0.92, lots: [], walletKind: "dex" },
  );
  assert.equal(r.category, "staking_reward");
});

test("LP withdraw → lp_remove, crea lote nuevo con FMV", () => {
  const r = categorize(
    { type: "lp_withdraw", tokenInSymbol: "USDC", tokenInAmount: 500, spotPriceUsd: 1, positionType: "Liquidity Pool" },
    { rate: 0.92, lots: [], walletKind: "dex" },
  );
  assert.equal(r.category, "lp_remove");
  assert.equal(r.newLot.costBasisEur, 460);
});

test("Staking deposit → non_taxable_transfer en cualquier wallet", () => {
  const r = categorize(
    { type: "staking_deposit", tokenInSymbol: "ETH", tokenInAmount: 1, spotPriceUsd: 2000, positionType: "Staking" },
    { rate: 0.92, lots: [], walletKind: "cex_foreign" },
  );
  assert.equal(r.category, "non_taxable_transfer");
});

test("Lending supply → non_taxable_transfer", () => {
  const r = categorize(
    { type: "lending_supply", tokenInSymbol: "ETH", tokenInAmount: 1, spotPriceUsd: 2000, positionType: "Lending" },
    { rate: 0.92, lots: [], walletKind: "dex" },
  );
  assert.equal(r.category, "non_taxable_transfer");
});

test("TODAS las anotaciones llevan inferred: true por defecto", () => {
  const cases = [
    { type: "deposit", tokenInSymbol: "BTC", tokenInAmount: 0.5, spotPriceUsd: 60000, positionType: "Hold" },
    { type: "withdrawal", tokenOutSymbol: "BTC", tokenOutAmount: 0.5, spotPriceUsd: 70000, positionType: "Hold" },
    { type: "harvest", tokenInSymbol: "ADA", tokenInAmount: 10, spotPriceUsd: 0.5, positionType: "Staking" },
    { type: "lp_deposit", tokenInSymbol: "ETH", tokenInAmount: 1, spotPriceUsd: 2000, positionType: "Liquidity Pool" },
  ];
  for (const tx of cases) {
    const r = categorize(tx, { rate: 0.92, lots: [makeLot("L1", "BTC", 1, 50000, "2024-01-01"), makeLot("L2", "ETH", 1, 1500, "2024-01-01")], walletKind: "cex_foreign" });
    assert.equal(r.inferred, true, `Anotación de ${tx.type} debe llevar inferred=true`);
  }
});

test("walletKind se propaga a la anotación", () => {
  const r = categorize(
    { type: "deposit", tokenInSymbol: "BTC", tokenInAmount: 0.5, spotPriceUsd: 60000, positionType: "Hold" },
    { rate: 0.92, lots: [], walletKind: "cold_wallet" },
  );
  assert.equal(r.walletKind, "cold_wallet");
});

test("Escenario realista: cliente con CEX + Cold Wallet (transferencia entre ellas no tributa)", () => {
  // Día 1: Compra 1 BTC en Binance (CEX)
  const buy = categorize(
    { type: "deposit", tokenInSymbol: "BTC", tokenInAmount: 1, spotPriceUsd: 50000, positionType: "Hold" },
    { rate: 0.92, lots: [], walletKind: "cex_foreign" },
  );
  assert.equal(buy.category, "buy");
  assert.equal(buy.newLot.costBasisEur, 46000);

  const lots = [{ ...makeLot("L1", "BTC", 1, 46000, "2025-01-01") }];

  // Día 2: Saca 1 BTC de Binance → debería ser "sell"
  const cexOut = categorize(
    { type: "withdrawal", tokenOutSymbol: "BTC", tokenOutAmount: 1, spotPriceUsd: 50000, positionType: "Hold" },
    { rate: 0.92, lots, walletKind: "cex_foreign" },
  );
  assert.equal(cexOut.category, "sell", "Salida de Binance se categoriza como venta (asunción conservadora)");

  // Mismo día: Entrada en Ledger → debería ser "non_taxable_transfer"
  const ledgerIn = categorize(
    { type: "deposit", tokenInSymbol: "BTC", tokenInAmount: 1, spotPriceUsd: 50000, positionType: "Hold" },
    { rate: 0.92, lots, walletKind: "cold_wallet" },
  );
  assert.equal(ledgerIn.category, "non_taxable_transfer", "Entrada en Ledger se categoriza como transferencia interna");
  assert.equal(ledgerIn.realizedGainEur, 0);
  // ↑ En este escenario el gestor verá ambas y podrá CONFIRMAR que es una transferencia
  // recategorizando manualmente la salida de Binance también como non_taxable_transfer.
});
