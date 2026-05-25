"use client";

import { Fragment } from "react";
import { BadgeDollarSign, Layers, Pencil, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import type { PositionSection, DefiPosition } from "@/types/portfolio";
import { currency, percent, plainPercent, signedCurrency } from "../utils/formatters";

interface PositionSectionCardProps {
  section: PositionSection;
  summary: { totalValueUsd: number };
  viewer: {
    canOperate: boolean;
    canDeletePosition: boolean;
  };
  harvestByPosition: Array<{ key: string; pendingUsd: number }>;
  isDeletingPositionKey: string | null;
  positionCompositeUiKey: (pos: DefiPosition) => string;
  openEditModal: (pos: DefiPosition) => void;
  deletePosition: (pos: DefiPosition) => void;
  openQuickHarvest: (pos: DefiPosition) => void;
  openReinvestHarvest: (pos: DefiPosition) => void;
}

// Per-section visual identity (anchor: top-border gradient + header accent)
const SECTION_META: Record<string, { label: string; color: string; glowClass: string }> = {
  wallet:         { label: "Wallet",         color: "#A0D2FF", glowClass: "text-[#A0D2FF]" },
  staking:        { label: "Staking",        color: "#C090E8", glowClass: "text-[#C090E8]" },
  lending:        { label: "Lending",        color: "#fcd34d", glowClass: "text-[#fcd34d]" },
  liquidity_pools: { label: "Liquidity Pools", color: "#6ee7b7", glowClass: "text-[#6ee7b7]" },
};

function formatTokenAmount(amount: number): string {
  if (amount >= 1000) return amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (amount >= 1) return amount.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return amount.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function formatPriceCompact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (value >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (value >= 0.01) return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function LendingDetailsPanel({ position, colSpan }: { position: DefiPosition; colSpan: number }) {
  const details = position.lendingDetails;
  if (!details) return null;

  const ltvPercent = details.ltv * 100;
  const maxLtvPercent = details.maxLtv * 100;
  const utilization = details.ltvUtilization;
  // Color de utilización: 0-0.7 verde, 0.7-0.9 amarillo, 0.9-1 rojo, >=1 liquidación
  const utilColor =
    utilization >= 1 ? "rgb(239,68,68)"
    : utilization >= 0.9 ? "rgb(248,113,113)"
    : utilization >= 0.7 ? "rgb(245,158,11)"
    : "rgb(16,185,129)";
  const utilLabel =
    utilization >= 1 ? "Liquidación"
    : utilization >= 0.9 ? "Crítico"
    : utilization >= 0.7 ? "Atención"
    : "Seguro";

  // Cap visual del LTV bar al 100% (referencia: el max LTV puntea el límite)
  const ltvBarPercent = Math.min(100, Math.max(0, (ltvPercent / Math.max(maxLtvPercent, 1)) * 100));
  // posición del max-LTV marker (siempre al 100% del max → al final de la barra escalada)

  const hasDebt = details.totalDebtUsd > 0;

  return (
    <tr className="border-t border-[var(--line)] bg-[rgba(252,211,77,0.025)]">
      <td colSpan={colSpan} className="px-4 py-4">
        <div className="grid gap-5 md:grid-cols-3">
          {/* Net Value */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] mb-2">
              Posición neta
            </p>
            <p className={`text-xl font-semibold tabular-nums ${details.netValueUsd >= 0 ? "text-[#fcd34d]" : "text-rose-300"}`}>
              {currency(details.netValueUsd)}
            </p>
            <div className="mt-2 space-y-1 text-[11px] text-[var(--muted)]">
              <p className="flex justify-between gap-3">
                <span>Colateral total</span>
                <span className="tabular-nums text-emerald-300">{currency(details.totalCollateralUsd)}</span>
              </p>
              <p className="flex justify-between gap-3">
                <span>Deuda total</span>
                <span className="tabular-nums text-rose-300">−{currency(details.totalDebtUsd)}</span>
              </p>
            </div>
          </div>

          {/* LTV bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
                Loan-to-Value
              </p>
              {hasDebt ? (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ color: utilColor, borderColor: `${utilColor}66`, borderWidth: 1, backgroundColor: `${utilColor}14` }}
                >
                  {utilLabel}
                </span>
              ) : null}
            </div>
            {hasDebt ? (
              <>
                <div className="relative h-2 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
                  <div
                    className="absolute top-0 left-0 h-full rounded-full transition-all"
                    style={{ width: `${ltvBarPercent}%`, background: `linear-gradient(90deg, ${utilColor}66, ${utilColor})` }}
                  />
                  {/* marca del max LTV al borde derecho */}
                  <div
                    className="absolute top-0 h-full w-px bg-white/40"
                    style={{ left: "100%" }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[10px] tabular-nums">
                  <span className="text-[var(--muted)]">
                    Actual: <span className="text-[var(--foreground)]">{ltvPercent.toFixed(1)}%</span>
                  </span>
                  <span className="text-[var(--muted)]">
                    Máx: <span className="text-[var(--foreground)]">{maxLtvPercent.toFixed(1)}%</span>
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-[var(--muted)]">
                  Capacidad libre: {currency(Math.max(0, details.totalCollateralUsd * details.maxLtv - details.totalDebtUsd))}
                </p>
              </>
            ) : (
              <p className="text-sm text-emerald-300">Sin deuda</p>
            )}
          </div>

          {/* Distancia a liquidación */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] mb-2">
              Distancia a liquidación
            </p>
            {!hasDebt || details.liquidationRisks.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Sin riesgo</p>
            ) : (
              <div className="space-y-1.5">
                {details.liquidationRisks.map((risk) => {
                  const drop = risk.dropPercent;
                  const liqColor =
                    drop === null ? "var(--muted)"
                    : drop < 0 ? "rgb(239,68,68)"
                    : drop < 10 ? "rgb(248,113,113)"
                    : drop < 25 ? "rgb(245,158,11)"
                    : "rgb(16,185,129)";
                  return (
                    <div key={risk.tokenSymbol} className="flex items-center justify-between gap-3 text-[11px]">
                      <span className="token-emphasis tabular-nums">{risk.tokenSymbol}</span>
                      <span className="text-[var(--muted)] tabular-nums">
                        {formatPriceCompact(risk.currentPrice)} → <span className="text-[var(--foreground)]">{formatPriceCompact(risk.liquidationPrice ?? 0)}</span>
                      </span>
                      <span className="font-semibold tabular-nums" style={{ color: liqColor }}>
                        {drop === null ? "—" : drop < 0 ? `${drop.toFixed(1)}%` : `−${drop.toFixed(1)}%`}
                      </span>
                    </div>
                  );
                })}
                <p className="text-[10px] text-[var(--muted)] pt-1">
                  Asumiendo el resto de precios constantes.
                </p>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

function BreakdownCell({ items, emptyLabel }: { items: DefiPosition["collateralBreakdown"]; emptyLabel: string }) {
  if (items.length === 0) {
    return <span className="text-xs text-[var(--muted)]">{emptyLabel}</span>;
  }

  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div key={item.tokenSymbol}>
          <p className="text-sm font-medium tabular-nums">
            {formatTokenAmount(item.amount)}{" "}
            <span className="token-emphasis">{item.tokenSymbol}</span>
          </p>
          <p className="text-[11px] tabular-nums text-[var(--muted)]">
            {currency(item.valueUsd)}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Parse numeric range from lpRangeLabel like "Rango BTC/ETH: 0.032 - 0.0357" */
function parseRange(label: string | null): { lower: number; upper: number; pair: string } | null {
  if (!label) return null;
  const match = label.match(/Rango\s+(\S+):\s*([\d.,]+)\s*-\s*([\d.,]+)/);
  if (!match) return null;
  const lower = parseFloat(match[2].replace(",", "."));
  const upper = parseFloat(match[3].replace(",", "."));
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower >= upper) return null;
  return { lower, upper, pair: match[1] };
}

/** Parse current price from currentPriceLabel like "Actual BTC/ETH: 32.4459" */
function parseCurrentPrice(label: string | null): number | null {
  if (!label) return null;
  const match = label.match(/Actual\s+\S+:\s*([\d.,]+)/);
  if (!match) return null;
  const val = parseFloat(match[1].replace(",", "."));
  return Number.isFinite(val) ? val : null;
}

/** Orca-style LP range visualization */
function LpRangeBar({ position }: { position: DefiPosition }) {
  if (position.lpRangeStatus === "correlated") {
    return (
      <span className="inline-flex rounded-full border border-[rgba(147,130,255,0.45)] bg-[rgba(147,130,255,0.1)] px-2.5 py-1 text-[11px] text-violet-300">
        Correlacionado
      </span>
    );
  }

  const range = parseRange(position.lpRangeLabel);
  const currentPrice = parseCurrentPrice(position.currentPriceLabel);

  if (!range || currentPrice === null) {
    if (position.lpRangeStatus === "na") {
      return <span className="text-xs text-[var(--muted)]">—</span>;
    }
    // Fallback: badge only
    return (
      <div className="space-y-1">
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${
            position.lpRangeStatus === "out_of_range"
              ? "border-[rgba(239,68,68,0.45)] bg-[rgba(239,68,68,0.1)] text-red-300"
              : "border-[rgba(16,185,129,0.45)] bg-[rgba(16,185,129,0.1)] text-emerald-300"
          }`}
        >
          {position.lpRangeStatus === "out_of_range" ? "Fuera de rango" : "En rango"}
        </span>
        {position.lpRangeLabel ? (
          <p className="text-[11px] text-[var(--muted)] leading-relaxed">{position.lpRangeLabel}</p>
        ) : null}
      </div>
    );
  }

  const { lower, upper, pair } = range;
  const isInRange = position.lpRangeStatus === "in_range";

  // Calculate visual position (with padding so marker doesn't clip at edges)
  const totalSpan = upper - lower;
  const padding = totalSpan * 0.15;
  const visualMin = lower - padding;
  const visualMax = upper + padding;
  const visualSpan = visualMax - visualMin;

  const clampedPrice = Math.max(visualMin, Math.min(visualMax, currentPrice));
  const markerPercent = ((clampedPrice - visualMin) / visualSpan) * 100;
  const lowerPercent = ((lower - visualMin) / visualSpan) * 100;
  const upperPercent = ((upper - visualMin) / visualSpan) * 100;
  const rangeWidth = upperPercent - lowerPercent;

  const barColor = isInRange ? "rgb(16,185,129)" : "rgb(239,68,68)";
  const barColorMuted = isInRange ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)";
  const markerGlow = isInRange ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.5)";

  const formatNum = (n: number) =>
    n >= 100 ? n.toLocaleString("en-US", { maximumFractionDigits: 1 })
    : n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 3 })
    : n.toLocaleString("en-US", { maximumFractionDigits: 4 });

  return (
    <div className="min-w-[160px] max-w-[220px]">
      {/* Pair label + status */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-[var(--muted)] font-medium tracking-wide">{pair}</span>
        <span
          className={`text-[10px] font-semibold ${isInRange ? "text-emerald-400" : "text-red-400"}`}
        >
          {isInRange ? "En rango" : "Fuera"}
        </span>
      </div>

      {/* Range bar */}
      <div className="relative h-2 rounded-full bg-[rgba(255,255,255,0.06)]">
        {/* Active range zone */}
        <div
          className="absolute top-0 h-full rounded-full"
          style={{
            left: `${lowerPercent}%`,
            width: `${rangeWidth}%`,
            background: `linear-gradient(90deg, ${barColorMuted}, ${barColor}80, ${barColorMuted})`,
          }}
        />

        {/* Current price marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
          style={{ left: `${markerPercent}%` }}
        >
          <div
            className="h-3.5 w-3.5 rounded-full border-2"
            style={{
              borderColor: barColor,
              background: "var(--void-deep)",
              boxShadow: `0 0 8px ${markerGlow}`,
            }}
          />
        </div>
      </div>

      {/* Lower / Current / Upper labels */}
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[9px] tabular-nums text-[var(--muted)]">{formatNum(lower)}</span>
        <span
          className={`text-[10px] tabular-nums font-semibold ${isInRange ? "text-emerald-300" : "text-red-300"}`}
        >
          {formatNum(currentPrice)}
        </span>
        <span className="text-[9px] tabular-nums text-[var(--muted)]">{formatNum(upper)}</span>
      </div>
    </div>
  );
}

export function PositionSectionCard({
  section,
  summary,
  viewer,
  harvestByPosition,
  isDeletingPositionKey,
  positionCompositeUiKey,
  openEditModal,
  deletePosition,
  openQuickHarvest,
  openReinvestHarvest,
}: PositionSectionCardProps) {
  const isLending = section.key === "lending";
  const showIlColumn = section.key === "liquidity_pools";
  const showHealthFactor = isLending;
  const showEntryPriceColumn = !isLending && section.key !== "liquidity_pools";
  const showYieldColumn = section.key !== "wallet";
  const showActionsColumn = viewer.canOperate;
  const sectionToneClass = `card-section-${section.key}`;
  const meta = SECTION_META[section.key] ?? { label: section.title, color: "#A0D2FF", glowClass: "text-[#A0D2FF]" };

  const thClass = "px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]";

  // colSpan dinámico para el panel de detalles lending (debe abarcar toda la tabla)
  const lendingColSpan =
    (isLending ? 2 : (showEntryPriceColumn ? 3 : 2)) +
    4 /* deposited, current, allocation, protocol */ +
    (showYieldColumn ? 1 : 0) +
    1 /* P&L */ +
    (showHealthFactor ? 1 : 0) +
    (showIlColumn ? 1 : 0) +
    (showActionsColumn ? 1 : 0);

  return (
    <section
      className={`glass-panel page-section-card ${sectionToneClass} p-5 md:p-6 mb-6 animate-fade-up`}
      aria-label={`Sección ${meta.label}`}
    >
      {/* Section header */}
      <div className="section-header-row mb-5 flex items-center justify-between gap-3 flex-wrap">
        <h2
          className={`text-2xl font-semibold tracking-tight ${meta.glowClass}`}
          style={{ textShadow: `0 0 30px ${meta.color}22` }}
        >
          {section.title}
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-black/30 px-3 py-1.5 text-xs text-[var(--muted)]">
          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
          {section.positions.length} posición{section.positions.length !== 1 ? "es" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="page-table-shell overflow-hidden rounded-[1rem] border border-[var(--glass-border)]">
        <table className="w-full min-w-[900px] border-collapse">
          <thead className="bg-[rgba(10,18,40,0.55)] text-left backdrop-blur-md">
            <tr>
              {isLending ? (
                <>
                  <th scope="col" className={thClass}>POSICIÓN COLATERAL</th>
                  <th scope="col" className={thClass}>POSICIÓN DEUDA</th>
                </>
              ) : (
                <>
                  <th scope="col" className={thClass}>ACTIVO</th>
                  <th scope="col" className={thClass}>SALDO</th>
                  {showEntryPriceColumn ? (
                    <th scope="col" className={thClass}>PRECIO ENTRADA</th>
                  ) : null}
                </>
              )}
              <th scope="col" className={thClass}>DEPOSITADO</th>
              <th scope="col" className={thClass}>VALOR ACTUAL</th>
              <th scope="col" className={thClass}>ASIGNACIÓN</th>
              <th scope="col" className={thClass}>PROTOCOLO</th>
              {showYieldColumn ? (
                <th scope="col" className={thClass}>YIELD</th>
              ) : null}
              <th scope="col" className={thClass}>P&L / ROI</th>
              {showHealthFactor ? (
                <th scope="col" className={thClass}>HEALTH</th>
              ) : null}
              {showIlColumn ? (
                <th scope="col" className={thClass}>RANGO</th>
              ) : null}
              {showActionsColumn ? (
                <th scope="col" className={thClass}>OPERAR</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {section.positions.map((position) => {
              const depositedValue =
                position.costBasisUsd !== null && Number.isFinite(position.costBasisUsd)
                  ? position.costBasisUsd!
                  : position.averageEntryPrice * position.currentBalance;
              const pnlValue = position.currentValue - depositedValue;
              const allocationPercent =
                summary.totalValueUsd > 0 ? (position.currentValue / summary.totalValueUsd) * 100 : 0;

              return (
                <Fragment key={`${position.positionId}-${position.tokenSymbol}`}>
                <tr
                  className="border-t border-[var(--line)]"
                >
                  {isLending ? (
                    <>
                      {/* Collateral breakdown */}
                      <td className="px-4 py-4">
                        <BreakdownCell items={position.collateralBreakdown} emptyLabel="Sin colateral" />
                      </td>
                      {/* Debt breakdown */}
                      <td className="px-4 py-4">
                        <BreakdownCell items={position.debtBreakdown} emptyLabel="Sin deuda" />
                      </td>
                    </>
                  ) : (
                    <>
                      {/* Asset */}
                      <td className="px-4 py-4">
                        <p className="token-emphasis text-sm">{position.tokenSymbol}</p>
                      </td>

                      {/* Balance */}
                      <td className="px-4 py-4 font-mono text-sm text-[var(--foreground)]">
                        {position.balanceLabel ?? position.currentBalance.toLocaleString("en-US")}
                      </td>

                      {/* Entry price */}
                      {showEntryPriceColumn ? (
                        <td className="px-4 py-4">
                          {position.isAggregatePosition ? (
                            <span className="text-xs text-[var(--muted)]">Posición agregada</span>
                          ) : (
                            <span className="text-sm">{currency(position.averageEntryPrice)}</span>
                          )}
                          {position.dataQualityIssue ? (
                            <p className="mt-1 text-[11px] text-amber-300">Revisar coste histórico</p>
                          ) : null}
                        </td>
                      ) : null}
                    </>
                  )}

                  {/* Deposited */}
                  <td className="px-4 py-4 value-emphasis text-sm">{currency(depositedValue)}</td>

                  {/* Current value */}
                  <td className="px-4 py-4 value-emphasis text-sm font-semibold">{currency(position.currentValue)}</td>

                  {/* Allocation */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-1 rounded-full bg-[var(--accent-primary)] opacity-60"
                        style={{ width: `${Math.min(60, allocationPercent)}px` }}
                        aria-hidden="true"
                      />
                      <span className="text-sm text-[var(--muted)]">{plainPercent(allocationPercent)}</span>
                    </div>
                  </td>

                  {/* Protocol badge */}
                  <td className="px-4 py-4">
                    <span
                      className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium"
                      style={{
                        borderColor: `${meta.color}44`,
                        backgroundColor: `${meta.color}12`,
                        color: meta.color,
                      }}
                    >
                      {position.protocol}
                    </span>
                  </td>

                  {/* Yield */}
                  {showYieldColumn ? (
                    <td className="px-4 py-4">
                      {position.totalHarvested > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(160,210,255,0.35)] bg-[rgba(160,210,255,0.09)] px-2.5 py-1 text-xs text-[#A0D2FF]">
                          <BadgeDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
                          {currency(position.totalHarvested)}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--muted)]">—</span>
                      )}
                    </td>
                  ) : null}

                  {/* P&L / ROI */}
                  <td className="px-4 py-4">
                    {position.dataQualityIssue ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(245,158,11,0.45)] bg-[rgba(245,158,11,0.1)] px-2.5 py-1 text-xs text-amber-300">
                        Revisar precio medio
                      </span>
                    ) : position.roiPercent >= 0 ? (
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(16,185,129,0.4)] bg-[rgba(16,185,129,0.1)] px-2.5 py-1 text-xs text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.12)]">
                          <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                          {percent(position.roiPercent)}
                        </span>
                        <p className="text-[11px] text-emerald-300">{signedCurrency(pnlValue)}</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(248,113,113,0.4)] bg-[rgba(248,113,113,0.1)] px-2.5 py-1 text-xs text-rose-400 shadow-[0_0_10px_rgba(248,113,113,0.12)]">
                          <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
                          {percent(position.roiPercent)}
                        </span>
                        <p className="text-[11px] text-rose-300">{signedCurrency(pnlValue)}</p>
                      </div>
                    )}
                  </td>

                  {/* Health factor */}
                  {showHealthFactor ? (
                    <td className="px-4 py-4">
                      {position.healthFactor === null ? (
                        <span className="text-xs text-[var(--muted)]">N/A</span>
                      ) : (
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                            position.healthStatus === "critical"
                              ? "border-[rgba(239,68,68,0.45)] bg-[rgba(239,68,68,0.1)] text-red-400"
                              : position.healthStatus === "warning"
                                ? "border-[rgba(245,158,11,0.45)] bg-[rgba(245,158,11,0.1)] text-amber-300"
                                : "border-[rgba(16,185,129,0.45)] bg-[rgba(16,185,129,0.1)] text-emerald-400"
                          }`}
                          aria-label={`Health factor: ${position.healthFactor.toFixed(2)} — ${position.healthStatus}`}
                        >
                          {position.healthFactor.toFixed(2)}
                        </span>
                      )}
                    </td>
                  ) : null}

                  {/* LP Range — Orca-style visual bar */}
                  {showIlColumn ? (
                    <td className="px-4 py-4">
                      <LpRangeBar position={position} />
                    </td>
                  ) : null}

                  {/* Actions — only shown when user can operate */}
                  {showActionsColumn ? (
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => openEditModal(position)}
                            className="btn-secondary btn-secondary-compact"
                            aria-label={`Modificar posición ${position.tokenSymbol}`}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            Modificar
                          </button>
                          {viewer.canDeletePosition ? (
                            <button
                              type="button"
                              onClick={() => deletePosition(position)}
                              disabled={isDeletingPositionKey === positionCompositeUiKey(position)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[rgba(248,113,113,0.4)] bg-[rgba(248,113,113,0.1)] px-2.5 py-1.5 text-xs text-rose-300 transition hover:bg-[rgba(248,113,113,0.2)] disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label={`Eliminar posición ${position.tokenSymbol}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              {isDeletingPositionKey === positionCompositeUiKey(position) ? "Eliminando..." : "Eliminar"}
                            </button>
                          ) : null}
                        </div>

                        {/* Harvest actions */}
                        {(section.key === "staking" || section.key === "liquidity_pools" || section.key === "lending") ? (
                          <div className="flex gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => openQuickHarvest(position)}
                              className="inline-flex items-center gap-1 rounded-md border border-[rgba(160,210,255,0.35)] bg-[rgba(160,210,255,0.08)] px-2 py-1 text-[11px] text-[#A0D2FF] transition hover:bg-[rgba(160,210,255,0.16)] hover:border-[rgba(160,210,255,0.55)]"
                              aria-label={`Registrar harvest para ${position.tokenSymbol}`}
                              style={{ transition: "all 0.3s var(--ease)" }}
                            >
                              <BadgeDollarSign className="h-3 w-3" aria-hidden="true" />
                              Harvest
                            </button>
                            {(() => {
                              const posKey = `${position.portfolioId}::${position.protocol}::${position.positionId}`;
                              const harvestInfo = harvestByPosition.find((h) => h.key === posKey);
                              const hasPending = (harvestInfo?.pendingUsd ?? 0) > 0;
                              if (!hasPending) return null;
                              return (
                                <button
                                  type="button"
                                  onClick={() => openReinvestHarvest(position)}
                                  className="inline-flex items-center gap-1 rounded-md border border-[rgba(157,80,187,0.45)] bg-[rgba(157,80,187,0.1)] px-2 py-1 text-[11px] text-[#D4B6EC] transition hover:bg-[rgba(157,80,187,0.2)] hover:border-[rgba(157,80,187,0.65)]"
                                  aria-label={`Reinvertir harvest pendiente de ${position.tokenSymbol}`}
                                  style={{ transition: "all 0.3s var(--ease)" }}
                                >
                                  <BadgeDollarSign className="h-3 w-3" aria-hidden="true" />
                                  Reinvertir
                                </button>
                              );
                            })()}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
                {isLending && position.lendingDetails ? (
                  <LendingDetailsPanel position={position} colSpan={lendingColSpan} />
                ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
