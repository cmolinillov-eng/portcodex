"use client";

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
                <tr
                  key={`${position.positionId}-${position.tokenSymbol}`}
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
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
