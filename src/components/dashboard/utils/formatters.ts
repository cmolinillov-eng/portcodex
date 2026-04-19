import type { DefiPosition } from "@/types/portfolio";

export type OperationType = "base_deposit" | "harvest" | "staking" | "lending_borrow" | "liquidity_pool" | "rebalance";
export type BaseDepositLendingMode = "collateral" | "debt" | "both";
export type HarvestReinvestLendingMode = "collateral" | "debt" | "both";
export type OperationScope = "increase_existing" | "create_new";

export type FormState = {
  operationType: OperationType;
  operationScope: OperationScope;
  portfolioId: string;
  positionId: string;
  protocol: string;
  transactionDate: string;
  manualSpotPrices: Record<string, string>;
  positionContextType: string;
  tokenSymbol: string;
  amount: string;
  harvestSourceKey: string;
  harvestTargetPositionId: string;
  harvestTargetProtocol: string;
  harvestTargetPositionType: string;
  harvestTargetKey: string;
  harvestTargetTokenSymbol: string;
  harvestTargetAmount: string;
  harvestTargetLpTokenSymbolB: string;
  harvestTargetLpAmountB: string;
  harvestTargetLendingMode: HarvestReinvestLendingMode;
  harvestTargetCollateralToken: string;
  harvestTargetCollateralAmount: string;
  harvestTargetDebtToken: string;
  harvestTargetDebtAmount: string;
  lendingCollateralToken: string;
  lendingCollateralAmount: string;
  lendingDebtToken: string;
  lendingDebtAmount: string;
  lpTokenSymbolB: string;
  lpAmountB: string;
  lpRangeLower: string;
  lpRangeUpper: string;
  isCorrelated: boolean;
  baseDepositTargetKey: string;
  baseDepositTokenSymbol: string;
  baseDepositLendingMode: BaseDepositLendingMode;
  rebalanceSourceKey: string;
  rebalanceSourceTokenSymbol: string;
  rebalanceSourceAmount: string;
  rebalanceSourceLpTokenSymbolB: string;
  rebalanceSourceLpAmountB: string;
  rebalanceTargetKey: string;
  rebalanceTargetTokenSymbol: string;
  rebalanceTargetAmount: string;
  rebalanceTargetLpTokenSymbolB: string;
  rebalanceTargetLpAmountB: string;
};

export type DeletedPositionState = {
  portfolioId: string;
  protocol: string;
  positionId: string;
  label: string;
  canUndo: boolean;
};

export function toDateTimeLocalValue(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function createEmptyForm(): FormState {
  return {
    operationType: "base_deposit",
    operationScope: "increase_existing",
    portfolioId: "",
    positionId: "",
    protocol: "Wallet",
    transactionDate: toDateTimeLocalValue(new Date()),
    manualSpotPrices: {},
    positionContextType: "Hold",
    tokenSymbol: "",
    amount: "",
    harvestSourceKey: "",
    harvestTargetPositionId: "",
    harvestTargetProtocol: "",
    harvestTargetPositionType: "",
    harvestTargetKey: "",
    harvestTargetTokenSymbol: "",
    harvestTargetAmount: "",
    harvestTargetLpTokenSymbolB: "",
    harvestTargetLpAmountB: "",
    harvestTargetLendingMode: "collateral",
    harvestTargetCollateralToken: "",
    harvestTargetCollateralAmount: "",
    harvestTargetDebtToken: "",
    harvestTargetDebtAmount: "",
    lendingCollateralToken: "",
    lendingCollateralAmount: "",
    lendingDebtToken: "",
    lendingDebtAmount: "",
    lpTokenSymbolB: "",
    lpAmountB: "",
    lpRangeLower: "",
    lpRangeUpper: "",
    isCorrelated: false,
    baseDepositTargetKey: "",
    baseDepositTokenSymbol: "",
    baseDepositLendingMode: "collateral",
    rebalanceSourceKey: "",
    rebalanceSourceTokenSymbol: "",
    rebalanceSourceAmount: "",
    rebalanceSourceLpTokenSymbolB: "",
    rebalanceSourceLpAmountB: "",
    rebalanceTargetKey: "",
    rebalanceTargetTokenSymbol: "",
    rebalanceTargetAmount: "",
    rebalanceTargetLpTokenSymbolB: "",
    rebalanceTargetLpAmountB: "",
  };
}

export function currency(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function percent(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function plainPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function signedCurrency(value: number): string {
  const base = currency(Math.abs(value));
  if (value > 0) return `+${base}`;
  if (value < 0) return `-${base}`;
  return base;
}

/** Currency without decimals — for compact stat displays */
export function currencyCompact(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
  }).format(value);
}

export function signedCurrencyCompact(value: number): string {
  const base = currencyCompact(Math.abs(value));
  if (value > 0) return `+${base}`;
  if (value < 0) return `-${base}`;
  return base;
}

export function positionCompositeUiKey(position: DefiPosition): string {
  return `${position.portfolioId}::${position.protocol.toLowerCase()}::${position.positionId}`;
}

export function inferOperationType(positionType: string): OperationType {
  const normalized = positionType.toLowerCase();
  if (normalized.includes("lending")) return "lending_borrow";
  if (normalized.includes("staking")) return "staking";
  if (normalized.includes("lp") || normalized.includes("liquidity")) return "harvest";
  return "base_deposit";
}

export function defaultPositionContextType(operationType: OperationType): string {
  if (operationType === "staking") return "Staking";
  if (operationType === "lending_borrow") return "Lending";
  if (operationType === "liquidity_pool") return "Liquidity Pool";
  return "Hold";
}

export function targetMatchesOperation(targetPositionType: string, operationType: OperationType): boolean {
  const normalized = targetPositionType.trim().toLowerCase();
  if (operationType === "base_deposit") {
    return !normalized.includes("staking") && !normalized.includes("lending") && !normalized.includes("lp") && !normalized.includes("liquidity");
  }
  if (operationType === "staking") return normalized.includes("staking");
  if (operationType === "lending_borrow") return normalized.includes("lending");
  if (operationType === "liquidity_pool") return normalized.includes("lp") || normalized.includes("liquidity");
  return false;
}

export function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
