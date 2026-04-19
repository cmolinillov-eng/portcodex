"use client";

import { BadgeDollarSign, Clock, FileDown, History, LogOut, RefreshCw } from "lucide-react";
import { useState } from "react";
import { currency, plainPercent, percent, signedCurrency } from "../utils/formatters";

interface DashboardHeaderProps {
  summary: any;
  portfolioContext: any;
  viewer: any;
  pricesLastUpdatedAt: string | null;
  isRefreshingPrices: boolean;
  refreshPricesNow: () => void;
  exportCurrentReportPdf: () => void;
  openHistoryModal: () => void;
  compositionStyles: any;
  openModal: () => void;
}

export function DashboardHeader({
  summary,
  portfolioContext,
  viewer,
  pricesLastUpdatedAt,
  isRefreshingPrices,
  refreshPricesNow,
  exportCurrentReportPdf,
  openHistoryModal,
  compositionStyles,
  openModal,
}: DashboardHeaderProps) {
  const [hoveredCompositionKey, setHoveredCompositionKey] = useState<string | null>(null);

  const donutOuterStroke = 30;
  const donutActiveStroke = 38;
  const donutInnerInset = 34;

  const isPnlPositive = summary.pnlUsd >= 0;

  return (
    <header className="glass-panel relative overflow-hidden rounded-[2rem] px-5 pt-6 pb-5 md:px-8 md:pt-7 md:pb-6 animate-fade-up">
      {/* Ambient glow top-right */}
      <div
        className="pointer-events-none absolute top-0 right-0 h-[480px] w-[480px]"
        style={{
          background: "radial-gradient(ellipse at top right, rgba(160,210,255,0.07), transparent 55%)",
        }}
      />
      {/* Ambient glow bottom-left */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 h-[300px] w-[300px]"
        style={{
          background: "radial-gradient(ellipse at bottom left, rgba(157,80,187,0.05), transparent 60%)",
        }}
      />

      <div className="relative z-10 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(320px,0.55fr)] xl:items-center">

        {/* ── Col 1: Balance + Identity + Actions ── */}
        <div className="flex flex-col gap-4">
          {/* Main balance block */}
          <div className="relative">
            <p className="text-[11px] uppercase tracking-[0.25em] text-[var(--muted)]">
              Saldo Total del Portfolio
            </p>
            <h1 className="text-hero mt-1.5 text-5xl tracking-tight font-semibold md:text-6xl">
              {currency(summary.totalValueUsd)}
            </h1>

            {portfolioContext ? (
              <p className="mt-2.5 text-sm text-[var(--muted)] leading-relaxed">
                <span className="text-[var(--foreground)]">
                  {portfolioContext.ownerName || portfolioContext.ownerEmail || "Sin nombre"}
                </span>
                {portfolioContext.managerName || portfolioContext.managerEmail ? (
                  <>
                    <span className="mx-2 opacity-40">·</span>
                    <span className="opacity-70">Gestor: </span>
                    <span className="text-[var(--foreground)]">
                      {portfolioContext.managerName || portfolioContext.managerEmail}
                    </span>
                  </>
                ) : null}
              </p>
            ) : null}

            {/* Role badge */}
            <span
              className={`mt-3 inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide ${
                viewer.isSuperAdmin
                  ? "border-[rgba(99,102,241,0.5)] bg-[rgba(99,102,241,0.12)] text-indigo-300"
                  : viewer.role === "cliente"
                    ? "border-[rgba(245,158,11,0.45)] bg-[rgba(245,158,11,0.1)] text-amber-300"
                    : viewer.role === "admin"
                      ? "border-[rgba(160,210,255,0.45)] bg-[rgba(160,210,255,0.1)] text-[#A0D2FF]"
                      : "border-[rgba(157,80,187,0.45)] bg-[rgba(157,80,187,0.1)] text-[#C090E8]"
              }`}
            >
              {viewer.isSuperAdmin
                ? "Administrador Principal"
                : viewer.role === "cliente"
                  ? "Cliente · Solo lectura"
                  : viewer.role === "admin"
                    ? "Gestor"
                    : "Usuario Autónomo"}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {viewer.canRefreshPrices ? (
              <button
                type="button"
                onClick={() => refreshPricesNow()}
                disabled={isRefreshingPrices}
                className="btn-secondary px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Actualizar precios de mercado"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingPrices ? "animate-spin" : ""}`} />
                {isRefreshingPrices ? "Actualizando..." : "Actualizar precios"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={exportCurrentReportPdf}
              className="btn-secondary px-4 py-2 text-sm font-medium"
              aria-label="Descargar reporte PDF"
            >
              <FileDown className="h-3.5 w-3.5" />
              Reporte PDF
            </button>
            <button
              type="button"
              onClick={openHistoryModal}
              className="btn-secondary px-4 py-2 text-sm font-medium"
              aria-label="Ver historial de transacciones"
            >
              <History className="h-3.5 w-3.5" />
              Historial
            </button>
            <a
              href="/api/auth/logout?redirectTo=/login"
              className="btn-secondary px-4 py-2 text-sm font-medium"
              aria-label="Cerrar sesión"
            >
              <LogOut className="h-3.5 w-3.5" />
              Salir
            </a>
          </div>
        </div>

        {/* ── Col 2: Composition Donut ── */}
        <aside className="self-start animate-fade-up stagger-2 xl:-translate-x-4">
          <h2 className="mb-3 text-sm font-semibold tracking-[0.12em] uppercase text-[var(--muted)]">
            Composición de la Cartera
          </h2>
          <div className="grid gap-3 lg:grid-cols-[210px_minmax(0,1fr)] lg:items-center">
            {/* Donut */}
            <div className="flex items-center justify-center">
              <div className="relative h-52 w-52">
                <svg
                  viewBox="0 0 220 220"
                  className="h-52 w-52"
                  aria-hidden="true"
                  style={{ filter: "drop-shadow(0 0 16px rgba(160,210,255,0.22))" }}
                >
                  {/* Track */}
                  <circle
                    cx="110" cy="110" r="78"
                    fill="none"
                    stroke="rgba(14,30,50,0.9)"
                    strokeWidth={donutOuterStroke}
                  />
                  {/* Segments */}
                  {compositionStyles.entries.map((entry: any) => {
                    const ratio = Math.max(0, Math.min(1, entry.percent / 100));
                    const circumference = 2 * Math.PI * 78;
                    const segmentLength = circumference * ratio;
                    const segmentGap = Math.max(0, circumference - segmentLength);
                    const isActive = hoveredCompositionKey === entry.key;
                    const hasHovered = hoveredCompositionKey !== null;
                    return (
                      <circle
                        key={entry.key}
                        cx="110" cy="110" r="78"
                        fill="none"
                        stroke={entry.color}
                        strokeWidth={isActive ? donutActiveStroke : donutOuterStroke}
                        strokeLinecap="butt"
                        strokeDasharray={`${segmentLength} ${segmentGap}`}
                        strokeDashoffset={-(entry.start / 360) * circumference}
                        transform="rotate(-90 110 110)"
                        className="cursor-pointer"
                        style={{
                          transition: "stroke-width 0.3s var(--ease), opacity 0.3s var(--ease), filter 0.3s var(--ease)",
                          filter: isActive ? "drop-shadow(0 0 12px rgba(160,210,255,0.5))" : "none",
                          opacity: hasHovered && !isActive ? 0.25 : 1,
                        }}
                        onMouseEnter={() => setHoveredCompositionKey(entry.key)}
                        onMouseLeave={() => setHoveredCompositionKey(null)}
                        aria-label={`${entry.title}: ${entry.percent.toFixed(1)}%`}
                      />
                    );
                  })}
                </svg>
                {/* Inner hole */}
                <div
                  className="pointer-events-none absolute rounded-full"
                  style={{
                    inset: `${donutInnerInset}px`,
                    background: "radial-gradient(circle, rgba(6,12,24,0.97) 60%, rgba(10,20,42,0.9) 100%)",
                  }}
                />
                {/* Center label */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
                  <div className="px-3">
                    <p className="text-[9px] uppercase tracking-[0.22em] text-[var(--muted)]">Total</p>
                    <p className="mt-0.5 text-xl font-semibold leading-tight text-white">
                      {currency(summary.totalValueUsd)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Legend cards */}
            <div className="grid grid-cols-2 gap-2">
              {compositionStyles.entries.map((entry: any) => (
                <div
                  key={entry.key}
                  role="button"
                  tabIndex={0}
                  aria-pressed={hoveredCompositionKey === entry.key}
                  aria-label={`${entry.title}: ${entry.percent.toFixed(1)}% · ${currency(entry.value)}`}
                  onMouseEnter={() => setHoveredCompositionKey(entry.key)}
                  onMouseLeave={() => setHoveredCompositionKey(null)}
                  onFocus={() => setHoveredCompositionKey(entry.key)}
                  onBlur={() => setHoveredCompositionKey(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setHoveredCompositionKey(hoveredCompositionKey === entry.key ? null : entry.key);
                    }
                  }}
                  className="cursor-pointer rounded-xl border px-3 py-2.5 transition-all"
                  style={{
                    borderColor:
                      hoveredCompositionKey === entry.key
                        ? "rgba(160,210,255,0.65)"
                        : "var(--line)",
                    background:
                      hoveredCompositionKey === entry.key
                        ? "rgba(160,210,255,0.12)"
                        : "rgba(0,0,0,0.2)",
                    boxShadow:
                      hoveredCompositionKey === entry.key
                        ? "0 0 0 1px rgba(160,210,255,0.3), 0 0 16px rgba(160,210,255,0.18)"
                        : "none",
                    transition: "all 0.3s var(--ease)",
                  }}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: entry.color }}
                      aria-hidden="true"
                    />
                    <span className="text-[11px] text-[var(--muted)]">{plainPercent(entry.percent)}</span>
                  </div>
                  <p className="mt-1 text-xs font-medium leading-tight truncate">{entry.title}</p>
                  <p className="mt-0.5 text-sm font-semibold">{currency(entry.value)}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ── Col 3: Stats + Actions ── */}
        <div className="self-center animate-fade-up stagger-3 xl:justify-self-end">
          <div className="rounded-2xl border border-[var(--line)] bg-black/20 p-2.5 space-y-2">
            {/* Row: depositado + harvest */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-[var(--line)] bg-black/25 px-4 py-3">
                <div className="text-[9px] uppercase tracking-[0.18em] text-[var(--muted)]">Depositado</div>
                <p className="mt-1 text-lg font-semibold leading-tight">{currency(summary.totalDepositedUsd)}</p>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-black/25 px-4 py-3">
                <div className="text-[9px] uppercase tracking-[0.18em] text-[var(--muted)]">
                  <BadgeDollarSign className="mb-0.5 mr-1 inline h-3 w-3 opacity-60" aria-hidden="true" />
                  Harvest
                </div>
                <p className="mt-1 text-lg font-semibold leading-tight text-[#A0D2FF]">
                  {currency(summary.totalHarvestUsd)}
                </p>
              </div>
            </div>

            {/* Realized P&L (conditional) */}
            {summary.totalRealizedPnl !== 0 ? (
              <div className="rounded-xl border border-[var(--line)] bg-black/25 px-4 py-3">
                <div className="text-[9px] uppercase tracking-[0.18em] text-[var(--muted)]">P&L Realizado</div>
                <p className={`mt-1 text-base font-semibold leading-tight ${summary.totalRealizedPnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {signedCurrency(summary.totalRealizedPnl)}
                </p>
              </div>
            ) : null}

            {/* Glow divider */}
            <div className="glow-divider" />

            {/* P&L card — with ambient glow based on direction */}
            <div
              className={`rounded-xl border bg-black/25 px-4 py-3 transition-all duration-500 ${
                isPnlPositive ? "stat-card-profit" : "stat-card-loss"
              }`}
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.18em] text-[var(--muted)]">P&L %</div>
                  <p className={`mt-1 text-xl font-semibold leading-tight ${isPnlPositive ? "text-emerald-300" : "text-rose-300"}`}>
                    {percent(summary.pnlPercent)}
                  </p>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-[0.18em] text-[var(--muted)]">P&L USD</div>
                  <p className={`mt-1 text-xl font-semibold leading-tight ${isPnlPositive ? "text-emerald-300" : "text-rose-300"}`}>
                    {signedCurrency(summary.pnlUsd)}
                  </p>
                </div>
              </div>
            </div>

            {/* Timestamp — inside stats panel */}
            <div className="flex items-center gap-1.5 px-1 pt-0.5">
              <Clock className="h-3 w-3 text-[var(--muted)] opacity-50" aria-hidden="true" />
              <p className="text-[10px] text-[var(--muted)] opacity-70">
                Precios:{" "}
                {pricesLastUpdatedAt
                  ? new Date(pricesLastUpdatedAt).toLocaleString("es-ES")
                  : "sin datos"}
              </p>
            </div>
          </div>

          {/* Nueva Operación CTA */}
          {viewer.canOperate ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => openModal()}
                className="btn-primary w-full"
                aria-label="Registrar nueva operación"
              >
                + Nueva Operación
              </button>
            </div>
          ) : null}
        </div>

      </div>
    </header>
  );
}
