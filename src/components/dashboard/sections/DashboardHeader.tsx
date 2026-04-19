"use client";

import { BadgeDollarSign, Clock, FileDown, History, LogOut, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
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

  const donutOuterStroke = 28;
  const donutActiveStroke = 36;
  const donutR = 78;
  const donutInnerInset = 36;

  const isPnlPositive = summary.pnlUsd >= 0;

  // Find hovered entry for donut center display
  const hoveredEntry = hoveredCompositionKey
    ? compositionStyles.entries.find((e: any) => e.key === hoveredCompositionKey)
    : null;

  return (
    <header className="glass-panel relative overflow-hidden rounded-[2rem] px-5 pt-7 pb-5 md:px-8 md:pt-8 md:pb-6 animate-fade-up">
      {/* ── Iridescent top border ── */}
      <div
        className="pointer-events-none absolute top-0 left-0 right-0 z-20"
        style={{ height: "2px" }}
      >
        <div className="ola-border" />
      </div>

      {/* ── Multi-layer ambient lighting ── */}
      <div
        className="pointer-events-none absolute -top-20 -right-20 h-[560px] w-[560px]"
        style={{
          background: "radial-gradient(ellipse at 70% 20%, rgba(160,210,255,0.09), transparent 50%)",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-16 -left-16 h-[400px] w-[400px]"
        style={{
          background: "radial-gradient(ellipse at 30% 80%, rgba(157,80,187,0.07), transparent 55%)",
        }}
      />
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 h-[300px] w-[600px] -translate-x-1/2 -translate-y-1/2"
        style={{
          background: "radial-gradient(ellipse, rgba(160,210,255,0.03), transparent 60%)",
        }}
      />

      <div className="relative z-10 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(300px,0.5fr)] xl:items-center">

        {/* ══════════════════════════════════════════════════════════
            Col 1: Balance + Identity + Actions
            ══════════════════════════════════════════════════════════ */}
        <div className="flex flex-col gap-5">
          <div className="relative">
            {/* Pulsing glow behind balance */}
            <div
              className="header-balance-glow pointer-events-none absolute -top-8 -left-6 h-40 w-64 rounded-full"
              style={{
                background: "radial-gradient(ellipse, rgba(160,210,255,0.2), transparent 70%)",
              }}
            />

            <p className="relative text-[10px] uppercase tracking-[0.3em] text-[var(--muted)] font-medium">
              Saldo Total del Portfolio
            </p>
            <h1 className="text-hero relative mt-2 text-5xl tracking-tight font-semibold md:text-6xl lg:text-[4rem]">
              {currency(summary.totalValueUsd)}
            </h1>

            {/* Shimmer line under balance */}
            <div className="header-shimmer-line mt-3 w-48 rounded-full opacity-60" />

            {/* P&L inline indicator under balance */}
            <div className="mt-3 flex items-center gap-3">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  isPnlPositive
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "bg-rose-500/10 text-rose-300"
                }`}
              >
                {isPnlPositive
                  ? <TrendingUp className="h-3 w-3" />
                  : <TrendingDown className="h-3 w-3" />
                }
                {percent(summary.pnlPercent)}
              </span>
              <span className={`text-sm font-medium ${isPnlPositive ? "text-emerald-300/70" : "text-rose-300/70"}`}>
                {signedCurrency(summary.pnlUsd)}
              </span>
            </div>

            {portfolioContext ? (
              <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed">
                <span className="text-[var(--foreground)] font-medium">
                  {portfolioContext.ownerName || portfolioContext.ownerEmail || "Sin nombre"}
                </span>
                {portfolioContext.managerName || portfolioContext.managerEmail ? (
                  <>
                    <span className="mx-2 opacity-30">|</span>
                    <span className="opacity-60">Gestor: </span>
                    <span className="text-[var(--foreground)] opacity-80">
                      {portfolioContext.managerName || portfolioContext.managerEmail}
                    </span>
                  </>
                ) : null}
              </p>
            ) : null}

            {/* Role badge */}
            <span
              className={`mt-2.5 inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase ${
                viewer.isSuperAdmin
                  ? "border-indigo-500/50 bg-indigo-500/12 text-indigo-300"
                  : viewer.role === "cliente"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                    : viewer.role === "admin"
                      ? "border-[rgba(160,210,255,0.45)] bg-[rgba(160,210,255,0.1)] text-[#A0D2FF]"
                      : "border-purple-500/40 bg-purple-500/10 text-[#C090E8]"
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

        {/* ══════════════════════════════════════════════════════════
            Col 2: Composition Donut + Legend
            ══════════════════════════════════════════════════════════ */}
        <aside className="self-start animate-fade-up stagger-2">
          <h2 className="mb-4 text-[10px] font-semibold tracking-[0.2em] uppercase text-[var(--muted)]">
            Composición de la Cartera
          </h2>
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center">
            {/* Donut with orbital rings */}
            <div className="flex items-center justify-center">
              <div className="relative h-56 w-56">
                {/* Outer orbital ring — decorative */}
                <svg
                  viewBox="0 0 240 240"
                  className="header-orbit-ring pointer-events-none absolute -inset-3 h-[calc(100%+24px)] w-[calc(100%+24px)]"
                  aria-hidden="true"
                >
                  <circle
                    cx="120" cy="120" r="116"
                    fill="none"
                    stroke="rgba(160,210,255,0.08)"
                    strokeWidth="0.5"
                    strokeDasharray="4 12"
                  />
                  {/* Orbital dots */}
                  <circle cx="120" cy="4" r="1.5" fill="rgba(160,210,255,0.35)" />
                  <circle cx="236" cy="120" r="1" fill="rgba(157,80,187,0.3)" />
                  <circle cx="120" cy="236" r="1.5" fill="rgba(160,210,255,0.25)" />
                </svg>

                {/* Inner orbital ring — counter-rotate */}
                <svg
                  viewBox="0 0 240 240"
                  className="header-orbit-ring-reverse pointer-events-none absolute -inset-1 h-[calc(100%+8px)] w-[calc(100%+8px)]"
                  aria-hidden="true"
                >
                  <circle
                    cx="120" cy="120" r="112"
                    fill="none"
                    stroke="rgba(157,80,187,0.06)"
                    strokeWidth="0.5"
                    strokeDasharray="2 18"
                  />
                  <circle cx="8" cy="120" r="1" fill="rgba(157,80,187,0.2)" />
                </svg>

                {/* Main donut SVG */}
                <svg
                  viewBox="0 0 220 220"
                  className="relative h-56 w-56"
                  aria-hidden="true"
                  style={{ filter: "drop-shadow(0 0 20px rgba(160,210,255,0.18))" }}
                >
                  {/* Track */}
                  <circle
                    cx="110" cy="110" r={donutR}
                    fill="none"
                    stroke="rgba(14,30,50,0.9)"
                    strokeWidth={donutOuterStroke}
                  />
                  {/* Segments */}
                  {compositionStyles.entries.map((entry: any) => {
                    const ratio = Math.max(0, Math.min(1, entry.percent / 100));
                    const circumference = 2 * Math.PI * donutR;
                    const segmentLength = circumference * ratio;
                    const segmentGap = Math.max(0, circumference - segmentLength);
                    const isActive = hoveredCompositionKey === entry.key;
                    const hasHovered = hoveredCompositionKey !== null;
                    return (
                      <circle
                        key={entry.key}
                        cx="110" cy="110" r={donutR}
                        fill="none"
                        stroke={entry.color}
                        strokeWidth={isActive ? donutActiveStroke : donutOuterStroke}
                        strokeLinecap="butt"
                        strokeDasharray={`${segmentLength} ${segmentGap}`}
                        strokeDashoffset={-(entry.start / 360) * circumference}
                        transform="rotate(-90 110 110)"
                        className="cursor-pointer"
                        style={{
                          transition: "stroke-width 0.35s var(--ease), opacity 0.35s var(--ease), filter 0.35s var(--ease)",
                          filter: isActive
                            ? `drop-shadow(0 0 14px ${entry.color}80)`
                            : "none",
                          opacity: hasHovered && !isActive ? 0.2 : 1,
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
                    background: "radial-gradient(circle, rgba(6,12,24,0.98) 55%, rgba(10,20,42,0.92) 100%)",
                    boxShadow: "inset 0 0 20px rgba(0,0,0,0.5)",
                  }}
                />

                {/* Center label — dynamic on hover */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
                  <div className="px-3" style={{ transition: "opacity 0.25s var(--ease)" }}>
                    {hoveredEntry ? (
                      <>
                        <div
                          className="mx-auto mb-1 h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: hoveredEntry.color }}
                        />
                        <p className="text-[9px] uppercase tracking-[0.18em] text-[var(--muted)] truncate max-w-[100px]">
                          {hoveredEntry.title}
                        </p>
                        <p className="mt-0.5 text-lg font-semibold leading-tight text-white">
                          {currency(hoveredEntry.value)}
                        </p>
                        <p className="mt-0.5 text-[10px] font-medium" style={{ color: hoveredEntry.color }}>
                          {plainPercent(hoveredEntry.percent)}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-[9px] uppercase tracking-[0.22em] text-[var(--muted)]">Total</p>
                        <p className="mt-0.5 text-xl font-semibold leading-tight text-white">
                          {currency(summary.totalValueUsd)}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Legend cards */}
            <div className="grid grid-cols-2 gap-2">
              {compositionStyles.entries.map((entry: any) => {
                const isActive = hoveredCompositionKey === entry.key;
                return (
                  <div
                    key={entry.key}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isActive}
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
                    className="group cursor-pointer rounded-xl border px-3 py-2.5"
                    style={{
                      borderColor: isActive
                        ? `${entry.color}99`
                        : "var(--line)",
                      background: isActive
                        ? `${entry.color}18`
                        : "rgba(0,0,0,0.2)",
                      boxShadow: isActive
                        ? `0 0 0 1px ${entry.color}30, 0 0 20px ${entry.color}20`
                        : "none",
                      transition: "all 0.3s var(--ease)",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 flex-shrink-0 rounded-full"
                        style={{
                          backgroundColor: entry.color,
                          boxShadow: isActive ? `0 0 8px ${entry.color}60` : "none",
                          transition: "box-shadow 0.3s var(--ease)",
                        }}
                        aria-hidden="true"
                      />
                      <span className="text-[10px] font-medium text-[var(--muted)]">
                        {plainPercent(entry.percent)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs font-medium leading-tight truncate text-[var(--foreground)]">
                      {entry.title}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums">
                      {currency(entry.value)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* ══════════════════════════════════════════════════════════
            Col 3: Stats Panel (redesigned — left-accent bars)
            ══════════════════════════════════════════════════════════ */}
        <div className="self-center animate-fade-up stagger-3 xl:justify-self-end w-full xl:max-w-[320px]">
          <div className="rounded-2xl border border-[var(--line)] bg-black/20 p-4 space-y-3">
            {/* Depositado */}
            <div className="header-stat-row" style={{ "--stat-accent": "var(--accent-primary)" } as React.CSSProperties}>
              <div className="text-[9px] uppercase tracking-[0.18em] text-[var(--muted)] font-medium">Depositado</div>
              <p className="mt-0.5 text-xl font-semibold leading-tight tabular-nums">
                {currency(summary.totalDepositedUsd)}
              </p>
            </div>

            {/* Harvest */}
            <div className="header-stat-row" style={{ "--stat-accent": "#A0D2FF" } as React.CSSProperties}>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] uppercase tracking-[0.18em] text-[var(--muted)] font-medium">Harvest</span>
                <BadgeDollarSign className="h-3 w-3 text-[#A0D2FF] opacity-50" aria-hidden="true" />
              </div>
              <p className="mt-0.5 text-xl font-semibold leading-tight text-[#A0D2FF] tabular-nums">
                {currency(summary.totalHarvestUsd)}
              </p>
            </div>

            {/* Realized P&L (conditional) */}
            {summary.totalRealizedPnl !== 0 ? (
              <div
                className="header-stat-row"
                style={{ "--stat-accent": summary.totalRealizedPnl >= 0 ? "var(--profit)" : "var(--loss)" } as React.CSSProperties}
              >
                <div className="text-[9px] uppercase tracking-[0.18em] text-[var(--muted)] font-medium">P&L Realizado</div>
                <p className={`mt-0.5 text-lg font-semibold leading-tight tabular-nums ${summary.totalRealizedPnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {signedCurrency(summary.totalRealizedPnl)}
                </p>
              </div>
            ) : null}

            {/* Glow divider */}
            <div className="glow-divider" />

            {/* P&L card — ambient glow */}
            <div
              className={`rounded-xl border bg-black/25 px-4 py-3.5 transition-all duration-500 ${
                isPnlPositive ? "stat-card-profit" : "stat-card-loss"
              }`}
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.18em] text-[var(--muted)] font-medium">P&L %</div>
                  <p className={`mt-1 text-2xl font-bold leading-tight tabular-nums ${isPnlPositive ? "text-emerald-300" : "text-rose-300"}`}>
                    {percent(summary.pnlPercent)}
                  </p>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-[0.18em] text-[var(--muted)] font-medium">P&L USD</div>
                  <p className={`mt-1 text-2xl font-bold leading-tight tabular-nums ${isPnlPositive ? "text-emerald-300" : "text-rose-300"}`}>
                    {signedCurrency(summary.pnlUsd)}
                  </p>
                </div>
              </div>
            </div>

            {/* Timestamp */}
            <div className="flex items-center gap-1.5 px-1 pt-0.5">
              <Clock className="h-3 w-3 text-[var(--muted)] opacity-40" aria-hidden="true" />
              <p className="text-[10px] text-[var(--muted)] opacity-60">
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
