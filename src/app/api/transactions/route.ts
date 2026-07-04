import { randomUUID } from "crypto";
import { autoClosePositionIfEmpty } from "@/lib/positions/auto-close";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { computeReinvestSplit, type ReinvestEventToken, type SwapLeg } from "@/lib/onchain/reinvest-split";
import { ensurePortfolioAccess, getViewerAccess } from "@/lib/auth/viewer-access";
import { validateCsrf } from "@/lib/security/csrf";
import { checkRateLimit } from "@/lib/security/rate-limit";

type OperationType =
  | "base_deposit"
  | "harvest"
  | "reinvest_harvest"
  | "staking"
  | "lending_borrow"
  | "liquidity_pool"
  | "rebalance"
  | "lending_adjust";

type TransactionType =
  | "deposit"
  | "withdrawal"
  | "staking_withdrawal"
  | "staking_deposit"
  | "lending_withdraw"
  | "lending_supply"
  | "lending_borrow"
  | "lp_withdraw"
  | "lp_deposit"
  | "harvest";

type TransactionInsert = {
  portfolio_id: string;
  type: TransactionType;
  operation_group_id?: string | null;
  token_in_symbol: string | null;
  token_in_amount: number | null;
  token_out_symbol: string | null;
  token_out_amount: number | null;
  spot_price: number;
  fee_amount: number;
  notes: string | null;
  transaction_date: string;
  protocol: string;
  position_id: string;
  position_type: string;
  metadata: Record<string, unknown> | null;
};

type TokenPriceRow = {
  token_symbol: string | null;
  price: string | number | null;
};

type OperationPayload = {
  operationType: OperationType;
  portfolioId: string;
  positionId?: string;
  protocol?: string;
  positionContextType?: string;
  baseDepositLendingMode?: "collateral" | "debt" | "both";
  tokenSymbol?: string;
  amount?: number;
  harvestSourcePositionId?: string;
  harvestSourceProtocol?: string;
  harvestTargetPositionType?: string;
  harvestTargetTokenSymbol?: string;
  harvestTargetAmount?: number;
  harvestTargetLpTokenSymbolB?: string;
  harvestTargetLpAmountB?: number;
  harvestTargetLendingMode?: "collateral" | "debt" | "both";
  harvestTargetCollateralToken?: string;
  harvestTargetCollateralAmount?: number;
  harvestTargetDebtToken?: string;
  harvestTargetDebtAmount?: number;
  rebalanceSourcePositionId?: string;
  rebalanceSourceProtocol?: string;
  rebalanceSourcePositionType?: string;
  rebalanceSourceTokenSymbol?: string;
  rebalanceSourceAmount?: number;
  rebalanceSourceLpTokenSymbolB?: string;
  rebalanceSourceLpAmountB?: number;
  rebalanceTargetPositionId?: string;
  rebalanceTargetProtocol?: string;
  rebalanceTargetPositionType?: string;
  rebalanceTargetTokenSymbol?: string;
  rebalanceTargetAmount?: number;
  rebalanceTargetLpTokenSymbolB?: string;
  rebalanceTargetLpAmountB?: number;
  rebalanceTargetIsNew?: boolean;
  /**
   * Tokens de harvest pendiente del LP origen que se materializan en el destino
   * al deshacer el LP. Cada token se emite como harvest claim (token_in nulo,
   * token_out con el reward) para que salga del balance pendiente.
   */
  rebalanceSourceHarvestTokens?: Array<{
    tokenSymbol: string;
    amount: number;
    spotPriceUsd?: number;
  }>;
  harvestTargetPositionId?: string;
  harvestTargetProtocol?: string;
  lendingCollateralToken?: string;
  lendingCollateralAmount?: number;
  lendingDebtToken?: string;
  lendingDebtAmount?: number;
  lendingAdjustType?: "add_collateral" | "remove_collateral" | "add_debt" | "repay_debt";
  lendingAdjustToken?: string;
  lendingAdjustAmount?: number;
  harvestNoReinvest?: boolean;
  lpTokenSymbolB?: string;
  lpAmountB?: number;
  lpRangeLower?: number;
  lpRangeUpper?: number;
  isCorrelated?: boolean;
  spotPrice?: number;
  transactionDate?: string;
  spotPricesBySymbol?: Record<string, number | string>;
};

