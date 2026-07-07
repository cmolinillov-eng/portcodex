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

  // ─── ADOPCIÓN de posición preexistente (migración) ───────────────────────
  // El gestor incorporó una posición ya abierta indicando su depositado: no
  // es un hecho imponible (el patrimonio ya era suyo), pero SÍ crea el lote
  // FIFO con esa base para que ventas/retiradas futuras tengan coste.
  if ((tx.metadata?.source as string | undefined) === "onchain_adopt") {
    const symbol = (tx.tokenInSymbol ?? "").toUpperCase();
    const amount = Number(tx.tokenInAmount ?? 0);
    const spotUsd = Number(tx.spotPriceUsd ?? 0);
    if (symbol && amount > 0 && spotUsd > 0) {
      const valueEur = roundEur(usdToEur(amount * spotUsd, fxRateUsdToEur));
      return {
        annotation: {
          category: "non_taxable_transfer",
          incomeType: "none",
          valueEur,
          costBasisEur: valueEur,
          realizedGainEur: 0,
          notes: `Adopción de posición existente: ${amount} ${symbol} en ${walletName} con base indicada de ${valueEur} €. Sin hecho imponible (patrimonio preexistente); el coste de adquisición real debe confirmarlo el asesor.`,
          taxable: false,
          humanLabel: getCategoryLabel("non_taxable_transfer"),
          humanDescription: `Incorporaste a la app ${amount} ${symbol} ya existentes en ${walletName} (base ${valueEur} €).`,
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
  }

  switch (txType) {
    case "deposit":
      return handleDeposit(tx, currentLots, fxRateUsdToEur, walletKind, walletName);

    case "withdrawal":
      return handleWithdrawal(tx, currentLots, fxRateUsdToEur, walletKind, walletName);

    case "staking_deposit":
    case "staking_withdrawal":
      return handleStakingMovement(tx, currentLots, fxRateUsdToEur, walletKind, walletName, txType);

    case "lending_supply":
    case "lending_withdraw":
      return handleLendingMovement(tx, currentLots, fxRateUsdToEur, walletKind, walletName, txType);

    case "lending_borrow":
      return handleLendingBorrow(tx, walletKind, walletName);

    case "lp_deposit":
      return handleLpDeposit(tx, currentLots, fxRateUsdToEur, walletKind, walletName);

    case "lp_withdraw":
      return handleLpWithdraw(tx, currentLots, fxRateUsdToEur, walletKind, walletName);

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
  currentLots: TaxLot[],
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

  // Las transferencias detectadas on-chain (metadata.source = onchain_ingest)
  // son SIEMPRE movimientos de wallets propias monitorizadas → nunca es una
  // compra con fiat, aunque el protocolo no esté catalogado ("Bitcoin"…).
  const isOnchainTransfer = (tx.metadata?.source as string | undefined) === "onchain_ingest";
  const category = isOnchainTransfer ? "non_taxable_transfer" : decideDepositCategory(walletKind);
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
    // Permuta implícita en el rebalanceo (metadata.swapLegs): el token que
    // entra difiere del que salió del origen. Consumimos por FIFO los lotes
    // del vendido y creamos el de este token con la base trasladada — la
    // fila de salida del origen NO consume lotes, lo hace este leg.
    const rebalanceSwap = applyReinvestSwapLegs(tx, symbol, currentLots, rate, "el rebalanceo");
    if (rebalanceSwap.newLots.length > 0 || rebalanceSwap.lotUpdates.length > 0) {
      return reinvestSwapResult(rebalanceSwap, {
        symbol,
        amount,
        valueEur,
        baseNote: `Destino de rebalanceo: ${amount} ${symbol} en ${walletName} (FMV ${valueEur} €). Movimiento interno; la base viaja del origen.`,
        walletKind,
        walletName,
      });
    }
    // rebalanceSwapChecked sin legs = el token es el MISMO que salió del
    // origen: su lote original sigue vivo y viaja con él. Crear aquí otro
    // lote (comportamiento legacy con depositedDelta) duplicaría la base.
    if (meta.rebalanceSwapChecked === true) {
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
          notes: `Destino de rebalanceo: ${amount} ${symbol} en ${walletName} (FMV ${valueEur} €). Mismo token que en el origen: su lote FIFO original sigue vivo y viaja con él (no se crea lote nuevo).`,
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
    // Filas legacy (sin anotación de permuta del rebalanceo): comportamiento
    // anterior — lote con la base heredada vía depositedDelta.
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

  // ─── CASO ESPECIAL: reinversión de harvest con permuta implícita ────────
  // Reinversión manual hacia Hold en la que el token que entra difiere del
  // cobrado en el harvest (metadata.swapLegs): se consume el lote del cobrado
  // y se traslada su base al que entra. NO es una compra nueva — sin este
  // corte, la rama "buy" crearía un lote a FMV duplicando la base.
  const depositSwap = applyReinvestSwapLegs(tx, symbol, currentLots, rate);
  if (depositSwap.newLots.length > 0 || depositSwap.lotUpdates.length > 0) {
    return reinvestSwapResult(depositSwap, {
      symbol,
      amount,
      valueEur,
      baseNote: `Reinversión de harvest: entran ${amount} ${symbol} en ${walletName} (FMV ${valueEur} €). Movimiento interno, sin hecho imponible.`,
      walletKind,
      walletName,
    });
  }

  // ─── CASO ESPECIAL: reinversión de harvest SIN permuta (mismo token) ────
  // El lote FIFO de este token ya lo creó el harvest al cobrarlo. Sin este
  // corte, la reinversión hacia un Hold en CEX/protocolo sin catalogar caía
  // en la rama "buy" y creaba un SEGUNDO lote a FMV: base y balance FIFO
  // duplicados (ganancias futuras infravaloradas). Movimiento interno.
  if (rebalanceSource === "harvest_reinvest") {
    const reinvestDescription = buildHumanDescription({
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
        notes: `Reinversión de harvest: entran ${amount} ${symbol} en ${walletName} (FMV ${valueEur} €). El lote FIFO lo creó el harvest al cobrarlo; no se crea otro.`,
        taxable: false,
        humanLabel: getCategoryLabel("non_taxable_transfer"),
        humanDescription: reinvestDescription,
        inferred: true,
        walletKind,
      },
      newLots: [],
      taxEvents: [],
      consumedLotUpdates: [],
    };
  }

  // ─── CASO ESPECIAL: lado RECIBIDO de una permuta on-chain (swap_in) ─────
  // El swap detectado on-chain tributa en el lado entregado (swap_out, en
  // handleWithdrawal); aquí solo nace el lote del token recibido con base =
  // FMV en el momento del swap. No imponible.
  if ((tx.metadata?.source as string | undefined) === "onchain_swap") {
    const soldLabel = typeof tx.metadata?.swapSold === "string" ? tx.metadata.swapSold : "otro token";
    const swapInDescription = buildHumanDescription({
      category: "swap_in",
      walletKind,
      walletName,
      tokenSymbol: symbol,
      amount,
      valueEur,
    });
    return {
      annotation: {
        category: "swap_in",
        incomeType: "none",
        valueEur,
        costBasisEur: 0,
        realizedGainEur: 0,
        notes: `Permuta: recibes ${amount} ${symbol} a cambio de ${soldLabel} (FMV ${valueEur} €). Nace lote FIFO con esa base; la ganancia tributó en el lado entregado.`,
        taxable: false,
        humanLabel: getCategoryLabel("swap_in"),
        humanDescription: swapInDescription,
        inferred: true,
        walletKind,
      },
      newLots: [
        {
          tokenSymbol: symbol,
          amount,
          costBasisEur: valueEur,
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

  // ─── CASO ESPECIAL: salida de rebalanceo desde una posición Hold ────────
  // Movimiento interno: el valor entra en la posición destino en la misma
  // operación. Sin esta rama, un origen Hold en CEX se categorizaba como
  // VENTA tributable (incoherente con handleLpWithdraw/handleDeposit, que sí
  // tratan el rebalanceo como interno). Los lotes NO se consumen aquí: los
  // consume la fila destino vía metadata.swapLegs si el token cambió, o
  // siguen vivos y viajan si es el mismo token.
  const wMeta = tx.metadata ?? {};
  const wReason = typeof wMeta.reason === "string" ? wMeta.reason : null;
  if (wReason === "rebalance_transfer" || wReason === "rebalance_harvest_out") {
    const rebalanceValueEur = roundEur(usdToEur(amount * spotUsd, rate));
    const rebalanceDescription = buildHumanDescription({
      category: "non_taxable_transfer",
      walletKind,
      walletName,
      tokenSymbol: symbol,
      amount,
      valueEur: rebalanceValueEur,
    });
    return {
      annotation: {
        category: "non_taxable_transfer",
        incomeType: "none",
        valueEur: rebalanceValueEur,
        costBasisEur: 0,
        realizedGainEur: 0,
        notes: `Salida por rebalanceo: ${amount} ${symbol} desde ${walletName} (FMV ${rebalanceValueEur} €). La base se traslada al destino del rebalanceo.`,
        taxable: false,
        humanLabel: getCategoryLabel("non_taxable_transfer"),
        humanDescription: rebalanceDescription,
        inferred: true,
        walletKind,
      },
      newLots: [],
      taxEvents: [],
      consumedLotUpdates: [],
    };
  }

  // ─── CASO ESPECIAL: permuta cripto-cripto (swap de wallet, on-chain) ────
  // El lado ENTREGADO de un swap detectado on-chain consume lotes FIFO y
  // TRIBUTA como ganancia/pérdida patrimonial (permuta, art. 37.1.h LIRPF):
  // proceeds = FMV de lo entregado en el momento del swap. El lado recibido
  // crea su lote en handleDeposit (swap_in, no imponible).
  if ((wMeta.source as string | undefined) === "onchain_swap") {
    const permutaValueEur = roundEur(usdToEur(amount * spotUsd, rate));
    const fifo = applyFifo(symbol, amount, currentLots, tx.transactionDate);
    const realizedGainEur = calculateRealizedGain(permutaValueEur, fifo.consumedCostEur);
    const boughtLabel = typeof wMeta.swapBought === "string" ? wMeta.swapBought : "otro token";
    const notes = fifo.insufficientLots
      ? `Permuta: ${amount} ${symbol} → ${boughtLabel} en ${walletName}. ⚠️ Lotes FIFO insuficientes (${fifo.consumedAmount.toFixed(8)} de ${amount}).`
      : `Permuta: ${amount} ${symbol} → ${boughtLabel} en ${walletName} (FMV ${permutaValueEur} €). Cost basis FIFO: ${fifo.consumedCostEur} €. Ganancia: ${realizedGainEur} €.`;
    const permutaDescription = buildHumanDescription({
      category: "swap_out",
      walletKind,
      walletName,
      tokenSymbol: symbol,
      amount,
      valueEur: permutaValueEur,
      costBasisEur: fifo.consumedCostEur,
      realizedGainEur,
    });
    return {
      annotation: {
        category: "swap_out",
        incomeType: realizedGainEur >= 0 ? "ganancia_patrimonial" : "perdida_patrimonial",
        valueEur: permutaValueEur,
        costBasisEur: fifo.consumedCostEur,
        realizedGainEur,
        notes,
        taxable: true,
        humanLabel: getCategoryLabel("swap_out"),
        humanDescription: permutaDescription,
        inferred: true,
        walletKind,
      },
      newLots: [],
      taxEvents: [
        buildTaxEvent({
          tx,
          eventType: "swap_out",
          proceedsEur: permutaValueEur,
          costBasisEur: fifo.consumedCostEur,
          realizedGainEur,
          incomeType: realizedGainEur >= 0 ? "ganancia_patrimonial" : "perdida_patrimonial",
          tokenSymbol: symbol,
          tokenAmount: amount,
          lotsConsumed: fifo.lotsConsumed,
          notes,
        }),
      ],
      consumedLotUpdates: fifo.lotUpdates,
    };
  }

  // Salidas detectadas on-chain: transferencia de wallet propia, nunca venta
  // (aunque el protocolo no esté catalogado). El gestor puede recategorizar.
  const isOnchainTransfer = (tx.metadata?.source as string | undefined) === "onchain_ingest";
  const category = isOnchainTransfer ? "non_taxable_transfer" : decideWithdrawalCategory(walletKind);
  const valueEur = roundEur(usdToEur(amount * spotUsd, rate));

  // ─── CASO A: Venta real (CEX, broker, payment app) ──────────────────────
  if (category === "sell") {
    const fifo = applyFifo(symbol, amount, currentLots, tx.transactionDate);
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
          incomeType: realizedGainEur >= 0 ? "ganancia_patrimonial" : "perdida_patrimonial",
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
  currentLots: TaxLot[],
  rate: number,
  walletKind: WalletKind | null,
  walletName: string,
  txType: string,
): CategorizationResult {
  const symbol = (tx.tokenInSymbol ?? tx.tokenOutSymbol ?? "").toUpperCase();
  const amount = Number(tx.tokenInAmount ?? tx.tokenOutAmount ?? 0);
  const action = txType === "staking_deposit" ? "Bloqueaste" : "Desbloqueaste";
  // Permuta implícita (metadata.swapLegs) al entrar un token distinto del de
  // origen — por reinversión de harvest o por rebalanceo hacia staking:
  // traslada la base del vendido al que entra.
  if (txType === "staking_deposit" && symbol) {
    const isRebalanceIn = (tx.metadata?.source as string | undefined) === "rebalance_transfer";
    const contextLabel = isRebalanceIn ? "el rebalanceo" : "la reinversión";
    const swap = applyReinvestSwapLegs(tx, symbol, currentLots, rate, contextLabel);
    if (swap.newLots.length > 0 || swap.lotUpdates.length > 0) {
      const valueEur = roundEur(usdToEur(amount * Number(tx.spotPriceUsd ?? 0), rate));
      return reinvestSwapResult(swap, {
        symbol,
        amount,
        valueEur,
        baseNote: `${isRebalanceIn ? "Destino de rebalanceo" : "Reinversión de harvest"}: bloqueaste ${amount} ${symbol} en staking (${walletName}, FMV ${valueEur} €). No hay cambio de titularidad.`,
        walletKind,
        walletName,
      });
    }
  }
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
  currentLots: TaxLot[],
  rate: number,
  walletKind: WalletKind | null,
  walletName: string,
  txType: string,
): CategorizationResult {
  const symbol = (tx.tokenInSymbol ?? tx.tokenOutSymbol ?? "").toUpperCase();
  const amount = Number(tx.tokenInAmount ?? tx.tokenOutAmount ?? 0);
  const action = txType === "lending_supply" ? "Depositaste" : "Retiraste";
  // Permuta implícita (metadata.swapLegs) al entrar colateral distinto del
  // token de origen — por reinversión de harvest o por rebalanceo hacia
  // lending: traslada la base del vendido al colateral que entra.
  if (txType === "lending_supply" && symbol) {
    const isRebalanceIn = (tx.metadata?.source as string | undefined) === "rebalance_transfer";
    const contextLabel = isRebalanceIn ? "el rebalanceo" : "la reinversión";
    const swap = applyReinvestSwapLegs(tx, symbol, currentLots, rate, contextLabel);
    if (swap.newLots.length > 0 || swap.lotUpdates.length > 0) {
      const valueEur = roundEur(usdToEur(amount * Number(tx.spotPriceUsd ?? 0), rate));
      return reinvestSwapResult(swap, {
        symbol,
        amount,
        valueEur,
        baseNote: `${isRebalanceIn ? "Destino de rebalanceo" : "Reinversión de harvest"}: depositaste ${amount} ${symbol} como colateral en ${walletName} (FMV ${valueEur} €). No hay transmisión patrimonial en el supply.`,
        walletKind,
        walletName,
      });
    }
  }
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
 * tokens al pool. Cuando se retire (lp_withdraw), los lotes originales se
 * ROTAN: se consumen por FIFO y su base se traslada al lote de salida —
 * la base total del contribuyente no cambia en el ciclo LP (sin duplicación).
 */
function handleLpDeposit(
  tx: CategorizeInput,
  currentLots: TaxLot[],
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
    // Permuta implícita en el rebalanceo (metadata.swapLegs): este token del
    // LP destino no salió del origen — se compró vendiendo lo que sí salió.
    // Consumimos los lotes del vendido y creamos el de este token con base
    // trasladada; la rotación del futuro lp_withdraw lo encontrará. Sin legs
    // (mismo token o fila legacy) se mantiene el comportamiento de siempre:
    // sin lote, la base viaja con los lotes originales.
    const rebalanceSwap = applyReinvestSwapLegs(tx, symbol, currentLots, rate, "el rebalanceo");
    if (rebalanceSwap.newLots.length > 0 || rebalanceSwap.lotUpdates.length > 0) {
      return reinvestSwapResult(rebalanceSwap, {
        symbol,
        amount,
        valueEur,
        baseNote: `Aportación al LP recibida vía rebalanceo (${amount} ${symbol} en ${walletName}, FMV ${valueEur} €). Movimiento interno.`,
        walletKind,
        walletName,
      });
    }
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

  // ─── PERMUTA IMPLÍCITA EN REINVERSIÓN (metadata.swapLegs) ───────────────
  const {
    newLots: swapNewLots,
    lotUpdates: swapLotUpdates,
    notes: swapNotes,
  } = applyReinvestSwapLegs(tx, symbol, currentLots, rate);

  const notes = `LP provide: aportaste ${amount} ${symbol} al pool en ${walletName} (FMV ${valueEur} €). No se materializa ganancia/pérdida hasta retirar la liquidez. Si tu asesor aplica criterio DGT de permuta, deberá calcularse aparte.${swapNotes}`;

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
    newLots: swapNewLots,
    taxEvents: [],
    consumedLotUpdates: swapLotUpdates,
  };
}

/**
 * PERMUTA IMPLÍCITA EN REINVERSIÓN (metadata.swapLegs).
 *
 * En una reinversión de harvest el token que entra a la posición destino
 * puede diferir del cobrado: parte del harvest se permutó dentro de la misma
 * operación. Los legs los anotan el ingestor on-chain
 * (src/app/api/onchain/events/route.ts) y el flujo manual de reinversión
 * (src/app/api/transactions/route.ts). Cada leg consume por FIFO los lotes
 * del token VENDIDO y crea un lote del token COMPRADO (el de esta fila) con
 * la base trasladada. Sin esto el lote del vendido quedaría vivo y los
 * tokens comprados saldrían de la posición sin lote (base a FMV): base
 * duplicada. Coherente con la filosofía del módulo, NO se materializa
 * ganancia aquí (permuta a criterio del asesor; la ventana
 * harvest→redepósito es de minutos, diferencia ≈ 0).
 */
function applyReinvestSwapLegs(
  tx: CategorizeInput,
  boughtSymbol: string,
  currentLots: TaxLot[],
  rate: number,
  contextLabel: string = "la reinversión",
): {
  newLots: CategorizationResult["newLots"];
  lotUpdates: CategorizationResult["consumedLotUpdates"];
  notes: string;
} {
  const newLots: CategorizationResult["newLots"] = [];
  const lotUpdates: CategorizationResult["consumedLotUpdates"] = [];
  const swapLegs = parseSwapLegs((tx.metadata ?? {}).swapLegs);
  let notes = "";
  if (swapLegs.length > 0) {
    let boughtAmount = 0;
    let carriedEur = 0;
    let uncoveredNote = "";
    const soldParts: string[] = [];
    for (const leg of swapLegs) {
      const fifo = applyFifo(leg.soldSymbol, leg.soldAmount, currentLots, tx.transactionDate);
      lotUpdates.push(...fifo.lotUpdates);
      const uncovered = Math.max(0, leg.soldAmount - fifo.consumedAmount);
      const uncoveredEur = roundEur(usdToEur(uncovered * leg.soldPriceUsd, rate));
      carriedEur += fifo.consumedCostEur + uncoveredEur;
      if (uncovered > 1e-9) {
        uncoveredNote = ` ⚠️ Lotes FIFO insuficientes en ${leg.soldSymbol}; la parte sin lote se valora a FMV.`;
      }
      boughtAmount += leg.boughtAmount;
      soldParts.push(`${leg.soldAmount.toFixed(8)} ${leg.soldSymbol}`);
    }
    if (boughtAmount > 1e-9) {
      newLots.push({
        tokenSymbol: boughtSymbol,
        amount: boughtAmount,
        costBasisEur: roundEur(carriedEur),
        acquiredAt: tx.transactionDate,
        acquiredViaEvent: "swap_in",
        acquiredViaTransactionId: tx.id ?? null,
      });
      notes = ` Incluye permuta implícita en ${contextLabel}: ${soldParts.join(" + ")} → ${boughtAmount.toFixed(8)} ${boughtSymbol}; lotes del vendido consumidos por FIFO y base trasladada de ${roundEur(carriedEur)} € al comprado.${uncoveredNote}`;
    }
  }
  return { newLots, lotUpdates, notes };
}

/**
 * Resultado para un depósito/supply de reinversión con permuta implícita:
 * movimiento interno (non_taxable_transfer) cuyo único efecto en lotes es el
 * traslado de base calculado por applyReinvestSwapLegs. NO crea lote a FMV
 * del token que entra (lo crea el propio leg con la base del vendido).
 */
function reinvestSwapResult(
  swap: ReturnType<typeof applyReinvestSwapLegs>,
  args: {
    symbol: string;
    amount: number;
    valueEur: number;
    baseNote: string;
    walletKind: WalletKind | null;
    walletName: string;
  },
): CategorizationResult {
  return {
    annotation: {
      category: "non_taxable_transfer",
      incomeType: "none",
      valueEur: args.valueEur,
      costBasisEur: 0,
      realizedGainEur: 0,
      notes: `${args.baseNote}${swap.notes}`,
      taxable: false,
      humanLabel: getCategoryLabel("non_taxable_transfer"),
      humanDescription: buildHumanDescription({
        category: "non_taxable_transfer",
        walletKind: args.walletKind,
        walletName: args.walletName,
        tokenSymbol: args.symbol,
        amount: args.amount,
        valueEur: args.valueEur,
      }),
      inferred: true,
      walletKind: args.walletKind,
    },
    newLots: swap.newLots,
    taxEvents: [],
    consumedLotUpdates: swap.lotUpdates,
  };
}

/**
 * Legs de la permuta implícita anotada en `metadata.swapLegs` (ingestor
 * on-chain y flujo manual de reinversión). Se agregan
 * por token vendido para no consumir dos veces el mismo lote dentro de la
 * misma fila (applyFifo trabaja sobre una vista inmutable de los lotes).
 */
function parseSwapLegs(raw: unknown): Array<{ soldSymbol: string; soldAmount: number; soldPriceUsd: number; boughtAmount: number }> {
  if (!Array.isArray(raw)) return [];
  const bySold = new Map<string, { soldSymbol: string; soldAmount: number; soldPriceUsd: number; boughtAmount: number }>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const leg = item as Record<string, unknown>;
    const soldSymbol = typeof leg.soldSymbol === "string" ? leg.soldSymbol.trim().toUpperCase() : "";
    const soldAmount = typeof leg.soldAmount === "number" && Number.isFinite(leg.soldAmount) ? leg.soldAmount : 0;
    const soldPriceUsd = typeof leg.soldPriceUsd === "number" && Number.isFinite(leg.soldPriceUsd) ? leg.soldPriceUsd : 0;
    const boughtAmount = typeof leg.boughtAmount === "number" && Number.isFinite(leg.boughtAmount) ? leg.boughtAmount : 0;
    if (!soldSymbol || soldAmount <= 0 || soldPriceUsd <= 0 || boughtAmount <= 0) continue;
    const cur = bySold.get(soldSymbol);
    if (cur) {
      cur.soldAmount += soldAmount;
      cur.boughtAmount += boughtAmount;
    } else {
      bySold.set(soldSymbol, { soldSymbol, soldAmount, soldPriceUsd, boughtAmount });
    }
  }
  return [...bySold.values()];
}

function handleLpWithdraw(
  tx: CategorizeInput,
  currentLots: TaxLot[],
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

  // ROTACIÓN DE LOTES: los tokens que salen del pool son (fiscalmente) los
  // mismos que entraron — consumimos sus lotes por FIFO y trasladamos esa
  // base al lote de salida. Así la base total NO se duplica en el ciclo
  // deposit→withdraw (antes se creaba un lote a FMV dejando vivo el original:
  // base fantasma sistemática). La parte no cubierta por lotes (tokens
  // aparecidos por IL o cuya base entró vía rebalanceo con depositedDelta)
  // se valora a FMV y queda anotada para revisión.
  const fifo = applyFifo(symbol, amount, currentLots, tx.transactionDate);
  const uncoveredAmount = Math.max(0, amount - fifo.consumedAmount);
  const uncoveredEur = roundEur(usdToEur(uncoveredAmount * spotUsd, rate));
  const carriedBasisEur = roundEur(fifo.consumedCostEur + uncoveredEur);

  const notes = uncoveredAmount > 0.00000001
    ? `LP remove: recibido ${amount} ${symbol} en ${walletName} (FMV ${valueEur} €). Base trasladada de lotes FIFO: ${fifo.consumedCostEur} € + ${uncoveredEur} € a FMV por ${uncoveredAmount.toFixed(8)} ${symbol} sin lote previo (IL/rebalanceo) — revisar si procede.`
    : `LP remove: recibido ${amount} ${symbol} en ${walletName} (FMV ${valueEur} €). Lote rotado con base trasladada: ${carriedBasisEur} € (sin duplicación de base).`;

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
      costBasisEur: carriedBasisEur,
      realizedGainEur: 0,
      notes,
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
        costBasisEur: carriedBasisEur,
        acquiredAt: tx.transactionDate,
        acquiredViaEvent: "lp_remove",
        acquiredViaTransactionId: tx.id ?? null,
      },
    ],
    taxEvents: [],
    consumedLotUpdates: fifo.lotUpdates,
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
    /** Tipo de cambio USD→EUR por fecha ("YYYY-MM-DD"). Si una fecha no está,
     *  se usa fxRateUsdToEur (tipo actual) como aproximación. */
    fxRateByDate?: Map<string, number>;
  },
): {
  results: Array<CategorizationResult & { txIndex: number }>;
  finalLots: TaxLot[];
} {
  // Orden DETERMINISTA: por fecha; a igual fecha, los harvests primero (crean
  // el lote que las reinversiones escritas en el mismo instante consumen vía
  // swapLegs) y desempate final por id. Sin esto, el resultado fiscal dependía
  // del orden físico de las filas en la BD (harvest y reinversión comparten
  // timestamp en el flujo manual): si el depósito llegaba antes que el
  // harvest, la base se duplicaba.
  const typeRank = (t: CategorizeInput) =>
    (t.type ?? "").trim().toLowerCase() === "harvest" ? 0 : 1;
  // txIndex debe seguir apuntando a la posición en el array de ENTRADA (los
  // consumidores hacen inputs[res.txIndex]), así que el orden de proceso se
  // resuelve sobre pares {tx, índice original}.
  const indexed = txs.map((tx, originalIndex) => ({ tx, originalIndex }));
  indexed.sort((a, b) => {
    const ta = Date.parse(a.tx.transactionDate);
    const tb = Date.parse(b.tx.transactionDate);
    const va = Number.isFinite(ta) ? ta : Number.MAX_SAFE_INTEGER;
    const vb = Number.isFinite(tb) ? tb : Number.MAX_SAFE_INTEGER;
    if (va !== vb) return va - vb;
    if (typeRank(a.tx) !== typeRank(b.tx)) return typeRank(a.tx) - typeRank(b.tx);
    return (a.tx.id ?? "").localeCompare(b.tx.id ?? "");
  });
  const sorted = indexed.map((e) => e.tx);
  const originalIndexes = indexed.map((e) => e.originalIndex);

  let lots: TaxLot[] = [...options.initialLots];
  const results: Array<CategorizationResult & { txIndex: number }> = [];

  for (let i = 0; i < sorted.length; i++) {
    const tx = sorted[i];
    const dayRate = options.fxRateByDate?.get(tx.transactionDate.slice(0, 10));
    const result = categorizeTransaction(tx, {
      fxRateUsdToEur: dayRate ?? options.fxRateUsdToEur,
      currentLots: lots,
      walletProtocol: options.walletProtocolResolver
        ? options.walletProtocolResolver(tx.protocol)
        : null,
    });
    results.push({ ...result, txIndex: originalIndexes[i] });

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
