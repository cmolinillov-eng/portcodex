"use client";

import {
  BadgeDollarSign,
  FileDown,
  FileSpreadsheet,
  Layers,
  Pencil,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardData } from "@/lib/dashboard/get-dashboard-data";
import type { DefiPosition, PositionSection } from "@/types/portfolio";

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
  const normalized = positionType.toLowerCase();
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
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedPosition, setSelectedPosition] = useState<DefiPosition | null>(null);
  const [form, setForm] = useState<FormState>(createEmptyForm);

  // Edit modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editPosition, setEditPosition] = useState<DefiPosition | null>(null);
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

  const rebalancePreview = useMemo(() => {
    const sourceTarget = baseDepositTargets.find((item) => item.key === form.rebalanceSourceKey);
    const targetTarget = baseDepositTargets.find((item) => item.key === form.rebalanceTargetKey);
    const sourceType = (sourceTarget?.positionType ?? "").toLowerCase();
    const targetType = (targetTarget?.positionType ?? "").toLowerCase();

    let usd = 0;
    const sourcePriceA = tokenPriceMap.get(form.rebalanceSourceTokenSymbol.toUpperCase()) ?? 0;
    const sourceAmountA = Number(form.rebalanceSourceAmount);
    if (sourceType.includes("liquidity") || sourceType.includes("lp")) {
      const sourcePriceB = tokenPriceMap.get(form.rebalanceSourceLpTokenSymbolB.toUpperCase()) ?? 0;
      const sourceAmountB = Number(form.rebalanceSourceLpAmountB);
      if (Number.isFinite(sourceAmountA) && sourceAmountA > 0) usd += sourceAmountA * sourcePriceA;
      if (Number.isFinite(sourceAmountB) && sourceAmountB > 0) usd += sourceAmountB * sourcePriceB;
    } else {
      if (Number.isFinite(sourceAmountA) && sourceAmountA > 0) usd = sourceAmountA * sourcePriceA;
    }

    const targetPrice = tokenPriceMap.get(form.rebalanceTargetTokenSymbol.toUpperCase()) ?? 0;
    const targetAmountAuto = targetPrice > 0 ? usd / targetPrice : 0;
    const targetAmountManual = Number(form.rebalanceTargetAmount);
    const targetAmount =
      targetType.includes("liquidity") || targetType.includes("lp")
        ? targetAmountManual
        : (Number.isFinite(targetAmountManual) && targetAmountManual > 0 ? targetAmountManual : targetAmountAuto);

    return { usd, targetAmount };
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
    tokenPriceMap,
  ]);

  const compositionStyles = useMemo(() => {
    const palette = ["#00E5FF", "#35F3FF", "#6AF5FF", "#00B7FF", "#96FBFF"];
    const total = sectionTotals.reduce((sum, item) => sum + item.value, 0);
    if (total <= 0) {
      return {
        donutBackground: "conic-gradient(#1E293B 0deg 360deg)",
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
    setIsEditModalOpen(true);
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

  function exportCurrentReportPdf() {
    const reportDate = new Date().toLocaleString("es-ES");
    const tokenComposition = new Map<string, number>();
    for (const section of sections) {
      for (const position of section.positions) {
        if (position.valueBreakdown.length > 0) {
          for (const part of position.valueBreakdown) {
            const symbol = part.tokenSymbol.trim().toUpperCase();
            if (!symbol || part.valueUsd <= 0) continue;
            tokenComposition.set(symbol, (tokenComposition.get(symbol) ?? 0) + part.valueUsd);
          }
          continue;
        }
        const fallbackSymbol = position.tokenSymbol.trim().toUpperCase();
        if (!fallbackSymbol) continue;
        tokenComposition.set(fallbackSymbol, (tokenComposition.get(fallbackSymbol) ?? 0) + position.currentValue);
      }
    }
    const tokenRows = Array.from(tokenComposition.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([token, value]) => ({
        token,
        value,
        percent: summary.totalValueUsd > 0 ? (value / summary.totalValueUsd) * 100 : 0,
      }));

    const tokenPalette = ["#00E5FF", "#35F3FF", "#6AF5FF", "#00B7FF", "#96FBFF", "#4FD4FF", "#8CD7FF"];
    let angleStart = 0;
    const tokenSlices = tokenRows.map((row, index) => {
      const angleSize = (row.percent / 100) * 360;
      const angleEnd = angleStart + angleSize;
      const slice = {
        ...row,
        color: tokenPalette[index % tokenPalette.length],
        start: angleStart,
        end: angleEnd,
      };
      angleStart = angleEnd;
      return slice;
    });

    const donutRadius = 46;
    const donutCircumference = 2 * Math.PI * donutRadius;
    let donutOffsetCursor = 0;
    const donutSvgSegments =
      tokenRows.length > 0
        ? tokenRows
            .map((row, index) => {
              const ratio = Math.max(0, Math.min(1, row.percent / 100));
              const segmentLength = donutCircumference * ratio;
              const segmentGap = Math.max(0, donutCircumference - segmentLength);
              const segment = `<circle cx="80" cy="80" r="${donutRadius}" fill="none" stroke="${
                tokenPalette[index % tokenPalette.length]
              }" stroke-width="24" stroke-linecap="butt" stroke-dasharray="${segmentLength} ${segmentGap}" stroke-dashoffset="${-donutOffsetCursor}" transform="rotate(-90 80 80)" />`;
              donutOffsetCursor += segmentLength;
              return segment;
            })
            .join("")
        : `<circle cx="80" cy="80" r="${donutRadius}" fill="none" stroke="#9ca3af" stroke-width="24" />`;

    const donutSvg = `
      <svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="Composición de la cartera">
        <circle cx="80" cy="80" r="${donutRadius}" fill="none" stroke="#e5e7eb" stroke-width="24" />
        ${donutSvgSegments}
        <circle cx="80" cy="80" r="30" fill="#ffffff" />
      </svg>
    `;

    const tokenTableRows = tokenRows
      .map(
        (row) =>
          `<tr><td>${row.token}</td><td>${currency(row.value)}</td><td>${plainPercent(row.percent)}</td></tr>`,
      )
      .join("");

    const positionsRows = sections
      .flatMap((section) => section.positions)
      .map((position) => {
        const depositedInPosition =
          position.costBasisUsd !== null && Number.isFinite(position.costBasisUsd)
            ? position.costBasisUsd
            : position.averageEntryPrice * position.currentBalance;
        const pnlPosition = position.currentValue - depositedInPosition;
        return `<tr>
          <td>${position.tokenSymbol}</td>
          <td>${position.protocol}</td>
          <td>${position.positionType}</td>
          <td>${currency(position.averageEntryPrice)}</td>
          <td>${currency(depositedInPosition)}</td>
          <td>${currency(position.currentValue)}</td>
          <td>${signedCurrency(pnlPosition)} (${percent(position.roiPercent)})</td>
        </tr>`;
      })
      .join("");

    const html = `
      <!doctype html>
      <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Reporte Portfolio</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #111827; }
          h1, h2 { margin: 0 0 8px; }
          p { margin: 0 0 12px; color: #4b5563; }
          .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; text-align: left; }
          th { background: #f9fafb; }
        </style>
      </head>
      <body>
        <h1>Reporte del Portfolio</h1>
        <p>Snapshot generado el ${reportDate}</p>

        <section class="card">
          <h2>Resumen</h2>
          <p>Valor total actual: ${currency(summary.totalValueUsd)}</p>
          <p>Total depositado: ${currency(summary.totalDepositedUsd)}</p>
          <p>P&L: ${signedCurrency(summary.pnlUsd)} (${percent(summary.pnlPercent)})</p>
          <p>Harvest total: ${currency(summary.totalHarvestUsd)}</p>
          <p>Posiciones activas: ${totalActivePositions}</p>
        </section>

        <section class="card">
          <h2>Composición por Token</h2>
          <div style="display:flex; gap:16px; align-items:center; margin-bottom:10px;">
            <div>${donutSvg}</div>
            <div style="display:grid; gap:6px;">
              ${tokenSlices
                .map(
                  (slice) =>
                    `<div style="display:flex; align-items:center; gap:8px; font-size:12px;">
                      <span style="display:inline-block; width:10px; height:10px; border-radius:9999px; background:${slice.color};"></span>
                      <span>${slice.token}: ${plainPercent(slice.percent)}</span>
                    </div>`,
                )
                .join("")}
            </div>
          </div>
          <table>
            <thead><tr><th>Token</th><th>Valor</th><th>Distribución</th></tr></thead>
            <tbody>${tokenTableRows || '<tr><td colspan="3">Sin posiciones activas.</td></tr>'}</tbody>
          </table>
        </section>

        <section class="card">
          <h2>Posiciones</h2>
          <table>
            <thead><tr><th>Posición</th><th>Protocolo</th><th>Tipo</th><th>Entrada (precio medio)</th><th>Depositado posición</th><th>Valor actual</th><th>Rentabilidad</th></tr></thead>
            <tbody>${positionsRows}</tbody>
          </table>
        </section>
      </body>
      </html>
    `;

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
      const targetType = (targetTarget?.positionType ?? "").toLowerCase();
      if (!form.rebalanceSourceKey || !form.rebalanceTargetKey) {
        setErrorMessage("Selecciona posición origen y destino para el rebalanceo.");
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
        const targetAmountA = Number(form.rebalanceTargetAmount);
        const targetAmountB = Number(form.rebalanceTargetLpAmountB);
        if (!form.rebalanceTargetTokenSymbol.trim() || !form.rebalanceTargetLpTokenSymbolB.trim()) {
          setErrorMessage("Si el destino es LP, debes indicar los dos tokens de entrada.");
          return;
        }
        if (!Number.isFinite(targetAmountA) || targetAmountA <= 0 || !Number.isFinite(targetAmountB) || targetAmountB <= 0) {
          setErrorMessage("Si el destino es LP, debes indicar cantidad válida para ambos tokens.");
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
          rebalanceTargetPositionId: baseDepositTargets.find((item) => item.key === form.rebalanceTargetKey)?.positionId,
          rebalanceTargetProtocol: baseDepositTargets.find((item) => item.key === form.rebalanceTargetKey)?.protocol,
          rebalanceTargetPositionType: baseDepositTargets.find((item) => item.key === form.rebalanceTargetKey)?.positionType,
          rebalanceTargetTokenSymbol: form.rebalanceTargetTokenSymbol,
          rebalanceTargetAmount: Number(form.rebalanceTargetAmount || 0),
          rebalanceTargetLpTokenSymbolB: form.rebalanceTargetLpTokenSymbolB,
          rebalanceTargetLpAmountB: Number(form.rebalanceTargetLpAmountB || 0),
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

  function renderSection(section: PositionSection) {
    const showIlColumn = section.key === "liquidity_pools";
    const showHealthFactor = section.key === "lending";
    const showEntryPriceColumn = section.key !== "liquidity_pools";
    const showYieldColumn = section.key !== "wallet";
    const sectionToneClass = `card-section-${section.key}`;

    return (
      <section key={section.key} className={`card-premium page-section-card ${sectionToneClass}`}>
        <div className="section-header-row flex items-center justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">{section.title}</h2>
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-black/20 px-3 py-1 text-xs text-[var(--muted)]">
            <Layers className="h-3.5 w-3.5" />
            {section.positions.length} posiciones activas
          </span>
        </div>

        <div className="page-table-shell">
          <table className="w-full min-w-[1180px] border-collapse">
            <thead className="bg-[rgba(0,229,255,0.12)] text-left">
              <tr>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">ACTIVO</th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">SALDO</th>
                {showEntryPriceColumn ? (
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">PRECIO ENTRADA</th>
                ) : null}
                <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">TOTAL DEPOSITADO</th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">VALOR ACTUAL</th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">ASIGNACIÓN</th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">PROTOCOLO</th>
                {showYieldColumn ? (
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">YIELD GANADO</th>
                ) : null}
                <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">P&L / ROI</th>
                {showHealthFactor ? (
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">HEALTH FACTOR</th>
                ) : null}
                {showIlColumn ? (
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">IL ESTIMADA</th>
                ) : null}
                <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">OPERAR</th>
              </tr>
            </thead>
            <tbody>
              {section.positions.map((position) => (
                <tr key={`${position.positionId}-${position.tokenSymbol}`} className="border-t border-[var(--line)]">
                  {(() => {
                    const depositedValue =
                      position.costBasisUsd !== null && Number.isFinite(position.costBasisUsd)
                        ? position.costBasisUsd
                        : position.averageEntryPrice * position.currentBalance;
                    const pnlValue = position.currentValue - depositedValue;
                    const allocationPercent =
                      summary.totalValueUsd > 0 ? (position.currentValue / summary.totalValueUsd) * 100 : 0;
                    return (
                      <>
                  <td className="px-4 py-4">
                    <p className="token-emphasis">{position.tokenSymbol}</p>
                  </td>
                  <td className="px-4 py-4 font-mono text-sm">
                    {position.balanceLabel ?? position.currentBalance.toLocaleString("en-US")}
                  </td>
                  {showEntryPriceColumn ? (
                    <td className="px-4 py-4">
                      {section.key === "lending" ? (
                        position.currentPriceLabel ? (
                          <div className="space-y-1">
                            {position.currentPriceLabel.split("|").map((line, idx) => (
                              <p
                                key={`${position.positionId}-entry-${idx}`}
                                className="whitespace-nowrap text-sm font-medium text-foreground"
                              >
                                {line.trim()}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--muted)]">-</span>
                        )
                      ) : position.isAggregatePosition ? (
                        <span className="text-xs text-[var(--muted)]">N/A (posición agregada)</span>
                      ) : (
                        currency(position.averageEntryPrice)
                      )}
                      {position.dataQualityIssue ? (
                        <p className="mt-1 text-[11px] text-amber-300">Revisar coste histórico</p>
                      ) : null}
                    </td>
                  ) : null}
                  <td className="px-4 py-4 value-emphasis">{currency(depositedValue)}</td>
                  <td className="px-4 py-4 value-emphasis">{currency(position.currentValue)}</td>
                  <td className="px-4 py-4">
                    <span className="text-sm">{plainPercent(allocationPercent)}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-flex items-center rounded-full border border-[rgba(0,229,255,0.4)] bg-[rgba(0,229,255,0.12)] px-2.5 py-1 text-xs">
                      {position.protocol}
                    </span>
                  </td>
                  {showYieldColumn ? (
                    <td className="px-4 py-4">
                      {position.totalHarvested > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(0,229,255,0.35)] bg-[rgba(0,229,255,0.1)] px-2.5 py-1 text-xs">
                          <BadgeDollarSign className="h-3.5 w-3.5" />
                          {currency(position.totalHarvested)}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--muted)]">-</span>
                      )}
                    </td>
                  ) : null}
                  <td className="px-4 py-4">
                    {position.dataQualityIssue ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(245,158,11,0.45)] bg-[rgba(245,158,11,0.12)] px-2.5 py-1 text-xs text-amber-300">
                        Revisar precio medio
                      </span>
                    ) : position.roiPercent >= 0 ? (
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(16,185,129,0.45)] bg-[rgba(16,185,129,0.12)] px-2.5 py-1 text-xs text-emerald-400">
                          <TrendingUp className="h-3.5 w-3.5" />
                          {percent(position.roiPercent)}
                        </span>
                        <p className="text-[11px] text-emerald-300">{signedCurrency(pnlValue)}</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(248,113,113,0.45)] bg-[rgba(248,113,113,0.12)] px-2.5 py-1 text-xs text-rose-400">
                          <TrendingDown className="h-3.5 w-3.5" />
                          {percent(position.roiPercent)}
                        </span>
                        <p className="text-[11px] text-rose-300">{signedCurrency(pnlValue)}</p>
                      </div>
                    )}
                  </td>
                  {showHealthFactor ? (
                    <td className="px-4 py-4">
                      {position.healthFactor === null ? (
                        <span className="text-xs text-[var(--muted)]">N/A</span>
                      ) : position.healthStatus === "critical" ? (
                        <span className="inline-flex rounded-full border border-[rgba(239,68,68,0.45)] bg-[rgba(239,68,68,0.12)] px-2.5 py-1 text-xs text-red-400">
                          {position.healthFactor.toFixed(2)}
                        </span>
                      ) : position.healthStatus === "warning" ? (
                        <span className="inline-flex rounded-full border border-[rgba(245,158,11,0.45)] bg-[rgba(245,158,11,0.12)] px-2.5 py-1 text-xs text-amber-300">
                          {position.healthFactor.toFixed(2)}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-[rgba(16,185,129,0.45)] bg-[rgba(16,185,129,0.12)] px-2.5 py-1 text-xs text-emerald-400">
                          {position.healthFactor.toFixed(2)}
                        </span>
                      )}
                    </td>
                  ) : null}
                  {showIlColumn ? (
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        {position.lpRangeStatus === "correlated" ? (
                          <span className="inline-flex rounded-full border border-[rgba(147,130,255,0.45)] bg-[rgba(147,130,255,0.12)] px-2.5 py-1 text-[11px] text-violet-300">
                            Pool correlacionado
                          </span>
                        ) : position.lpRangeStatus !== "na" ? (
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] ${
                              position.lpRangeStatus === "out_of_range"
                                ? "border-[rgba(239,68,68,0.45)] bg-[rgba(239,68,68,0.12)] text-red-300"
                                : "border-[rgba(16,185,129,0.45)] bg-[rgba(16,185,129,0.12)] text-emerald-300"
                            }`}
                          >
                            {position.lpRangeStatus === "out_of_range" ? "Fuera de rango" : "Dentro de rango"}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--muted)]">-</span>
                        )}
                        {position.lpRangeLabel ? (
                          <p className="text-[11px] text-[var(--muted)]">{position.lpRangeLabel}</p>
                        ) : null}
                        {position.currentPriceLabel ? (
                          <p className="text-[11px] text-[var(--muted)]">{position.currentPriceLabel}</p>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                  <td className="px-4 py-4">
                    {viewer.canOperate ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(position)}
                          className="btn-secondary"
                        >
                          <Pencil className="mr-1 inline h-3.5 w-3.5" />
                          Modificar
                        </button>
                        {viewer.canDeletePosition ? (
                          <button
                            type="button"
                            onClick={() => deletePosition(position)}
                            disabled={isDeletingPositionKey === positionCompositeUiKey(position)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[rgba(248,113,113,0.4)] bg-[rgba(248,113,113,0.12)] px-3 py-1.5 text-xs text-rose-300 transition hover:bg-[rgba(248,113,113,0.2)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {isDeletingPositionKey === positionCompositeUiKey(position) ? "Eliminando..." : "Eliminar"}
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--muted)]">Solo lectura</span>
                    )}
                  </td>
                      </>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <main className="page-shell">
      <div className="bg-orb -top-20 -left-20 h-72 w-72 bg-[rgba(41,234,217,0.07)]" />
      <div className="bg-orb top-28 right-0 h-80 w-80 bg-[rgba(102,255,241,0.05)]" />

      <section className="page-content">
        <header className="card-premium card-header relative overflow-hidden rounded-3xl px-4 pt-3.5 pb-2.5 md:px-5 md:pt-4 md:pb-3">
          <div className="grid items-start gap-2 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.08fr)_minmax(340px,0.54fr)] xl:items-center">
            <div className="flex flex-col gap-3">
              <div className="min-w-[260px]">
                <p className="text-sm uppercase tracking-[0.22em] text-[var(--muted)]">Saldo Total del Portfolio</p>
                <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
                  {currency(summary.totalValueUsd)}
                </h1>
                {portfolioContext ? (
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Usuario:{" "}
                    <span className="text-foreground">
                      {portfolioContext.ownerName || portfolioContext.ownerEmail || "Sin nombre"}
                    </span>
                    {portfolioContext.managerName || portfolioContext.managerEmail ? (
                      <>
                        {" · "}Gestor:{" "}
                        <span className="text-foreground">
                          {portfolioContext.managerName || portfolioContext.managerEmail}
                        </span>
                      </>
                    ) : null}
                  </p>
                ) : null}
                <span
                  className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-[11px] ${
                    viewer.isSuperAdmin
                      ? "border-[rgba(99,102,241,0.5)] bg-[rgba(99,102,241,0.14)] text-indigo-300"
                      : viewer.role === "cliente"
                        ? "border-[rgba(245,158,11,0.45)] bg-[rgba(245,158,11,0.12)] text-amber-300"
                        : viewer.role === "admin"
                          ? "border-[rgba(0,229,255,0.5)] bg-[rgba(0,229,255,0.14)] text-cyan-300"
                          : "border-[rgba(74,222,128,0.5)] bg-[rgba(74,222,128,0.12)] text-emerald-300"
                  }`}
                >
                  {viewer.isSuperAdmin
                    ? "Administrador Principal"
                    : viewer.role === "cliente"
                      ? "Cliente (solo lectura)"
                      : viewer.role === "admin"
                        ? "Gestor"
                        : "Usuario Autónomo"}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {viewer.canRefreshPrices ? (
                  <button
                    type="button"
                    onClick={() => refreshPricesNow()}
                    disabled={isRefreshingPrices}
                    className="btn-secondary px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isRefreshingPrices ? "Actualizando precios..." : "Actualizar precios"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={exportCurrentReportPdf}
                  className="btn-secondary px-5 py-2.5 text-sm font-semibold"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Descargar Reporte (PDF)
                </button>
                <a href="/api/auth/logout?redirectTo=/login" className="btn-secondary px-5 py-2.5 text-sm font-semibold">
                  Cerrar sesión
                </a>
              </div>
              <p className="text-xs text-[var(--muted)]">
                Última actualización de precios:{" "}
                {pricesLastUpdatedAt ? new Date(pricesLastUpdatedAt).toLocaleString("es-ES") : "sin datos"}
              </p>
            </div>

            <aside className="self-start rounded-2xl p-0.5 xl:-ml-4 xl:justify-self-start">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold tracking-tight">Composición de la Cartera</h2>
              </div>
              <div className="grid gap-2 lg:grid-cols-[224px_minmax(0,1fr)] lg:items-center">
                <div className="flex items-center justify-center">
                  <div className="relative h-56 w-56">
                    <svg
                      viewBox="0 0 220 220"
                      className="h-56 w-56"
                      style={{ filter: "drop-shadow(0 0 14px rgba(0,229,255,0.28))" }}
                    >
                      <circle
                        cx="110"
                        cy="110"
                        r="78"
                        fill="none"
                        stroke="rgba(43,29,20,0.92)"
                        strokeWidth={donutOuterStroke}
                      />
                      {compositionStyles.entries.map((entry) => {
                        const ratio = Math.max(0, Math.min(1, entry.percent / 100));
                        const circumference = 2 * Math.PI * 78;
                        const segmentLength = circumference * ratio;
                        const segmentGap = Math.max(0, circumference - segmentLength);
                        const isActive = hoveredCompositionKey === entry.key;
                        const hasHovered = hoveredCompositionKey !== null;
                        return (
                          <circle
                            key={entry.key}
                            cx="110"
                            cy="110"
                            r="78"
                            fill="none"
                            stroke={entry.color}
                            strokeWidth={isActive ? donutActiveStroke : donutOuterStroke}
                            strokeLinecap="butt"
                            strokeDasharray={`${segmentLength} ${segmentGap}`}
                            strokeDashoffset={-(entry.start / 360) * circumference}
                            transform="rotate(-90 110 110)"
                            className="cursor-pointer transition-all duration-200"
                            style={{
                              filter: isActive ? "drop-shadow(0 0 10px rgba(0,229,255,0.45))" : "none",
                              opacity: hasHovered && !isActive ? 0.28 : 1,
                            }}
                            onMouseEnter={() => setHoveredCompositionKey(entry.key)}
                            onMouseLeave={() => setHoveredCompositionKey(null)}
                          />
                        );
                      })}
                    </svg>
                    <div
                      className="pointer-events-none absolute rounded-full bg-[rgba(5,5,6,0.95)]"
                      style={{ inset: `${donutInnerInset}px` }}
                    />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
                      <div className="px-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Valor Total</p>
                        <p className="mt-1 text-xl leading-tight font-semibold">{currency(summary.totalValueUsd)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="grid grid-cols-2 gap-2 auto-rows-fr">
                    {compositionStyles.entries.map((entry) => (
                      <div
                        key={entry.key}
                        onMouseEnter={() => setHoveredCompositionKey(entry.key)}
                        onMouseLeave={() => setHoveredCompositionKey(null)}
                        className={`rounded-xl border px-3.5 py-3 transition-all duration-200 ${
                          hoveredCompositionKey === entry.key
                            ? "border-[rgba(0,229,255,0.72)] bg-[rgba(0,229,255,0.18)] shadow-[0_0_0_1px_rgba(0,229,255,0.36),0_0_14px_rgba(0,229,255,0.24)]"
                            : "border-[var(--line)] bg-black/25"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                          <span className="text-xs text-[var(--muted)]">{plainPercent(entry.percent)}</span>
                        </div>
                        <p className="mt-1 text-sm font-medium leading-tight">{entry.title}</p>
                        <p className="mt-1 text-base font-semibold">{currency(entry.value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </aside>

            <div className="self-center xl:justify-self-end">
              <div className="rounded-2xl border border-[var(--line)] bg-black/20 p-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-[var(--line)] bg-black/25 px-4 py-3">
                    <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--muted)]">Total Depositado</div>
                    <p className="mt-1 text-xl leading-tight font-semibold">{currency(summary.totalDepositedUsd)}</p>
                  </div>
                  <div className="rounded-xl border border-[var(--line)] bg-black/25 px-4 py-3">
                    <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--muted)]">Harvest Total</div>
                    <p className="mt-1 text-xl leading-tight font-semibold">{currency(summary.totalHarvestUsd)}</p>
                  </div>
                </div>
                <div className="glow-divider my-1.5" />
                <div className="rounded-xl border border-[var(--line)] bg-black/25 px-4 py-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--muted)]">P&L %</div>
                      <p className={`mt-1 text-xl leading-tight font-semibold ${summary.pnlUsd >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                        {percent(summary.pnlPercent)}
                      </p>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--muted)]">P&L (US$)</div>
                      <p className={`mt-1 text-xl leading-tight font-semibold ${summary.pnlUsd >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                        {signedCurrency(summary.pnlUsd)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              {viewer.canOperate ? (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => openModal()}
                    className="btn-secondary w-full px-5 py-2.5 text-sm font-semibold"
                  >
                    Nueva Operación
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

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
          sections.map(renderSection)
        )}

        <section className="card-premium card-activity page-section-card">
          <div className="section-header-row flex items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">Actividad Reciente</h2>
            <button
              type="button"
              onClick={() => setIsCsvModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,229,255,0.4)] bg-[rgba(0,229,255,0.12)] px-4 py-2 text-sm font-medium transition hover:bg-[rgba(0,229,255,0.22)]"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Exportar Operaciones (CSV)
            </button>
          </div>
          <div className="page-table-shell">
            <table className="w-full min-w-[980px] border-collapse">
              <thead className="bg-[rgba(0,229,255,0.12)] text-left">
                <tr>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">FECHA</th>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">TIPO</th>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">POSICIÓN</th>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">TOKENS</th>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">DETALLE</th>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">PRECIO</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.length === 0 ? (
                  <tr className="border-t border-[var(--line)]">
                    <td className="px-4 py-4 text-sm text-[var(--muted)]" colSpan={6}>
                      Todavía no hay movimientos en este portfolio.
                    </td>
                  </tr>
                ) : (
                  visibleRecentActivity.map((item, index) => (
                    <tr key={`${item.transactionDate}-${item.positionId}-${item.type}-${item.tokenInSymbol}-${item.tokenOutSymbol}-${index}`} className="border-t border-[var(--line)]">
                      <td className="px-4 py-4 text-sm">
                        {item.transactionDate ? new Date(item.transactionDate).toLocaleString("es-ES") : "-"}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div>{item.type || "-"}</div>
                        {item.movementOrigin === "harvest_reinvest" ? (
                          <span className="mt-1 inline-flex rounded-full border border-[rgba(16,185,129,0.45)] bg-[rgba(16,185,129,0.12)] px-2 py-0.5 text-[10px] text-emerald-300">
                            Reinversión de harvest
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div>{item.positionId || "-"}</div>
                        <div className="text-xs text-[var(--muted)]">{item.protocol}</div>
                        {item.operationGroupId ? (
                          <div className="text-[10px] text-[var(--muted)]">Op: {item.operationGroupId.slice(0, 8)}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        {[item.tokenInSymbol, item.tokenOutSymbol].filter((token) => token.length > 0).join("/") || "-"}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        {item.tokenInSymbol ? `IN ${item.tokenInAmount.toLocaleString("en-US")} ${item.tokenInSymbol}` : ""}
                        {item.tokenInSymbol && item.tokenOutSymbol ? " · " : ""}
                        {item.tokenOutSymbol ? `OUT ${item.tokenOutAmount.toLocaleString("en-US")} ${item.tokenOutSymbol}` : ""}
                        {!item.tokenInSymbol && !item.tokenOutSymbol ? "-" : ""}
                      </td>
                      <td className="px-4 py-4 text-sm">{item.spotPrice > 0 ? currency(item.spotPrice) : "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {recentActivity.length > visibleRecentActivityCount ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleRecentActivityCount((current) => current + 10)}
                className="rounded-xl border border-[rgba(0,229,255,0.45)] bg-[rgba(0,229,255,0.14)] px-4 py-2 text-sm font-medium transition hover:bg-[rgba(0,229,255,0.24)]"
              >
                Ver movimientos anteriores
              </button>
            </div>
          ) : null}
        </section>
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
                        const sourcePos = positionByKey.get(key);
                        const sourceType = (source?.positionType ?? "").toLowerCase();
                        const isLpSrc = sourceType.includes("liquidity") || sourceType.includes("lp");
                        // Auto-fill balances from current position data
                        let autoAmountA = "";
                        let autoAmountB = "";
                        if (sourcePos) {
                          if (isLpSrc) {
                            const parts = (sourcePos.balanceLabel ?? "").split("+");
                            autoAmountA = parts[0]?.replace(/[^0-9.]/g, "").trim() ?? "";
                            autoAmountB = parts[1]?.replace(/[^0-9.]/g, "").trim() ?? "";
                          } else {
                            autoAmountA = sourcePos.currentBalance > 0 ? String(sourcePos.currentBalance) : "";
                          }
                        }
                        setForm((prev) => ({
                          ...prev,
                          rebalanceSourceKey: key,
                          rebalanceSourceTokenSymbol: source?.availableTokens[0] ?? "",
                          rebalanceSourceLpTokenSymbolB: isLpSrc ? source?.availableTokens[1] ?? "" : "",
                          rebalanceSourceAmount: autoAmountA,
                          rebalanceSourceLpAmountB: autoAmountB,
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
                  {/* Capital disponible de la posición origen */}
                  {form.rebalanceSourceKey ? (() => {
                    const srcPos = positionByKey.get(form.rebalanceSourceKey);
                    if (!srcPos) return null;
                    const availableUsd = srcPos.currentValue;
                    return (
                      <div className="col-span-full rounded-lg border border-[rgba(0,229,255,0.25)] bg-[rgba(0,229,255,0.06)] px-3 py-2 text-sm">
                        <span className="text-[var(--muted)]">Capital disponible: </span>
                        <span className="font-semibold text-[var(--brand)]">{currency(availableUsd)}</span>
                        {srcPos.balanceLabel ? (
                          <span className="ml-2 text-xs text-[var(--muted)]">({srcPos.balanceLabel})</span>
                        ) : srcPos.currentBalance > 0 ? (
                          <span className="ml-2 text-xs text-[var(--muted)]">({srcPos.currentBalance} {srcPos.tokenSymbol})</span>
                        ) : null}
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
                      value={form.rebalanceTargetKey}
                      onChange={(event) => {
                        const target = baseDepositTargets.find((item) => item.key === event.target.value);
                        const targetType = (target?.positionType ?? "").toLowerCase();
                        setForm((prev) => ({
                          ...prev,
                          rebalanceTargetKey: event.target.value,
                          rebalanceTargetTokenSymbol: target?.availableTokens[0] ?? "",
                          rebalanceTargetLpTokenSymbolB:
                            targetType.includes("liquidity") || targetType.includes("lp")
                              ? target?.availableTokens[1] ?? ""
                              : "",
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
                    </select>
                  </label>
                  {(() => {
                    const target = baseDepositTargets.find((item) => item.key === form.rebalanceTargetKey);
                    const targetType = (target?.positionType ?? "").toLowerCase();
                    if (targetType.includes("liquidity") || targetType.includes("lp")) {
                      return (
                        <>
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--muted)]">Token destino A</span>
                            <input
                              value={form.rebalanceTargetTokenSymbol}
                              onChange={(event) => setForm((prev) => ({ ...prev, rebalanceTargetTokenSymbol: event.target.value.toUpperCase() }))}
                              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                            />
                          </label>
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--muted)]">Cantidad A (entra al pool)</span>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={form.rebalanceTargetAmount}
                              onChange={(event) => setForm((prev) => ({ ...prev, rebalanceTargetAmount: event.target.value }))}
                              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                            />
                          </label>
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--muted)]">Token destino B</span>
                            <input
                              value={form.rebalanceTargetLpTokenSymbolB}
                              onChange={(event) => setForm((prev) => ({ ...prev, rebalanceTargetLpTokenSymbolB: event.target.value.toUpperCase() }))}
                              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                            />
                          </label>
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--muted)]">Cantidad B (entra al pool)</span>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={form.rebalanceTargetLpAmountB}
                              onChange={(event) => setForm((prev) => ({ ...prev, rebalanceTargetLpAmountB: event.target.value }))}
                              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
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
                          {(target?.availableTokens ?? []).length > 0 ? (
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
                            placeholder="Si lo dejas vacío, se calcula automático"
                          />
                        </label>
                      </>
                    );
                  })()}
                  <div className="rounded-lg border border-[var(--line)] bg-black/20 px-3 py-2 text-sm">
                    <p className="text-[var(--muted)]">Valor estimado</p>
                    <p className="font-semibold">{currency(rebalancePreview.usd)}</p>
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
                <div className="grid gap-3 rounded-xl border border-[rgba(0,229,255,0.25)] bg-[rgba(0,229,255,0.06)] p-3 sm:grid-cols-2">
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
                className="rounded-lg border border-[rgba(0,229,255,0.5)] bg-[rgba(0,229,255,0.2)] px-4 py-2 text-sm font-medium hover:bg-[rgba(0,229,255,0.3)] disabled:opacity-60"
              >
                {isSaving ? "Guardando..." : "Guardar operación"}
              </button>
            </div>
            </div>
          </div>
        </div>
      ) : null}

      {isCsvModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="card-premium w-full max-w-lg rounded-2xl p-6">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-semibold">Exportar Operaciones (CSV)</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Selecciona un rango de fechas para descargar el historial de movimientos.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCsvModal}
                className="rounded-lg p-1 text-[var(--muted)] hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-[var(--muted)]">Fecha inicio</span>
                <input
                  type="date"
                  value={csvStartDate}
                  onChange={(event) => setCsvStartDate(event.target.value)}
                  className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-[var(--muted)]">Fecha fin</span>
                <input
                  type="date"
                  value={csvEndDate}
                  onChange={(event) => setCsvEndDate(event.target.value)}
                  className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                />
              </label>
            </div>

            {csvErrorMessage ? (
              <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {csvErrorMessage}
              </p>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeCsvModal}
                className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={exportTransactionsCsv}
                disabled={isExportingCsv}
                className="rounded-lg border border-[rgba(16,185,129,0.5)] bg-[rgba(16,185,129,0.2)] px-4 py-2 text-sm font-medium hover:bg-[rgba(16,185,129,0.3)] disabled:opacity-60"
              >
                {isExportingCsv ? "Exportando..." : "Descargar CSV"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isManualPriceModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="card-premium w-full max-w-md rounded-2xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">Precios no disponibles</h3>
              <button
                type="button"
                onClick={() => setIsManualPriceModalOpen(false)}
                className="text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-sm text-[var(--muted)]">
              Los siguientes tokens no tienen precio en CoinGecko. Introduce el precio actual en USD para actualizar los cálculos.
            </p>
            <div className="grid gap-3">
              {unmappedTokens.map((symbol) => (
                <label key={symbol} className="text-sm">
                  <span className="mb-1 block font-medium text-[var(--foreground)]">{symbol} (USD)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Ej: 25.50"
                    value={manualPriceInputs[symbol] ?? ""}
                    onChange={(e) =>
                      setManualPriceInputs((prev) => ({ ...prev, [symbol]: e.target.value }))
                    }
                    className="input-field w-full"
                  />
                </label>
              ))}
            </div>
            {errorMessage ? (
              <p className="mt-3 text-xs text-rose-400">{errorMessage}</p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={submitManualPrices}
                disabled={isRefreshingPrices}
                className="btn-primary flex-1 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRefreshingPrices ? "Guardando..." : "Guardar precios"}
              </button>
              <button
                type="button"
                onClick={() => setIsManualPriceModalOpen(false)}
                className="btn-secondary flex-1 py-2 text-sm font-semibold"
              >
                Omitir
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isEditModalOpen && editPosition ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                Modificar posición · {editPosition.tokenSymbol}
              </h3>
              <button type="button" onClick={() => { setIsEditModalOpen(false); setEditPosition(null); setErrorMessage(""); }}>
                <X className="h-5 w-5 text-[var(--muted)]" />
              </button>
            </div>

            {errorMessage ? (
              <p className="mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{errorMessage}</p>
            ) : null}

            <div className="space-y-4">
              <div>
                <span className="mb-1 block text-sm text-[var(--muted)]">Token</span>
                <input
                  type="text"
                  className="input-base w-full"
                  value={editForm.tokenSymbol}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, tokenSymbol: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="mb-1 block text-sm text-[var(--muted)]">Saldo (cantidad)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input-base w-full"
                    value={editForm.amount}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, amount: e.target.value }))}
                  />
                </div>
                <div>
                  <span className="mb-1 block text-sm text-[var(--muted)]">Precio de entrada (USD)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input-base w-full"
                    value={editForm.entryPrice}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, entryPrice: e.target.value }))}
                  />
                </div>
              </div>

              {(editPosition.positionType.toLowerCase().includes("liquidity") || editPosition.positionType.toLowerCase().includes("pool")) ? (
                <>
                  <hr className="border-[var(--line)]" />
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isCorrelated"
                      checked={editForm.isCorrelated}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, isCorrelated: e.target.checked }))}
                      className="h-4 w-4 rounded border-[var(--line)] accent-[var(--brand)]"
                    />
                    <label htmlFor="isCorrelated" className="text-sm text-[var(--muted)]">
                      Pool correlacionado (ej: USDC/USDS, SOL/jitoSOL)
                    </label>
                  </div>
                  <p className="text-xs text-[var(--muted)]">Datos del par LP</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="mb-1 block text-sm text-[var(--muted)]">Token B</span>
                      <input
                        type="text"
                        className="input-base w-full"
                        value={editForm.lpTokenSymbolB}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, lpTokenSymbolB: e.target.value }))}
                      />
                    </div>
                    <div>
                      <span className="mb-1 block text-sm text-[var(--muted)]">Saldo Token B</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="input-base w-full"
                        value={editForm.lpAmountB}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, lpAmountB: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <span className="mb-1 block text-sm text-[var(--muted)]">Precio de entrada Token B (USD)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="input-base w-full"
                      value={editForm.lpEntryPriceB}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, lpEntryPriceB: e.target.value }))}
                    />
                  </div>
                  <p className="rounded-lg border border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.06)] px-3 py-2 text-xs text-[var(--muted)]">
                    <strong className="text-amber-400">Rango:</strong> precio caro ÷ precio barato → siempre &gt; 1. Ej: BTC/ETH → 15–25.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="mb-1 block text-sm text-[var(--muted)]">Rango mín (caro/barato)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="input-base w-full"
                        placeholder="ej: 15.0"
                        value={editForm.lpRangeLower}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, lpRangeLower: e.target.value }))}
                      />
                    </div>
                    <div>
                      <span className="mb-1 block text-sm text-[var(--muted)]">Rango máx (caro/barato)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="input-base w-full"
                        placeholder="ej: 25.0"
                        value={editForm.lpRangeUpper}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, lpRangeUpper: e.target.value }))}
                      />
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={saveEditPosition}
                disabled={isSavingEdit}
                className="flex-1 rounded-lg py-2 text-sm font-semibold text-[var(--background)] transition"
                style={{ background: "var(--brand)" }}
              >
                {isSavingEdit ? "Guardando..." : "Guardar cambios"}
              </button>
              <button
                type="button"
                onClick={() => { setIsEditModalOpen(false); setEditPosition(null); setErrorMessage(""); }}
                className="btn-secondary flex-1 py-2 text-sm font-semibold"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
  }
