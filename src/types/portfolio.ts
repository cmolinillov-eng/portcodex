export type PortfolioSummary = {
  totalValueUsd: number;
  totalDepositedUsd: number;
  pnlUsd: number;
  pnlPercent: number;
  totalHarvestUsd: number;
  totalRealizedPnl: number;
};

export type DashboardCategoryKey = "wallet" | "lending" | "liquidity_pools" | "staking";

export type DefiPosition = {
  portfolioId: string;
  tokenSymbol: string;
  protocol: string;
  positionId: string;
  positionType: string;
  currentBalance: number;
  averageEntryPrice: number;
  currentPrice: number;
  currentValue: number;
  roiPercent: number;
  impermanentLossPercent: number | null;
  hodlEquivalentValue: number | null;
  impermanentLossValue: number | null;
  healthFactor: number | null;
  healthStatus: "safe" | "warning" | "critical" | "na";
  lpRangeStatus: "in_range" | "out_of_range" | "na" | "correlated";
  lpRangeLabel: string | null;
  currentPriceLabel: string | null;
  dataQualityIssue: string | null;
  isAggregatePosition: boolean;
  balanceLabel: string | null;
  costBasisUsd: number | null;
  totalHarvested: number;
  isActive: boolean;
  valueBreakdown: Array<{
    tokenSymbol: string;
    valueUsd: number;
  }>;
  collateralBreakdown: Array<{ tokenSymbol: string; amount: number; valueUsd: number }>;
  debtBreakdown: Array<{ tokenSymbol: string; amount: number; valueUsd: number }>;
  lendingDetails: LendingDetails | null;
};

/**
 * Detalle ampliado de una posición de lending. Sólo se rellena para
 * posiciones cuyo position_type pertenece a la categoría 'lending'.
 */
export type LendingDetails = {
  /** Loan-to-Value actual: deuda / colateral (sin ponderar). 0..1 (puede superar 1 si la deuda excede el colateral). */
  ltv: number;
  /** LTV máximo ponderado por threshold de cada colateral. 0..1. */
  maxLtv: number;
  /** Utilización del límite: ltv / maxLtv. 1.0 = liquidación inminente. */
  ltvUtilization: number;
  /** Colateral total en USD. */
  totalCollateralUsd: number;
  /** Deuda total en USD. */
  totalDebtUsd: number;
  /** Net = colateral - deuda. Lo que recuperarías si cerrases la posición hoy. */
  netValueUsd: number;
  /** Distancia a liquidación por activo de colateral. */
  liquidationRisks: Array<{
    tokenSymbol: string;
    currentPrice: number;
    liquidationPrice: number | null;
    dropPercent: number | null;
  }>;
};

export type PositionSection = {
  key: DashboardCategoryKey;
  title: string;
  positions: DefiPosition[];
};

export type QuickAction = {
  key: "deposit" | "withdraw" | "swap";
  label: string;
};
