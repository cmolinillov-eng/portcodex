/**
 * Motor de categorización fiscal para TRAZABILIDAD.
 *
 * ⚠️ Filosofía: esta aplicación NO es una herramienta de declaración fiscal.
 * Es una herramienta de TRAZABILIDAD que clasifica cada movimiento del cliente
 * para que tenga visibilidad clara de qué pasó en cada wallet y qué tipo de
 * evento fiscal puede haberse generado. Para declarar, el cliente debe usar
 * un asesor o software fiscal especializado.
 *
 * El motor toma:
 *   - Una transacción
 *   - Los lotes FIFO activos del portfolio
 *   - La metadata del wallet/protocolo donde ocurre
 *   - El tipo de cambio USD→EUR
 *
 * Y devuelve:
 *   - Anotación clara (categoría + etiqueta humana + descripción + flag inferido)
 *   - Nuevos lotes FIFO a crear
 *   - Eventos tributables (cuando la operación genera ganancia/pérdida/rendimiento)
 *   - Updates sobre lotes consumidos
 *
 * Decisiones clave:
 *
 *  • Las inferencias dependen del TIPO DE WALLET:
 *      - CEX deposit → "compra con fiat" (asunción más común)
 *      - Hot/Cold wallet deposit → "transferencia interna" (no es compra)
 *      - DEX → siempre transferencia o swap, nunca compra/venta
 *
 *  • Toda anotación lleva `inferred: true` por defecto. El gestor puede
 *    confirmarla o cambiarla desde la UI, pasando a `inferred: false`.
 *
 *  • El propósito declarado es TRAZABILIDAD, no asesoramiento fiscal.
 *
 * Fuente de verdad fiscal: skills/spanish-crypto-tax-expert/SKILL.md
 *
 * Función pura — no toca BD, no hace I/O.
 */

import type {
  CategorizationResult,
  CategorizeInput,
  FiscalCategory,
  IncomeType,
  TaxEvent,
  TaxLot,
  WalletKind,
  WalletProtocolMeta,
} from "./types";
import { applyFifo } from "./fifo";
import { calculateRealizedGain, getTaxYear, roundEur, usdToEur } from "./eur-conversion";
import { buildHumanDescription, getCategoryLabel } from "./human-language";

interface CategorizeOptions {
  fxRateUsdToEur: number;
  currentLots: TaxLot[];
  /** Metadata del custodio. Si null, se asume "other" (fallback conservador). */
  walletProtocol: WalletProtocolMeta | null;
}

// =============================================================================
// DECISIONES POR TIPO DE WALLET
// =============================================================================
//
// Reglas centralizadas: dado (txType, walletKind), decide la categoría.
// Si añades nuevos walletKinds en el futuro, edita aquí.

function decideDepositCategory(walletKind: WalletKind | null): FiscalCategory {
  if (walletKind === null) return "buy"; // fallback conservador para wallet sin clasificar
  switch (walletKind) {
    case "cex_es":
    case "cex_foreign":
    case "broker_es":
    case "broker_foreign":
    case "payment_app":
      return "buy"; // compra con fiat (lo más común en estos servicios)
    case "hot_wallet":
    case "cold_wallet":
    case "paper_wallet":
    case "smart_contract_wallet":
      return "non_taxable_transfer"; // entrada desde otra wallet
    case "dex":
      return "non_taxable_transfer"; // DEX no es custodial, entrada técnica
    case "other":
    default:
      return "buy"; // fallback conservador
  }
}

