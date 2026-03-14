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
