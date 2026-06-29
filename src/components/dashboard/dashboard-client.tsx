"use client";

import {
  BadgeDollarSign,
  FileDown,
  FileSpreadsheet,
  History,
  Layers,
  Pencil,
  Scale,
  ChevronRight,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { DashboardData } from "@/lib/dashboard/get-dashboard-data";
import type { DefiPosition, PositionSection } from "@/types/portfolio";
import { HistoryModal } from "./modals/history-modal";
import { QuickHarvestModal } from "./modals/quick-harvest-modal";
import { ReinvestHarvestModal } from "./modals/reinvest-harvest-modal";
import { EditModal } from "./modals/edit-modal";
import { CsvModal } from "./modals/csv-modal";
import { ManualPriceModal } from "./modals/manual-price-modal";
import { DashboardHeader } from "./sections/DashboardHeader";
import { HealthFactorAlertBanner } from "./sections/HealthFactorAlertBanner";
import { PositionSectionCard } from "./sections/PositionSectionCard";
import { StrategyComposition } from "./sections/StrategyComposition";
import { PortfolioEvolutionChart } from "./sections/PortfolioEvolutionChart";
import { CurrencyProvider, useCurrency } from "./utils/currency-context";
import { buildPortfolioReportHtml } from "@/lib/reports/portfolio-report-html";
import { RecentActivity, undoKeyFor } from "./sections/RecentActivity";
import { OnchainLivePanel } from "./sections/OnchainLivePanel";

type OperationType = "base_deposit" | "harvest" | "staking" | "lending_borrow" | "liquidity_pool" | "rebalance";
type BaseDepositLendingMode = "collateral" | "debt" | "both";
type HarvestReinvestLendingMode = "collateral" | "debt" | "both";
type OperationScope = "increase_existing" | "create_new";

type FormState = {
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
  rebalanceTargetIsNew: boolean;
  rebalanceTargetNewProtocol: string;
  rebalanceTargetNewPositionType: string;
  rebalanceTargetLpSplitPercentA: string;
};

type TransactionExportRow = {
  transaction_date: string | null;
  type: string | null;
  movement_origin?: string | null;
  operation_group_id?: string | null;
  protocol: string | null;
  position_id: string | null;
  position_type: string | null;
  token_in_symbol: string | null;
  token_in_amount: string | number | null;
  token_out_symbol: string | null;
  token_out_amount: string | number | null;
  spot_price: string | number | null;
  fee_amount: string | number | null;
  notes: string | null;
};

type DeletedPositionState = {
  portfolioId: string;
  protocol: string;
  positionId: string;
  label: string;
  canUndo: boolean;
};

function toDateTimeLocalValue(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function createEmptyForm(): FormState {
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
    rebalanceTargetIsNew: false,
    rebalanceTargetNewProtocol: "",
    rebalanceTargetNewPositionType: "Hold",
    rebalanceTargetLpSplitPercentA: "50",
  };
}

type BaseDepositTarget = {
  key: string;
  label: string;
  portfolioId: string;
  positionId: string;
  protocol: string;
  positionType: string;
  availableTokens: string[];
};

function currency(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function percent(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function plainPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function signedCurrency(value: number): string {
  const base = currency(Math.abs(value));
  if (value > 0) return `+${base}`;
  if (value < 0) return `-${base}`;
  return base;
}

function positionCompositeUiKey(position: DefiPosition): string {
  return `${position.portfolioId}::${position.protocol.toLowerCase()}::${position.positionId}`;
}

function inferOperationType(positionType: string): OperationType {
  const normalized = (positionType ?? "").toLowerCase();
  if (normalized.includes("lending")) return "lending_borrow";
  if (normalized.includes("staking")) return "staking";
  if (normalized.includes("lp") || normalized.includes("liquidity")) return "harvest";
  return "base_deposit";
}

function defaultPositionContextType(operationType: OperationType): string {
  if (operationType === "staking") return "Staking";
  if (operationType === "lending_borrow") return "Lending";
  if (operationType === "liquidity_pool") return "Liquidity Pool";
  return "Hold";
}

function targetMatchesOperation(targetPositionType: string, operationType: OperationType): boolean {
  const normalized = targetPositionType.trim().toLowerCase();
  if (operationType === "base_deposit") {
    return !normalized.includes("staking") && !normalized.includes("lending") && !normalized.includes("lp") && !normalized.includes("liquidity");
  }
  if (operationType === "staking") return normalized.includes("staking");
  if (operationType === "lending_borrow") return normalized.includes("lending");
  if (operationType === "liquidity_pool") return normalized.includes("lp") || normalized.includes("liquidity");
  return false;
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function escapeCsv(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function parseManualSpotPrices(input: Record<string, string>): Record<string, number> {
  const entries = Object.entries(input).flatMap(([rawSymbol, rawValue]) => {
    const symbol = rawSymbol.trim().toUpperCase();
    const parsed = Number(rawValue.replace(",", "."));
    if (!symbol || !Number.isFinite(parsed) || parsed <= 0) return [];
    return [[symbol, parsed] as const];
  });

  return Object.fromEntries(entries);
}

export function DashboardClient({ data }: { data: DashboardData }) {
  return (
    <CurrencyProvider fxRateUsdToEur={data.fxRates.eur}>
      <DashboardClientInner data={data} />
    </CurrencyProvider>
  );
}

function DashboardClientInner({ data }: { data: DashboardData }) {
  const router = useRouter();
  const {
    summary,
    sections,
    harvestByPosition,
    recentActivity,
    pricesBySymbol,
    pricesLastUpdatedAt,
    viewer,
    portfolioContext,
  } = data;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingPositionKey, setIsDeletingPositionKey] = useState("");
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [unmappedTokens, setUnmappedTokens] = useState<string[]>([]);
  const [manualPriceInputs, setManualPriceInputs] = useState<Record<string, string>>({});
  const [isManualPriceModalOpen, setIsManualPriceModalOpen] = useState(false);
  const [lastDeletedPosition, setLastDeletedPosition] = useState<DeletedPositionState | null>(null);
  const [undoingKey, setUndoingKey] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedPosition, setSelectedPosition] = useState<DefiPosition | null>(null);
  const [form, setForm] = useState<FormState>(createEmptyForm);

  // Edit modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editPosition, setEditPosition] = useState<DefiPosition | null>(null);
  const [editModalTab, setEditModalTab] = useState<"edit" | "lending_adjust">("edit");
  const [editLendingAdjustType, setEditLendingAdjustType] = useState<"add_collateral" | "remove_collateral" | "add_debt" | "repay_debt">("add_collateral");
  const [editLendingToken, setEditLendingToken] = useState("");
  const [editLendingAmount, setEditLendingAmount] = useState("");
  const [isSavingLendingFromEdit, setIsSavingLendingFromEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    tokenSymbol: "",
    amount: "",
    entryPrice: "",
    lpTokenSymbolB: "",
    lpAmountB: "",
    lpEntryPriceB: "",
    lpRangeLower: "",
    lpRangeUpper: "",
    isCorrelated: false,
  });

  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvStartDate, setCsvStartDate] = useState("");
  const [csvEndDate, setCsvEndDate] = useState("");
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [csvErrorMessage, setCsvErrorMessage] = useState("");
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyRows, setHistoryRows] = useState<Array<{
    tokenSymbol: string;
    protocol: string;
    positionId: string;
    positionType: string;
    closedAt: string;
    reason: string;
    totalDeposited: number;
    valueAtClose: number;
    realizedPnl: number;
    destToken?: string;
  }>>([]);
  // Quick harvest modal state
  const [isQuickHarvestOpen, setIsQuickHarvestOpen] = useState(false);
  const [quickHarvestPosition, setQuickHarvestPosition] = useState<DefiPosition | null>(null);
  const [quickHarvestToken, setQuickHarvestToken] = useState("");
  const [quickHarvestAmount, setQuickHarvestAmount] = useState("");
  const [quickHarvestReinvest, setQuickHarvestReinvest] = useState(false);
  const [quickHarvestTargetKey, setQuickHarvestTargetKey] = useState("");
  const [quickHarvestTargetToken, setQuickHarvestTargetToken] = useState("");
  const [isSavingQuickHarvest, setIsSavingQuickHarvest] = useState(false);

  // Reinvest Harvest modal state
  const [isReinvestHarvestOpen, setIsReinvestHarvestOpen] = useState(false);
  const [reinvestHarvestSourcePosition, setReinvestHarvestSourcePosition] = useState<DefiPosition | null>(null);
  const [reinvestHarvestToken, setReinvestHarvestToken] = useState("");
  const [reinvestHarvestAmount, setReinvestHarvestAmount] = useState("");
  const [reinvestHarvestTargetKey, setReinvestHarvestTargetKey] = useState("");
  const [reinvestHarvestTargetToken, setReinvestHarvestTargetToken] = useState("");
  const [isSavingReinvestHarvest, setIsSavingReinvestHarvest] = useState(false);

  const [hoveredCompositionKey, setHoveredCompositionKey] = useState<string | null>(null);
  const [isCompactDonut, setIsCompactDonut] = useState(false);
  const [visibleRecentActivityCount, setVisibleRecentActivityCount] = useState(10);
  const isScopedOperation =
    form.operationType === "base_deposit" ||
    form.operationType === "staking" ||
    form.operationType === "lending_borrow" ||
    form.operationType === "liquidity_pool";
  const isCreateMode = isScopedOperation && form.operationScope === "create_new";

  const totalActivePositions = useMemo(
    () => sections.reduce((acc, section) => acc + section.positions.length, 0),
    [sections],
  );

  const primaryPortfolioId = useMemo(() => {
    for (const section of sections) {
      for (const position of section.positions) {
        if (position.portfolioId) return position.portfolioId;
      }
    }
    return "";
  }, [sections]);

  const activePortfolioId = useMemo(() => {
    const scopedPortfolioId = (portfolioContext?.portfolioId ?? "").trim();
    if (scopedPortfolioId) return scopedPortfolioId;
    return primaryPortfolioId;
  }, [portfolioContext?.portfolioId, primaryPortfolioId]);

  const manualPriceSymbols = useMemo(() => {
    const rawSymbols = [
      form.tokenSymbol,
      form.baseDepositTokenSymbol,
      form.lpTokenSymbolB,
      form.lendingCollateralToken,
      form.lendingDebtToken,
      form.harvestTargetTokenSymbol,
      form.harvestTargetLpTokenSymbolB,
      form.harvestTargetCollateralToken,
      form.harvestTargetDebtToken,
      form.rebalanceSourceTokenSymbol,
      form.rebalanceSourceLpTokenSymbolB,
      form.rebalanceTargetTokenSymbol,
      form.rebalanceTargetLpTokenSymbolB,
    ];
    return Array.from(
      new Set(
        rawSymbols
          .map((symbol) => symbol.trim().toUpperCase())
          .filter((symbol) => symbol.length > 0),
      ),
    );
  }, [
    form.baseDepositTokenSymbol,
    form.harvestTargetCollateralToken,
    form.harvestTargetDebtToken,
    form.harvestTargetLpTokenSymbolB,
    form.harvestTargetTokenSymbol,
    form.lendingCollateralToken,
    form.lendingDebtToken,
    form.lpTokenSymbolB,
    form.rebalanceSourceLpTokenSymbolB,
    form.rebalanceSourceTokenSymbol,
    form.rebalanceTargetLpTokenSymbolB,
    form.rebalanceTargetTokenSymbol,
    form.tokenSymbol,
  ]);

  const sectionTotals = useMemo(
    () => {
      const sectionMap = new Map(
        sections.map((section) => [
          section.key,
          section.positions.reduce((sum, position) => sum + position.currentValue, 0),
        ]),
      );
      const fixedOrder: Array<{ key: PositionSection["key"]; title: string }> = [
        { key: "wallet", title: "Wallet (HODL)" },
        { key: "lending", title: "Lending Protocols" },
        { key: "liquidity_pools", title: "Liquidity Pools" },
        { key: "staking", title: "Staking" },
      ];
      return fixedOrder.map((entry) => ({
        key: entry.key,
        title: entry.title,
        value: sectionMap.get(entry.key) ?? 0,
      }));
    },
    [sections],
  );

  const baseDepositTargets = useMemo<BaseDepositTarget[]>(() => {
    const targets: BaseDepositTarget[] = [];
    const seen = new Set<string>();

    for (const section of sections) {
      for (const position of section.positions) {
        if (!position.portfolioId || !position.positionId || !position.tokenSymbol) continue;

        const availableTokens = position.tokenSymbol
          .split("/")
          .map((token) => token.trim().toUpperCase())
          .filter((token) => token.length > 0);
        if (availableTokens.length === 0) continue;

        const key = `${position.portfolioId}::${position.protocol}::${position.positionId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        targets.push({
          key,
          label: `${position.tokenSymbol} · ${position.protocol} · ${position.positionType} · ${position.positionId}`,
          portfolioId: position.portfolioId,
          positionId: position.positionId,
          protocol: position.protocol,
          positionType: position.positionType,
          availableTokens,
        });
      }
    }

    return targets;
  }, [sections]);

  const positionByKey = useMemo(() => {
    const map = new Map<string, DefiPosition>();
    for (const section of sections) {
      for (const pos of section.positions) {
        if (pos.portfolioId && pos.positionId) {
          map.set(`${pos.portfolioId}::${pos.protocol}::${pos.positionId}`, pos);
        }
      }
    }
    return map;
  }, [sections]);

  const scopedTargets = useMemo(
    () =>
      baseDepositTargets.filter((target) => targetMatchesOperation(target.positionType, form.operationType)),
    [baseDepositTargets, form.operationType],
  );

  const harvestSourceTargets = useMemo(
    () => {
      const summaryByKey = new Map(harvestByPosition.map((item) => [item.key, item]));
      return baseDepositTargets.map((target) => {
        const details =
          summaryByKey.get(target.key) ?? {
            key: target.key,
            portfolioId: target.portfolioId,
            protocol: target.protocol,
            positionId: target.positionId,
            harvestedUsd: 0,
            pendingUsd: 0,
            pendingByToken: [],
          };
        return {
          key: target.key,
          label: `${target.positionType} · ${target.protocol} · ${target.positionId}`,
          details,
        };
      });
    },
    [harvestByPosition, baseDepositTargets],
  );

  const tokenPriceMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const [symbol, price] of Object.entries(pricesBySymbol)) {
      const normalized = symbol.toUpperCase();
      if (!normalized || !Number.isFinite(price) || price <= 0) continue;
      map.set(normalized, price);
    }
    for (const section of sections) {
      for (const position of section.positions) {
        if (position.isAggregatePosition) continue;
        const symbol = position.tokenSymbol.toUpperCase();
        if (!symbol || position.currentPrice <= 0) continue;
        map.set(symbol, position.currentPrice);
      }
    }
    return map;
  }, [pricesBySymbol, sections]);

  // Mapa rápido para buscar harvest pendiente por (portfolioId::protocol::positionId)
  const harvestByPositionKey = useMemo(() => {
    return new Map(harvestByPosition.map((h) => [h.key, h]));
  }, [harvestByPosition]);

  const rebalancePreview = useMemo(() => {
    const sourceTarget = baseDepositTargets.find((item) => item.key === form.rebalanceSourceKey);
    const targetTarget = baseDepositTargets.find((item) => item.key === form.rebalanceTargetKey);
    const sourceType = (sourceTarget?.positionType ?? "").toLowerCase();
    const targetTypeRaw = form.rebalanceTargetIsNew
      ? form.rebalanceTargetNewPositionType
      : (targetTarget?.positionType ?? "");
    const targetType = targetTypeRaw.toLowerCase();

    let lpUsd = 0;
    const sourcePriceA = tokenPriceMap.get(form.rebalanceSourceTokenSymbol.toUpperCase()) ?? 0;
    const sourceAmountA = Number(form.rebalanceSourceAmount);
    const isSourceLp = sourceType.includes("liquidity") || sourceType.includes("lp");
    if (isSourceLp) {
      const sourcePriceB = tokenPriceMap.get(form.rebalanceSourceLpTokenSymbolB.toUpperCase()) ?? 0;
      const sourceAmountB = Number(form.rebalanceSourceLpAmountB);
      if (Number.isFinite(sourceAmountA) && sourceAmountA > 0) lpUsd += sourceAmountA * sourcePriceA;
      if (Number.isFinite(sourceAmountB) && sourceAmountB > 0) lpUsd += sourceAmountB * sourcePriceB;
    } else {
      if (Number.isFinite(sourceAmountA) && sourceAmountA > 0) lpUsd = sourceAmountA * sourcePriceA;
    }

    // ── Incluir el harvest pendiente cuando el origen es un LP ──────────────
    // Cuando deshacemos un LP a (típicamente) USDC, el USDC final debe incluir:
    //   · el valor actual de los 2 tokens del pool (lpUsd)
    //   · el valor actual del harvest pendiente acumulado por ese pool
    // De este modo el total del portfolio no varía: el harvest ya estaba
    // contabilizado y simplemente se materializa en el activo destino.
    let harvestPendingUsd = 0;
    let harvestPendingTokens: Array<{ tokenSymbol: string; amount: number; priceUsd: number; usdValue: number }> = [];
    if (isSourceLp && sourceTarget) {
      const harvestEntry = harvestByPositionKey.get(form.rebalanceSourceKey);
      if (harvestEntry && harvestEntry.pendingByToken.length > 0) {
        for (const item of harvestEntry.pendingByToken) {
          const sym = item.tokenSymbol.toUpperCase();
          const priceUsd = tokenPriceMap.get(sym) ?? 0;
          const usdValue = Math.max(0, item.amount) * priceUsd;
          if (usdValue > 0) {
            harvestPendingTokens.push({ tokenSymbol: sym, amount: item.amount, priceUsd, usdValue });
            harvestPendingUsd += usdValue;
          }
        }
      }
    }
    const usd = lpUsd + harvestPendingUsd;

    const isTargetLp = targetType.includes("liquidity") || targetType.includes("lp");
    const targetPriceA = tokenPriceMap.get(form.rebalanceTargetTokenSymbol.toUpperCase()) ?? 0;
    const targetPriceB = tokenPriceMap.get(form.rebalanceTargetLpTokenSymbolB.toUpperCase()) ?? 0;
    const targetAmountManual = Number(form.rebalanceTargetAmount);
    const targetAmountManualB = Number(form.rebalanceTargetLpAmountB);

    let targetAmount = 0;
    let suggestedAmountA = 0;
    let suggestedAmountB = 0;

    if (isTargetLp) {
      // Para LP: sugerencias basadas en split %. Si el usuario ya editó, respetar.
      const rawSplit = Number(form.rebalanceTargetLpSplitPercentA);
      const splitA = Number.isFinite(rawSplit) ? Math.max(0, Math.min(100, rawSplit)) : 50;
      const usdForA = (usd * splitA) / 100;
      const usdForB = usd - usdForA;
      suggestedAmountA = targetPriceA > 0 ? usdForA / targetPriceA : 0;
      suggestedAmountB = targetPriceB > 0 ? usdForB / targetPriceB : 0;
      targetAmount = Number.isFinite(targetAmountManual) && targetAmountManual > 0 ? targetAmountManual : suggestedAmountA;
    } else {
      const targetAmountAuto = targetPriceA > 0 ? usd / targetPriceA : 0;
      targetAmount = Number.isFinite(targetAmountManual) && targetAmountManual > 0 ? targetAmountManual : targetAmountAuto;
      suggestedAmountA = targetAmountAuto;
    }

    return {
      usd,
      lpUsd,
      harvestPendingUsd,
      harvestPendingTokens,
      targetAmount,
      suggestedAmountA,
      suggestedAmountB,
      isTargetLp,
      targetPriceA,
      targetPriceB,
      targetAmountManualB,
    };
  }, [
    baseDepositTargets,
    form.rebalanceSourceAmount,
    form.rebalanceSourceKey,
    form.rebalanceSourceTokenSymbol,
    form.rebalanceSourceLpAmountB,
    form.rebalanceSourceLpTokenSymbolB,
    form.rebalanceTargetAmount,
    form.rebalanceTargetKey,
    form.rebalanceTargetTokenSymbol,
    form.rebalanceTargetLpTokenSymbolB,
    form.rebalanceTargetLpAmountB,
    form.rebalanceTargetLpSplitPercentA,
    form.rebalanceTargetIsNew,
    form.rebalanceTargetNewPositionType,
    tokenPriceMap,
    harvestByPositionKey,
  ]);

  const compositionStyles = useMemo(() => {
    // Paleta: wallet=azul perla, lending=púrpura, liquidity=teal, staking=ámbar
    const palette = ["#A0D2FF", "#B87EF5", "#4ECDC4", "#FFB347", "#D4E9FF"];
    const total = sectionTotals.reduce((sum, item) => sum + item.value, 0);
    if (total <= 0) {
      return {
        donutBackground: "conic-gradient(#0e1e32 0deg 360deg)",
        entries: sectionTotals.map((item, index) => ({
          ...item,
          percent: 0,
          color: palette[index % palette.length],
          start: 0,
          end: 0,
        })),
      };
    }

    let angleStart = 0;
    const entries = sectionTotals.map((item, index) => {
      const percentValue = (item.value / total) * 100;
      const angleSize = (percentValue / 100) * 360;
      const angleEnd = angleStart + angleSize;
      const entry = {
        ...item,
        percent: percentValue,
        color: palette[index % palette.length],
        start: angleStart,
        end: angleEnd,
      };
      angleStart = angleEnd;
      return entry;
    });

    const donutBackground = `conic-gradient(${entries
      .map((entry) => `${entry.color} ${entry.start}deg ${entry.end}deg`)
      .join(", ")})`;

    return { donutBackground, entries };
  }, [sectionTotals]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1024px)");
    const sync = () => setIsCompactDonut(media.matches);
    sync();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    }

    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  const donutOuterStroke = isCompactDonut ? 24 : 30;
  const donutActiveStroke = isCompactDonut ? 30 : 38;
  const donutInnerInset = isCompactDonut ? 40 : 34;

  const visibleRecentActivity = useMemo(
    () => recentActivity.slice(0, visibleRecentActivityCount),
    [recentActivity, visibleRecentActivityCount],
  );

  useEffect(() => {
    setVisibleRecentActivityCount(10);
  }, [recentActivity.length]);

  function openModal(position?: DefiPosition) {
    if (!viewer.canOperate) return;

    const suggestedTarget =
      position
        ? `${position.portfolioId}::${position.protocol}::${position.positionId}`
        : "";
    const suggestedToken = position?.tokenSymbol
      ? position.tokenSymbol.split("/")[0]?.trim().toUpperCase() ?? ""
      : "";

    const nextForm: FormState = position
      ? {
          ...createEmptyForm(),
          operationType: inferOperationType(position.positionType),
          operationScope: "increase_existing",
          portfolioId: position.portfolioId,
          positionId: position.positionId,
          protocol: position.protocol,
          positionContextType: position.positionType,
          tokenSymbol: position.tokenSymbol,
          harvestTargetPositionId: position.positionId,
          harvestTargetProtocol: position.protocol,
          harvestSourceKey: `${position.portfolioId}::${position.protocol}::${position.positionId}`,
          baseDepositTargetKey: suggestedTarget,
          baseDepositTokenSymbol: suggestedToken,
          baseDepositLendingMode: "collateral",
        }
      : { ...createEmptyForm(), portfolioId: activePortfolioId };

    setSelectedPosition(position ?? null);
    setForm(nextForm);
    setErrorMessage("");
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setSelectedPosition(null);
    setForm(createEmptyForm());
    setErrorMessage("");
  }

  function closeCsvModal() {
    setIsCsvModalOpen(false);
    setCsvErrorMessage("");
  }

  async function deletePosition(position: DefiPosition) {
    if (!viewer.canDeletePosition) return;

    const label = `${position.tokenSymbol} · ${position.protocol} · ${position.positionId}`;
    const confirmed = window.confirm(
      `Vas a eliminar la posición ${label}.\nSe borrarán sus movimientos históricos de esta posición.\n\n¿Quieres continuar?`,
    );
    if (!confirmed) return;

    try {
      setErrorMessage("");
      setIsDeletingPositionKey(positionCompositeUiKey(position));
      const response = await fetch("/api/positions/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioId: position.portfolioId,
          protocol: position.protocol,
          positionId: position.positionId,
        }),
      });

      const body = (await response.json()) as { error?: string; canUndo?: boolean };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo eliminar la posición.");
      }

      setLastDeletedPosition({
        portfolioId: position.portfolioId,
        protocol: position.protocol,
        positionId: position.positionId,
        label,
        canUndo: body.canUndo === true,
      });

      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido al eliminar la posición.";
      setErrorMessage(message);
    } finally {
      setIsDeletingPositionKey("");
    }
  }

  async function undoDeletePosition() {
    if (!lastDeletedPosition || !lastDeletedPosition.canUndo) return;
    try {
      setErrorMessage("");
      const response = await fetch("/api/positions/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioId: lastDeletedPosition.portfolioId,
          protocol: lastDeletedPosition.protocol,
          positionId: lastDeletedPosition.positionId,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo restaurar la posición.");
      }
      setLastDeletedPosition(null);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido al restaurar la posición.";
      setErrorMessage(message);
    }
  }

  // Deshacer una operación reciente (añadir/rebalanceo/harvest = soft-delete del
  // grupo; borrado de posición = restaurar). Solo gestores con permiso.
  async function undoOperation(
    item: DashboardData["recentActivity"][number],
    mode: "operation" | "restore",
  ) {
    if (!viewer.canDeletePosition) return;
    const label =
      mode === "restore"
        ? `restaurar la posición ${item.positionId} (${item.protocol})`
        : `deshacer esta operación (${item.type})`;
    const confirmed = window.confirm(`Vas a ${label}.\n\n¿Quieres continuar?`);
    if (!confirmed) return;

    const key = undoKeyFor(item, mode);
    try {
      setErrorMessage("");
      setUndoingKey(key);
      const response = await fetch("/api/transactions/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioId: item.portfolioId,
          mode,
          operationGroupId: item.operationGroupId,
          protocol: item.protocol,
          positionId: item.positionId,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo deshacer la operación.");
      }
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido al deshacer.";
      setErrorMessage(message);
    } finally {
      setUndoingKey("");
    }
  }

  function openQuickHarvest(position: DefiPosition) {
    if (!viewer.canOperate) return;
    const firstToken = position.tokenSymbol.split("/")[0]?.trim().toUpperCase() ?? "";
    setQuickHarvestPosition(position);
    setQuickHarvestToken(firstToken);
    setQuickHarvestAmount("");
    setQuickHarvestReinvest(false);
    setQuickHarvestTargetKey(`${position.portfolioId}::${position.protocol}::${position.positionId}`);
    setQuickHarvestTargetToken(firstToken);
    setErrorMessage("");
    setIsQuickHarvestOpen(true);
  }

  function openReinvestHarvest(position: DefiPosition) {
    if (!viewer.canOperate) return;
    const posKey = `${position.portfolioId}::${position.protocol}::${position.positionId}`;
    const harvestInfo = harvestByPosition.find((h) => h.key === posKey);
    const pendingTokens = harvestInfo?.pendingByToken ?? [];
    const firstPendingToken = pendingTokens[0]?.tokenSymbol ?? position.tokenSymbol.split("/")[0]?.trim().toUpperCase() ?? "";
    const firstPendingUsd = harvestInfo?.pendingUsd ?? 0;
    setReinvestHarvestSourcePosition(position);
    setReinvestHarvestToken(firstPendingToken);
    setReinvestHarvestAmount(firstPendingUsd > 0 ? firstPendingUsd.toFixed(2) : "");
    setReinvestHarvestTargetKey(posKey);
    setReinvestHarvestTargetToken(firstPendingToken);
    setErrorMessage("");
    setIsReinvestHarvestOpen(true);
  }

  async function saveReinvestHarvest() {
    if (!reinvestHarvestSourcePosition) return;
    const token = reinvestHarvestToken.trim().toUpperCase();
    const amount = Number(reinvestHarvestAmount.replace(",", "."));
    if (!token) { setErrorMessage("Indica el token a reinvertir."); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setErrorMessage("Indica la cantidad en USD a reinvertir."); return; }

    const targetInfo = baseDepositTargets.find((t) => t.key === reinvestHarvestTargetKey);
    if (!targetInfo) { setErrorMessage("Selecciona una posición destino."); return; }

    try {
      setErrorMessage("");
      setIsSavingReinvestHarvest(true);
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationType: "reinvest_harvest",
          portfolioId: reinvestHarvestSourcePosition.portfolioId,
          positionId: reinvestHarvestSourcePosition.positionId,
          protocol: reinvestHarvestSourcePosition.protocol,
          positionContextType: reinvestHarvestSourcePosition.positionType,
          tokenSymbol: token,
          amount,
          harvestSourcePositionId: reinvestHarvestSourcePosition.positionId,
          harvestSourceProtocol: reinvestHarvestSourcePosition.protocol,
          harvestTargetPositionId: targetInfo.positionId,
          harvestTargetProtocol: targetInfo.protocol,
          harvestTargetPositionType: targetInfo.positionType,
          harvestTargetTokenSymbol: reinvestHarvestTargetToken.trim().toUpperCase() || token,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Error al reinvertir harvest.");
      setIsReinvestHarvestOpen(false);
      setReinvestHarvestSourcePosition(null);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Error desconocido.");
    } finally {
      setIsSavingReinvestHarvest(false);
    }
  }

  async function saveQuickHarvest() {
    if (!quickHarvestPosition) return;
    const token = quickHarvestToken.trim().toUpperCase();
    const amount = Number(quickHarvestAmount.replace(",", "."));
    if (!token) { setErrorMessage("Indica el token del harvest."); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setErrorMessage("Indica la cantidad ganada en USD."); return; }

    const targetInfo = quickHarvestReinvest ? baseDepositTargets.find((t) => t.key === quickHarvestTargetKey) : null;

    try {
      setErrorMessage("");
      setIsSavingQuickHarvest(true);
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationType: "harvest",
          portfolioId: quickHarvestPosition.portfolioId,
          positionId: quickHarvestPosition.positionId,
          protocol: quickHarvestPosition.protocol,
          positionContextType: quickHarvestPosition.positionType,
          tokenSymbol: token,
          amount,
          harvestSourcePositionId: quickHarvestPosition.positionId,
          harvestSourceProtocol: quickHarvestPosition.protocol,
          harvestNoReinvest: !quickHarvestReinvest,
          harvestTargetPositionId: targetInfo?.positionId ?? quickHarvestPosition.positionId,
          harvestTargetProtocol: targetInfo?.protocol ?? quickHarvestPosition.protocol,
          harvestTargetPositionType: targetInfo?.positionType ?? quickHarvestPosition.positionType,
          harvestTargetTokenSymbol: quickHarvestReinvest ? quickHarvestTargetToken.trim().toUpperCase() : token,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Error al registrar harvest.");
      setIsQuickHarvestOpen(false);
      setQuickHarvestPosition(null);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Error desconocido.");
    } finally {
      setIsSavingQuickHarvest(false);
    }
  }

  function openEditModal(position: DefiPosition) {
    if (!viewer.canOperate) return;
    const isLp = position.positionType.toLowerCase().includes("liquidity") || position.positionType.toLowerCase().includes("pool");
    const tokens = position.tokenSymbol.split("/").map((t) => t.trim());
    setEditPosition(position);
    setEditForm({
      tokenSymbol: tokens[0] ?? position.tokenSymbol,
      amount: position.currentBalance > 0 ? String(position.currentBalance) : (position.balanceLabel?.split("+")[0]?.replace(/[^0-9.,]/g, "").trim() ?? ""),
      entryPrice: position.averageEntryPrice > 0 ? String(position.averageEntryPrice) : "",
      lpTokenSymbolB: isLp && tokens[1] ? tokens[1] : "",
      lpAmountB: isLp && position.balanceLabel ? (position.balanceLabel.split("+")[1]?.replace(/[^0-9.,]/g, "").trim() ?? "") : "",
      lpEntryPriceB: "",
      lpRangeLower: position.lpRangeLabel?.match(/Rango\s+([\d.,]+)/)?.[1]?.replace(",", "") ?? "",
      lpRangeUpper: position.lpRangeLabel?.match(/-\s+([\d.,]+)/)?.[1]?.replace(",", "") ?? "",
      isCorrelated: position.lpRangeStatus === "correlated",
    });
    setErrorMessage("");
    setEditModalTab("edit");
    setEditLendingAdjustType("add_collateral");
    setEditLendingToken("");
    setEditLendingAmount("");
    setIsEditModalOpen(true);
  }

  async function saveLendingAdjustFromEdit() {
    if (!editPosition) return;
    const token = editLendingToken.trim().toUpperCase();
    const amount = Number(editLendingAmount.replace(",", "."));
    if (!token) { setErrorMessage("Indica el token."); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setErrorMessage("Indica una cantidad válida."); return; }

    try {
      setErrorMessage("");
      setIsSavingLendingFromEdit(true);
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationType: "lending_adjust",
          portfolioId: editPosition.portfolioId,
          positionId: editPosition.positionId,
          protocol: editPosition.protocol,
          lendingAdjustType: editLendingAdjustType,
          lendingAdjustToken: token,
          lendingAdjustAmount: amount,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Error al ajustar posición lending.");
      setIsEditModalOpen(false);
      setEditPosition(null);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Error desconocido.");
    } finally {
      setIsSavingLendingFromEdit(false);
    }
  }

  async function saveEditPosition() {
    if (!editPosition) return;
    const isLp = editPosition.positionType.toLowerCase().includes("liquidity") || editPosition.positionType.toLowerCase().includes("pool");
    const amount = Number(editForm.amount.replace(",", "."));
    const entryPrice = Number(editForm.entryPrice.replace(",", "."));

    if (!Number.isFinite(amount) || amount < 0) {
      setErrorMessage("Cantidad inválida.");
      return;
    }
    if (!Number.isFinite(entryPrice) || entryPrice < 0) {
      setErrorMessage("Precio de entrada inválido.");
      return;
    }

    try {
      setErrorMessage("");
      setIsSavingEdit(true);
      const payload: Record<string, unknown> = {
        portfolioId: editPosition.portfolioId,
        protocol: editPosition.protocol,
        positionId: editPosition.positionId,
        positionType: editPosition.positionType,
        tokenSymbol: editForm.tokenSymbol.trim().toUpperCase(),
        amount,
        entryPrice,
      };

      if (isLp && editForm.lpTokenSymbolB) {
        payload.lpTokenSymbolB = editForm.lpTokenSymbolB.trim().toUpperCase();
        payload.lpAmountB = Number(editForm.lpAmountB.replace(",", ".")) || 0;
        payload.lpEntryPriceB = Number(editForm.lpEntryPriceB.replace(",", ".")) || 0;
        payload.lpRangeLower = Number(editForm.lpRangeLower.replace(",", ".")) || 0;
        payload.lpRangeUpper = Number(editForm.lpRangeUpper.replace(",", ".")) || 0;
        payload.isCorrelated = editForm.isCorrelated;
      }

      const response = await fetch("/api/positions/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo guardar la edición.");
      }

      setIsEditModalOpen(false);
      setEditPosition(null);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido al editar la posición.";
      setErrorMessage(message);
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function updateStrategyTag(pos: DefiPosition, newTag: string | null) {
    try {
      setErrorMessage("");
      const response = await fetch("/api/positions/tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioId: pos.portfolioId,
          protocol: pos.protocol,
          positionId: pos.positionId,
          strategyTag: newTag,
        }),
      });
      const body = (await response.json()) as { error?: string; hint?: string };
      if (!response.ok) {
        throw new Error(body.hint ? `${body.error} — ${body.hint}` : (body.error ?? "No se pudo actualizar la etiqueta."));
      }
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido actualizando etiqueta.";
      setErrorMessage(message);
    }
  }

  function exportCurrentReportPdf() {
    const html = buildPortfolioReportHtml({
      summary,
      sections,
      recentActivity,
      portfolioContext: portfolioContext
        ? {
            portfolioName: portfolioContext.portfolioName ?? null,
            clientName: portfolioContext.ownerName ?? null,
          }
        : null,
      generatedAt: new Date(),
    });

    try {
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.setAttribute("aria-hidden", "true");
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc || !iframe.contentWindow) {
        document.body.removeChild(iframe);
        setErrorMessage("No se pudo generar el reporte PDF en este navegador.");
        return;
      }

      doc.open();
      doc.write(html);
      doc.close();

      window.setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } finally {
          window.setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 1500);
        }
      }, 300);
    } catch {
      setErrorMessage("No se pudo generar el reporte PDF.");
    }
  }

  async function loadHistory() {
    if (isLoadingHistory) return;
    setIsLoadingHistory(true);
    try {
      const response = await fetch("/api/positions/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await response.json();
      const rows = (json.data ?? []) as Array<{
        token_in_symbol?: string;
        protocol?: string;
        position_id?: string;
        position_type?: string;
        transaction_date?: string;
        metadata?: { closure?: {
          totalDeposited?: number;
          valueAtClose?: number;
          realizedPnl?: number;
          reason?: string;
          closedAt?: string;
          destToken?: string;
        } };
      }>;
      setHistoryRows(
        rows
          .filter((r) => r.metadata?.closure)
          .map((r) => {
            const c = r.metadata!.closure!;
            return {
              tokenSymbol: r.token_in_symbol ?? "",
              protocol: r.protocol ?? "",
              positionId: r.position_id ?? "",
              positionType: r.position_type ?? "",
              closedAt: c.closedAt ?? r.transaction_date ?? "",
              reason: c.reason ?? "deleted",
              totalDeposited: c.totalDeposited ?? 0,
              valueAtClose: c.valueAtClose ?? 0,
              realizedPnl: c.realizedPnl ?? 0,
              destToken: c.destToken,
            };
          }),
      );
    } catch {
      setHistoryRows([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }

  function openHistoryModal() {
    setIsHistoryModalOpen(true);
    loadHistory();
  }

  async function exportTransactionsCsv() {
    setCsvErrorMessage("");

    if (!activePortfolioId) {
      setCsvErrorMessage("No se encontró portfolio activo para exportar.");
      return;
    }

    if (!csvStartDate || !csvEndDate) {
      setCsvErrorMessage("Debes seleccionar fecha inicio y fecha fin.");
      return;
    }

    if (csvStartDate > csvEndDate) {
      setCsvErrorMessage("La fecha inicio no puede ser mayor que la fecha fin.");
      return;
    }

    try {
      setIsExportingCsv(true);
      const query = new URLSearchParams({
        portfolioId: activePortfolioId,
        startDate: csvStartDate,
        endDate: csvEndDate,
      });

      const response = await fetch(`/api/transactions/export?${query.toString()}`, {
        method: "GET",
      });

      const body = (await response.json()) as { rows?: TransactionExportRow[]; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo exportar el CSV.");
      }

      const rows = body.rows ?? [];
      const headers = [
        "Fecha",
        "Tipo",
        "Origen movimiento",
        "Grupo operación",
        "Posición ID",
        "Protocolo",
        "Tokens implicados",
        "Token Entrada",
        "Cantidad Entrada",
        "Token Salida",
        "Cantidad Salida",
        "Precio de Entrada (Fiat)",
      ];

      const csvLines = [headers.map(escapeCsv).join(",")];

      for (const row of rows) {
        const tokenIn = row.token_in_symbol ?? "";
        const tokenOut = row.token_out_symbol ?? "";
        const tokensInvolved = [tokenIn, tokenOut].filter((token) => token.length > 0).join("/");
        const line = [
          row.transaction_date ?? "",
          row.type ?? "",
          row.movement_origin ?? "Operación estándar",
          row.operation_group_id ?? "",
          row.position_id ?? "",
          row.protocol ?? "",
          tokensInvolved,
          row.token_in_symbol ?? "",
          String(toNumber(row.token_in_amount)),
          row.token_out_symbol ?? "",
          String(toNumber(row.token_out_amount)),
          String(toNumber(row.spot_price)),
        ];

        csvLines.push(line.map(escapeCsv).join(","));
      }

      const filename = `operaciones_${csvStartDate}_${csvEndDate}.csv`;
      downloadTextFile(filename, csvLines.join("\n"), "text/csv;charset=utf-8;");
      closeCsvModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      setCsvErrorMessage(message);
    } finally {
      setIsExportingCsv(false);
    }
  }

  async function refreshPricesNow(manualPrices?: Array<{ symbol: string; price: number }>) {
    try {
      setErrorMessage("");
      setIsRefreshingPrices(true);
      const response = await fetch("/api/prices/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manualPrices ? { manualPrices } : {}),
      });
      const body = (await response.json()) as {
        error?: string;
        unmappedSymbols?: string[];
      };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudieron actualizar precios.");
      }
      const unmapped = (body.unmappedSymbols ?? []).filter((s) => s.length > 0);
      if (unmapped.length > 0 && !manualPrices) {
        setUnmappedTokens(unmapped);
        setManualPriceInputs({});
        setIsManualPriceModalOpen(true);
      } else {
        setUnmappedTokens([]);
        setIsManualPriceModalOpen(false);
      }
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido actualizando precios.";
      setErrorMessage(message);
    } finally {
      setIsRefreshingPrices(false);
    }
  }

  function submitManualPrices() {
    const prices = unmappedTokens
      .map((symbol) => {
        const raw = (manualPriceInputs[symbol] ?? "").replace(",", ".");
        const price = Number(raw);
        if (!Number.isFinite(price) || price <= 0) return null;
        return { symbol, price };
      })
      .filter((item): item is { symbol: string; price: number } => item !== null);

    if (prices.length === 0) {
      setErrorMessage("Introduce al menos un precio válido.");
      return;
    }
    setIsManualPriceModalOpen(false);
    refreshPricesNow(prices);
  }

  async function submitOperation() {
    setErrorMessage("");
    const effectivePortfolioId = form.portfolioId.trim() || activePortfolioId;
    const effectiveProtocol = form.protocol.trim() || "Wallet";

    if (form.operationType === "base_deposit") {
      if (!isCreateMode && !form.baseDepositTargetKey) {
        setErrorMessage("Selecciona una posición Hold existente o cambia a crear nueva.");
        return;
      }
      const target = scopedTargets.find((item) => item.key === form.baseDepositTargetKey);
      const targetType = (isCreateMode ? form.positionContextType : target?.positionType ?? "").toLowerCase();

      if (targetType.includes("liquidity") || targetType.includes("lp")) {
        const amountA = Number(form.amount);
        const amountB = Number(form.lpAmountB);
        if (!form.tokenSymbol.trim() || !form.lpTokenSymbolB.trim()) {
          setErrorMessage("Para aportar a LP debes indicar ambos tokens.");
          return;
        }
        if (!Number.isFinite(amountA) || amountA <= 0 || !Number.isFinite(amountB) || amountB <= 0) {
          setErrorMessage("Para aportar a LP debes indicar cantidades válidas para ambos tokens.");
          return;
        }
      } else if (targetType.includes("lending")) {
        const collateralAmount = Number(form.lendingCollateralAmount);
        const debtAmount = Number(form.lendingDebtAmount);
        if (form.baseDepositLendingMode === "collateral" || form.baseDepositLendingMode === "both") {
          if (!form.lendingCollateralToken.trim() || !Number.isFinite(collateralAmount) || collateralAmount <= 0) {
            setErrorMessage("En lending, para colateral necesitas token y cantidad válidos.");
            return;
          }
        }
        if (form.baseDepositLendingMode === "debt" || form.baseDepositLendingMode === "both") {
          if (!form.lendingDebtToken.trim() || !Number.isFinite(debtAmount) || debtAmount <= 0) {
            setErrorMessage("En lending, para deuda necesitas token y cantidad válidos.");
            return;
          }
        }
      } else {
        if (!form.baseDepositTokenSymbol.trim()) {
          setErrorMessage("Selecciona el token de la posición al que quieres añadir capital.");
          return;
        }
        const amount = Number(form.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          setErrorMessage("Debes indicar una cantidad válida.");
          return;
        }
      }
    }

    if (isScopedOperation && form.operationType !== "base_deposit" && !isCreateMode) {
      if (!form.baseDepositTargetKey) {
        setErrorMessage("Selecciona una posición existente para aumentar.");
        return;
      }
    }

    const amount = Number(form.amount);
    const needsTokenAndAmount = form.operationType === "staking";

    if (needsTokenAndAmount) {
      if (!form.tokenSymbol.trim() || !Number.isFinite(amount) || amount <= 0) {
        setErrorMessage("Debes indicar token y cantidad válidos.");
        return;
      }
    }
    const hasPortfolio = effectivePortfolioId.length > 0;
    const hasProtocol = effectiveProtocol.length > 0;
    if (!hasPortfolio || !hasProtocol) {
      setErrorMessage("Portfolio ID y protocolo son obligatorios.");
      return;
    }

    if (form.operationType === "harvest") {
      if (!form.harvestSourceKey || !form.positionId.trim()) {
        setErrorMessage("Harvest requiere una posición origen existente.");
        return;
      }
      if (!form.tokenSymbol.trim()) {
        setErrorMessage("Selecciona el token del harvest.");
        return;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        setErrorMessage("La cantidad de harvest debe ser positiva y en USD.");
        return;
      }

      if (!form.harvestTargetPositionId.trim() || !form.harvestTargetProtocol.trim() || !form.harvestTargetPositionType.trim()) {
        setErrorMessage("Harvest requiere posición destino para reinvertir.");
        return;
      }
      const targetType = form.harvestTargetPositionType.toLowerCase();
      if (targetType.includes("liquidity") || targetType.includes("lp")) {
        if (!form.harvestTargetTokenSymbol.trim() || !form.harvestTargetLpTokenSymbolB.trim()) {
          setErrorMessage("Para reinvertir en LP debes indicar ambos tokens.");
          return;
        }
      } else if (targetType.includes("lending")) {
        if (form.harvestTargetLendingMode === "collateral" || form.harvestTargetLendingMode === "both") {
          if (!form.harvestTargetCollateralToken.trim()) {
            setErrorMessage("Para reinvertir en lending (colateral) debes indicar token.");
            return;
          }
        }
        if (form.harvestTargetLendingMode === "debt" || form.harvestTargetLendingMode === "both") {
          if (!form.harvestTargetDebtToken.trim()) {
            setErrorMessage("Para reinvertir en lending (deuda) debes indicar token.");
            return;
          }
        }
      } else {
        if (!form.harvestTargetTokenSymbol.trim()) {
          setErrorMessage("Indica token a reinvertir.");
          return;
        }
      }
    }

    if (form.operationType === "rebalance") {
      const sourceAmount = Number(form.rebalanceSourceAmount);
      const sourceTarget = baseDepositTargets.find((item) => item.key === form.rebalanceSourceKey);
      const targetTarget = baseDepositTargets.find((item) => item.key === form.rebalanceTargetKey);
      const sourceType = (sourceTarget?.positionType ?? "").toLowerCase();
      const targetTypeRaw = form.rebalanceTargetIsNew
        ? form.rebalanceTargetNewPositionType
        : (targetTarget?.positionType ?? "");
      const targetType = targetTypeRaw.toLowerCase();
      if (!form.rebalanceSourceKey) {
        setErrorMessage("Selecciona la posición origen para el rebalanceo.");
        return;
      }
      if (!form.rebalanceTargetIsNew && !form.rebalanceTargetKey) {
        setErrorMessage("Selecciona destino o crea una posición nueva.");
        return;
      }
      if (form.rebalanceTargetIsNew && !form.rebalanceTargetNewProtocol.trim()) {
        setErrorMessage("Indica el protocolo de la nueva posición destino.");
        return;
      }
      if (sourceType.includes("liquidity") || sourceType.includes("lp")) {
        const sourceAmountB = Number(form.rebalanceSourceLpAmountB);
        if (!form.rebalanceSourceTokenSymbol.trim() || !form.rebalanceSourceLpTokenSymbolB.trim()) {
          setErrorMessage("Si el origen es LP, debes indicar los dos tokens de salida.");
          return;
        }
        if (!Number.isFinite(sourceAmount) || sourceAmount <= 0 || !Number.isFinite(sourceAmountB) || sourceAmountB <= 0) {
          setErrorMessage("Si el origen es LP, debes indicar cantidad válida para ambos tokens.");
          return;
        }
      } else {
        if (!form.rebalanceSourceTokenSymbol.trim()) {
          setErrorMessage("Selecciona token origen.");
          return;
        }
        if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) {
          setErrorMessage("La cantidad origen del rebalanceo debe ser positiva.");
          return;
        }
      }

      if (targetType.includes("liquidity") || targetType.includes("lp")) {
        if (!form.rebalanceTargetTokenSymbol.trim() || !form.rebalanceTargetLpTokenSymbolB.trim()) {
          setErrorMessage("Si el destino es LP, debes indicar los dos tokens de entrada.");
          return;
        }
        // Si los amounts están vacíos, usamos las sugerencias derivadas del split %.
        const resolvedA = Number(form.rebalanceTargetAmount) > 0 ? Number(form.rebalanceTargetAmount) : rebalancePreview.suggestedAmountA;
        const resolvedB = Number(form.rebalanceTargetLpAmountB) > 0 ? Number(form.rebalanceTargetLpAmountB) : rebalancePreview.suggestedAmountB;
        if (!Number.isFinite(resolvedA) || resolvedA <= 0 || !Number.isFinite(resolvedB) || resolvedB <= 0) {
          setErrorMessage("No se pudo calcular el split del LP destino. Revisa precios o ajusta el split manualmente.");
          return;
        }
      } else if (!form.rebalanceTargetTokenSymbol.trim()) {
        setErrorMessage("Selecciona token destino.");
        return;
      }
      if (rebalancePreview.usd <= 0 || rebalancePreview.targetAmount <= 0) {
        setErrorMessage("No se pudo calcular el valor USD del rebalanceo con los precios actuales.");
        return;
      }
    }

    if (form.operationType === "lending_borrow") {
      const collateralAmount = Number(form.lendingCollateralAmount);
      const debtAmount = Number(form.lendingDebtAmount);
      const hasCollateral = Number.isFinite(collateralAmount) && collateralAmount > 0;
      const hasDebt = Number.isFinite(debtAmount) && debtAmount > 0;

      if (!hasCollateral && !hasDebt) {
        setErrorMessage("Debes indicar al menos colateral o deuda.");
        return;
      }

      if (hasCollateral && !form.lendingCollateralToken.trim()) {
        setErrorMessage("Indica el token del colateral.");
        return;
      }

      if (hasDebt && !form.lendingDebtToken.trim()) {
        setErrorMessage("Indica el token de la deuda.");
        return;
      }
    }

    if (form.operationType === "liquidity_pool") {
      const amountA = Number(form.amount);
      const amountB = Number(form.lpAmountB);
      const rangeLower = Number(form.lpRangeLower);
      const rangeUpper = Number(form.lpRangeUpper);

      if (!form.tokenSymbol.trim() || !Number.isFinite(amountA) || amountA <= 0) {
        setErrorMessage("Para LP debes indicar Token A y cantidad A válidos.");
        return;
      }

      if (!form.lpTokenSymbolB.trim() || !Number.isFinite(amountB) || amountB <= 0) {
        setErrorMessage("Para LP debes indicar Token B y cantidad B válidos.");
        return;
      }

      if (
        !Number.isFinite(rangeLower) ||
        !Number.isFinite(rangeUpper) ||
        rangeLower <= 0 ||
        rangeUpper <= rangeLower
      ) {
        setErrorMessage("Rango LP inválido. Usa un mínimo positivo y un máximo mayor.");
        return;
      }
    }

    try {
      setIsSaving(true);
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationType: form.operationType,
          portfolioId: effectivePortfolioId,
          positionId: form.positionId,
          protocol: effectiveProtocol,
          transactionDate: form.transactionDate || undefined,
          spotPricesBySymbol: parseManualSpotPrices(form.manualSpotPrices),
          positionContextType: form.positionContextType,
          tokenSymbol:
            form.operationType === "base_deposit"
              ? (form.baseDepositTokenSymbol || form.tokenSymbol)
              : form.tokenSymbol,
          amount: Number(form.amount || 0),
          baseDepositLendingMode: form.baseDepositLendingMode,
          harvestReinvest: true,
          harvestSourcePositionId: form.positionId,
          harvestSourceProtocol: effectiveProtocol,
          harvestTargetPositionType: form.harvestTargetPositionType,
          harvestTargetTokenSymbol: form.harvestTargetTokenSymbol,
          harvestTargetAmount: Number(form.harvestTargetAmount || 0),
          harvestTargetLpTokenSymbolB: form.harvestTargetLpTokenSymbolB,
          harvestTargetLpAmountB: Number(form.harvestTargetLpAmountB || 0),
          harvestTargetLendingMode: form.harvestTargetLendingMode,
          harvestTargetCollateralToken: form.harvestTargetCollateralToken,
          harvestTargetCollateralAmount: Number(form.harvestTargetCollateralAmount || 0),
          harvestTargetDebtToken: form.harvestTargetDebtToken,
          harvestTargetDebtAmount: Number(form.harvestTargetDebtAmount || 0),
          harvestTargetPositionId: form.harvestTargetPositionId,
          harvestTargetProtocol: form.harvestTargetProtocol,
          rebalanceSourcePositionId: baseDepositTargets.find((item) => item.key === form.rebalanceSourceKey)?.positionId,
          rebalanceSourceProtocol: baseDepositTargets.find((item) => item.key === form.rebalanceSourceKey)?.protocol,
          rebalanceSourcePositionType: baseDepositTargets.find((item) => item.key === form.rebalanceSourceKey)?.positionType,
          rebalanceSourceTokenSymbol: form.rebalanceSourceTokenSymbol,
          rebalanceSourceAmount: Number(form.rebalanceSourceAmount || 0),
          rebalanceSourceLpTokenSymbolB: form.rebalanceSourceLpTokenSymbolB,
          rebalanceSourceLpAmountB: Number(form.rebalanceSourceLpAmountB || 0),
          rebalanceTargetIsNew: form.rebalanceTargetIsNew,
          rebalanceTargetPositionId: form.rebalanceTargetIsNew
            ? undefined
            : baseDepositTargets.find((item) => item.key === form.rebalanceTargetKey)?.positionId,
          rebalanceTargetProtocol: form.rebalanceTargetIsNew
            ? form.rebalanceTargetNewProtocol
            : baseDepositTargets.find((item) => item.key === form.rebalanceTargetKey)?.protocol,
          rebalanceTargetPositionType: form.rebalanceTargetIsNew
            ? form.rebalanceTargetNewPositionType
            : baseDepositTargets.find((item) => item.key === form.rebalanceTargetKey)?.positionType,
          rebalanceTargetTokenSymbol: form.rebalanceTargetTokenSymbol,
          rebalanceTargetAmount:
            Number(form.rebalanceTargetAmount) > 0
              ? Number(form.rebalanceTargetAmount)
              : (rebalancePreview.isTargetLp ? rebalancePreview.suggestedAmountA : 0),
          rebalanceTargetLpTokenSymbolB: form.rebalanceTargetLpTokenSymbolB,
          rebalanceTargetLpAmountB:
            Number(form.rebalanceTargetLpAmountB) > 0
              ? Number(form.rebalanceTargetLpAmountB)
              : (rebalancePreview.isTargetLp ? rebalancePreview.suggestedAmountB : 0),
          // Harvest pendiente del LP origen — se incluye en el destino para
          // preservar el total del portfolio (ya estaba contabilizado).
          rebalanceSourceHarvestTokens:
            rebalancePreview.harvestPendingUsd > 0
              ? rebalancePreview.harvestPendingTokens.map((h) => ({
                  tokenSymbol: h.tokenSymbol,
                  amount: h.amount,
                  spotPriceUsd: h.priceUsd,
                }))
              : undefined,
          lendingCollateralToken: form.lendingCollateralToken,
          lendingCollateralAmount: Number(form.lendingCollateralAmount || 0),
          lendingDebtToken: form.lendingDebtToken,
          lendingDebtAmount: Number(form.lendingDebtAmount || 0),
          lpTokenSymbolB: form.lpTokenSymbolB,
          lpAmountB: Number(form.lpAmountB || 0),
          lpRangeLower: Number(form.lpRangeLower || 0),
          lpRangeUpper: Number(form.lpRangeUpper || 0),
          isCorrelated: form.isCorrelated,
        }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "No se pudo registrar la operación.");
      }

      closeModal();
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  }



  return (
    <main className="page-shell">
      <div className="bg-orb -top-20 -left-20 h-72 w-72 bg-[rgba(41,234,217,0.07)]" aria-hidden="true" />
      <div className="bg-orb top-28 right-0 h-80 w-80 bg-[rgba(102,255,241,0.05)]" aria-hidden="true" />

      <section className="page-content">
        <DashboardHeader
          summary={summary}
          portfolioContext={portfolioContext}
          viewer={viewer}
          pricesLastUpdatedAt={pricesLastUpdatedAt}
          isRefreshingPrices={isRefreshingPrices}
          refreshPricesNow={refreshPricesNow}
          exportCurrentReportPdf={exportCurrentReportPdf}
          openHistoryModal={openHistoryModal}
          compositionStyles={compositionStyles}
          openModal={openModal}
        />

        <HealthFactorAlertBanner sections={sections} />

        <StrategyComposition sections={sections} />

        <PortfolioEvolutionChart portfolioId={portfolioContext?.portfolioId ?? ""} />

        {lastDeletedPosition ? (
          <section className="rounded-2xl border border-[rgba(245,158,11,0.45)] bg-[rgba(245,158,11,0.12)] px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>
                Posición eliminada: <span className="font-medium">{lastDeletedPosition.label}</span>.
              </p>
              {lastDeletedPosition.canUndo ? (
                <button
                  type="button"
                  onClick={undoDeletePosition}
                  className="rounded-lg border border-[rgba(245,158,11,0.55)] bg-[rgba(245,158,11,0.2)] px-3 py-1.5 text-xs font-medium transition hover:bg-[rgba(245,158,11,0.32)]"
                >
                  Deshacer
                </button>
              ) : (
                <span className="text-xs text-[var(--muted)]">No se puede deshacer (modo legado).</span>
              )}
            </div>
          </section>
        ) : null}

        {sections.length === 0 ? (
          <section className="card-premium page-section-card text-center">
            <p className="text-sm text-[var(--muted)]">
              No hay posiciones activas (`is_active = true`) en `defi_positions_analytics` para este usuario.
            </p>
          </section>
        ) : (
          sections.map((section) => (
            <PositionSectionCard
              key={section.key}
              section={section}
              summary={summary}
              viewer={viewer}
              harvestByPosition={harvestByPosition}
              isDeletingPositionKey={isDeletingPositionKey}
              positionCompositeUiKey={positionCompositeUiKey}
              openEditModal={openEditModal}
              deletePosition={deletePosition}
              openQuickHarvest={openQuickHarvest}
              openReinvestHarvest={openReinvestHarvest}
              onChangeStrategyTag={updateStrategyTag}
            />
          ))
        )}

        <OnchainLivePanel portfolioId={(portfolioContext?.portfolioId ?? "").trim()} />

        <RecentActivity
          recentActivity={recentActivity}
          visibleRecentActivity={visibleRecentActivity}
          visibleRecentActivityCount={visibleRecentActivityCount}
          setIsCsvModalOpen={setIsCsvModalOpen}
          setVisibleRecentActivityCount={setVisibleRecentActivityCount}
          canUndo={viewer.canDeletePosition}
          undoingKey={undoingKey}
          onUndo={undoOperation}
        />

        <Link
          href={`/fiscal${portfolioContext?.portfolioId ? `?portfolio=${portfolioContext.portfolioId}` : ""}`}
          className="group flex items-center justify-between gap-4 rounded-2xl border border-[rgba(160,210,255,0.28)] bg-[rgba(160,210,255,0.06)] px-5 py-4 transition-colors hover:border-[rgba(160,210,255,0.5)] hover:bg-[rgba(160,210,255,0.1)]"
        >
          <div className="flex items-center gap-3.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(160,210,255,0.3)] bg-[rgba(160,210,255,0.1)] text-[#A0D2FF]">
              <Scale className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[var(--foreground)]">Trazabilidad fiscal</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Operaciones por casilla AEAT, base del ahorro/general, Modelo 721 y exportación CSV.
              </p>
            </div>
          </div>
          <span className="flex items-center gap-1 text-xs font-medium text-[#A0D2FF]">
            Abrir
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </section>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="card-premium flex w-full max-w-2xl flex-col rounded-2xl" style={{ maxHeight: "90vh" }}>
            {/* Header fijo */}
            <div className="flex flex-shrink-0 items-start justify-between border-b border-[var(--line)] px-6 py-4">
              <div>
                <h3 className="text-xl font-semibold">Nueva Operación</h3>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  Elige el tipo y rellena los campos — solo aparecen los relevantes.
                </p>
              </div>
              <button type="button" onClick={closeModal} className="rounded-lg p-1 text-[var(--muted)] hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Cuerpo con scroll interno */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="grid gap-4">
              {/* Fila 1: tipo + fecha en 2 columnas */}
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="mb-1 block text-[var(--muted)]">Tipo de operación</span>
                  <select
                    value={form.operationType}
                    onChange={(event) => {
                      const nextOperationType = event.target.value as OperationType;
                      setForm((prev) => ({
                        ...prev,
                        operationType: nextOperationType,
                        operationScope:
                          nextOperationType === "harvest" || nextOperationType === "rebalance"
                            ? "increase_existing"
                            : prev.operationScope,
                        positionContextType: defaultPositionContextType(nextOperationType),
                        baseDepositTargetKey: "",
                      }));
                    }}
                    className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                  >
                    <option value="base_deposit">Hold</option>
                    <option value="harvest">Harvest</option>
                    <option value="rebalance">Rebalanceo</option>
                    <option value="staking">Staking</option>
                    <option value="lending_borrow">Lending / Borrow</option>
                    <option value="liquidity_pool">Liquidity Pool (V3)</option>
                  </select>
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-[var(--muted)]">Fecha y hora</span>
                  <input
                    type="datetime-local"
                    value={form.transactionDate}
                    onChange={(event) => setForm((prev) => ({ ...prev, transactionDate: event.target.value }))}
                    className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                  />
                </label>
              </div>

              {isScopedOperation ? (
                <label className="text-sm">
                  <span className="mb-1 block text-[var(--muted)]">¿Qué quieres hacer?</span>
                  <select
                    value={form.operationScope}
                    onChange={(event) => {
                      const nextScope = event.target.value as OperationScope;
                      setForm((prev) => ({
                        ...prev,
                        operationScope: nextScope,
                        baseDepositTargetKey: "",
                        positionId: nextScope === "create_new" ? "" : prev.positionId,
                        positionContextType: defaultPositionContextType(prev.operationType),
                      }));
                    }}
                    className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                  >
                    <option value="increase_existing">Aumentar posición existente</option>
                    <option value="create_new">Crear posición nueva</option>
                  </select>
                </label>
              ) : null}

              {form.operationType !== "harvest" && form.operationType !== "rebalance" ? (
                <div className="grid gap-3">
                  <p className="text-xs text-[var(--muted)]">
                    El portfolio y la posición se infieren automáticamente de tu selección.
                  </p>
                  <label className="text-sm">
                    <span className="mb-1 block text-[var(--muted)]">Protocol</span>
                    <input
                      value={form.protocol}
                      onChange={(event) => setForm((prev) => ({ ...prev, protocol: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                      placeholder="Wallet, Aave, Lido, Uniswap..."
                    />
                  </label>
                </div>
              ) : null}

              {manualPriceSymbols.length > 0 ? (
                <div className="rounded-xl border border-[rgba(14,165,233,0.3)] bg-[rgba(14,165,233,0.08)] p-3">
                  <p className="mb-2 text-xs text-[var(--muted)]">
                    Precio de compra manual (opcional). Si no lo rellenas, usamos el precio actual en caché.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {manualPriceSymbols.map((symbol) => (
                      <label key={symbol} className="text-sm">
                        <span className="mb-1 block text-[var(--muted)]">Precio {symbol} (USD)</span>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={form.manualSpotPrices[symbol] ?? ""}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              manualSpotPrices: { ...prev.manualSpotPrices, [symbol]: event.target.value },
                            }))
                          }
                          className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                          placeholder="Ej: 42650.25"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {isScopedOperation ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {form.operationType === "base_deposit" && !isCreateMode ? (
                    <label className="text-sm">
                      <span className="mb-1 block text-[var(--muted)]">Posición Hold existente</span>
                      <select
                        value={form.baseDepositTargetKey}
                        onChange={(event) => {
                          const nextKey = event.target.value;
                          const target = scopedTargets.find((item) => item.key === nextKey);
                          const defaultToken = target?.availableTokens[0] ?? "";
                          const secondToken = target?.availableTokens[1] ?? "";
                          setForm((prev) => ({
                            ...prev,
                            baseDepositTargetKey: nextKey,
                            portfolioId: target?.portfolioId ?? prev.portfolioId,
                            positionId: target?.positionId ?? prev.positionId,
                            protocol: target?.protocol ?? prev.protocol,
                            positionContextType: target?.positionType ?? prev.positionContextType,
                            tokenSymbol: defaultToken || prev.tokenSymbol,
                            baseDepositTokenSymbol: defaultToken || prev.baseDepositTokenSymbol,
                            lpTokenSymbolB: secondToken || prev.lpTokenSymbolB,
                            baseDepositLendingMode: "collateral",
                          }));
                        }}
                        className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                      >
                        <option value="">Selecciona una posición Hold</option>
                        {scopedTargets.map((target) => (
                          <option key={target.key} value={target.key}>
                            {target.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {form.operationType === "base_deposit" ? (
                    <>
                      {(() => {
                        const target = scopedTargets.find((item) => item.key === form.baseDepositTargetKey);
                        const targetType = (
                          isCreateMode
                            ? form.positionContextType
                            : target?.positionType ?? ""
                        ).toLowerCase();
                        if (targetType.includes("liquidity") || targetType.includes("lp")) {
                          return (
                            <>
                              <label className="text-sm">
                                <span className="mb-1 block text-[var(--muted)]">Token A</span>
                                <input
                                  value={form.baseDepositTokenSymbol}
                                  onChange={(event) =>
                                    setForm((prev) => ({
                                      ...prev,
                                      baseDepositTokenSymbol: event.target.value.toUpperCase(),
                                      tokenSymbol: event.target.value.toUpperCase(),
                                    }))
                                  }
                                  className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                                  placeholder="ETH"
                                />
                              </label>
                              <label className="text-sm">
                                <span className="mb-1 block text-[var(--muted)]">Cantidad Token A</span>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={form.amount}
                                  onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                                  className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                                  placeholder="0.00"
                                />
                              </label>
                              <label className="text-sm">
                                <span className="mb-1 block text-[var(--muted)]">Token B</span>
                                <input
                                  value={form.lpTokenSymbolB}
                                  onChange={(event) =>
                                    setForm((prev) => ({ ...prev, lpTokenSymbolB: event.target.value.toUpperCase() }))
                                  }
                                  className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                                  placeholder="USDC"
                                />
                              </label>
                              <label className="text-sm">
                                <span className="mb-1 block text-[var(--muted)]">Cantidad Token B</span>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={form.lpAmountB}
                                  onChange={(event) => setForm((prev) => ({ ...prev, lpAmountB: event.target.value }))}
                                  className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                                  placeholder="0.00"
                                />
                              </label>
                            </>
                          );
                        }
                        if (targetType.includes("lending")) {
                          return (
                            <>
                              <label className="text-sm sm:col-span-2">
                                <span className="mb-1 block text-[var(--muted)]">Operación Lending</span>
                                <select
                                  value={form.baseDepositLendingMode}
                                  onChange={(event) =>
                                    setForm((prev) => ({
                                      ...prev,
                                      baseDepositLendingMode: event.target.value as BaseDepositLendingMode,
                                    }))
                                  }
                                  className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                                >
                                  <option value="collateral">Añadir colateral</option>
                                  <option value="debt">Pedir préstamo</option>
                                  <option value="both">Colateral + préstamo</option>
                                </select>
                              </label>
                              {form.baseDepositLendingMode !== "debt" ? (
                                <>
                                  <label className="text-sm">
                                    <span className="mb-1 block text-[var(--muted)]">Token colateral</span>
                                    <input
                                      value={form.lendingCollateralToken}
                                      onChange={(event) =>
                                        setForm((prev) => ({ ...prev, lendingCollateralToken: event.target.value.toUpperCase() }))
                                      }
                                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                                      placeholder="ETH"
                                    />
                                  </label>
                                  <label className="text-sm">
                                    <span className="mb-1 block text-[var(--muted)]">Cantidad colateral</span>
                                    <input
                                      type="number"
                                      step="any"
                                      min="0"
                                      value={form.lendingCollateralAmount}
                                      onChange={(event) => setForm((prev) => ({ ...prev, lendingCollateralAmount: event.target.value }))}
                                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                                      placeholder="0.00"
                                    />
                                  </label>
                                </>
                              ) : null}
                              {form.baseDepositLendingMode !== "collateral" ? (
                                <>
                                  <label className="text-sm">
                                    <span className="mb-1 block text-[var(--muted)]">Token deuda</span>
                                    <input
                                      value={form.lendingDebtToken}
                                      onChange={(event) =>
                                        setForm((prev) => ({ ...prev, lendingDebtToken: event.target.value.toUpperCase() }))
                                      }
                                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                                      placeholder="USDC"
                                    />
                                  </label>
                                  <label className="text-sm">
                                    <span className="mb-1 block text-[var(--muted)]">Cantidad deuda</span>
                                    <input
                                      type="number"
                                      step="any"
                                      min="0"
                                      value={form.lendingDebtAmount}
                                      onChange={(event) => setForm((prev) => ({ ...prev, lendingDebtAmount: event.target.value }))}
                                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                                      placeholder="0.00"
                                    />
                                  </label>
                                </>
                              ) : null}
                            </>
                          );
                        }
                        return (
                          <>
                            <label className="text-sm">
                              <span className="mb-1 block text-[var(--muted)]">
                                {isCreateMode ? "Token de la nueva posición" : "Token dentro de la posición"}
                              </span>
                              {isCreateMode ? (
                                <input
                                  value={form.baseDepositTokenSymbol}
                                  onChange={(event) =>
                                    setForm((prev) => ({
                                      ...prev,
                                      baseDepositTokenSymbol: event.target.value.toUpperCase(),
                                      tokenSymbol: event.target.value.toUpperCase(),
                                    }))
                                  }
                                  className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                                  placeholder="BTC, ETH..."
                                />
                              ) : (
                                <select
                                  value={form.baseDepositTokenSymbol}
                                  onChange={(event) =>
                                    setForm((prev) => ({
                                      ...prev,
                                      baseDepositTokenSymbol: event.target.value.toUpperCase(),
                                      tokenSymbol: event.target.value.toUpperCase(),
                                    }))
                                  }
                                  className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                                  disabled={!form.baseDepositTargetKey}
                                >
                                  <option value="">Selecciona token</option>
                                  {(target?.availableTokens ?? []).map((token) => (
                                    <option key={token} value={token}>
                                      {token}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </label>
                            <label className="text-sm">
                              <span className="mb-1 block text-[var(--muted)]">
                                Cantidad ({form.baseDepositTokenSymbol || "token"})
                              </span>
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={form.amount}
                                onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                                className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                                placeholder="0.00"
                              />
                            </label>
                          </>
                        );
                      })()}
                    </>
                  ) : (
                    <>
                      {!isCreateMode ? (
                        <label className="text-sm sm:col-span-2">
                          <span className="mb-1 block text-[var(--muted)]">Posición existente</span>
                          <select
                            value={form.baseDepositTargetKey}
                            onChange={(event) => {
                              const target = scopedTargets.find((item) => item.key === event.target.value);
                              const firstToken = target?.availableTokens[0] ?? "";
                              setForm((prev) => ({
                                ...prev,
                                baseDepositTargetKey: event.target.value,
                                portfolioId: target?.portfolioId ?? prev.portfolioId,
                                positionId: target?.positionId ?? prev.positionId,
                                protocol: target?.protocol ?? prev.protocol,
                                positionContextType: target?.positionType ?? prev.positionContextType,
                                tokenSymbol: firstToken || prev.tokenSymbol,
                              }));
                            }}
                            className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                          >
                            <option value="">Selecciona una posición existente</option>
                            {scopedTargets.map((target) => (
                              <option key={target.key} value={target.key}>
                                {target.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {form.operationType === "staking" ? (
                        <label className="text-sm">
                          <span className="mb-1 block text-[var(--muted)]">Token</span>
                          <input
                            value={form.tokenSymbol}
                            onChange={(event) =>
                              setForm((prev) => ({ ...prev, tokenSymbol: event.target.value.toUpperCase() }))
                            }
                            className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                            placeholder="BTC, ETH..."
                          />
                        </label>
                      ) : null}
                    </>
                  )}
                  {form.operationType === "staking" ? (
                    <label className="text-sm">
                      <span className="mb-1 block text-[var(--muted)]">Cantidad</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={form.amount}
                        onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                        className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                        placeholder="0.00"
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}

              {form.operationType === "harvest" ? (
                <div className="space-y-3 rounded-xl border border-[rgba(16,185,129,0.25)] bg-[rgba(16,185,129,0.06)] p-3">
                  <p className="text-xs text-[var(--muted)]">
                    Registra el yield ganado (USD). La app reinvierte automáticamente el 100% de ese valor en la posición destino.
                  </p>
                  <label className="text-sm">
                    <span className="mb-1 block text-[var(--muted)]">Posición origen del harvest</span>
                    <select
                      value={form.harvestSourceKey}
                        onChange={(event) => {
                          const source = harvestSourceTargets.find((item) => item.key === event.target.value);
                          const next = source?.details;
                          const defaultToken = next?.pendingByToken[0]?.tokenSymbol ?? "";
                          setForm((prev) => ({
                            ...prev,
                            harvestSourceKey: event.target.value,
                            portfolioId: next?.portfolioId ?? prev.portfolioId,
                            protocol: next?.protocol ?? prev.protocol,
                            positionId: next?.positionId ?? prev.positionId,
                            tokenSymbol: defaultToken || prev.tokenSymbol,
                          }));
                        }}
                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                    >
                      <option value="">Selecciona posición origen</option>
                      {harvestSourceTargets.map((source) => (
                        <option key={source.key} value={source.key}>
                          {source.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {(() => {
                    const source = harvestSourceTargets.find((item) => item.key === form.harvestSourceKey)?.details;
                    if (!source) return null;
                    const pendingLabel = source.pendingByToken
                      .map((token) => `${token.amount.toLocaleString("en-US")} ${token.tokenSymbol}`)
                      .join(" + ");
                    return (
                      <p className="text-xs text-[var(--muted)]">
                        Histórico harvest: {currency(source.harvestedUsd)} · Pendiente: {currency(source.pendingUsd)}{pendingLabel ? ` (${pendingLabel})` : ""}
                      </p>
                    );
                  })()}

                  <div className="grid gap-3 sm:grid-cols-2">
                    {((harvestSourceTargets.find((item) => item.key === form.harvestSourceKey)?.details.pendingByToken ?? []).length > 0) ? (
                      <label className="text-sm">
                        <span className="mb-1 block text-[var(--muted)]">Token del harvest</span>
                        <select
                          value={form.tokenSymbol}
                          onChange={(event) => setForm((prev) => ({ ...prev, tokenSymbol: event.target.value.toUpperCase() }))}
                          className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                        >
                          <option value="">Selecciona token</option>
                          {(
                            harvestSourceTargets.find((item) => item.key === form.harvestSourceKey)?.details.pendingByToken ??
                            []
                          ).map((token) => (
                            <option key={token.tokenSymbol} value={token.tokenSymbol}>
                              {token.tokenSymbol}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label className="text-sm">
                        <span className="mb-1 block text-[var(--muted)]">Token del harvest</span>
                        <input
                          value={form.tokenSymbol}
                          onChange={(event) => setForm((prev) => ({ ...prev, tokenSymbol: event.target.value.toUpperCase() }))}
                          className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                          placeholder="ARB, OP, ETH..."
                        />
                      </label>
                    )}
                    <label className="text-sm">
                      <span className="mb-1 block text-[var(--muted)]">Cantidad ganada (USD)</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={form.amount}
                        onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                        className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                        placeholder="15.00"
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm sm:col-span-2">
                        <span className="mb-1 block text-[var(--muted)]">Posición destino para reinversión</span>
                        <select
                          value={form.harvestTargetKey}
                          onChange={(event) => {
                            const target = baseDepositTargets.find((item) => item.key === event.target.value);
                            setForm((prev) => ({
                              ...prev,
                              harvestTargetKey: event.target.value,
                              harvestTargetPositionId: target?.positionId ?? "",
                              harvestTargetProtocol: target?.protocol ?? "",
                              harvestTargetPositionType: target?.positionType ?? "",
                              harvestTargetTokenSymbol: target?.availableTokens[0] ?? "",
                              harvestTargetLpTokenSymbolB: target?.availableTokens[1] ?? "",
                            }));
                          }}
                          className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                        >
                          <option value="">Selecciona posición destino</option>
                          {baseDepositTargets.map((target) => (
                            <option key={target.key} value={target.key}>
                              {target.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {(() => {
                        const targetType = form.harvestTargetPositionType.toLowerCase();
                        if (targetType.includes("liquidity") || targetType.includes("lp")) {
                          return (
                            <>
                              <label className="text-sm">
                                <span className="mb-1 block text-[var(--muted)]">Token A</span>
                                <input
                                  value={form.harvestTargetTokenSymbol}
                                  onChange={(event) => setForm((prev) => ({ ...prev, harvestTargetTokenSymbol: event.target.value.toUpperCase() }))}
                                  className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                                />
                              </label>
                              <label className="text-sm">
                                <span className="mb-1 block text-[var(--muted)]">Proporción A (opcional)</span>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={form.harvestTargetAmount}
                                  onChange={(event) => setForm((prev) => ({ ...prev, harvestTargetAmount: event.target.value }))}
                                  className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                                  placeholder="Proporción opcional (ej: 1)"
                                />
                              </label>
                              <label className="text-sm">
                                <span className="mb-1 block text-[var(--muted)]">Token B</span>
                                <input
                                  value={form.harvestTargetLpTokenSymbolB}
                                  onChange={(event) =>
                                    setForm((prev) => ({ ...prev, harvestTargetLpTokenSymbolB: event.target.value.toUpperCase() }))
                                  }
                                  className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                                />
                              </label>
                              <label className="text-sm">
                                <span className="mb-1 block text-[var(--muted)]">Proporción B (opcional)</span>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={form.harvestTargetLpAmountB}
                                  onChange={(event) => setForm((prev) => ({ ...prev, harvestTargetLpAmountB: event.target.value }))}
                                  className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                                  placeholder="Proporción opcional (ej: 1)"
                                />
                              </label>
                            </>
                          );
                        }
                        if (targetType.includes("lending")) {
                          return (
                            <>
                              <label className="text-sm sm:col-span-2">
                                <span className="mb-1 block text-[var(--muted)]">Modo reinversión lending</span>
                                <select
                                  value={form.harvestTargetLendingMode}
                                  onChange={(event) =>
                                    setForm((prev) => ({
                                      ...prev,
                                      harvestTargetLendingMode: event.target.value as HarvestReinvestLendingMode,
                                    }))
                                  }
                                  className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                                >
                                  <option value="collateral">Añadir colateral</option>
                                  <option value="debt">Pedir deuda</option>
                                  <option value="both">Ambos</option>
                                </select>
                              </label>
                              {form.harvestTargetLendingMode !== "debt" ? (
                                <>
                                  <label className="text-sm">
                                    <span className="mb-1 block text-[var(--muted)]">Token colateral</span>
                                    <input
                                      value={form.harvestTargetCollateralToken}
                                      onChange={(event) =>
                                        setForm((prev) => ({ ...prev, harvestTargetCollateralToken: event.target.value.toUpperCase() }))
                                      }
                                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                                    />
                                  </label>
                                  <label className="text-sm">
                                    <span className="mb-1 block text-[var(--muted)]">Proporción colateral (opcional)</span>
                                    <input
                                      type="number"
                                      step="any"
                                      min="0"
                                      value={form.harvestTargetCollateralAmount}
                                      onChange={(event) =>
                                        setForm((prev) => ({ ...prev, harvestTargetCollateralAmount: event.target.value }))
                                      }
                                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                                      placeholder="Proporción opcional (ej: 1)"
                                    />
                                  </label>
                                </>
                              ) : null}
                              {form.harvestTargetLendingMode !== "collateral" ? (
                                <>
                                  <label className="text-sm">
                                    <span className="mb-1 block text-[var(--muted)]">Token deuda</span>
                                    <input
                                      value={form.harvestTargetDebtToken}
                                      onChange={(event) =>
                                        setForm((prev) => ({ ...prev, harvestTargetDebtToken: event.target.value.toUpperCase() }))
                                      }
                                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                                    />
                                  </label>
                                  <label className="text-sm">
                                    <span className="mb-1 block text-[var(--muted)]">Proporción deuda (opcional)</span>
                                    <input
                                      type="number"
                                      step="any"
                                      min="0"
                                      value={form.harvestTargetDebtAmount}
                                      onChange={(event) => setForm((prev) => ({ ...prev, harvestTargetDebtAmount: event.target.value }))}
                                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                                      placeholder="Proporción opcional (ej: 1)"
                                    />
                                  </label>
                                </>
                              ) : null}
                            </>
                          );
                        }
                        return (
                          <>
                            <label className="text-sm sm:col-span-2">
                              <span className="mb-1 block text-[var(--muted)]">Token a reinvertir</span>
                              <input
                                value={form.harvestTargetTokenSymbol}
                                onChange={(event) => setForm((prev) => ({ ...prev, harvestTargetTokenSymbol: event.target.value.toUpperCase() }))}
                                className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                              />
                            </label>
                            <p className="text-xs text-[var(--muted)] sm:col-span-2">
                              La cantidad de tokens se calcula automáticamente con el precio actual del token destino.
                            </p>
                          </>
                        );
                      })()}
                    </div>
                </div>
              ) : null}

              {form.operationType === "rebalance" ? (
                <div className="grid gap-3 rounded-xl border border-[rgba(87,239,255,0.25)] bg-[rgba(87,239,255,0.08)] p-3 sm:grid-cols-2">
                  <p className="col-span-full text-xs text-[var(--muted)]">
                    Rebalanceo: mueve valor de una posición origen a una posición destino usando precios actuales.
                  </p>
                  <label className="text-sm sm:col-span-2">
                    <span className="mb-1 block text-[var(--muted)]">Posición origen</span>
                    <select
                      value={form.rebalanceSourceKey}
                      onChange={(event) => {
                        const key = event.target.value;
                        const source = baseDepositTargets.find((item) => item.key === key);
                        const sourceType = (source?.positionType ?? "").toLowerCase();
                        const isLpSrc = sourceType.includes("liquidity") || sourceType.includes("lp");
                        // NO auto-rellenamos con el saldo completo: en un rebalanceo
                        // parcial eso obligaba a borrar y reescribir. El usuario indica
                        // cuánto quiere mover; el botón "Usar saldo completo" cubre el
                        // caso de cerrar la posición en un clic.
                        setForm((prev) => ({
                          ...prev,
                          rebalanceSourceKey: key,
                          rebalanceSourceTokenSymbol: source?.availableTokens[0] ?? "",
                          rebalanceSourceLpTokenSymbolB: isLpSrc ? source?.availableTokens[1] ?? "" : "",
                          rebalanceSourceAmount: "",
                          rebalanceSourceLpAmountB: "",
                          portfolioId: source?.portfolioId ?? prev.portfolioId,
                        }));
                      }}
                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                    >
                      <option value="">Selecciona origen</option>
                      {baseDepositTargets.map((target) => (
                        <option key={target.key} value={target.key}>
                          {target.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {/* Capital disponible de la posición origen + atajo "Usar saldo completo" */}
                  {form.rebalanceSourceKey ? (() => {
                    const srcPos = positionByKey.get(form.rebalanceSourceKey);
                    if (!srcPos) return null;
                    const src = baseDepositTargets.find((item) => item.key === form.rebalanceSourceKey);
                    const sourceType = (src?.positionType ?? "").toLowerCase();
                    const isLpSrc = sourceType.includes("liquidity") || sourceType.includes("lp");
                    const availableUsd = srcPos.currentValue;
                    const fillFullBalance = () => {
                      let autoAmountA = "";
                      let autoAmountB = "";
                      if (isLpSrc) {
                        const parts = (srcPos.balanceLabel ?? "").split("+");
                        autoAmountA = parts[0]?.replace(/[^0-9.]/g, "").trim() ?? "";
                        autoAmountB = parts[1]?.replace(/[^0-9.]/g, "").trim() ?? "";
                      } else {
                        autoAmountA = srcPos.currentBalance > 0 ? String(srcPos.currentBalance) : "";
                      }
                      setForm((prev) => ({
                        ...prev,
                        rebalanceSourceAmount: autoAmountA,
                        rebalanceSourceLpAmountB: autoAmountB,
                      }));
                    };
                    return (
                      <div className="col-span-full flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[rgba(160,210,255,0.25)] bg-[rgba(160,210,255,0.06)] px-3 py-2 text-sm">
                        <div>
                          <span className="text-[var(--muted)]">Capital disponible: </span>
                          <span className="font-semibold text-[var(--brand)]">{currency(availableUsd)}</span>
                          {srcPos.balanceLabel ? (
                            <span className="ml-2 text-xs text-[var(--muted)]">({srcPos.balanceLabel})</span>
                          ) : srcPos.currentBalance > 0 ? (
                            <span className="ml-2 text-xs text-[var(--muted)]">({srcPos.currentBalance} {srcPos.tokenSymbol})</span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={fillFullBalance}
                          className="rounded-md border border-[rgba(160,210,255,0.45)] bg-[rgba(160,210,255,0.10)] px-2.5 py-1 text-xs text-[#A0D2FF] transition-colors hover:bg-[rgba(160,210,255,0.18)]"
                        >
                          Usar saldo completo
                        </button>
                      </div>
                    );
                  })() : null}

                  {(() => {
                    const source = baseDepositTargets.find((item) => item.key === form.rebalanceSourceKey);
                    const sourceType = (source?.positionType ?? "").toLowerCase();
                    if (sourceType.includes("liquidity") || sourceType.includes("lp")) {
                      return (
                        <>
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--muted)]">Token origen A</span>
                            <input
                              value={form.rebalanceSourceTokenSymbol}
                              onChange={(event) => setForm((prev) => ({ ...prev, rebalanceSourceTokenSymbol: event.target.value.toUpperCase() }))}
                              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                            />
                          </label>
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--muted)]">Cantidad A (sale del pool)</span>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={form.rebalanceSourceAmount}
                              onChange={(event) => setForm((prev) => ({ ...prev, rebalanceSourceAmount: event.target.value }))}
                              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                            />
                          </label>
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--muted)]">Token origen B</span>
                            <input
                              value={form.rebalanceSourceLpTokenSymbolB}
                              onChange={(event) => setForm((prev) => ({ ...prev, rebalanceSourceLpTokenSymbolB: event.target.value.toUpperCase() }))}
                              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                            />
                          </label>
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--muted)]">Cantidad B (sale del pool)</span>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={form.rebalanceSourceLpAmountB}
                              onChange={(event) => setForm((prev) => ({ ...prev, rebalanceSourceLpAmountB: event.target.value }))}
                              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                            />
                          </label>
                        </>
                      );
                    }
                    return (
                      <>
                        <label className="text-sm">
                          <span className="mb-1 block text-[var(--muted)]">Token origen</span>
                          {(source?.availableTokens ?? []).length > 0 ? (
                            <select
                              value={form.rebalanceSourceTokenSymbol}
                              onChange={(event) => setForm((prev) => ({ ...prev, rebalanceSourceTokenSymbol: event.target.value.toUpperCase() }))}
                              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                            >
                              <option value="">Selecciona token</option>
                              {(source?.availableTokens ?? []).map((token) => (
                                <option key={token} value={token}>
                                  {token}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={form.rebalanceSourceTokenSymbol}
                              onChange={(event) => setForm((prev) => ({ ...prev, rebalanceSourceTokenSymbol: event.target.value.toUpperCase() }))}
                              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                              placeholder="BTC, ETH..."
                            />
                          )}
                        </label>
                        <label className="text-sm">
                          <span className="mb-1 block text-[var(--muted)]">Cantidad origen (tokens)</span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={form.rebalanceSourceAmount}
                            onChange={(event) => setForm((prev) => ({ ...prev, rebalanceSourceAmount: event.target.value }))}
                            className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                            placeholder="0.00"
                          />
                        </label>
                      </>
                    );
                  })()}

                  <label className="text-sm sm:col-span-2">
                    <span className="mb-1 block text-[var(--muted)]">Posición destino</span>
                    <select
                      value={form.rebalanceTargetIsNew ? "__new__" : form.rebalanceTargetKey}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === "__new__") {
                          setForm((prev) => ({
                            ...prev,
                            rebalanceTargetIsNew: true,
                            rebalanceTargetKey: "",
                            rebalanceTargetTokenSymbol: "",
                            rebalanceTargetLpTokenSymbolB: "",
                            rebalanceTargetAmount: "",
                            rebalanceTargetLpAmountB: "",
                            rebalanceTargetNewPositionType: prev.rebalanceTargetNewPositionType || "Hold",
                            rebalanceTargetLpSplitPercentA: prev.rebalanceTargetLpSplitPercentA || "50",
                          }));
                          return;
                        }
                        const target = baseDepositTargets.find((item) => item.key === value);
                        const targetType = (target?.positionType ?? "").toLowerCase();
                        setForm((prev) => ({
                          ...prev,
                          rebalanceTargetIsNew: false,
                          rebalanceTargetKey: value,
                          rebalanceTargetTokenSymbol: target?.availableTokens[0] ?? "",
                          rebalanceTargetLpTokenSymbolB:
                            targetType.includes("liquidity") || targetType.includes("lp")
                              ? target?.availableTokens[1] ?? ""
                              : "",
                          rebalanceTargetAmount: "",
                          rebalanceTargetLpAmountB: "",
                        }));
                      }}
                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                    >
                      <option value="">Selecciona destino</option>
                      {baseDepositTargets.map((target) => (
                        <option key={target.key} value={target.key}>
                          {target.label}
                        </option>
                      ))}
                      <option value="__new__">+ Crear nueva posición…</option>
                    </select>
                  </label>
                  {form.rebalanceTargetIsNew ? (
                    <>
                      <label className="text-sm">
                        <span className="mb-1 block text-[var(--muted)]">Tipo de posición nueva</span>
                        <select
                          value={form.rebalanceTargetNewPositionType}
                          onChange={(event) => {
                            const newType = event.target.value;
                            setForm((prev) => ({
                              ...prev,
                              rebalanceTargetNewPositionType: newType,
                              rebalanceTargetTokenSymbol: "",
                              rebalanceTargetLpTokenSymbolB: "",
                              rebalanceTargetAmount: "",
                              rebalanceTargetLpAmountB: "",
                            }));
                          }}
                          className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                        >
                          <option value="Hold">Hold</option>
                          <option value="Staking">Staking</option>
                          <option value="Lending">Lending</option>
                          <option value="Liquidity Pool">Liquidity Pool</option>
                        </select>
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-[var(--muted)]">Protocolo / Plataforma</span>
                        <input
                          value={form.rebalanceTargetNewProtocol}
                          onChange={(event) => setForm((prev) => ({ ...prev, rebalanceTargetNewProtocol: event.target.value }))}
                          className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                          placeholder="ej: Uniswap V3, Aave, Lido"
                        />
                      </label>
                    </>
                  ) : null}
                  {(() => {
                    const targetTypeStr = form.rebalanceTargetIsNew
                      ? form.rebalanceTargetNewPositionType
                      : (baseDepositTargets.find((item) => item.key === form.rebalanceTargetKey)?.positionType ?? "");
                    const targetType = targetTypeStr.toLowerCase();
                    const target = baseDepositTargets.find((item) => item.key === form.rebalanceTargetKey);
                    if (targetType.includes("liquidity") || targetType.includes("lp")) {
                      return (
                        <>
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--muted)]">Token destino A</span>
                            <input
                              value={form.rebalanceTargetTokenSymbol}
                              onChange={(event) => setForm((prev) => ({ ...prev, rebalanceTargetTokenSymbol: event.target.value.toUpperCase() }))}
                              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                              placeholder="ETH"
                            />
                          </label>
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--muted)]">Token destino B</span>
                            <input
                              value={form.rebalanceTargetLpTokenSymbolB}
                              onChange={(event) => setForm((prev) => ({ ...prev, rebalanceTargetLpTokenSymbolB: event.target.value.toUpperCase() }))}
                              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                              placeholder="USDC"
                            />
                          </label>
                          <div className="sm:col-span-2 rounded-lg border border-[rgba(160,210,255,0.25)] bg-[rgba(160,210,255,0.06)] p-3">
                            <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-2">
                              <span>Split entre tokens (% en {form.rebalanceTargetTokenSymbol || "Token A"})</span>
                              <span className="font-semibold text-[var(--brand)]">
                                {form.rebalanceTargetLpSplitPercentA || "50"}% / {Math.max(0, 100 - Number(form.rebalanceTargetLpSplitPercentA || 50))}%
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="range"
                                min="0"
                                max="100"
                                step="1"
                                value={form.rebalanceTargetLpSplitPercentA || "50"}
                                onChange={(event) => {
                                  const split = event.target.value;
                                  setForm((prev) => ({ ...prev, rebalanceTargetLpSplitPercentA: split, rebalanceTargetAmount: "", rebalanceTargetLpAmountB: "" }));
                                }}
                                className="flex-1 accent-[var(--brand)]"
                              />
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={form.rebalanceTargetLpSplitPercentA || "50"}
                                onChange={(event) => setForm((prev) => ({ ...prev, rebalanceTargetLpSplitPercentA: event.target.value, rebalanceTargetAmount: "", rebalanceTargetLpAmountB: "" }))}
                                className="w-20 rounded-lg border border-[var(--line)] bg-black/30 px-2 py-1 text-sm"
                              />
                              <button
                                type="button"
                                onClick={() => setForm((prev) => ({ ...prev, rebalanceTargetLpSplitPercentA: "50", rebalanceTargetAmount: "", rebalanceTargetLpAmountB: "" }))}
                                className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs hover:bg-white/5"
                              >
                                50/50
                              </button>
                            </div>
                            <p className="mt-2 text-[11px] text-[var(--muted)]">
                              Sugerencia: <strong className="text-[var(--brand)]">{rebalancePreview.suggestedAmountA > 0 ? rebalancePreview.suggestedAmountA.toFixed(6) : "—"}</strong> {form.rebalanceTargetTokenSymbol || "A"}
                              {" + "}
                              <strong className="text-[var(--brand)]">{rebalancePreview.suggestedAmountB > 0 ? rebalancePreview.suggestedAmountB.toFixed(6) : "—"}</strong> {form.rebalanceTargetLpTokenSymbolB || "B"}
                            </p>
                          </div>
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--muted)]">Cantidad A (entra al pool)</span>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={form.rebalanceTargetAmount}
                              onChange={(event) => {
                                const value = event.target.value;
                                const amountA = Number(value);
                                // Recalcular split si el usuario edita amount manualmente
                                const priceA = tokenPriceMap.get(form.rebalanceTargetTokenSymbol.toUpperCase()) ?? 0;
                                const totalUsd = rebalancePreview.usd;
                                if (Number.isFinite(amountA) && amountA > 0 && priceA > 0 && totalUsd > 0) {
                                  const usedUsd = amountA * priceA;
                                  const pct = Math.max(0, Math.min(100, (usedUsd / totalUsd) * 100));
                                  setForm((prev) => ({ ...prev, rebalanceTargetAmount: value, rebalanceTargetLpSplitPercentA: pct.toFixed(2) }));
                                } else {
                                  setForm((prev) => ({ ...prev, rebalanceTargetAmount: value }));
                                }
                              }}
                              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                              placeholder={rebalancePreview.suggestedAmountA > 0 ? rebalancePreview.suggestedAmountA.toFixed(6) : "0.00"}
                            />
                          </label>
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--muted)]">Cantidad B (entra al pool)</span>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={form.rebalanceTargetLpAmountB}
                              onChange={(event) => {
                                const value = event.target.value;
                                const amountB = Number(value);
                                const priceB = tokenPriceMap.get(form.rebalanceTargetLpTokenSymbolB.toUpperCase()) ?? 0;
                                const totalUsd = rebalancePreview.usd;
                                if (Number.isFinite(amountB) && amountB > 0 && priceB > 0 && totalUsd > 0) {
                                  const usedUsd = amountB * priceB;
                                  const pctB = Math.max(0, Math.min(100, (usedUsd / totalUsd) * 100));
                                  setForm((prev) => ({ ...prev, rebalanceTargetLpAmountB: value, rebalanceTargetLpSplitPercentA: (100 - pctB).toFixed(2) }));
                                } else {
                                  setForm((prev) => ({ ...prev, rebalanceTargetLpAmountB: value }));
                                }
                              }}
                              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                              placeholder={rebalancePreview.suggestedAmountB > 0 ? rebalancePreview.suggestedAmountB.toFixed(6) : "0.00"}
                            />
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={form.isCorrelated}
                              onChange={(e) => setForm((prev) => ({ ...prev, isCorrelated: e.target.checked }))}
                              className="h-4 w-4 rounded border-[var(--line)] accent-[var(--brand)]"
                            />
                            <span className="text-[var(--muted)]">Pool correlacionado (ej: USDC/USDS, SOL/jitoSOL)</span>
                          </label>
                          <div className="col-span-full rounded-lg border border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.06)] px-3 py-2 text-xs text-[var(--muted)]">
                            <strong className="text-amber-400">Rango:</strong> precio caro ÷ precio barato → siempre &gt; 1.
                          </div>
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--muted)]">Rango mínimo (caro/barato)</span>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={form.lpRangeLower}
                              onChange={(event) => setForm((prev) => ({ ...prev, lpRangeLower: event.target.value }))}
                              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                              placeholder="ej: 15.0"
                            />
                          </label>
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--muted)]">Rango máximo (caro/barato)</span>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={form.lpRangeUpper}
                              onChange={(event) => setForm((prev) => ({ ...prev, lpRangeUpper: event.target.value }))}
                              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                              placeholder="ej: 25.0"
                            />
                          </label>
                        </>
                      );
                    }
                    return (
                      <>
                        <label className="text-sm">
                          <span className="mb-1 block text-[var(--muted)]">Token destino</span>
                          {!form.rebalanceTargetIsNew && (target?.availableTokens ?? []).length > 0 ? (
                            <select
                              value={form.rebalanceTargetTokenSymbol}
                              onChange={(event) => setForm((prev) => ({ ...prev, rebalanceTargetTokenSymbol: event.target.value.toUpperCase() }))}
                              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                            >
                              <option value="">Selecciona token</option>
                              {(target?.availableTokens ?? []).map((token) => (
                                <option key={token} value={token}>
                                  {token}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={form.rebalanceTargetTokenSymbol}
                              onChange={(event) => setForm((prev) => ({ ...prev, rebalanceTargetTokenSymbol: event.target.value.toUpperCase() }))}
                              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                              placeholder="BTC, ETH..."
                            />
                          )}
                        </label>
                        <label className="text-sm">
                          <span className="mb-1 block text-[var(--muted)]">Cantidad destino (tokens, opcional)</span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={form.rebalanceTargetAmount}
                            onChange={(event) => setForm((prev) => ({ ...prev, rebalanceTargetAmount: event.target.value }))}
                            className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                            placeholder={rebalancePreview.suggestedAmountA > 0 ? `Sugerido: ${rebalancePreview.suggestedAmountA.toFixed(6)}` : "Si lo dejas vacío, se calcula automático"}
                          />
                        </label>
                      </>
                    );
                  })()}
                  <div className="rounded-lg border border-[var(--line)] bg-black/20 px-3 py-2 text-sm">
                    <p className="text-[var(--muted)]">Valor estimado</p>
                    <p className="font-semibold">{currency(rebalancePreview.usd)}</p>
                    {rebalancePreview.harvestPendingUsd > 0 ? (
                      <div className="mt-1.5 space-y-0.5 text-[11px] text-[var(--muted)] border-t border-white/5 pt-1.5">
                        <p className="flex justify-between gap-2">
                          <span>Valor LP a precio actual</span>
                          <span className="tabular-nums">{currency(rebalancePreview.lpUsd)}</span>
                        </p>
                        <p className="flex justify-between gap-2 text-emerald-300/80">
                          <span>+ Harvest pendiente ({rebalancePreview.harvestPendingTokens.map((h) => `${h.amount.toFixed(4)} ${h.tokenSymbol}`).join(", ")})</span>
                          <span className="tabular-nums">{currency(rebalancePreview.harvestPendingUsd)}</span>
                        </p>
                        <p className="text-[10px] opacity-70 mt-1 italic">
                          Al deshacer este LP el harvest se incluye en el destino — el total del portfolio se conserva.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {form.operationType === "lending_borrow" ? (
                <div className="grid gap-3 rounded-xl border border-[rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.08)] p-3 sm:grid-cols-2">
                  <p className="col-span-full text-xs text-[var(--muted)]">
                    Puedes registrar en una sola operación cuánto aportas de colateral y cuánto tomas de deuda.
                  </p>
                  <label className="text-sm">
                    <span className="mb-1 block text-[var(--muted)]">Token colateral</span>
                    <input
                      value={form.lendingCollateralToken}
                      onChange={(event) => setForm((prev) => ({ ...prev, lendingCollateralToken: event.target.value.toUpperCase() }))}
                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                      placeholder="ETH"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-[var(--muted)]">Cantidad colateral</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={form.lendingCollateralAmount}
                      onChange={(event) => setForm((prev) => ({ ...prev, lendingCollateralAmount: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                      placeholder="0.00"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-[var(--muted)]">Token deuda</span>
                    <input
                      value={form.lendingDebtToken}
                      onChange={(event) => setForm((prev) => ({ ...prev, lendingDebtToken: event.target.value.toUpperCase() }))}
                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                      placeholder="USDC"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-[var(--muted)]">Cantidad deuda</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={form.lendingDebtAmount}
                      onChange={(event) => setForm((prev) => ({ ...prev, lendingDebtAmount: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                      placeholder="0.00"
                    />
                  </label>
                </div>
              ) : null}

              {form.operationType === "liquidity_pool" ? (
                <div className="grid gap-3 rounded-xl border border-[rgba(160,210,255,0.25)] bg-[rgba(160,210,255,0.06)] p-3 sm:grid-cols-2">
                  <p className="col-span-full text-xs text-[var(--muted)]">
                    Liquidity Pool V3: dos tokens + rango. Con esto se habilita el cálculo de IL automáticamente.
                  </p>
                  <label className="text-sm">
                    <span className="mb-1 block text-[var(--muted)]">Token A</span>
                    <input
                      value={form.tokenSymbol}
                      onChange={(event) => setForm((prev) => ({ ...prev, tokenSymbol: event.target.value.toUpperCase() }))}
                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                      placeholder="ETH"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-[var(--muted)]">Cantidad A</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={form.amount}
                      onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                      placeholder="1.5"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-[var(--muted)]">Token B</span>
                    <input
                      value={form.lpTokenSymbolB}
                      onChange={(event) => setForm((prev) => ({ ...prev, lpTokenSymbolB: event.target.value.toUpperCase() }))}
                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                      placeholder="USDC"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-[var(--muted)]">Cantidad B</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={form.lpAmountB}
                      onChange={(event) => setForm((prev) => ({ ...prev, lpAmountB: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                      placeholder="2500"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.isCorrelated}
                      onChange={(e) => setForm((prev) => ({ ...prev, isCorrelated: e.target.checked }))}
                      className="h-4 w-4 rounded border-[var(--line)] accent-[var(--brand)]"
                    />
                    <span className="text-[var(--muted)]">Pool correlacionado (ej: USDC/USDS, SOL/jitoSOL)</span>
                  </label>
                  <div className="col-span-full rounded-lg border border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.06)] px-3 py-2 text-xs text-[var(--muted)]">
                    <strong className="text-amber-400">Convención de rango:</strong> expresa siempre como <em>precio caro ÷ precio barato</em> → resultado &gt; 1. Ej: pool BTC/ETH → rango 15 – 25 (BTC/ETH). Pool HYPE/BTC → rango 3500 – 4500 (BTC/HYPE).
                  </div>
                  <label className="text-sm">
                    <span className="mb-1 block text-[var(--muted)]">Rango mínimo (activo caro / barato)</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={form.lpRangeLower}
                      onChange={(event) => setForm((prev) => ({ ...prev, lpRangeLower: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                      placeholder="ej: 15.0"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-[var(--muted)]">Rango máximo (activo caro / barato)</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={form.lpRangeUpper}
                      onChange={(event) => setForm((prev) => ({ ...prev, lpRangeUpper: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                      placeholder="ej: 25.0"
                    />
                  </label>
                </div>
              ) : null}
            </div>

            {selectedPosition ? (
              <p className="mt-2 text-xs text-[var(--muted)]">
                Posición seleccionada: {selectedPosition.tokenSymbol} / {selectedPosition.protocol}
              </p>
            ) : null}
            </div>{/* fin scroll */}

            {/* Footer fijo con botones */}
            <div className="flex-shrink-0 border-t border-[var(--line)] px-6 py-4">
            {errorMessage ? (
              <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {errorMessage}
              </p>
            ) : null}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitOperation}
                disabled={isSaving}
                className="rounded-lg border border-[rgba(160,210,255,0.5)] bg-[rgba(160,210,255,0.2)] px-4 py-2 text-sm font-medium hover:bg-[rgba(160,210,255,0.3)] disabled:opacity-60"
              >
                {isSaving ? "Guardando..." : "Guardar operación"}
              </button>
            </div>
            </div>
          </div>
        </div>
      ) : null}

      <CsvModal isOpen={isCsvModalOpen} onClose={closeCsvModal} activePortfolioId={activePortfolioId} />
      <ManualPriceModal isOpen={isManualPriceModalOpen} onClose={() => setIsManualPriceModalOpen(false)} unmappedTokens={unmappedTokens} isRefreshingPrices={isRefreshingPrices} onSubmit={refreshPricesNow} />

      {isEditModalOpen && editPosition && <EditModal isOpen={isEditModalOpen} onClose={() => { setIsEditModalOpen(false); setEditPosition(null); setErrorMessage(""); }} position={editPosition} tokenPriceMap={tokenPriceMap} onSuccess={() => { router.refresh(); }} />}

      {/* History Modal */}
      <HistoryModal isOpen={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)} />

      {/* Quick Harvest Modal */}
      {isQuickHarvestOpen && quickHarvestPosition && <QuickHarvestModal isOpen={isQuickHarvestOpen} onClose={() => { setIsQuickHarvestOpen(false); setErrorMessage(""); }} position={quickHarvestPosition} harvestByPosition={harvestByPosition} baseDepositTargets={baseDepositTargets} onSuccess={() => { setIsQuickHarvestOpen(false); setQuickHarvestPosition(null); router.refresh(); }} />}

      {/* Reinvest Harvest Modal */}
      {isReinvestHarvestOpen && reinvestHarvestSourcePosition && <ReinvestHarvestModal isOpen={isReinvestHarvestOpen} onClose={() => { setIsReinvestHarvestOpen(false); setReinvestHarvestSourcePosition(null); setErrorMessage(""); }} position={reinvestHarvestSourcePosition} harvestByPosition={harvestByPosition} baseDepositTargets={baseDepositTargets} onSuccess={() => { setIsReinvestHarvestOpen(false); setReinvestHarvestSourcePosition(null); router.refresh(); }} />}

    </main>
  );
  }