function decideWithdrawalCategory(walletKind: WalletKind | null): FiscalCategory {
  if (walletKind === null) return "sell"; // fallback conservador
  switch (walletKind) {
    case "cex_es":
    case "cex_foreign":
    case "broker_es":
    case "broker_foreign":
    case "payment_app":
      return "sell"; // venta a fiat
    case "hot_wallet":
    case "cold_wallet":
    case "paper_wallet":
    case "smart_contract_wallet":
      return "non_taxable_transfer"; // salida a otra wallet
    case "dex":
      return "non_taxable_transfer";
    case "other":
    default:
      return "sell"; // fallback conservador
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function emptyResult(
  category: FiscalCategory,
  incomeType: IncomeType,
  notes: string,
  humanDescription: string,
  walletKind: WalletKind | null,
): CategorizationResult {
  return {
    annotation: {
      category,
      incomeType,
      valueEur: 0,
      costBasisEur: 0,
      realizedGainEur: 0,
      notes,
      taxable: false,
      humanLabel: getCategoryLabel(category),
      humanDescription,
      inferred: true,
      walletKind,
    },
    newLots: [],
    taxEvents: [],
    consumedLotUpdates: [],
  };
}

function buildTaxEvent(input: {
  tx: CategorizeInput;
  eventType: FiscalCategory;
  proceedsEur: number;
  costBasisEur: number;
  realizedGainEur: number;
  incomeType: IncomeType;
  tokenSymbol: string | null;
  tokenAmount: number | null;
  lotsConsumed: TaxEvent["lotsConsumed"];
  notes: string;
}): TaxEvent {
  return {
    portfolioId: input.tx.portfolioId,
    transactionId: input.tx.id ?? null,
    eventType: input.eventType,
    eventDate: input.tx.transactionDate,
    taxYear: getTaxYear(input.tx.transactionDate),
    proceedsEur: roundEur(input.proceedsEur),
    costBasisEur: roundEur(input.costBasisEur),
    realizedGainEur: roundEur(input.realizedGainEur),
    incomeType: input.incomeType,
    tokenSymbol: input.tokenSymbol,
    tokenAmount: input.tokenAmount,
    lotsConsumed: input.lotsConsumed,
    notes: input.notes,
  };
}

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

export function categorizeTransaction(
  tx: CategorizeInput,
  options: CategorizeOptions,
): CategorizationResult {
  const { fxRateUsdToEur, currentLots, walletProtocol } = options;
  const txType = (tx.type ?? "").trim().toLowerCase();
  const positionType = (tx.positionType ?? "").trim().toLowerCase();
  const walletKind = walletProtocol?.walletKind ?? null;
  const walletName = walletProtocol?.name ?? tx.protocol;

  switch (txType) {
    case "deposit":
      return handleDeposit(tx, fxRateUsdToEur, walletKind, walletName);

    case "withdrawal":
      return handleWithdrawal(tx, currentLots, fxRateUsdToEur, walletKind, walletName);

    case "staking_deposit":
    case "staking_withdrawal":
      return handleStakingMovement(tx, walletKind, walletName, txType);

    case "lending_supply":
    case "lending_withdraw":
      return handleLendingMovement(tx, walletKind, walletName, txType);

    case "lending_borrow":
      return handleLendingBorrow(tx, walletKind, walletName);

    case "lp_deposit":
      return handleLpDeposit(tx, currentLots, fxRateUsdToEur, walletKind, walletName);

    case "lp_withdraw":
      return handleLpWithdraw(tx, fxRateUsdToEur, walletKind, walletName);

    case "harvest":
      return handleHarvest(tx, positionType, fxRateUsdToEur, walletKind, walletName);

    case "position_closed":
      return emptyResult(
        "non_taxable_technical",
        "none",
        "Snapshot de cierre — sin impacto fiscal directo (la fiscalidad se imputa a las transacciones que cerraron la posición).",
        `Cierre técnico de posición en ${walletName}.`,
        walletKind,
      );

    default:
      return emptyResult(
        "non_taxable_technical",
        "none",
        `Tipo de transacción no clasificado: "${tx.type}". Revisar manualmente.`,
        `Movimiento sin clasificar en ${walletName}.`,
        walletKind,
      );
  }
}

// =============================================================================
// HANDLERS POR TIPO DE OPERACIÓN
// =============================================================================

function handleDeposit(
  tx: CategorizeInput,
  rate: number,
  walletKind: WalletKind | null,
  walletName: string,
): CategorizationResult {
  const symbol = (tx.tokenInSymbol ?? "").toUpperCase();
  const amount = Number(tx.tokenInAmount ?? 0);
  const spotUsd = Number(tx.spotPriceUsd ?? 0);

  if (!symbol || amount <= 0 || spotUsd <= 0) {
    return emptyResult(
      "buy",
      "none",
      "Depósito con datos incompletos — sin impacto fiscal calculable.",
      `Depósito en ${walletName} sin datos suficientes para clasificar.`,
      walletKind,
    );
  }

  const category = decideDepositCategory(walletKind);
  const valueEur = roundEur(usdToEur(amount * spotUsd, rate));

  // ─── CASO ESPECIAL: Destino de un rebalanceo ───────────────────────────
  // Si la fila viene marcada con `metadata.source === "rebalance_transfer"`,
  // el activo se MATERIALIZA aquí por un rebalanceo. La app trata el
  // rebalanceo como movimiento interno (la base viaja vía `depositedDelta`
  // en USD), así que creamos un lote FIFO con esa base — convertida a EUR —
  // para que una venta futura tenga lotes suficientes. Si no hay
  // `depositedDelta`, caemos al FMV de recepción.
  const meta = tx.metadata ?? {};
  const rebalanceSource = typeof meta.source === "string" ? meta.source : null;
  if (rebalanceSource === "rebalance_transfer") {
    const depositedDeltaUsd =
      typeof meta.depositedDelta === "number" ? (meta.depositedDelta as number) : null;
    const costBasisEur =
      depositedDeltaUsd !== null && depositedDeltaUsd > 0
        ? roundEur(usdToEur(depositedDeltaUsd, rate))
        : valueEur;
    const description = buildHumanDescription({
      category: "non_taxable_transfer",
      walletKind,
      walletName,
      tokenSymbol: symbol,
      amount,
      valueEur,
    });
    return {
      annotation: {
        category: "non_taxable_transfer",
        incomeType: "none",
        valueEur,
        costBasisEur,
        realizedGainEur: 0,
        notes: `Destino de rebalanceo: ${amount} ${symbol} en ${walletName} (FMV ${valueEur} €). Base trasladada del origen: ${costBasisEur} €.`,
        taxable: false,
        humanLabel: getCategoryLabel("non_taxable_transfer"),
        humanDescription: description,
        inferred: true,
        walletKind,
      },
      newLots: [
        {
          tokenSymbol: symbol,
          amount,
          costBasisEur,
          acquiredAt: tx.transactionDate,
          acquiredViaEvent: "swap_in",
          acquiredViaTransactionId: tx.id ?? null,
        },
      ],
      taxEvents: [],
      consumedLotUpdates: [],
    };
  }

  // ─── CASO A: Compra real (CEX, broker, payment app) ─────────────────────
  if (category === "buy") {
    const description = buildHumanDescription({
      category: "buy",
      walletKind,
      walletName,
      tokenSymbol: symbol,
      amount,
      valueEur,
    });
    return {
      annotation: {
        category: "buy",
        incomeType: "none",
        valueEur,
        costBasisEur: 0,
        realizedGainEur: 0,
        notes: `Compra fiat → ${symbol} en ${walletName}. Cost basis: ${valueEur} €.`,
        taxable: false,
        humanLabel: getCategoryLabel("buy"),
        humanDescription: description,
        inferred: true,
        walletKind,
      },
      newLots: [
        {
          tokenSymbol: symbol,
          amount,
          costBasisEur: valueEur,
          acquiredAt: tx.transactionDate,
          acquiredViaEvent: "buy",
          acquiredViaTransactionId: tx.id ?? null,
        },
      ],
      taxEvents: [],
      consumedLotUpdates: [],
    };
  }

  // ─── CASO B: Transferencia interna (hot/cold/smart contract wallet) ────
  const description = buildHumanDescription({
    category: "non_taxable_transfer",
    walletKind,
    walletName,
    tokenSymbol: symbol,
    amount,
    valueEur,
  });
  return {
    annotation: {
      category: "non_taxable_transfer",
      incomeType: "none",
      valueEur,
      costBasisEur: 0,
      realizedGainEur: 0,
      notes: `Entrada de ${amount} ${symbol} en ${walletName} (wallet self-custody). Asumido transferencia interna; el gestor puede recategorizarlo como "buy" si fue compra con fiat.`,
      taxable: false,
      humanLabel: getCategoryLabel("non_taxable_transfer"),
      humanDescription: description,
      inferred: true,
      walletKind,
    },
    // En transferencias internas NO creamos lote nuevo: el lote ya existe en
    // la otra wallet del cliente. Si no existe (porque el cliente no la tiene
    // en la app), el gestor debe recategorizar manualmente.
    newLots: [],
    taxEvents: [],
    consumedLotUpdates: [],
  };
}

function handleWithdrawal(
  tx: CategorizeInput,
  currentLots: TaxLot[],
  rate: number,
  walletKind: WalletKind | null,
  walletName: string,
): CategorizationResult {
  const symbol = (tx.tokenOutSymbol ?? "").toUpperCase();
  const amount = Number(tx.tokenOutAmount ?? 0);
  const spotUsd = Number(tx.spotPriceUsd ?? 0);

  if (!symbol || amount <= 0 || spotUsd <= 0) {
    return emptyResult(
      "sell",
      "none",
      "Retirada con datos incompletos.",
      `Retirada de ${walletName} sin datos suficientes.`,
      walletKind,
    );
  }

  const category = decideWithdrawalCategory(walletKind);
  const valueEur = roundEur(usdToEur(amount * spotUsd, rate));

  // ─── CASO A: Venta real (CEX, broker, payment app) ──────────────────────
  if (category === "sell") {
    const fifo = applyFifo(symbol, amount, currentLots);
    const realizedGainEur = calculateRealizedGain(valueEur, fifo.consumedCostEur);

    const notes = fifo.insufficientLots
      ? `Venta ${amount} ${symbol} → fiat en ${walletName}. ⚠️ Lotes FIFO insuficientes (${fifo.consumedAmount.toFixed(8)} de ${amount}). Posiblemente faltan transacciones históricas.`
      : `Venta ${amount} ${symbol} → fiat en ${walletName}. Cost basis FIFO: ${fifo.consumedCostEur} €. Ganancia: ${realizedGainEur} €.`;

    const description = buildHumanDescription({
      category: "sell",
      walletKind,
      walletName,
      tokenSymbol: symbol,
      amount,
      valueEur,
      costBasisEur: fifo.consumedCostEur,
      realizedGainEur,
    });

    return {
      annotation: {
        category: "sell",
        incomeType: realizedGainEur >= 0 ? "ganancia_patrimonial" : "perdida_patrimonial",
        valueEur,
        costBasisEur: fifo.consumedCostEur,
        realizedGainEur,
        notes,
        taxable: true,
        humanLabel: getCategoryLabel("sell"),
        humanDescription: description,
        inferred: true,
        walletKind,
      },
      newLots: [],
      taxEvents: [
        buildTaxEvent({
          tx,
          eventType: "sell",
          proceedsEur: valueEur,
          costBasisEur: fifo.consumedCostEur,
          realizedGainEur,
          incomeType: "ganancia_patrimonial",
          tokenSymbol: symbol,
          tokenAmount: amount,
          lotsConsumed: fifo.lotsConsumed,
          notes,
        }),
      ],
      consumedLotUpdates: fifo.lotUpdates,
    };
  }

  // ─── CASO B: Transferencia interna ──────────────────────────────────────
  const description = buildHumanDescription({
    category: "non_taxable_transfer",
    walletKind,
    walletName,
    tokenSymbol: symbol,
    amount,
    valueEur,
  });
  return {
    annotation: {
      category: "non_taxable_transfer",
      incomeType: "none",
      valueEur,
      costBasisEur: 0,
      realizedGainEur: 0,
      notes: `Salida de ${amount} ${symbol} desde ${walletName} (wallet self-custody). Asumido transferencia interna; el gestor puede recategorizarlo como "sell" si fue venta a fiat.`,
      taxable: false,
      humanLabel: getCategoryLabel("non_taxable_transfer"),
      humanDescription: description,
      inferred: true,
      walletKind,
    },
    // En transferencias internas NO consumimos lote: el lote sigue activo
    // (se transferirá a la wallet destino donde aparecerá como deposit).
    newLots: [],
    taxEvents: [],
    consumedLotUpdates: [],
  };
}

function handleStakingMovement(
  tx: CategorizeInput,
  walletKind: WalletKind | null,
  walletName: string,
  txType: string,
): CategorizationResult {
  const symbol = (tx.tokenInSymbol ?? tx.tokenOutSymbol ?? "").toUpperCase();
  const amount = Number(tx.tokenInAmount ?? tx.tokenOutAmount ?? 0);
  const action = txType === "staking_deposit" ? "Bloqueaste" : "Desbloqueaste";
  return emptyResult(
    "non_taxable_transfer",
    "none",
    "Movimiento entre wallet y staking pool (mismo activo, conservas titularidad).",
    `${action} ${amount} ${symbol} en staking (${walletName}). No hay cambio de titularidad.`,
    walletKind,
  );
}

function handleLendingMovement(
  tx: CategorizeInput,
  walletKind: WalletKind | null,
  walletName: string,
  txType: string,
): CategorizationResult {
  const symbol = (tx.tokenInSymbol ?? tx.tokenOutSymbol ?? "").toUpperCase();
  const amount = Number(tx.tokenInAmount ?? tx.tokenOutAmount ?? 0);
  const action = txType === "lending_supply" ? "Depositaste" : "Retiraste";
  return emptyResult(
    "non_taxable_transfer",
    "none",
    "Supply/withdraw de colateral en lending — no hay transmisión patrimonial.",
    `${action} ${amount} ${symbol} como colateral en ${walletName}. No hay transmisión patrimonial.`,
    walletKind,
  );
}

function handleLendingBorrow(
  tx: CategorizeInput,
  walletKind: WalletKind | null,
  walletName: string,
): CategorizationResult {
  const isReceiving = Boolean(tx.tokenInSymbol && (tx.tokenInAmount ?? 0) > 0);
  const isRepaying = Boolean(tx.tokenOutSymbol && (tx.tokenOutAmount ?? 0) > 0);
  const symbol = (tx.tokenInSymbol ?? tx.tokenOutSymbol ?? "").toUpperCase();
  const amount = Number(tx.tokenInAmount ?? tx.tokenOutAmount ?? 0);

  let humanDescription: string;
  let notes: string;
  if (isReceiving) {
    humanDescription = `Tomaste prestado ${amount} ${symbol} en ${walletName}. Esto crea deuda; no hay transmisión patrimonial.`;
    notes = "Préstamo recibido — entra deuda. No hay transmisión patrimonial.";
  } else if (isRepaying) {
    humanDescription = `Repagaste ${amount} ${symbol} de deuda en ${walletName}.`;
    notes = "Repago de deuda. No hay transmisión patrimonial.";
  } else {
    humanDescription = `Movimiento de lending borrow en ${walletName} sin lado claro — revisar manualmente.`;
    notes = "Operación lending_borrow sin lado claro — revisar manualmente.";
  }

  return emptyResult("non_taxable_transfer", "none", notes, humanDescription, walletKind);
}

/**
 * LP DEPOSIT — Trazabilidad pura, SIN ganancia/pérdida realizada.
 *
 * Decisión de diseño: aunque la DGT considera la provisión de liquidez como
 * una permuta tributable, NO calculamos aquí la ganancia ficticia porque:
 *   1. No se ha vendido nada — el usuario no entiende ver +200€ de ganancia
 *      cuando solo ha depositado tokens
 *   2. Esta app es de TRAZABILIDAD, no fiscal — el asesor decidirá si aplica
 *      el criterio permuta y cómo
 *   3. La ganancia/pérdida real se materializa cuando se RETIRA del pool
 *      (con su impermanent loss correspondiente)
 *
 * Mantenemos el lote FIFO sin consumir, así el cost basis viaja con los
 * tokens al pool. Cuando se retire (lp_withdraw), ahí sí calculamos resultado.
 */
function handleLpDeposit(
  tx: CategorizeInput,
  _currentLots: TaxLot[],
  rate: number,
  walletKind: WalletKind | null,
  walletName: string,
): CategorizationResult {
  const symbol = (tx.tokenInSymbol ?? "").toUpperCase();
  const amount = Number(tx.tokenInAmount ?? 0);
  const spotUsd = Number(tx.spotPriceUsd ?? 0);

  if (!symbol || amount <= 0 || spotUsd <= 0) {
    return emptyResult(
      "lp_provide",
      "none",
      "LP deposit con datos incompletos.",
      `LP deposit en ${walletName} sin datos suficientes.`,
      walletKind,
    );
  }

  const valueEur = roundEur(usdToEur(amount * spotUsd, rate));

  // ─── CASO ESPECIAL: Destino de un rebalanceo a LP ──────────────────────
  // Si la fila viene marcada con `metadata.source === "rebalance_transfer"`,
  // los tokens entran al pool como parte de un movimiento interno. NO es una
  // aportación nueva de capital; la base ya estaba en la posición de origen y
  // viaja vía `depositedDelta`. No emitimos lp_provide ni evento permuta —
  // categoría `non_taxable_transfer`, sin lote (el LP no genera lotes activos;
  // cuando salga, `handleLpWithdraw` creará el lote con FMV).
  const lpMeta = tx.metadata ?? {};
  if (typeof lpMeta.source === "string" && lpMeta.source === "rebalance_transfer") {
    const description = buildHumanDescription({
      category: "non_taxable_transfer",
      walletKind,
      walletName,
      tokenSymbol: symbol,
      amount,
      valueEur,
    });
    return {
      annotation: {
        category: "non_taxable_transfer",
        incomeType: "none",
        valueEur,
        costBasisEur: 0,
        realizedGainEur: 0,
        notes: `Aportación al LP recibida vía rebalanceo (${amount} ${symbol} en ${walletName}, FMV ${valueEur} €). Movimiento interno; la base viaja con el LP.`,
        taxable: false,
        humanLabel: getCategoryLabel("non_taxable_transfer"),
        humanDescription: description,
        inferred: true,
        walletKind,
      },
      newLots: [],
      taxEvents: [],
      consumedLotUpdates: [],
    };
  }

  const notes = `LP provide: aportaste ${amount} ${symbol} al pool en ${walletName} (FMV ${valueEur} €). No se materializa ganancia/pérdida hasta retirar la liquidez. Si tu asesor aplica criterio DGT de permuta, deberá calcularse aparte.`;

  const description = buildHumanDescription({
    category: "lp_provide",
    walletKind,
    walletName,
    tokenSymbol: symbol,
    amount,
    valueEur,
  });

  return {
    annotation: {
      category: "lp_provide",
      incomeType: "none",
      valueEur,
      costBasisEur: 0,
      realizedGainEur: 0,
      notes,
      taxable: false,
      humanLabel: getCategoryLabel("lp_provide"),
      humanDescription: description,
      inferred: true,
      walletKind,
    },
    newLots: [],
    taxEvents: [],
    consumedLotUpdates: [],
  };
}

function handleLpWithdraw(
  tx: CategorizeInput,
  rate: number,
  walletKind: WalletKind | null,
  walletName: string,
): CategorizationResult {
  // En un lp_withdraw normal los tokens VUELVEN al cliente → van en token_in.
  // Pero en un rebalanceo, esta misma fila representa la SALIDA del LP hacia
  // el destino → la app guarda los tokens en token_out. Si vemos esa señal,
  // leemos de token_out y marcamos como movimiento interno (sin evento fiscal,
  // la base viaja al destino vía `depositedDelta`).
  const withdrawMeta = tx.metadata ?? {};
  const withdrawReason = typeof withdrawMeta.reason === "string" ? withdrawMeta.reason : null;
  const isRebalanceOut =
    withdrawReason === "rebalance_transfer" || withdrawReason === "rebalance_harvest_out";

  if (isRebalanceOut) {
    const outSym = (tx.tokenOutSymbol ?? "").toUpperCase();
    const outAmt = Number(tx.tokenOutAmount ?? 0);
    const sp = Number(tx.spotPriceUsd ?? 0);
    if (!outSym || outAmt <= 0 || sp <= 0) {
      return emptyResult(
        "non_taxable_transfer",
        "none",
        "Salida de rebalanceo con datos incompletos.",
        `Rebalanceo desde ${walletName} sin datos suficientes.`,
        walletKind,
      );
    }
    const valueEur = roundEur(usdToEur(outAmt * sp, rate));
    const description = buildHumanDescription({
      category: "non_taxable_transfer",
      walletKind,
      walletName,
      tokenSymbol: outSym,
      amount: outAmt,
      valueEur,
    });
    const noteSuffix =
      withdrawReason === "rebalance_harvest_out"
        ? "Harvest pendiente materializado en el destino."
        : "La base se traslada al destino del rebalanceo.";
    return {
      annotation: {
        category: "non_taxable_transfer",
        incomeType: "none",
        valueEur,
        costBasisEur: 0,
        realizedGainEur: 0,
        notes: `Salida de LP por rebalanceo: ${outAmt} ${outSym} desde ${walletName} (FMV ${valueEur} €). ${noteSuffix}`,
        taxable: false,
        humanLabel: getCategoryLabel("non_taxable_transfer"),
        humanDescription: description,
        inferred: true,
        walletKind,
      },
      newLots: [],
      taxEvents: [],
      consumedLotUpdates: [],
    };
  }

  const symbol = (tx.tokenInSymbol ?? "").toUpperCase();
  const amount = Number(tx.tokenInAmount ?? 0);
  const spotUsd = Number(tx.spotPriceUsd ?? 0);

  if (!symbol || amount <= 0 || spotUsd <= 0) {
    return emptyResult(
      "lp_remove",
      "none",
      "LP withdraw con datos incompletos.",
      `LP withdraw en ${walletName} sin datos suficientes.`,
      walletKind,
    );
  }

  const valueEur = roundEur(usdToEur(amount * spotUsd, rate));
  const description = buildHumanDescription({
    category: "lp_remove",
    walletKind,
    walletName,
    tokenSymbol: symbol,
    amount,
    valueEur,
  });

  return {
    annotation: {
      category: "lp_remove",
      incomeType: "none",
      valueEur,
      costBasisEur: 0,
      realizedGainEur: 0,
      notes: `LP remove: recibido ${amount} ${symbol} en ${walletName} (FMV ${valueEur} €). Nuevo lote con cost basis = FMV recepción.`,
      taxable: false,
      humanLabel: getCategoryLabel("lp_remove"),
      humanDescription: description,
      inferred: true,
      walletKind,
    },
    newLots: [
      {
        tokenSymbol: symbol,
        amount,
        costBasisEur: valueEur,
        acquiredAt: tx.transactionDate,
        acquiredViaEvent: "lp_remove",
        acquiredViaTransactionId: tx.id ?? null,
      },
    ],
    taxEvents: [],
    consumedLotUpdates: [],
  };
}

/**
 * HARVEST — distinción crítica según positionType:
 *   - Lending → `lending_interest` (Aave, Compound, Kamino lending side)
 *   - Liquidity Pool → `lp_reward` (Orca farms, Raydium, Uniswap farms, PancakeSwap)
 *     → NUNCA "staking_reward": Orca no tiene staking, tiene LP rewards
 *   - Staking → `staking_reward` (validador PoS nativo: ETH, ADA, SOL stake,
 *     Lido / Marinade / Jito harvests)
 *
 * Todos son rendimiento de capital mobiliario fiscalmente, pero la etiqueta
 * que ve el usuario en la UI debe ser correcta semánticamente.
 */
function handleHarvest(
  tx: CategorizeInput,
  positionType: string,
  rate: number,
  walletKind: WalletKind | null,
  walletName: string,
): CategorizationResult {
  const symbol = (tx.tokenInSymbol ?? "").toUpperCase();
  const amount = Number(tx.tokenInAmount ?? 0);
  const spotUsd = Number(tx.spotPriceUsd ?? 0);

  if (!symbol || amount <= 0 || spotUsd <= 0) {
    return emptyResult(
      "lp_reward",
      "none",
      "Harvest con datos incompletos.",
      `Harvest en ${walletName} sin datos suficientes.`,
      walletKind,
    );
  }

  // Decidir el tipo correcto según el positionType
  let category: FiscalCategory;
  let originEvent: "lending_interest" | "lp_reward" | "staking_reward";
  if (positionType.includes("lending")) {
    category = "lending_interest";
    originEvent = "lending_interest";
  } else if (positionType.includes("liquidity") || positionType.includes("pool") || positionType.includes("lp")) {
    category = "lp_reward";
    originEvent = "lp_reward";
  } else {
    category = "staking_reward";
    originEvent = "staking_reward";
  }

  const valueEur = roundEur(usdToEur(amount * spotUsd, rate));

  const label =
    category === "lending_interest"
      ? "Interés lending"
      : category === "lp_reward"
        ? "Recompensa farming / LP"
        : "Recompensa staking nativo";
  const notes = `${label}: ${amount} ${symbol} en ${walletName} (FMV ${valueEur} €). Rendimiento de capital mobiliario.`;
  const description = buildHumanDescription({
    category,
    walletKind,
    walletName,
    tokenSymbol: symbol,
    amount,
    valueEur,
  });

  return {
    annotation: {
      category,
      incomeType: "rendimiento_capital_mobiliario",
      valueEur,
      costBasisEur: 0,
      realizedGainEur: valueEur,
      notes,
      taxable: true,
      humanLabel: getCategoryLabel(category),
      humanDescription: description,
      inferred: true,
      walletKind,
    },
    newLots: [
      {
        tokenSymbol: symbol,
        amount,
        costBasisEur: valueEur,
        acquiredAt: tx.transactionDate,
        acquiredViaEvent: originEvent,
        acquiredViaTransactionId: tx.id ?? null,
      },
    ],
    taxEvents: [
      buildTaxEvent({
        tx,
        eventType: category,
        proceedsEur: valueEur,
        costBasisEur: 0,
        realizedGainEur: valueEur,
        incomeType: "rendimiento_capital_mobiliario",
        tokenSymbol: symbol,
        tokenAmount: amount,
        lotsConsumed: null,
        notes,
      }),
    ],
    consumedLotUpdates: [],
  };
}

// =============================================================================
// SEQUENCE PROCESSING (para backfill)
// =============================================================================

export function categorizeTransactionsSequence(
  txs: CategorizeInput[],
  options: {
    fxRateUsdToEur: number;
    initialLots: TaxLot[];
    walletProtocolResolver?: (protocol: string) => WalletProtocolMeta | null;
  },
): {
  results: Array<CategorizationResult & { txIndex: number }>;
  finalLots: TaxLot[];
} {
  const sorted = [...txs].sort((a, b) => {
    const ta = Date.parse(a.transactionDate);
    const tb = Date.parse(b.transactionDate);
    return ta - tb;
  });

  let lots: TaxLot[] = [...options.initialLots];
  const results: Array<CategorizationResult & { txIndex: number }> = [];

  for (let i = 0; i < sorted.length; i++) {
    const tx = sorted[i];
    const result = categorizeTransaction(tx, {
      fxRateUsdToEur: options.fxRateUsdToEur,
      currentLots: lots,
      walletProtocol: options.walletProtocolResolver
        ? options.walletProtocolResolver(tx.protocol)
        : null,
    });
    results.push({ ...result, txIndex: i });

    // Aplicar lotUpdates
    lots = lots.map((lot) => {
      const update = result.consumedLotUpdates.find((u) => u.lotId === lot.id);
      if (!update) return lot;
      return {
        ...lot,
        amount: update.newAmount,
        costBasisEur: update.newCostBasisEur,
        exhaustedAt: update.exhaustedAt,
      };
    });

    // Añadir newLots
    for (const nl of result.newLots) {
      lots.push({
        id: `synthetic-${i}-${Math.random().toString(36).slice(2, 8)}`,
        portfolioId: tx.portfolioId,
        tokenSymbol: nl.tokenSymbol,
        amount: nl.amount,
        costBasisEur: nl.costBasisEur,
        originalAmount: nl.amount,
        originalCostBasisEur: nl.costBasisEur,
        acquiredAt: nl.acquiredAt,
        acquiredViaTransactionId: nl.acquiredViaTransactionId,
        acquiredViaEvent: nl.acquiredViaEvent,
        exhaustedAt: null,
      });
    }
  }

  return { results, finalLots: lots };
}
