import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
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
  return parseObject(data.metadata) ?? parseObject(data.notes);
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
          metadata: { ...metadata, source: "harvest_reinvest", sourcePositionId, sourceProtocol },
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
          metadata: { ...metadata, source: "harvest_reinvest", sourcePositionId, sourceProtocol },
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
            metadata: { source: "harvest_reinvest", sourcePositionId, sourceProtocol },
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
          metadata: { source: "harvest_reinvest", sourcePositionId, sourceProtocol },
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
          metadata: { ...metadata, source: "harvest_reinvest", sourcePositionId, sourceProtocol },
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
          metadata: { ...metadata, source: "harvest_reinvest", sourcePositionId, sourceProtocol },
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
            metadata: { source: "harvest_reinvest", sourcePositionId, sourceProtocol },
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
          metadata: { source: "harvest_reinvest", sourcePositionId, sourceProtocol },
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

    let rebalanceUsd = 0;
    const sourceRows: TransactionInsert[] = [];
    if (sourceMapping.normalizedPositionType === "Liquidity Pool") {
      if (!sourceToken || !sourceTokenB || sourceAmount <= 0 || sourceAmountB <= 0) {
        throw new Error("Si el origen es LP debes indicar dos tokens y dos cantidades.");
      }
      const sourcePriceA = spotPriceFor(sourceToken);
      const sourcePriceB = spotPriceFor(sourceTokenB);
      rebalanceUsd = sourceAmount * sourcePriceA + sourceAmountB * sourcePriceB;
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
          metadata: { reason: "rebalance_transfer" },
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
          metadata: { reason: "rebalance_transfer" },
          timestamp,
        }),
      );
    } else {
      if (!sourceToken || sourceAmount <= 0) {
        throw new Error("Rebalanceo requiere token y cantidad de origen.");
      }
      const sourcePrice = spotPriceFor(sourceToken);
      rebalanceUsd = sourceAmount * sourcePrice;
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
          metadata: { reason: "rebalance_transfer" },
          timestamp,
        }),
      );
    }
    if (rebalanceUsd <= 0) {
      throw new Error("No se pudo calcular el valor USD del rebalanceo.");
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

      const targetMeta = {
        lp: {
          tokenA: latestLp?.tokenA ?? targetToken,
          tokenB: latestLp?.tokenB ?? targetTokenB,
          rangeLower: resolvedRangeLower,
          rangeUpper: resolvedRangeUpper,
          entryPriceRatio: Number.isFinite(latestLp?.entryPriceRatio ?? 0) && Number(latestLp?.entryPriceRatio) > 0
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
          metadata: { ...targetMeta, source: "rebalance_transfer", usdValue: rebalanceUsd },
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
          metadata: { ...targetMeta, source: "rebalance_transfer", usdValue: rebalanceUsd },
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
            sourcePositionId,
            sourceProtocol,
            sourceToken,
            sourceAmount,
          },
          timestamp,
        }),
      );
    }

    // Insert closure snapshot for the source position (P&L history)
    const snapshotRow = await (async () => {
      try {
        // Compute source position cost basis from historical transactions
        const { data: srcTxs } = await client
          .from("transactions")
          .select("type, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount, spot_price")
          .eq("portfolio_id", portfolioId)
          .eq("protocol", sourceProtocol)
          .eq("position_id", sourcePositionId)
          .is("deleted_at", null);

        const srcCapitalIn = new Set(["deposit", "staking_deposit", "lp_deposit", "lending_supply"]);
        const srcCapitalOut = new Set(["withdrawal", "staking_withdrawal", "lp_withdraw", "lending_withdraw"]);
        let srcTotalDeposited = 0;
        let srcTotalValue = 0;
        const srcBalances: Record<string, number> = {};

        for (const tx of srcTxs ?? []) {
          const t = ((tx.type ?? "") as string).trim();
          if (t === "position_closed") continue;
          const inAmt = toNumber(tx.token_in_amount);
          const outAmt = toNumber(tx.token_out_amount);
          const inSym = ((tx.token_in_symbol ?? "") as string).toUpperCase();
          const outSym = ((tx.token_out_symbol ?? "") as string).toUpperCase();
          const sp = toNumber(tx.spot_price);
          if (srcCapitalIn.has(t)) {
            srcTotalDeposited += inAmt * sp;
            if (inSym) srcBalances[inSym] = (srcBalances[inSym] ?? 0) + inAmt;
          } else if (srcCapitalOut.has(t)) {
            srcTotalDeposited -= outAmt * sp;
            if (outSym) srcBalances[outSym] = (srcBalances[outSym] ?? 0) - outAmt;
          }
        }

        // Current value of source position (before rebalance withdrawal)
        for (const sym of Object.keys(srcBalances)) {
          const bal = Math.max(0, srcBalances[sym] ?? 0);
          const price = spotPriceFor(sym);
          srcTotalValue += bal * price;
        }

        // Pro-rate: what fraction of the position is being rebalanced
        const fraction = srcTotalValue > 0 ? rebalanceUsd / srcTotalValue : 1;
        const proratedDeposited = srcTotalDeposited * Math.min(1, fraction);
        const realizedPnl = rebalanceUsd - proratedDeposited;

        const tokenLabel = sourceTokenB
          ? `${sourceToken}/${sourceTokenB}`
          : sourceToken;

        return createRow({
          portfolio_id: portfolioId,
          type: "position_closed" as TransactionType,
          token_in_symbol: tokenLabel,
          token_in_amount: 0,
          token_out_symbol: null,
          token_out_amount: null,
          spot_price: 0,
          protocol: sourceProtocol,
          position_id: sourcePositionId,
          position_type: sourcePositionType,
          metadata: {
            closure: {
              totalDeposited: proratedDeposited,
              valueAtClose: rebalanceUsd,
              realizedPnl,
              reason: "rebalanced",
              closedAt: timestamp,
              balances: srcBalances,
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
    })();

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
    let { error } = await client.from("transactions").insert(rows);
    if (error && error.message.toLowerCase().includes("operation_group_id")) {
      const fallbackRows = rows.map((row) => {
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

    return NextResponse.json({ ok: true, inserted: rows.length });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Transaction error:", error);
    const message = error instanceof Error ? error.message : "Error inesperado al guardar la operación.";
    const isSafeMessage = message.startsWith("Operación") || message.startsWith("Portfolio") || message.startsWith("No hay precio") || message.startsWith("Depósito") || message.startsWith("Staking") || message.startsWith("LP") || message.startsWith("Harvest") || message.startsWith("Rebalanceo") || message.startsWith("Falta") || message.startsWith("Debes") || message.startsWith("Para") || message.startsWith("Indica") || message.startsWith("Selecciona") || message.startsWith("Rango") || message.startsWith("El valor") || message.startsWith("Si el") || message.startsWith("No se pudo") || message.startsWith("Fecha") || message.startsWith("Cantidad") || message.startsWith("+") || message.startsWith("-") || message.startsWith("Tipo de ajuste") || message.startsWith("Reinvertir") || message.startsWith("Reinversión");
    return NextResponse.json({ error: isSafeMessage ? message : "Error inesperado al guardar la operación." }, { status: 400 });
  }
}