function sanitizeUppercase(value: string | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function sanitizeText(value: string | undefined, fallback = ""): string {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function sanitizePositive(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}

function sanitizeSpotPrice(value: number | undefined): number {
  if (Number.isFinite(value) && Number(value) > 0) return Number(value);
  return 0;
}

function sanitizeSpotPriceMap(value: OperationPayload["spotPricesBySymbol"]): Map<string, number> {
  const map = new Map<string, number>();
  if (!value || typeof value !== "object") return map;

  for (const [rawSymbol, rawPrice] of Object.entries(value)) {
    const symbol = sanitizeUppercase(rawSymbol);
    if (!symbol) continue;
    const parsed = typeof rawPrice === "string" ? Number(rawPrice.replace(",", ".")) : Number(rawPrice);
    if (!Number.isFinite(parsed) || parsed <= 0) continue;
    map.set(symbol, parsed);
  }

  return map;
}

function sanitizeTransactionDate(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return new Date().toISOString();

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Fecha de operación inválida.");
  }

  return parsed.toISOString();
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function mapBaseDepositByPosition(positionType: string): { type: TransactionType; normalizedPositionType: string } {
  const normalized = positionType.trim().toLowerCase();
  if (normalized.includes("lending")) {
    return { type: "lending_supply", normalizedPositionType: "Lending" };
  }
  if (normalized.includes("staking")) {
    return { type: "staking_deposit", normalizedPositionType: "Staking" };
  }
  if (normalized.includes("lp") || normalized.includes("liquidity")) {
    return { type: "lp_deposit", normalizedPositionType: "Liquidity Pool" };
  }
  return { type: "deposit", normalizedPositionType: "Hold" };
}

function mapRebalanceSourceType(positionType: string): TransactionType {
  const normalized = positionType.trim().toLowerCase();
  if (normalized.includes("lending")) return "lending_withdraw";
  if (normalized.includes("staking")) return "staking_withdrawal";
  if (normalized.includes("lp") || normalized.includes("liquidity")) return "lp_withdraw";
  return "withdrawal";
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

async function getLatestLpMetadata(
  client: SupabaseClient,
  portfolioId: string,
  protocol: string,
  positionId: string,
): Promise<Record<string, unknown> | null> {
  const withDeletedFilter = await client
    .from("transactions")
    .select("metadata, notes")
    .eq("portfolio_id", portfolioId)
    .eq("protocol", protocol)
    .eq("position_id", positionId)
    .eq("type", "lp_deposit")
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const fallbackQuery =
    withDeletedFilter.error && withDeletedFilter.error.message.toLowerCase().includes("deleted_at")
      ? await client
          .from("transactions")
          .select("metadata, notes")
          .eq("portfolio_id", portfolioId)
          .eq("protocol", protocol)
          .eq("position_id", positionId)
          .eq("type", "lp_deposit")
          .order("transaction_date", { ascending: false })
          .limit(1)
          .maybeSingle()
      : null;
  const data = fallbackQuery?.data ?? withDeletedFilter.data;
  const error = fallbackQuery?.error ?? withDeletedFilter.error;
  if (error) return null;
  if (!data) return null;
  // SOLO la clave lp (rango/ratio/par): es lo único que se hereda entre
  // depósitos. Devolver el metadata completo arrastraba a filas nuevas las
  // marcas de la fila anterior (source=harvest_reinvest/rebalance_transfer,
  // swapLegs, depositedDelta…), con lo que un depósito base posterior podía
  // quedar marcado como movimiento interno (no sumaba al depositado) o
  // re-consumir por FIFO legs de una permuta ya procesada.
  const full = parseObject(data.metadata) ?? parseObject(data.notes);
  const lp = full && typeof full.lp === "object" && full.lp !== null && !Array.isArray(full.lp)
    ? (full.lp as Record<string, unknown>)
    : null;
  return lp ? { lp } : null;
}

function createRow(input: Omit<TransactionInsert, "fee_amount" | "transaction_date" | "notes"> & { timestamp: string; notes?: string }): TransactionInsert {
  return {
    portfolio_id: input.portfolio_id,
    type: input.type,
    operation_group_id: input.operation_group_id ?? null,
    token_in_symbol: input.token_in_symbol,
    token_in_amount: input.token_in_amount,
    token_out_symbol: input.token_out_symbol,
    token_out_amount: input.token_out_amount,
    spot_price: input.spot_price,
    fee_amount: 0,
    notes: input.notes ?? null,
    transaction_date: input.timestamp,
    protocol: input.protocol,
    position_id: input.position_id,
    position_type: input.position_type,
    metadata: input.metadata,
  };
}

function getInsertClient(): SupabaseClient {
  const serviceClient = getSupabaseServiceClient();
  if (serviceClient) return serviceClient;
  return getSupabaseServerClient();
}

async function getCachedPricesBySymbol(
  client: SupabaseClient,
  symbols: string[],
): Promise<Map<string, number>> {
  const cleanSymbols = Array.from(
    new Set(symbols.map((symbol) => sanitizeUppercase(symbol)).filter((symbol) => symbol.length > 0)),
  );
  if (cleanSymbols.length === 0) return new Map<string, number>();

  const { data, error } = await client
    .from("cached_prices")
    .select("token_symbol, price")
    .in("token_symbol", cleanSymbols);

  if (error) {
    return new Map<string, number>();
  }

  return ((data ?? []) as TokenPriceRow[]).reduce((acc, row) => {
    const symbol = sanitizeUppercase(row.token_symbol ?? "");
    if (!symbol) return acc;
    const price = toNumber(row.price);
    if (price > 0) acc.set(symbol, price);
    return acc;
  }, new Map<string, number>());
}

function validateBaseFields(payload: OperationPayload): { portfolioId: string; protocol: string; positionId: string } {
  const portfolioId = sanitizeText(payload.portfolioId);
  const protocol = sanitizeText(payload.protocol, "Wallet");
  const positionId = sanitizeText(payload.positionId, randomUUID());

  if (!portfolioId) {
    throw new Error("Portfolio ID es obligatorio.");
  }

  return { portfolioId, protocol, positionId };
}

async function buildRows(
  payload: OperationPayload,
  pricesBySymbol: Map<string, number>,
  client: SupabaseClient,
): Promise<TransactionInsert[]> {
  const timestamp = sanitizeTransactionDate(payload.transactionDate);
  const operationGroupId = randomUUID();
  const { portfolioId, protocol, positionId } = validateBaseFields(payload);
  const makeRow = (
    input: Omit<TransactionInsert, "fee_amount" | "transaction_date" | "notes" | "operation_group_id"> & {
      timestamp: string;
      notes?: string;
    },
  ): TransactionInsert => createRow({ ...input, operation_group_id: operationGroupId });
  const sourceType = sanitizeText(payload.positionContextType, "Hold");
  const tokenSymbol = sanitizeUppercase(payload.tokenSymbol);
  const amount = sanitizePositive(payload.amount);
  const fallbackSpotPrice = sanitizeSpotPrice(payload.spotPrice);
  const customSpotPrices = sanitizeSpotPriceMap(payload.spotPricesBySymbol);
  const spotPriceFor = (symbol: string): number => {
    const normalizedSymbol = sanitizeUppercase(symbol);
    const customPrice = customSpotPrices.get(normalizedSymbol);
    if (customPrice && customPrice > 0) return customPrice;

    const price = pricesBySymbol.get(normalizedSymbol);
    if (price && price > 0) return price;
    if (fallbackSpotPrice > 0) return fallbackSpotPrice;
    throw new Error(`No hay precio disponible para ${normalizedSymbol} en cached_prices.`);
  };

  // Permuta implícita en reinversión de harvest: si el token que entra a la
  // posición destino difiere del cobrado, anotamos metadata.swapLegs para que
  // el motor fiscal consuma por FIFO el lote del cobrado y traslade su base
  // al comprado, y dashboard/snapshots muevan el pending de un token al otro
  // (misma semántica que el ingestor on-chain, src/app/api/onchain/events/route.ts).
  // Sin precio del token cobrado no se puede valorar la permuta: no se anota.
  const reinvestSwapLegsFor = (
    boughtSymbol: string,
    boughtAmount: number,
    usdPortion: number,
  ): { swapLegs?: SwapLeg[] } => {
    if (!tokenSymbol || boughtSymbol === tokenSymbol || usdPortion <= 0) return {};
    let soldPriceUsd: number;
    try {
      soldPriceUsd = spotPriceFor(tokenSymbol);
    } catch {
      return {};
    }
    const soldAmount = usdPortion / soldPriceUsd;
    if (!Number.isFinite(soldAmount) || soldAmount <= 0) return {};
    return {
      swapLegs: [
        {
          soldSymbol: tokenSymbol,
          soldAmount,
          soldPriceUsd,
          boughtSymbol,
          boughtAmount,
          boughtPriceUsd: spotPriceFor(boughtSymbol),
        },
      ],
    };
  };

  if (payload.operationType === "base_deposit") {
    const mapping = mapBaseDepositByPosition(sourceType);
    if (mapping.normalizedPositionType === "Liquidity Pool") {
      const tokenA = tokenSymbol;
      const tokenB = sanitizeUppercase(payload.lpTokenSymbolB);
      const amountA = amount;
      const amountB = sanitizePositive(payload.lpAmountB);
      if (!tokenA || !tokenB || amountA <= 0 || amountB <= 0) {
        throw new Error("Depósito LP requiere dos tokens y dos cantidades válidas.");
      }

      const existingMetadata = await getLatestLpMetadata(client, portfolioId, protocol, positionId);
      const metadata = existingMetadata ?? {
        lp: {
          tokenA,
          tokenB,
          rangeLower: sanitizePositive(payload.lpRangeLower),
          rangeUpper: sanitizePositive(payload.lpRangeUpper),
          entryPriceRatio: amountB / amountA,
          isCorrelated: payload.isCorrelated === true,
        },
      };

      return [
        makeRow({
          portfolio_id: portfolioId,
          type: "lp_deposit",
          token_in_symbol: tokenA,
          token_in_amount: amountA,
          token_out_symbol: null,
          token_out_amount: null,
          spot_price: spotPriceFor(tokenA),
          protocol,
          position_id: positionId,
          position_type: "Liquidity Pool",
          metadata,
          notes: JSON.stringify(metadata),
          timestamp,
        }),
        makeRow({
          portfolio_id: portfolioId,
          type: "lp_deposit",
          token_in_symbol: tokenB,
          token_in_amount: amountB,
          token_out_symbol: null,
          token_out_amount: null,
          spot_price: spotPriceFor(tokenB),
          protocol,
          position_id: positionId,
          position_type: "Liquidity Pool",
          metadata,
          notes: JSON.stringify(metadata),
          timestamp,
        }),
      ];
    }

    if (mapping.normalizedPositionType === "Lending") {
      const mode = payload.baseDepositLendingMode ?? "collateral";
      const collateralToken = sanitizeUppercase(payload.lendingCollateralToken ?? payload.tokenSymbol);
      const collateralAmount = sanitizePositive(
        payload.lendingCollateralAmount ?? (mode !== "debt" ? payload.amount : 0),
      );
      const debtToken = sanitizeUppercase(payload.lendingDebtToken);
      const debtAmount = sanitizePositive(payload.lendingDebtAmount);
      const rows: TransactionInsert[] = [];

      if (mode !== "debt") {
        if (!collateralToken || collateralAmount <= 0) {
          throw new Error("Para añadir colateral indica token y cantidad válidos.");
        }
        rows.push(
          makeRow({
            portfolio_id: portfolioId,
            type: "lending_supply",
            token_in_symbol: collateralToken,
            token_in_amount: collateralAmount,
            token_out_symbol: null,
            token_out_amount: null,
            spot_price: spotPriceFor(collateralToken),
            protocol,
            position_id: positionId,
            position_type: "Lending",
            metadata: null,
            timestamp,
          }),
        );
      }

      if (mode !== "collateral") {
        if (!debtToken || debtAmount <= 0) {
          throw new Error("Para pedir deuda indica token y cantidad válidos.");
        }
        rows.push(
          makeRow({
            portfolio_id: portfolioId,
            type: "lending_borrow",
            token_in_symbol: debtToken,
            token_in_amount: debtAmount,
            token_out_symbol: null,
            token_out_amount: null,
            spot_price: spotPriceFor(debtToken),
            protocol,
            position_id: positionId,
            position_type: "Lending",
            metadata: null,
            timestamp,
          }),
        );
      }

      return rows;
    }

    if (!tokenSymbol || amount <= 0) throw new Error("Operación Hold requiere token y cantidad válidos.");
    return [
      makeRow({
        portfolio_id: portfolioId,
        type: mapping.type,
        token_in_symbol: tokenSymbol,
        token_in_amount: amount,
        token_out_symbol: null,
        token_out_amount: null,
        spot_price: spotPriceFor(tokenSymbol),
        protocol,
        position_id: positionId,
        position_type: mapping.normalizedPositionType,
        metadata: null,
        timestamp,
      }),
    ];
  }

  if (payload.operationType === "staking") {
    if (!tokenSymbol || amount <= 0) throw new Error("Staking requiere token y cantidad válidos.");
    return [
      makeRow({
        portfolio_id: portfolioId,
        type: "staking_deposit",
        token_in_symbol: tokenSymbol,
        token_in_amount: amount,
        token_out_symbol: null,
        token_out_amount: null,
        spot_price: spotPriceFor(tokenSymbol),
        protocol,
        position_id: positionId,
        position_type: "Staking",
        metadata: null,
        timestamp,
      }),
    ];
  }

  if (payload.operationType === "liquidity_pool") {
    const tokenA = tokenSymbol;
    const tokenB = sanitizeUppercase(payload.lpTokenSymbolB);
    const amountA = amount;
    const amountB = sanitizePositive(payload.lpAmountB);
    const rangeLowerPayload = sanitizePositive(payload.lpRangeLower);
    const rangeUpperPayload = sanitizePositive(payload.lpRangeUpper);

    if (!tokenA || !tokenB || amountA <= 0 || amountB <= 0) {
      throw new Error("LP requiere token A/B y cantidades válidas.");
    }

    const lpPositionId = sanitizeText(payload.positionId, randomUUID());

    // Si la posición LP ya existe (depósito incremental), heredar rango y entryPriceRatio
    // del primer lp_deposit registrado. Solo se exige rango del payload cuando es nueva.
    const existingLpMeta = await getLatestLpMetadata(client, portfolioId, protocol, lpPositionId);
    const existingLp = (parseObject(existingLpMeta)?.lp ?? null) as
      | { tokenA?: string; tokenB?: string; rangeLower?: number; rangeUpper?: number; entryPriceRatio?: number; isCorrelated?: boolean }
      | null;

    const rangeLower = existingLp?.rangeLower && existingLp.rangeLower > 0 ? Number(existingLp.rangeLower) : rangeLowerPayload;
    const rangeUpper = existingLp?.rangeUpper && existingLp.rangeUpper > 0 ? Number(existingLp.rangeUpper) : rangeUpperPayload;

    if (!existingLp && (rangeLower <= 0 || rangeUpper <= rangeLower)) {
      throw new Error("Rango LP inválido.");
    }

    // VALIDACIÓN: si la posición existe y el par cambia, no permitir que se
    // mezclen tokens distintos en un mismo position_id (bug LP de 3 tokens).
    if (existingLp?.tokenA && existingLp?.tokenB) {
      const existingPair = [existingLp.tokenA.toUpperCase(), existingLp.tokenB.toUpperCase()]
        .sort()
        .join("/");
      const newPair = [tokenA.toUpperCase(), tokenB.toUpperCase()].sort().join("/");
      if (existingPair !== newPair) {
        throw new Error(
          `Esta posición LP ya tiene par ${existingLp.tokenA}/${existingLp.tokenB}. No se puede mezclar con ${tokenA}/${tokenB} en la misma posición. Crea una posición nueva.`,
        );
      }
    }

    const entryPriceRatio = existingLp?.entryPriceRatio && Number(existingLp.entryPriceRatio) > 0
      ? Number(existingLp.entryPriceRatio)
      : amountB / amountA;

    const metadata = {
      lp: {
        tokenA: existingLp?.tokenA ?? tokenA,
        tokenB: existingLp?.tokenB ?? tokenB,
        rangeLower,
        rangeUpper,
        entryPriceRatio,
        ...(existingLp?.isCorrelated !== undefined
          ? { isCorrelated: existingLp.isCorrelated }
          : payload.isCorrelated === true ? { isCorrelated: true } : {}),
      },
    };

    return [
      makeRow({
        portfolio_id: portfolioId,
        type: "lp_deposit",
        token_in_symbol: tokenA,
        token_in_amount: amountA,
        token_out_symbol: null,
        token_out_amount: null,
        spot_price: spotPriceFor(tokenA),
        protocol,
        position_id: lpPositionId,
        position_type: "Liquidity Pool",
        metadata,
        notes: JSON.stringify(metadata),
        timestamp,
      }),
      makeRow({
        portfolio_id: portfolioId,
        type: "lp_deposit",
        token_in_symbol: tokenB,
        token_in_amount: amountB,
        token_out_symbol: null,
        token_out_amount: null,
        spot_price: spotPriceFor(tokenB),
        protocol,
        position_id: lpPositionId,
        position_type: "Liquidity Pool",
        metadata,
        notes: JSON.stringify(metadata),
        timestamp,
      }),
    ];
  }

  if (payload.operationType === "lending_borrow") {
    const collateralToken = sanitizeUppercase(payload.lendingCollateralToken);
    const collateralAmount = sanitizePositive(payload.lendingCollateralAmount);
    const debtToken = sanitizeUppercase(payload.lendingDebtToken);
    const debtAmount = sanitizePositive(payload.lendingDebtAmount);

    const rows: TransactionInsert[] = [];

    if (collateralAmount > 0) {
      if (!collateralToken) throw new Error("Falta token de colateral.");
      rows.push(
        makeRow({
          portfolio_id: portfolioId,
          type: "lending_supply",
          token_in_symbol: collateralToken,
          token_in_amount: collateralAmount,
          token_out_symbol: null,
          token_out_amount: null,
          spot_price: spotPriceFor(collateralToken),
          protocol,
          position_id: positionId,
          position_type: "Lending",
          metadata: null,
          timestamp,
        }),
      );
    }

    if (debtAmount > 0) {
      if (!debtToken) throw new Error("Falta token de deuda.");
      rows.push(
        makeRow({
          portfolio_id: portfolioId,
          type: "lending_borrow",
          token_in_symbol: debtToken,
          token_in_amount: debtAmount,
          token_out_symbol: null,
          token_out_amount: null,
          spot_price: spotPriceFor(debtToken),
          protocol,
          position_id: positionId,
          position_type: "Lending",
          metadata: null,
          timestamp,
        }),
      );
    }

    if (rows.length === 0) {
      throw new Error("Debes indicar al menos colateral o deuda.");
    }

    return rows;
  }

  if (payload.operationType === "harvest") {
    if (!tokenSymbol || amount <= 0) throw new Error("Harvest requiere token y cantidad válidos.");

    const sourcePositionId = sanitizeText(payload.harvestSourcePositionId, positionId);
    const sourceProtocol = sanitizeText(payload.harvestSourceProtocol, protocol);

    const harvestUsdAmount = amount;
    const harvestTokenAmount = harvestUsdAmount / spotPriceFor(tokenSymbol);
    if (!Number.isFinite(harvestTokenAmount) || harvestTokenAmount <= 0) {
      throw new Error("No se pudo convertir el harvest en USD a cantidad de token.");
    }

    const rows: TransactionInsert[] = [
      makeRow({
        portfolio_id: portfolioId,
        type: "harvest",
        token_in_symbol: tokenSymbol,
        token_in_amount: harvestTokenAmount,
        token_out_symbol: null,
        token_out_amount: null,
        spot_price: spotPriceFor(tokenSymbol),
        protocol: sourceProtocol,
        position_id: sourcePositionId,
        position_type: sourceType,
        metadata: null,
        timestamp,
      }),
    ];

    // If harvestNoReinvest, only record the harvest transaction and return early
    if (payload.harvestNoReinvest) {
      return rows;
    }

    const targetPositionId = sanitizeText(payload.harvestTargetPositionId, sourcePositionId);
    const targetProtocol = sanitizeText(payload.harvestTargetProtocol, sourceProtocol);
    const targetPositionType = sanitizeText(payload.harvestTargetPositionType, sourceType);
    const targetMapping = mapBaseDepositByPosition(targetPositionType);

    // Nota: ya NO creamos una withdrawal row con reason=harvest_reinvest.
    // El pending del harvest se descuenta al registrar el deposit de reinversión
    // (ver dashboard/get-dashboard-data.ts, rama capitalInTypes con source=harvest_reinvest).
    const reinvestRows: TransactionInsert[] = [];

    if (targetMapping.normalizedPositionType === "Liquidity Pool") {
      const tokenA = sanitizeUppercase(payload.harvestTargetTokenSymbol ?? tokenSymbol);
      const tokenB = sanitizeUppercase(payload.harvestTargetLpTokenSymbolB);
      if (!tokenA || !tokenB) {
        throw new Error("Reinversión LP requiere dos tokens.");
      }
      const ratioWeightA = sanitizePositive(payload.harvestTargetAmount);
      const ratioWeightB = sanitizePositive(payload.harvestTargetLpAmountB);
      const weightA = ratioWeightA > 0 ? ratioWeightA : 1;
      const weightB = ratioWeightB > 0 ? ratioWeightB : 1;
      const totalWeight = weightA + weightB;
      if (totalWeight <= 0) {
        throw new Error("No se pudo calcular la distribución del harvest para LP.");
      }
      const priceA = spotPriceFor(tokenA);
      const priceB = spotPriceFor(tokenB);
      const usdA = harvestUsdAmount * (weightA / totalWeight);
      const usdB = harvestUsdAmount - usdA;
      const amountA = usdA / priceA;
      const amountB = usdB / priceB;
      if (!Number.isFinite(amountA) || amountA <= 0 || !Number.isFinite(amountB) || amountB <= 0) {
        throw new Error("No se pudo calcular cantidad reinvertida para LP.");
      }

      const existingMetadata = await getLatestLpMetadata(client, portfolioId, targetProtocol, targetPositionId);
      const metadata = existingMetadata ?? {
        lp: {
          tokenA,
          tokenB,
          rangeLower: sanitizePositive(payload.lpRangeLower),
          rangeUpper: sanitizePositive(payload.lpRangeUpper),
          entryPriceRatio: amountB / amountA,
        },
      };

      reinvestRows.push(
        makeRow({
          portfolio_id: portfolioId,
          type: "lp_deposit",
          token_in_symbol: tokenA,
          token_in_amount: amountA,
          token_out_symbol: null,
          token_out_amount: null,
          spot_price: spotPriceFor(tokenA),
          protocol: targetProtocol,
          position_id: targetPositionId,
          position_type: "Liquidity Pool",
          metadata: { ...metadata, source: "harvest_reinvest", sourcePositionId, sourceProtocol, ...reinvestSwapLegsFor(tokenA, amountA, usdA) },
          notes: JSON.stringify(metadata),
          timestamp,
        }),
      );
      reinvestRows.push(
        makeRow({
          portfolio_id: portfolioId,
          type: "lp_deposit",
          token_in_symbol: tokenB,
          token_in_amount: amountB,
          token_out_symbol: null,
          token_out_amount: null,
          spot_price: spotPriceFor(tokenB),
          protocol: targetProtocol,
          position_id: targetPositionId,
          position_type: "Liquidity Pool",
          metadata: { ...metadata, source: "harvest_reinvest", sourcePositionId, sourceProtocol, ...reinvestSwapLegsFor(tokenB, amountB, usdB) },
          notes: JSON.stringify(metadata),
          timestamp,
        }),
      );
    } else if (targetMapping.normalizedPositionType === "Lending") {
      const mode = payload.harvestTargetLendingMode ?? "collateral";
      const collateralToken = sanitizeUppercase(payload.harvestTargetCollateralToken ?? tokenSymbol);
      const debtToken = sanitizeUppercase(payload.harvestTargetDebtToken);
      const collateralWeightRaw = sanitizePositive(payload.harvestTargetCollateralAmount);
      const debtWeightRaw = sanitizePositive(payload.harvestTargetDebtAmount);
      const useCollateral = mode !== "debt";
      const useDebt = mode !== "collateral";
      if (useCollateral && !collateralToken) {
        throw new Error("Reinversión lending requiere token de colateral.");
      }
      if (useDebt && !debtToken) {
        throw new Error("Reinversión lending requiere token de deuda.");
      }
      const collateralWeight = useCollateral ? (collateralWeightRaw > 0 ? collateralWeightRaw : 1) : 0;
      const debtWeight = useDebt ? (debtWeightRaw > 0 ? debtWeightRaw : 1) : 0;
      const totalWeight = collateralWeight + debtWeight;
      if (totalWeight <= 0) {
        throw new Error("No se pudo calcular la distribución del harvest para lending.");
      }
      if (useCollateral) {
        const collateralUsd = harvestUsdAmount * (collateralWeight / totalWeight);
        const collateralAmount = collateralUsd / spotPriceFor(collateralToken);
        if (!Number.isFinite(collateralAmount) || collateralAmount <= 0) {
          throw new Error("No se pudo calcular la cantidad de colateral a reinvertir.");
        }
        reinvestRows.push(
          makeRow({
            portfolio_id: portfolioId,
            type: "lending_supply",
            token_in_symbol: collateralToken,
            token_in_amount: collateralAmount,
            token_out_symbol: null,
            token_out_amount: null,
            spot_price: spotPriceFor(collateralToken),
            protocol: targetProtocol,
            position_id: targetPositionId,
            position_type: "Lending",
            metadata: { source: "harvest_reinvest", sourcePositionId, sourceProtocol, ...reinvestSwapLegsFor(collateralToken, collateralAmount, collateralUsd) },
            timestamp,
          }),
        );
      }
      if (useDebt) {
        const debtUsd = harvestUsdAmount * (debtWeight / totalWeight);
        const debtAmount = debtUsd / spotPriceFor(debtToken);
        if (!Number.isFinite(debtAmount) || debtAmount <= 0) {
          throw new Error("No se pudo calcular la cantidad de deuda a reinvertir.");
        }
        // Sin swapLegs: el token de deuda entra como préstamo (no procede del
        // harvest) y lending_borrow no participa en pending ni en lotes FIFO.
        reinvestRows.push(
          makeRow({
            portfolio_id: portfolioId,
            type: "lending_borrow",
            token_in_symbol: debtToken,
            token_in_amount: debtAmount,
            token_out_symbol: null,
            token_out_amount: null,
            spot_price: spotPriceFor(debtToken),
            protocol: targetProtocol,
            position_id: targetPositionId,
            position_type: "Lending",
            metadata: { source: "harvest_reinvest", sourcePositionId, sourceProtocol },
            timestamp,
          }),
        );
      }
    } else {
      const reinvestToken = sanitizeUppercase(payload.harvestTargetTokenSymbol ?? tokenSymbol);
      if (!reinvestToken) {
        throw new Error("Indica token a reinvertir.");
      }
      const reinvestAmount = harvestUsdAmount / spotPriceFor(reinvestToken);
      if (!Number.isFinite(reinvestAmount) || reinvestAmount <= 0) {
        throw new Error("No se pudo calcular cantidad a reinvertir.");
      }
      reinvestRows.push(
        makeRow({
          portfolio_id: portfolioId,
          type: targetMapping.type,
          token_in_symbol: reinvestToken,
          token_in_amount: reinvestAmount,
          token_out_symbol: null,
          token_out_amount: null,
          spot_price: spotPriceFor(reinvestToken),
          protocol: targetProtocol,
          position_id: targetPositionId,
          position_type: targetMapping.normalizedPositionType,
          metadata: { source: "harvest_reinvest", sourcePositionId, sourceProtocol, ...reinvestSwapLegsFor(reinvestToken, reinvestAmount, harvestUsdAmount) },
          timestamp,
        }),
      );
    }

    rows.push(...reinvestRows);

    return rows;
  }

  if (payload.operationType === "reinvest_harvest") {
    // Reinvierte un harvest previamente registrado en cualquier posición destino.
    // No crea una nueva fila de tipo "harvest" (eso duplicaría el rendimiento).
    // Sólo emite las filas de depósito con metadata.source = "harvest_reinvest".
    if (!tokenSymbol || amount <= 0) {
      throw new Error("Reinvertir harvest requiere token y cantidad válidos.");
    }
    const sourcePositionId = sanitizeText(payload.harvestSourcePositionId, positionId);
    const sourceProtocol = sanitizeText(payload.harvestSourceProtocol, protocol);
    if (!sourcePositionId) {
      throw new Error("Reinvertir harvest requiere posición de origen.");
    }

    const harvestUsdAmount = amount;
    const targetPositionId = sanitizeText(payload.harvestTargetPositionId, positionId);
    const targetProtocol = sanitizeText(payload.harvestTargetProtocol, protocol);
    const targetPositionType = sanitizeText(payload.harvestTargetPositionType, sourceType);
    const targetMapping = mapBaseDepositByPosition(targetPositionType);

    const reinvestRows: TransactionInsert[] = [];

    if (targetMapping.normalizedPositionType === "Liquidity Pool") {
      const tokenA = sanitizeUppercase(payload.harvestTargetTokenSymbol ?? tokenSymbol);
      const tokenB = sanitizeUppercase(payload.harvestTargetLpTokenSymbolB);
      if (!tokenA || !tokenB) {
        throw new Error("Reinversión LP requiere dos tokens.");
      }
      const ratioWeightA = sanitizePositive(payload.harvestTargetAmount);
      const ratioWeightB = sanitizePositive(payload.harvestTargetLpAmountB);
      const weightA = ratioWeightA > 0 ? ratioWeightA : 1;
      const weightB = ratioWeightB > 0 ? ratioWeightB : 1;
      const totalWeight = weightA + weightB;
      if (totalWeight <= 0) {
        throw new Error("No se pudo calcular la distribución del harvest para LP.");
      }
      const priceA = spotPriceFor(tokenA);
      const priceB = spotPriceFor(tokenB);
      const usdA = harvestUsdAmount * (weightA / totalWeight);
      const usdB = harvestUsdAmount - usdA;
      const amountA = usdA / priceA;
      const amountB = usdB / priceB;
      if (!Number.isFinite(amountA) || amountA <= 0 || !Number.isFinite(amountB) || amountB <= 0) {
        throw new Error("No se pudo calcular cantidad reinvertida para LP.");
      }

      const existingMetadata = await getLatestLpMetadata(client, portfolioId, targetProtocol, targetPositionId);
      const metadata = existingMetadata ?? {
        lp: {
          tokenA,
          tokenB,
          rangeLower: sanitizePositive(payload.lpRangeLower),
          rangeUpper: sanitizePositive(payload.lpRangeUpper),
          entryPriceRatio: amountB / amountA,
        },
      };

      reinvestRows.push(
        makeRow({
          portfolio_id: portfolioId,
          type: "lp_deposit",
          token_in_symbol: tokenA,
          token_in_amount: amountA,
          token_out_symbol: null,
          token_out_amount: null,
          spot_price: spotPriceFor(tokenA),
          protocol: targetProtocol,
          position_id: targetPositionId,
          position_type: "Liquidity Pool",
          metadata: { ...metadata, source: "harvest_reinvest", sourcePositionId, sourceProtocol, ...reinvestSwapLegsFor(tokenA, amountA, usdA) },
          notes: JSON.stringify(metadata),
          timestamp,
        }),
        makeRow({
          portfolio_id: portfolioId,
          type: "lp_deposit",
          token_in_symbol: tokenB,
          token_in_amount: amountB,
          token_out_symbol: null,
          token_out_amount: null,
          spot_price: spotPriceFor(tokenB),
          protocol: targetProtocol,
          position_id: targetPositionId,
          position_type: "Liquidity Pool",
          metadata: { ...metadata, source: "harvest_reinvest", sourcePositionId, sourceProtocol, ...reinvestSwapLegsFor(tokenB, amountB, usdB) },
          notes: JSON.stringify(metadata),
          timestamp,
        }),
      );
    } else if (targetMapping.normalizedPositionType === "Lending") {
      const mode = payload.harvestTargetLendingMode ?? "collateral";
      const collateralToken = sanitizeUppercase(payload.harvestTargetCollateralToken ?? tokenSymbol);
      const debtToken = sanitizeUppercase(payload.harvestTargetDebtToken);
      const collateralWeightRaw = sanitizePositive(payload.harvestTargetCollateralAmount);
      const debtWeightRaw = sanitizePositive(payload.harvestTargetDebtAmount);
      const useCollateral = mode !== "debt";
      const useDebt = mode !== "collateral";
      if (useCollateral && !collateralToken) {
        throw new Error("Reinversión lending requiere token de colateral.");
      }
      if (useDebt && !debtToken) {
        throw new Error("Reinversión lending requiere token de deuda.");
      }
      const collateralWeight = useCollateral ? (collateralWeightRaw > 0 ? collateralWeightRaw : 1) : 0;
      const debtWeight = useDebt ? (debtWeightRaw > 0 ? debtWeightRaw : 1) : 0;
      const totalWeight = collateralWeight + debtWeight;
      if (totalWeight <= 0) {
        throw new Error("No se pudo calcular la distribución del harvest para lending.");
      }
      if (useCollateral) {
        const collateralUsd = harvestUsdAmount * (collateralWeight / totalWeight);
        const collateralAmount = collateralUsd / spotPriceFor(collateralToken);
        if (!Number.isFinite(collateralAmount) || collateralAmount <= 0) {
          throw new Error("No se pudo calcular la cantidad de colateral a reinvertir.");
        }
        reinvestRows.push(
          makeRow({
            portfolio_id: portfolioId,
            type: "lending_supply",
            token_in_symbol: collateralToken,
            token_in_amount: collateralAmount,
            token_out_symbol: null,
            token_out_amount: null,
            spot_price: spotPriceFor(collateralToken),
            protocol: targetProtocol,
            position_id: targetPositionId,
            position_type: "Lending",
            metadata: { source: "harvest_reinvest", sourcePositionId, sourceProtocol, ...reinvestSwapLegsFor(collateralToken, collateralAmount, collateralUsd) },
            timestamp,
          }),
        );
      }
      if (useDebt) {
        const debtUsd = harvestUsdAmount * (debtWeight / totalWeight);
        const debtAmount = debtUsd / spotPriceFor(debtToken);
        if (!Number.isFinite(debtAmount) || debtAmount <= 0) {
          throw new Error("No se pudo calcular la cantidad de deuda a reinvertir.");
        }
        // Sin swapLegs: el token de deuda entra como préstamo (no procede del
        // harvest) y lending_borrow no participa en pending ni en lotes FIFO.
        reinvestRows.push(
          makeRow({
            portfolio_id: portfolioId,
            type: "lending_borrow",
            token_in_symbol: debtToken,
            token_in_amount: debtAmount,
            token_out_symbol: null,
            token_out_amount: null,
            spot_price: spotPriceFor(debtToken),
            protocol: targetProtocol,
            position_id: targetPositionId,
            position_type: "Lending",
            metadata: { source: "harvest_reinvest", sourcePositionId, sourceProtocol },
            timestamp,
          }),
        );
      }
    } else {
      const reinvestToken = sanitizeUppercase(payload.harvestTargetTokenSymbol ?? tokenSymbol);
      if (!reinvestToken) {
        throw new Error("Indica token a reinvertir.");
      }
      const reinvestAmount = harvestUsdAmount / spotPriceFor(reinvestToken);
      if (!Number.isFinite(reinvestAmount) || reinvestAmount <= 0) {
        throw new Error("No se pudo calcular cantidad a reinvertir.");
      }
      reinvestRows.push(
        makeRow({
          portfolio_id: portfolioId,
          type: targetMapping.type,
          token_in_symbol: reinvestToken,
          token_in_amount: reinvestAmount,
          token_out_symbol: null,
          token_out_amount: null,
          spot_price: spotPriceFor(reinvestToken),
          protocol: targetProtocol,
          position_id: targetPositionId,
          position_type: targetMapping.normalizedPositionType,
          metadata: { source: "harvest_reinvest", sourcePositionId, sourceProtocol, ...reinvestSwapLegsFor(reinvestToken, reinvestAmount, harvestUsdAmount) },
          timestamp,
        }),
      );
    }

    return reinvestRows;
  }

  if (payload.operationType === "rebalance") {
    const sourcePositionId = sanitizeText(payload.rebalanceSourcePositionId);
    const sourceProtocol = sanitizeText(payload.rebalanceSourceProtocol);
    const sourcePositionType = sanitizeText(payload.rebalanceSourcePositionType, "Hold");
    const sourceToken = sanitizeUppercase(payload.rebalanceSourceTokenSymbol);
    const sourceAmount = sanitizePositive(payload.rebalanceSourceAmount);
    const sourceTokenB = sanitizeUppercase(payload.rebalanceSourceLpTokenSymbolB);
    const sourceAmountB = sanitizePositive(payload.rebalanceSourceLpAmountB);

    const targetIsNew = Boolean(payload.rebalanceTargetIsNew);
    const targetPositionId = targetIsNew
      ? randomUUID()
      : sanitizeText(payload.rebalanceTargetPositionId);
    const targetProtocol = sanitizeText(payload.rebalanceTargetProtocol);
    const targetPositionTypeRaw = sanitizeText(payload.rebalanceTargetPositionType, "Hold");
    const targetToken = sanitizeUppercase(payload.rebalanceTargetTokenSymbol);
    const targetAmountManual = sanitizePositive(payload.rebalanceTargetAmount);
    const targetTokenB = sanitizeUppercase(payload.rebalanceTargetLpTokenSymbolB);
    const targetAmountB = sanitizePositive(payload.rebalanceTargetLpAmountB);

    const sourceMapping = mapBaseDepositByPosition(sourcePositionType);
    const targetMapping = mapBaseDepositByPosition(targetPositionTypeRaw);
    const sourceOutType = mapRebalanceSourceType(sourcePositionType);

    if (!sourcePositionId || !sourceProtocol) {
      throw new Error("Rebalanceo requiere origen válido (posición y protocolo).");
    }
    if (!targetProtocol) {
      throw new Error("Rebalanceo requiere destino válido (protocolo).");
    }
    if (!targetIsNew && !targetPositionId) {
      throw new Error("Rebalanceo requiere posición destino o crear una nueva.");
    }

    // Calcular rebalanceUsd primero (sin emitir filas todavía) — lo necesitamos
    // para derivar el "depositado heredado" antes de inyectarlo en las metadatas.
    let rebalanceUsd = 0;
    if (sourceMapping.normalizedPositionType === "Liquidity Pool") {
      if (!sourceToken || !sourceTokenB || sourceAmount <= 0 || sourceAmountB <= 0) {
        throw new Error("Si el origen es LP debes indicar dos tokens y dos cantidades.");
      }
      const sourcePriceA = spotPriceFor(sourceToken);
      const sourcePriceB = spotPriceFor(sourceTokenB);
      rebalanceUsd = sourceAmount * sourcePriceA + sourceAmountB * sourcePriceB;
    } else {
      if (!sourceToken || sourceAmount <= 0) {
        throw new Error("Rebalanceo requiere token y cantidad de origen.");
      }
      rebalanceUsd = sourceAmount * spotPriceFor(sourceToken);
    }

    // Si vienen harvest tokens del LP origen, sumamos su valor al rebalanceUsd
    // y los convertiremos en el destino para no perder el harvest al deshacer.
    // El total del portfolio queda invariante porque ese valor ya estaba contado.
    const sourceHarvestTokens = (payload.rebalanceSourceHarvestTokens ?? []).filter(
      (h) => h && typeof h.tokenSymbol === "string" && Number.isFinite(h.amount) && h.amount > 0,
    );
    let sourceHarvestUsd = 0;
    if (sourceHarvestTokens.length > 0) {
      if (sourceMapping.normalizedPositionType !== "Liquidity Pool") {
        throw new Error("Solo se puede incluir harvest pendiente cuando el origen es un LP.");
      }
      for (const h of sourceHarvestTokens) {
        const sym = sanitizeUppercase(h.tokenSymbol);
        if (!sym) continue;
        const price = h.spotPriceUsd && h.spotPriceUsd > 0 ? h.spotPriceUsd : spotPriceFor(sym);
        sourceHarvestUsd += Math.max(0, h.amount) * price;
      }
      rebalanceUsd += sourceHarvestUsd;
    }

    if (rebalanceUsd <= 0) {
      throw new Error("No se pudo calcular el valor USD del rebalanceo.");
    }

    // Cost basis y balances ACTUALES del origen, computados EXACTAMENTE como el
    // dashboard (get-dashboard-data.ts) para que la cuenta cuadre al rebalancear:
    //   • Total Depositado = depósitos − retiradas (cost basis), EXCLUYENDO los
    //     movimientos internos (rebalance/harvest_reinvest) pero SUMANDO el
    //     `depositedDelta` heredado de rebalanceos previos.
    //   • Balances por token = depósitos − retiradas de TODAS las filas (incl.
    //     internas): un token que ya salió por un rebalanceo anterior no cuenta.
    const sourceCostBasis = await (async () => {
      try {
        const { data: srcTxs } = await client
          .from("transactions")
          .select("type, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount, spot_price, metadata, notes")
          .eq("portfolio_id", portfolioId)
          .eq("protocol", sourceProtocol)
          .eq("position_id", sourcePositionId)
          .is("deleted_at", null);

        const inSet = new Set(["deposit", "staking_deposit", "lp_deposit", "lending_supply"]);
        const outSet = new Set(["withdrawal", "staking_withdrawal", "lp_withdraw", "lending_withdraw"]);
        let totalDeposited = 0;
        let totalValue = 0;
        const balances: Record<string, number> = {};
        for (const tx of srcTxs ?? []) {
          const t = ((tx.type ?? "") as string).trim();
          if (t === "position_closed") continue;
          const inAmt = toNumber(tx.token_in_amount);
          const outAmt = toNumber(tx.token_out_amount);
          const inSym = ((tx.token_in_symbol ?? "") as string).toUpperCase();
          const outSym = ((tx.token_out_symbol ?? "") as string).toUpperCase();
          const sp = toNumber(tx.spot_price);
          const meta = parseObject(tx.metadata) ?? parseObject(tx.notes);
          const reasonFlag = typeof meta?.reason === "string" ? (meta.reason as string) : null;
          const sourceFlag = typeof meta?.source === "string" ? (meta.source as string) : null;
          const isRebalanceRow = reasonFlag === "rebalance_transfer" || sourceFlag === "rebalance_transfer";
          const isInternal =
            isRebalanceRow || reasonFlag === "harvest_reinvest" || sourceFlag === "harvest_reinvest";
          const depositedDelta = typeof meta?.depositedDelta === "number" ? (meta.depositedDelta as number) : null;
          if (inSet.has(t)) {
            if (inSym) balances[inSym] = (balances[inSym] ?? 0) + inAmt;
            if (!isInternal) totalDeposited += inAmt * sp;
            if (isRebalanceRow && depositedDelta !== null) totalDeposited += depositedDelta;
          } else if (outSet.has(t)) {
            if (outSym) balances[outSym] = (balances[outSym] ?? 0) - outAmt;
            if (!isInternal) totalDeposited -= outAmt * sp;
            if (isRebalanceRow && depositedDelta !== null) totalDeposited += depositedDelta;
          }
        }
        for (const sym of Object.keys(balances)) {
          const bal = Math.max(0, balances[sym] ?? 0);
          totalValue += bal * spotPriceFor(sym);
        }
        return { totalDeposited: Math.max(0, totalDeposited), totalValue, balances };
      } catch {
        return { totalDeposited: 0, totalValue: 0, balances: {} as Record<string, number> };
      }
    })();

    // Fracción del origen que se mueve, MEDIDA POR CANTIDAD DE TOKEN (no por valor).
    // Es la forma robusta y consistente con cómo el dashboard reduce el cost basis
    // en una retirada normal (pro-rata sobre el balance del token). Para un LP usamos
    // la media de las fracciones de ambos tokens (retirada proporcional). Así, sacar
    // 300 de un LP de 1.800 transfiere ~1/6 del depositado, no el 100%.
    const tokenFraction = (() => {
      const fr: number[] = [];
      const balA = sourceCostBasis.balances[sourceToken] ?? 0;
      if (balA > 0) fr.push(sourceAmount / balA);
      if (sourceMapping.normalizedPositionType === "Liquidity Pool") {
        const balB = sourceCostBasis.balances[sourceTokenB] ?? 0;
        if (balB > 0) fr.push(sourceAmountB / balB);
      }
      if (fr.length === 0) {
        // Sin balances fiables → caer al método por valor; si tampoco, asumir todo.
        return sourceCostBasis.totalValue > 0 ? rebalanceUsd / sourceCostBasis.totalValue : 1;
      }
      return fr.reduce((a, b) => a + b, 0) / fr.length;
    })();

    const transferFraction = Math.min(1, Math.max(0, tokenFraction));
    const proratedDeposited = sourceCostBasis.totalDeposited * transferFraction;

    // ¿El rebalanceo vacía POR COMPLETO la posición de origen? Solo en ese caso
    // emitimos el snapshot `position_closed`. En un rebalanceo PARCIAL la posición
    // de origen DEBE permanecer abierta con su balance y su depositado restantes.
    const isFullClose =
      transferFraction >= 1 - 1e-4 ||
      (() => {
        let remaining = 0;
        for (const sym of Object.keys(sourceCostBasis.balances)) {
          let bal = Math.max(0, sourceCostBasis.balances[sym] ?? 0);
          if (sym === sourceToken) bal -= sourceAmount;
          if (sourceTokenB && sym === sourceTokenB) bal -= sourceAmountB;
          remaining += Math.max(0, bal);
        }
        return remaining <= 1e-6;
      })();

    // Número de filas que vamos a emitir por lado, para dividir el depositedDelta
    // de forma equitativa y evitar doble conteo cuando son LPs (2 rows).
    const sourceRowCount = sourceMapping.normalizedPositionType === "Liquidity Pool" ? 2 : 1;
    const targetRowCount = targetMapping.normalizedPositionType === "Liquidity Pool" ? 2 : 1;
    const sourceDepositedDeltaPerRow = -proratedDeposited / sourceRowCount;
    const targetDepositedDeltaPerRow = proratedDeposited / targetRowCount;

    const sourceRows: TransactionInsert[] = [];
    if (sourceMapping.normalizedPositionType === "Liquidity Pool") {
      const sourcePriceA = spotPriceFor(sourceToken);
      const sourcePriceB = spotPriceFor(sourceTokenB);
      // El trigger validate_transaction_integrity exige metadata.lp completa para
      // lp_withdraw. Heredar del primer lp_deposit del origen para no perder
      // información de rango / ratio de entrada.
      const sourceLpMeta = await getLatestLpMetadata(client, portfolioId, sourceProtocol, sourcePositionId);
      const sourceLp = (parseObject(sourceLpMeta)?.lp ?? null) as
        | { tokenA?: string; tokenB?: string; rangeLower?: number; rangeUpper?: number; entryPriceRatio?: number; isCorrelated?: boolean }
        | null;
      const sourceEntryRatio = Number(sourceLp?.entryPriceRatio);
      const fallbackEntryRatio = sourceAmount > 0 ? sourceAmountB / sourceAmount : 1;
      const sourceLpMetadata = {
        lp: {
          tokenA: sourceLp?.tokenA ?? sourceToken,
          tokenB: sourceLp?.tokenB ?? sourceTokenB,
          rangeLower: Number(sourceLp?.rangeLower) > 0 ? Number(sourceLp?.rangeLower) : 0.0001,
          rangeUpper: Number(sourceLp?.rangeUpper) > Number(sourceLp?.rangeLower ?? 0) ? Number(sourceLp?.rangeUpper) : Math.max(Number(sourceLp?.rangeLower ?? 0) * 1.2, 0.001),
          entryPriceRatio: Number.isFinite(sourceEntryRatio) && sourceEntryRatio > 0 ? sourceEntryRatio : fallbackEntryRatio,
          ...(sourceLp?.isCorrelated !== undefined ? { isCorrelated: sourceLp.isCorrelated } : {}),
        },
      };
      sourceRows.push(
        makeRow({
          portfolio_id: portfolioId,
          type: sourceOutType,
          token_in_symbol: null,
          token_in_amount: null,
          token_out_symbol: sourceToken,
          token_out_amount: sourceAmount,
          spot_price: sourcePriceA,
          protocol: sourceProtocol,
          position_id: sourcePositionId,
          position_type: sourcePositionType,
          metadata: { ...sourceLpMetadata, reason: "rebalance_transfer", depositedDelta: sourceDepositedDeltaPerRow },
          timestamp,
        }),
      );
      sourceRows.push(
        makeRow({
          portfolio_id: portfolioId,
          type: sourceOutType,
          token_in_symbol: null,
          token_in_amount: null,
          token_out_symbol: sourceTokenB,
          token_out_amount: sourceAmountB,
          spot_price: sourcePriceB,
          protocol: sourceProtocol,
          position_id: sourcePositionId,
          position_type: sourcePositionType,
          metadata: { ...sourceLpMetadata, reason: "rebalance_transfer", depositedDelta: sourceDepositedDeltaPerRow },
          timestamp,
        }),
      );

      // Salida del harvest pendiente del LP origen, si se incluye en el rebalance.
      // Cada fila consume el balance pendiente del token de harvest. La metadata
      // marca reason="rebalance_harvest_out" para que el dashboard reconozca
      // que NO debe restar al Total Depositado (ya estaba contabilizado al
      // recibir el harvest original como rendimiento).
      for (const h of sourceHarvestTokens) {
        const sym = sanitizeUppercase(h.tokenSymbol);
        if (!sym) continue;
        const harvestAmount = Math.max(0, h.amount);
        if (harvestAmount <= 0) continue;
        const harvestPrice = h.spotPriceUsd && h.spotPriceUsd > 0 ? h.spotPriceUsd : spotPriceFor(sym);
        sourceRows.push(
          makeRow({
            portfolio_id: portfolioId,
            type: sourceOutType,
            token_in_symbol: null,
            token_in_amount: null,
            token_out_symbol: sym,
            token_out_amount: harvestAmount,
            spot_price: harvestPrice,
            protocol: sourceProtocol,
            position_id: sourcePositionId,
            position_type: sourcePositionType,
            metadata: {
              ...sourceLpMetadata,
              reason: "rebalance_harvest_out",
              depositedDelta: 0, // el harvest no aporta cost basis al destino
              note: "Harvest pendiente convertido en el destino del rebalance",
            },
            timestamp,
          }),
        );
      }
    } else {
      const sourcePrice = spotPriceFor(sourceToken);
      sourceRows.push(
        makeRow({
          portfolio_id: portfolioId,
          type: sourceOutType,
          token_in_symbol: null,
          token_in_amount: null,
          token_out_symbol: sourceToken,
          token_out_amount: sourceAmount,
          spot_price: sourcePrice,
          protocol: sourceProtocol,
          position_id: sourcePositionId,
          position_type: sourcePositionType,
          metadata: { reason: "rebalance_transfer", depositedDelta: sourceDepositedDeltaPerRow },
          timestamp,
        }),
      );
    }

    const targetRows: TransactionInsert[] = [];
    if (targetMapping.normalizedPositionType === "Liquidity Pool") {
      if (!targetToken || !targetTokenB || targetAmountManual <= 0 || targetAmountB <= 0) {
        throw new Error("Si el destino es LP debes indicar dos tokens y dos cantidades.");
      }
      const targetPriceA = spotPriceFor(targetToken);
      const targetPriceB = spotPriceFor(targetTokenB);
      const targetUsd = targetAmountManual * targetPriceA + targetAmountB * targetPriceB;
      const usdDelta = Math.abs(targetUsd - rebalanceUsd);
      const maxAllowedDelta = Math.max(0.01, rebalanceUsd * 0.01); // tolerancia del 1%
      if (usdDelta > maxAllowedDelta) {
        throw new Error("El valor USD que entra al LP no cuadra con el valor que sale del origen.");
      }
      const entryPriceRatio = targetAmountB / targetAmountManual;
      const latestMetadata = await getLatestLpMetadata(client, portfolioId, targetProtocol, targetPositionId);
      const latestLp = (parseObject(latestMetadata)?.lp ?? null) as
        | { tokenA?: string; tokenB?: string; rangeLower?: number; rangeUpper?: number; entryPriceRatio?: number }
        | null;
      const payloadRangeLower = sanitizePositive(payload.lpRangeLower);
      const payloadRangeUpper = sanitizePositive(payload.lpRangeUpper);
      const marketRatio = targetPriceA > 0 && targetPriceB > 0 ? targetPriceA / targetPriceB : 0;

      const candidateRangeLower = Number(latestLp?.rangeLower ?? payloadRangeLower);
      const candidateRangeUpper = Number(latestLp?.rangeUpper ?? payloadRangeUpper);
      const derivedRangeLower = marketRatio > 0 ? marketRatio * 0.5 : 0;
      const derivedRangeUpper = marketRatio > 0 ? marketRatio * 1.5 : 0;

      const resolvedRangeLower =
        Number.isFinite(candidateRangeLower) && candidateRangeLower > 0
          ? candidateRangeLower
          : derivedRangeLower;
      const resolvedRangeUpper =
        Number.isFinite(candidateRangeUpper) && candidateRangeUpper > resolvedRangeLower
          ? candidateRangeUpper
          : derivedRangeUpper > resolvedRangeLower
            ? derivedRangeUpper
            : resolvedRangeLower * 1.2;

      if (!Number.isFinite(resolvedRangeLower) || !Number.isFinite(resolvedRangeUpper) || resolvedRangeLower <= 0 || resolvedRangeUpper <= resolvedRangeLower) {
        throw new Error("Rango LP inválido: no se pudo inferir un rango válido para el destino.");
      }

      // VALIDACIÓN CRÍTICA: si el target ya existe y los tokens del LP cambian,
      // estaríamos creando un LP con 3+ tokens distintos (bug reportado en
      // producción). En ese caso, exigimos crear una posición nueva.
      if (latestLp?.tokenA && latestLp?.tokenB) {
        const existingPair = new Set([
          (latestLp.tokenA ?? "").toUpperCase(),
          (latestLp.tokenB ?? "").toUpperCase(),
        ]);
        const newPair = new Set([targetToken.toUpperCase(), targetTokenB.toUpperCase()]);
        const pairsMatch =
          existingPair.size === newPair.size &&
          Array.from(existingPair).every((t) => newPair.has(t));
        if (!pairsMatch && !targetIsNew) {
          throw new Error(
            `El LP destino existente tiene tokens ${latestLp.tokenA}/${latestLp.tokenB} pero estás aportando ${targetToken}/${targetTokenB}. Para cambiar el par, marca "Crear nueva posición" — no se puede mezclar pares distintos en un mismo LP.`,
          );
        }
      }

      // La metadata.lp.tokenA/tokenB DEBE coincidir con los tokens que estamos
      // insertando en token_in_symbol. Si latestLp tiene un par distinto al
      // que estamos depositando, NO heredamos (sería inconsistente).
      const inheritedTokensCoincide =
        latestLp?.tokenA && latestLp?.tokenB
          ? [latestLp.tokenA.toUpperCase(), latestLp.tokenB.toUpperCase()].sort().join("/") ===
            [targetToken.toUpperCase(), targetTokenB.toUpperCase()].sort().join("/")
          : false;
      const targetMeta = {
        lp: {
          tokenA: inheritedTokensCoincide ? (latestLp?.tokenA ?? targetToken) : targetToken,
          tokenB: inheritedTokensCoincide ? (latestLp?.tokenB ?? targetTokenB) : targetTokenB,
          rangeLower: resolvedRangeLower,
          rangeUpper: resolvedRangeUpper,
          entryPriceRatio: inheritedTokensCoincide &&
            Number.isFinite(latestLp?.entryPriceRatio ?? 0) &&
            Number(latestLp?.entryPriceRatio) > 0
            ? Number(latestLp?.entryPriceRatio)
            : entryPriceRatio,
        },
      };
      targetRows.push(
        makeRow({
          portfolio_id: portfolioId,
          type: "lp_deposit",
          token_in_symbol: targetToken,
          token_in_amount: targetAmountManual,
          token_out_symbol: null,
          token_out_amount: null,
          spot_price: targetPriceA,
          protocol: targetProtocol,
          position_id: targetPositionId,
          position_type: "Liquidity Pool",
          metadata: { ...targetMeta, source: "rebalance_transfer", usdValue: rebalanceUsd, depositedDelta: targetDepositedDeltaPerRow },
          notes: JSON.stringify(targetMeta),
          timestamp,
        }),
      );
      targetRows.push(
        makeRow({
          portfolio_id: portfolioId,
          type: "lp_deposit",
          token_in_symbol: targetTokenB,
          token_in_amount: targetAmountB,
          token_out_symbol: null,
          token_out_amount: null,
          spot_price: targetPriceB,
          protocol: targetProtocol,
          position_id: targetPositionId,
          position_type: "Liquidity Pool",
          metadata: { ...targetMeta, source: "rebalance_transfer", usdValue: rebalanceUsd, depositedDelta: targetDepositedDeltaPerRow },
          notes: JSON.stringify(targetMeta),
          timestamp,
        }),
      );
    } else {
      if (!targetToken) {
        throw new Error("Selecciona token destino para el rebalanceo.");
      }
      const targetPrice = spotPriceFor(targetToken);
      const targetAmount = targetAmountManual > 0 ? targetAmountManual : (rebalanceUsd / targetPrice);
      if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
        throw new Error("No se pudo calcular la cantidad destino del rebalanceo.");
      }
      // CONSERVACIÓN DE VALOR: lo que entra al destino debe igualar lo que sale del
      // origen. Sin esto, indicar un origen (p.ej. el LP entero) y un destino menor
      // (p.ej. solo 300 $ en BTC) destruía silenciosamente la diferencia y disparaba
      // el cost basis heredado. Si no cuadra, abortamos y pedimos corregir cantidades.
      if (targetAmountManual > 0) {
        const targetUsd = targetAmount * targetPrice;
        const usdDelta = Math.abs(targetUsd - rebalanceUsd);
        const maxAllowedDelta = Math.max(0.01, rebalanceUsd * 0.01); // tolerancia 1%
        if (usdDelta > maxAllowedDelta) {
          throw new Error(
            `El valor que entra al destino (${targetUsd.toFixed(2)} $) no coincide con el que sale del origen (${rebalanceUsd.toFixed(2)} $). Ajusta las cantidades de origen para mover solo lo que quieres rebalancear.`,
          );
        }
      }
      targetRows.push(
        makeRow({
          portfolio_id: portfolioId,
          type: targetMapping.type,
          token_in_symbol: targetToken,
          token_in_amount: targetAmount,
          token_out_symbol: null,
          token_out_amount: null,
          spot_price: targetPrice,
          protocol: targetProtocol,
          position_id: targetPositionId,
          position_type: targetMapping.normalizedPositionType,
          metadata: {
            source: "rebalance_transfer",
            usdValue: rebalanceUsd,
            depositedDelta: targetDepositedDeltaPerRow,
            sourcePositionId,
            sourceProtocol,
            sourceToken,
            sourceAmount,
          },
          timestamp,
        }),
      );
    }

    // Permuta implícita del rebalanceo: si la cesta que entra al destino
    // difiere de la que sale del origen (cambio de token), anotamos
    // metadata.swapLegs en las filas destino para que el motor fiscal consuma
    // por FIFO los lotes de lo vendido y cree el lote de lo comprado con la
    // base trasladada (mismo mecanismo que las reinversiones de harvest). El
    // harvest arrastrado entra en la cesta origen: su lote (creado al
    // cobrarlo) también viaja. `rebalanceSwapChecked` distingue "sin legs
    // porque el token no cambió" (el lote original viaja; no crear otro) de
    // las filas legacy sin anotación, que conservan el comportamiento previo.
    try {
      const sourceBasket: ReinvestEventToken[] = [
        { symbol: sourceToken, amount: sourceAmount, priceUsd: spotPriceFor(sourceToken) },
      ];
      if (sourceMapping.normalizedPositionType === "Liquidity Pool") {
        sourceBasket.push({ symbol: sourceTokenB, amount: sourceAmountB, priceUsd: spotPriceFor(sourceTokenB) });
      }
      for (const h of sourceHarvestTokens) {
        const sym = sanitizeUppercase(h.tokenSymbol);
        if (!sym || !(h.amount > 0)) continue;
        sourceBasket.push({
          symbol: sym,
          amount: h.amount,
          priceUsd: h.spotPriceUsd && h.spotPriceUsd > 0 ? h.spotPriceUsd : spotPriceFor(sym),
        });
      }
      const targetBasket: ReinvestEventToken[] = targetRows.map((row) => ({
        symbol: (row.token_in_symbol ?? "").toUpperCase(),
        amount: row.token_in_amount ?? 0,
        priceUsd: row.spot_price,
      }));
      const split = computeReinvestSplit(sourceBasket, targetBasket, rebalanceUsd);
      if (split) {
        for (const row of targetRows) {
          const sym = (row.token_in_symbol ?? "").toUpperCase();
          const legs = split.swapLegsBySymbol.get(sym) ?? [];
          row.metadata = {
            ...(row.metadata ?? {}),
            rebalanceSwapChecked: true,
            ...(legs.length > 0 ? { swapLegs: legs } : {}),
          };
        }
      }
    } catch {
      // Sin precio de algún token: las filas quedan sin anotación (legacy).
    }

    // Snapshot de cierre SOLO si el rebalanceo vacía la posición de origen.
    // En un rebalanceo el cost basis VIAJA con la posición (vía depositedDelta),
    // así que el PnL realizado es 0: no es una venta a fiat. Registrar aquí un
    // realizedPnl duplicaría el resultado en el total del portfolio.
    const snapshotRow = isFullClose
      ? (() => {
          try {
            const tokenLabel = sourceTokenB ? `${sourceToken}/${sourceTokenB}` : sourceToken;
            // makeRow (no createRow) para que el snapshot comparta operationGroupId
            // con las filas del rebalanceo y se deshaga junto con ellas.
            return makeRow({
              portfolio_id: portfolioId,
              type: "position_closed" as TransactionType,
              token_in_symbol: tokenLabel || "CLOSED",
              // CHECK token_in_amount > 0 y spot_price > 0: el snapshot es un
              // marcador (las cifras reales van en metadata.closure). Con 0/0
              // el insert fallaba siempre y el cierre del rebalanceo no se
              // registraba. Sentinela positiva 1/1.
              token_in_amount: 1,
              token_out_symbol: null,
              token_out_amount: null,
              spot_price: 1,
              protocol: sourceProtocol,
              position_id: sourcePositionId,
              position_type: sourcePositionType,
              metadata: {
                closure: {
                  totalDeposited: proratedDeposited,
                  valueAtClose: rebalanceUsd,
                  realizedPnl: 0,
                  reason: "rebalanced",
                  closedAt: timestamp,
                  balances: sourceCostBasis.balances,
                  destPositionId: targetPositionId,
                  destProtocol: targetProtocol,
                  destToken: targetTokenB ? `${targetToken}/${targetTokenB}` : targetToken,
                },
              },
              timestamp,
              notes: `Rebalanceo → ${targetTokenB ? `${targetToken}/${targetTokenB}` : targetToken}`,
            });
          } catch {
            return null;
          }
        })()
      : null;

    const allRows = [...sourceRows, ...targetRows];
    if (snapshotRow) allRows.push(snapshotRow);
    return allRows;
  }

  if (payload.operationType === "lending_adjust") {
    const adjustType = payload.lendingAdjustType;
    const adjustToken = sanitizeUppercase(payload.lendingAdjustToken);
    const adjustAmount = sanitizePositive(payload.lendingAdjustAmount);

    if (!adjustType) throw new Error("Falta tipo de ajuste lending.");
    if (!adjustToken) throw new Error("Falta token para ajuste lending.");
    if (adjustAmount <= 0) throw new Error("Cantidad de ajuste debe ser mayor a 0.");

    const adjustPrice = spotPriceFor(adjustToken);
    let txType: TransactionType;
    let tokenIn: string | null = null;
    let tokenInAmount: number | null = null;
    let tokenOut: string | null = null;
    let tokenOutAmount: number | null = null;
    let noteLabel: string;

    switch (adjustType) {
      case "add_collateral":
        txType = "lending_supply";
        tokenIn = adjustToken;
        tokenInAmount = adjustAmount;
        noteLabel = `+Colateral ${adjustAmount} ${adjustToken}`;
        break;
      case "remove_collateral":
        txType = "lending_withdraw";
        tokenOut = adjustToken;
        tokenOutAmount = adjustAmount;
        noteLabel = `-Colateral ${adjustAmount} ${adjustToken}`;
        break;
      case "add_debt":
        txType = "lending_borrow";
        tokenIn = adjustToken;
        tokenInAmount = adjustAmount;
        noteLabel = `+Préstamo ${adjustAmount} ${adjustToken}`;
        break;
      case "repay_debt":
        txType = "lending_borrow";
        tokenOut = adjustToken;
        tokenOutAmount = adjustAmount;
        noteLabel = `-Préstamo ${adjustAmount} ${adjustToken}`;
        break;
      default:
        throw new Error("Tipo de ajuste lending no válido.");
    }

    return [
      makeRow({
        portfolio_id: portfolioId,
        type: txType,
        token_in_symbol: tokenIn,
        token_in_amount: tokenInAmount,
        token_out_symbol: tokenOut,
        token_out_amount: tokenOutAmount,
        spot_price: adjustPrice,
        protocol,
        position_id: positionId,
        position_type: "Lending",
        metadata: { adjustType },
        timestamp,
        notes: noteLabel,
      }),
    ];
  }

  throw new Error("Tipo de operación no soportado.");
}

export async function POST(request: NextRequest) {
  try {
    const csrfCheck = validateCsrf(request);
    if (!csrfCheck.ok) {
      return NextResponse.json({ error: csrfCheck.error }, { status: csrfCheck.status });
    }

    const payload = (await request.json()) as OperationPayload;
    const access = await getViewerAccess();
    const accessCheck = ensurePortfolioAccess(access, payload.portfolioId, true);
    if (!accessCheck.ok) {
      return NextResponse.json({ error: accessCheck.error }, { status: accessCheck.status });
    }

    const clientIp = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "unknown";
    const rateKey = `transactions-write:${access.userId ?? "anon"}:${payload.portfolioId}:${clientIp}`;
    const rateLimit = checkRateLimit(rateKey, { limit: 60, windowMs: 60_000 });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiadas operaciones en poco tiempo. Inténtalo de nuevo en unos segundos." },
        { status: 429 },
      );
    }

    const client = getInsertClient();
    const symbolsToPrice = [
      payload.tokenSymbol,
      payload.lpTokenSymbolB,
      payload.lendingCollateralToken,
      payload.lendingDebtToken,
      payload.harvestTargetTokenSymbol,
      payload.harvestTargetLpTokenSymbolB,
      payload.harvestTargetCollateralToken,
      payload.harvestTargetDebtToken,
      payload.rebalanceSourceTokenSymbol,
      payload.rebalanceSourceLpTokenSymbolB,
      payload.rebalanceTargetTokenSymbol,
      payload.rebalanceTargetLpTokenSymbolB,
      payload.lendingAdjustToken,
    ].filter((value): value is string => typeof value === "string");
    const pricesBySymbol = await getCachedPricesBySymbol(client, symbolsToPrice);
    const rows = await buildRows(payload, pricesBySymbol, client);
    // Separamos el snapshot opcional (position_closed) del resto.
    // El enum transaction_type en la BD no siempre incluye "position_closed",
    // así que lo intentamos por separado y, si el enum lo rechaza, lo ignoramos.
    const snapshotRows = rows.filter((row) => (row.type as string) === "position_closed");
    const mainRows = rows.filter((row) => (row.type as string) !== "position_closed");

    let { error } = await client.from("transactions").insert(mainRows);
    if (error && error.message.toLowerCase().includes("operation_group_id")) {
      const fallbackRows = mainRows.map((row) => {
        const clone = { ...row };
        delete clone.operation_group_id;
        return clone;
      });
      const fallbackInsert = await client.from("transactions").insert(fallbackRows);
      error = fallbackInsert.error;
    }

    if (error) {
      throw new Error(`No se pudo guardar en BD: ${error.message}`);
    }

    let insertedSnapshots = 0;
    if (snapshotRows.length > 0) {
      const { error: snapshotError } = await client.from("transactions").insert(snapshotRows);
      if (snapshotError) {
        const msg = snapshotError.message.toLowerCase();
        const isEnumIssue = msg.includes("invalid input value for enum") && msg.includes("position_closed");
        if (!isEnumIssue) {
          // Si el snapshot falla por otra razón (RLS, constraint…), no rompemos
          // la operación principal: ya está guardada. Log y seguimos.
          if (process.env.NODE_ENV !== "production") {
            console.error("Snapshot position_closed insert failed:", snapshotError.message);
          }
        }
      } else {
        insertedSnapshots = snapshotRows.length;
      }
    }

    // Auto-cierre: si la operación dejó alguna posición con balance ≤ 0, emitir
    // position_closed automáticamente (excepto si ya hay snapshot del rebalance).
    // Solo intentamos en operaciones que pueden vaciar posiciones.
    const opsThatCanEmpty = new Set(["lending_adjust", "rebalance"]);
    if (opsThatCanEmpty.has(payload.operationType)) {
      const touchedPositions = new Map<string, { protocol: string; positionId: string; positionType: string }>();
      for (const row of mainRows) {
        if (!row.position_id) continue;
        const key = `${row.protocol ?? ""}::${row.position_id}`;
        if (touchedPositions.has(key)) continue;
        touchedPositions.set(key, {
          protocol: row.protocol ?? "",
          positionId: row.position_id ?? "",
          positionType: row.position_type ?? "Hold",
        });
      }
      for (const pos of touchedPositions.values()) {
        try {
          await autoClosePositionIfEmpty({
            client,
            portfolioId: payload.portfolioId,
            protocol: pos.protocol,
            positionId: pos.positionId,
            positionType: pos.positionType,
            spotPriceFor: (symbol: string) => pricesBySymbol.get(symbol.toUpperCase()) ?? 0,
            // El snapshot comparte grupo con la operación: "Deshacer" lo revierte junto.
            operationGroupId: mainRows[0]?.operation_group_id ?? null,
          });
        } catch {
          // Auto-close no es crítico: si falla, no rompemos la operación principal.
        }
      }
    }

    return NextResponse.json({ ok: true, inserted: mainRows.length + insertedSnapshots });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Transaction error:", error);
    const message = error instanceof Error ? error.message : "Error inesperado al guardar la operación.";
    const isSafeMessage = message.startsWith("Operación") || message.startsWith("Portfolio") || message.startsWith("No hay precio") || message.startsWith("Depósito") || message.startsWith("Staking") || message.startsWith("LP") || message.startsWith("Harvest") || message.startsWith("Rebalanceo") || message.startsWith("Falta") || message.startsWith("Debes") || message.startsWith("Para") || message.startsWith("Indica") || message.startsWith("Selecciona") || message.startsWith("Rango") || message.startsWith("El valor") || message.startsWith("Si el") || message.startsWith("No se pudo") || message.startsWith("Fecha") || message.startsWith("Cantidad") || message.startsWith("+") || message.startsWith("-") || message.startsWith("Tipo de ajuste") || message.startsWith("Reinvertir") || message.startsWith("Reinversión");
    return NextResponse.json({ error: isSafeMessage ? message : "Error inesperado al guardar la operación." }, { status: 400 });
  }
}
