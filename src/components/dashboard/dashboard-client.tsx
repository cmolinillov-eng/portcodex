"use client";

import {
  BadgeDollarSign,
  FileDown,
  FileSpreadsheet,
  Layers,
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

const emptyForm: FormState = {
  operationType: "base_deposit",
  operationScope: "increase_existing",
  portfolioId: "",
  positionId: "",
  protocol: "Wallet",
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

export function DashboardClient({ data }: { data: DashboardData }) {
  const router = useRouter();
  const {
    summary,
    sections,
    harvestByPosition,
    recentActivity,
    pricesBySymbol,
    pricesLastUpdatedAt,
    pricesAreStale,
    viewer,
    portfolioContext,
  } = data;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingPositionKey, setIsDeletingPositionKey] = useState("");
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [lastDeletedPosition, setLastDeletedPosition] = useState<DeletedPositionState | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedPosition, setSelectedPosition] = useState<DefiPosition | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvStartDate, setCsvStartDate] = useState("");
  const [csvEndDate, setCsvEndDate] = useState("");
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [csvErrorMessage, setCsvErrorMessage] = useState("");
  const [hoveredCompositionKey, setHoveredCompositionKey] = useState<string | null>(null);
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

  const sectionTotals = useMemo(
    () =>
      sections.map((section) => ({
        key: section.key,
        title: section.title,
        value: section.positions.reduce((sum, position) => sum + position.currentValue, 0),
      })),
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
    const palette = ["#22D3EE", "#3B82F6", "#A78BFA", "#4ADE80", "#F43F5E"];
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
          ...emptyForm,
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
      : { ...emptyForm, portfolioId: primaryPortfolioId };

    setSelectedPosition(position ?? null);
    setForm(nextForm);
    setErrorMessage("");
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setSelectedPosition(null);
    setForm(emptyForm);
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

    const tokenPalette = ["#22D3EE", "#10B981", "#3B82F6", "#F59E0B", "#E11D48", "#22C55E", "#A855F7"];
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

    if (!primaryPortfolioId) {
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
        portfolioId: primaryPortfolioId,
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

  async function refreshPricesNow() {
    try {
      setErrorMessage("");
      setIsRefreshingPrices(true);
      const response = await fetch("/api/prices/refresh", {
        method: "POST",
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudieron actualizar precios.");
      }
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido actualizando precios.";
      setErrorMessage(message);
    } finally {
      setIsRefreshingPrices(false);
    }
  }

  async function submitOperation() {
    setErrorMessage("");
    const effectivePortfolioId = form.portfolioId.trim() || primaryPortfolioId;

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
    const hasProtocol = form.protocol.trim().length > 0;
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
          protocol: form.protocol,
          positionContextType: form.positionContextType,
          tokenSymbol:
            form.operationType === "base_deposit"
              ? (form.baseDepositTokenSymbol || form.tokenSymbol)
              : form.tokenSymbol,
          amount: Number(form.amount || 0),
          baseDepositLendingMode: form.baseDepositLendingMode,
          harvestReinvest: true,
          harvestSourcePositionId: form.positionId,
          harvestSourceProtocol: form.protocol,
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

    return (
      <section key={section.key} className="card-premium rounded-3xl p-6 md:p-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">{section.title}</h2>
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-black/20 px-3 py-1 text-xs text-[var(--muted)]">
            <Layers className="h-3.5 w-3.5" />
            {section.positions.length} posiciones activas
          </span>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[var(--line)]">
          <table className="w-full min-w-[1180px] border-collapse">
            <thead className="bg-[rgba(34,211,238,0.08)] text-left">
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
                    <p className="font-medium">{position.tokenSymbol}</p>
                    <p className="text-sm text-[var(--muted)]">{position.positionType}</p>
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
                              <p key={`${position.positionId}-entry-${idx}`} className="text-sm font-medium text-foreground">
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
                  <td className="px-4 py-4 font-medium">{currency(depositedValue)}</td>
                  <td className="px-4 py-4 font-medium">{currency(position.currentValue)}</td>
                  <td className="px-4 py-4">
                    <span className="text-sm">{plainPercent(allocationPercent)}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-flex items-center rounded-full border border-[rgba(34,211,238,0.4)] bg-[rgba(34,211,238,0.12)] px-2.5 py-1 text-xs">
                      {position.protocol}
                    </span>
                  </td>
                  {showYieldColumn ? (
                    <td className="px-4 py-4">
                      {position.totalHarvested > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(34,211,238,0.35)] bg-[rgba(34,211,238,0.1)] px-2.5 py-1 text-xs">
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
                        {position.lpRangeStatus !== "na" ? (
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
                          onClick={() => openModal(position)}
                          className="rounded-lg border border-[rgba(34,211,238,0.35)] bg-[rgba(34,211,238,0.1)] px-3 py-1.5 text-xs transition hover:bg-[rgba(34,211,238,0.2)]"
                        >
                          Operar
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
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="bg-orb -top-20 -left-20 h-72 w-72 bg-[rgba(56,189,248,0.22)]" />
      <div className="bg-orb top-28 right-0 h-80 w-80 bg-[rgba(34,211,238,0.16)]" />

      <section className="mx-auto flex w-full max-w-none flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
        <header className="card-premium relative overflow-hidden rounded-3xl p-6 md:p-8">
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-[rgba(56,189,248,0.24)] blur-3xl" />

          <div className="flex flex-wrap items-start justify-between gap-5">
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
                      ? "border-[rgba(56,189,248,0.5)] bg-[rgba(56,189,248,0.14)] text-sky-300"
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
            <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-2xl border border-[var(--line)] bg-black/20 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Total Depositado</div>
                <p className="mt-1 text-xl font-semibold">{currency(summary.totalDepositedUsd)}</p>
              </div>
              <div className="rounded-2xl border border-[var(--line)] bg-black/20 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Harvest Total</div>
                <p className="mt-1 text-xl font-semibold">{currency(summary.totalHarvestUsd)}</p>
              </div>
              <div className="rounded-2xl border border-[var(--line)] bg-black/20 px-4 py-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Posiciones activas
                </div>
                <p className="mt-1 text-xl font-semibold">{totalActivePositions}</p>
              </div>
              <div className="rounded-2xl border border-[var(--line)] bg-black/20 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">P&L %</div>
                <p className={`mt-1 text-xl font-semibold ${summary.pnlUsd >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {percent(summary.pnlPercent)}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--line)] bg-black/20 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">P&L (US$)</div>
                <p className={`mt-1 text-xl font-semibold ${summary.pnlUsd >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {signedCurrency(summary.pnlUsd)}
                </p>
              </div>
            </div>
          </div>

          <div className="glow-divider mt-5 mb-4" />

          <div className="flex flex-wrap items-center gap-3">
            {viewer.canRefreshPrices ? (
              <button
                type="button"
                onClick={refreshPricesNow}
                disabled={isRefreshingPrices}
                className="inline-flex w-fit items-center rounded-lg border border-[rgba(56,189,248,0.5)] bg-[rgba(56,189,248,0.16)] px-3 py-1.5 text-xs font-medium transition hover:bg-[rgba(56,189,248,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRefreshingPrices ? "Actualizando precios..." : "Actualizar precios"}
              </button>
            ) : null}
            {viewer.canOperate ? (
              <button
                type="button"
                onClick={() => openModal()}
                className="inline-flex w-fit items-center rounded-lg border border-[rgba(34,211,238,0.45)] bg-[rgba(34,211,238,0.16)] px-3 py-1.5 text-xs font-medium transition hover:bg-[rgba(34,211,238,0.28)]"
              >
                Nueva Operación
              </button>
            ) : null}
            <p className={`text-xs ${pricesAreStale ? "text-amber-300" : "text-[var(--muted)]"}`}>
              Precios actualizados: {pricesLastUpdatedAt ? new Date(pricesLastUpdatedAt).toLocaleString("es-ES") : "sin datos"}
              {pricesAreStale ? " · desactualizados (más de 10 min)" : ""}
            </p>
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

        <section className="card-premium rounded-3xl p-6 md:p-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">Composición de la Cartera</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Distribución por categoría</span>
              <button
                type="button"
                onClick={exportCurrentReportPdf}
                className="inline-flex items-center gap-2 rounded-xl border border-[rgba(59,130,246,0.4)] bg-[rgba(59,130,246,0.12)] px-4 py-2 text-sm font-medium transition hover:bg-[rgba(59,130,246,0.22)]"
              >
                <FileDown className="h-4 w-4" />
                Descargar Reporte (PDF)
              </button>
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            <div className="flex items-center justify-center">
              <div className="relative h-52 w-52">
                <svg
                  viewBox="0 0 220 220"
                  className="h-52 w-52"
                  style={{ filter: "drop-shadow(0 0 18px rgba(34,211,238,0.22))" }}
                >
                  <circle cx="110" cy="110" r="78" fill="none" stroke="rgba(30,41,59,0.9)" strokeWidth="30" />
                  {compositionStyles.entries.map((entry) => {
                    const ratio = Math.max(0, Math.min(1, entry.percent / 100));
                    const circumference = 2 * Math.PI * 78;
                    const segmentLength = circumference * ratio;
                    const segmentGap = Math.max(0, circumference - segmentLength);
                    const isActive = hoveredCompositionKey === entry.key;
                    return (
                      <circle
                        key={entry.key}
                        cx="110"
                        cy="110"
                        r="78"
                        fill="none"
                        stroke={entry.color}
                        strokeWidth={isActive ? 36 : 30}
                        strokeLinecap="butt"
                        strokeDasharray={`${segmentLength} ${segmentGap}`}
                        strokeDashoffset={-(entry.start / 360) * circumference}
                        transform="rotate(-90 110 110)"
                        className="cursor-pointer transition-all duration-200"
                        style={{ filter: isActive ? "drop-shadow(0 0 8px rgba(255,255,255,0.35))" : "none" }}
                        onMouseEnter={() => setHoveredCompositionKey(entry.key)}
                        onMouseLeave={() => setHoveredCompositionKey(null)}
                      />
                    );
                  })}
                </svg>
                <div className="pointer-events-none absolute inset-[34px] rounded-full bg-[rgba(5,6,10,0.95)]" />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">Valor Total</p>
                    <p className="mt-1 text-lg font-semibold">{currency(summary.totalValueUsd)}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {compositionStyles.entries.map((entry) => (
                <div
                  key={entry.key}
                  onMouseEnter={() => setHoveredCompositionKey(entry.key)}
                  onMouseLeave={() => setHoveredCompositionKey(null)}
                  className={`rounded-2xl border p-4 transition-all duration-200 ${
                    hoveredCompositionKey === entry.key
                      ? "border-[rgba(56,189,248,0.7)] bg-[rgba(56,189,248,0.14)] shadow-[0_0_0_1px_rgba(56,189,248,0.35),0_0_18px_rgba(56,189,248,0.25)]"
                      : "border-[var(--line)] bg-black/20"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
                      <p className="text-sm font-medium">{entry.title}</p>
                    </div>
                    <span className="text-sm text-[var(--muted)]">{plainPercent(entry.percent)}</span>
                  </div>
                  <p className="mt-2 text-lg font-semibold">{currency(entry.value)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {sections.length === 0 ? (
          <section className="card-premium rounded-3xl p-8 text-center">
            <p className="text-sm text-[var(--muted)]">
              No hay posiciones activas (`is_active = true`) en `defi_positions_analytics` para este usuario.
            </p>
          </section>
        ) : (
          sections.map(renderSection)
        )}

        <section className="card-premium rounded-3xl p-6 md:p-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">Actividad Reciente</h2>
            <button
              type="button"
              onClick={() => setIsCsvModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-[rgba(56,189,248,0.4)] bg-[rgba(56,189,248,0.12)] px-4 py-2 text-sm font-medium transition hover:bg-[rgba(56,189,248,0.22)]"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Exportar Operaciones (CSV)
            </button>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-[var(--line)]">
            <table className="w-full min-w-[980px] border-collapse">
              <thead className="bg-[rgba(34,211,238,0.08)] text-left">
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
                className="rounded-xl border border-[rgba(56,189,248,0.45)] bg-[rgba(56,189,248,0.14)] px-4 py-2 text-sm font-medium transition hover:bg-[rgba(56,189,248,0.24)]"
              >
                Ver movimientos anteriores
              </button>
            </div>
          ) : null}
        </section>
      </section>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="card-premium w-full max-w-xl rounded-2xl p-6">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-semibold">Nueva Operación</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Todo cuelga del tipo de operación: Hold, harvest, staking, lending/borrow o LP.
                </p>
              </div>
              <button type="button" onClick={closeModal} className="rounded-lg p-1 text-[var(--muted)] hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4">
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
                <div className="grid gap-3 rounded-xl border border-[rgba(59,130,246,0.25)] bg-[rgba(59,130,246,0.08)] p-3 sm:grid-cols-2">
                  <p className="col-span-full text-xs text-[var(--muted)]">
                    Rebalanceo: mueve valor de una posición origen a una posición destino usando precios actuales.
                  </p>
                  <label className="text-sm sm:col-span-2">
                    <span className="mb-1 block text-[var(--muted)]">Posición origen</span>
                    <select
                      value={form.rebalanceSourceKey}
                      onChange={(event) => {
                        const source = baseDepositTargets.find((item) => item.key === event.target.value);
                        const sourceType = (source?.positionType ?? "").toLowerCase();
                        setForm((prev) => ({
                          ...prev,
                          rebalanceSourceKey: event.target.value,
                          rebalanceSourceTokenSymbol: source?.availableTokens[0] ?? "",
                          rebalanceSourceLpTokenSymbolB:
                            sourceType.includes("liquidity") || sourceType.includes("lp")
                              ? source?.availableTokens[1] ?? ""
                              : "",
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
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--muted)]">Rango mínimo LP (opcional)</span>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={form.lpRangeLower}
                              onChange={(event) => setForm((prev) => ({ ...prev, lpRangeLower: event.target.value }))}
                              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                              placeholder="Si falta metadata, se usará este valor"
                            />
                          </label>
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--muted)]">Rango máximo LP (opcional)</span>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={form.lpRangeUpper}
                              onChange={(event) => setForm((prev) => ({ ...prev, lpRangeUpper: event.target.value }))}
                              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                              placeholder="Si falta metadata, se usará este valor"
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
                <div className="grid gap-3 rounded-xl border border-[rgba(34,211,238,0.25)] bg-[rgba(34,211,238,0.06)] p-3 sm:grid-cols-2">
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
                  <label className="text-sm">
                    <span className="mb-1 block text-[var(--muted)]">Rango mínimo</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={form.lpRangeLower}
                      onChange={(event) => setForm((prev) => ({ ...prev, lpRangeLower: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                      placeholder="0.90"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-[var(--muted)]">Rango máximo</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={form.lpRangeUpper}
                      onChange={(event) => setForm((prev) => ({ ...prev, lpRangeUpper: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2"
                      placeholder="1.30"
                    />
                  </label>
                </div>
              ) : null}
            </div>

            {selectedPosition ? (
              <p className="mt-3 text-xs text-[var(--muted)]">
                Posición seleccionada: {selectedPosition.tokenSymbol} / {selectedPosition.protocol}
              </p>
            ) : null}

            {errorMessage ? (
              <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {errorMessage}
              </p>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
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
                className="rounded-lg border border-[rgba(34,211,238,0.5)] bg-[rgba(34,211,238,0.2)] px-4 py-2 text-sm font-medium hover:bg-[rgba(34,211,238,0.3)] disabled:opacity-60"
              >
                {isSaving ? "Guardando..." : "Guardar operación"}
              </button>
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
    </main>
  );
  }
