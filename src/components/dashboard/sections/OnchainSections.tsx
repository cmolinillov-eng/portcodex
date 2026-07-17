"use client";

import { useState } from "react";
import { BadgeDollarSign, Layers, Pencil, TrendingDown, TrendingUp } from "lucide-react";
import type { LivePosition, ManualPositionRef } from "./OnchainLivePanel";
import { useMoneyFormatters } from "../utils/currency-context";

/** currency() ligada a la moneda activa (€/$). Null-safe como la de módulo. */
function useCurrencyFmt() {
  const { fmtMoney } = useMoneyFormatters();
  return (n: number | null | undefined) => (n == null ? "—" : fmtMoney(n));
}

/**
 * Secciones on-chain con la MISMA presentación que las tarjetas manuales
 * (PositionSectionCard): Liquidity Pools / Lending / Staking / Hold, con
 * SALDO, DEPOSITADO (de la posición contable enlazada), VALOR ACTUAL,
 * ASIGNACIÓN, PROTOCOLO, YIELD (cosechado + sin reclamar), P&L/ROI y RANGO
 * visual. Los datos vienen de blockchain; el cost basis y el yield acumulado,
 * de la contabilidad vía position_links.
 */

export type OnchainLinkRow = {
  id: string;
  onchain_id: string;
  protocol: string;
  position_id: string;
  position_type: string;
  auto_ingest?: boolean;
  /** Depositado manual del gestor: manda sobre la base contable derivada. */
  deposited_override_usd?: number | null;
};

const SECTION_META: Record<string, { label: string; color: string; glowClass: string; kinds: string[] }> = {
  liquidity_pools: { label: "Liquidity Pools", color: "#6FAE8F", glowClass: "text-[#6FAE8F]", kinds: ["liquidity"] },
  lending: { label: "Lending", color: "#C9A45E", glowClass: "text-[#C9A45E]", kinds: ["lending_supply", "lending_borrow"] },
  staking: { label: "Staking", color: "#8CA0B3", glowClass: "text-[#8CA0B3]", kinds: ["staking", "reward"] },
  wallet: { label: "Hold", color: "#8CA0B3", glowClass: "text-[#8CA0B3]", kinds: ["wallet"] },
  other: { label: "Otros", color: "#6FAE8F", glowClass: "text-[#6FAE8F]", kinds: ["perp", "other"] },
};


function formatTokenAmount(amount: number): string {
  if (amount >= 1000) return amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (amount >= 1) return amount.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return amount.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/** Normaliza símbolos para casar on-chain ↔ contable (WETH≈ETH, USDT0≈USDT…). */
export function normalizeSymbol(s: string): string {
  let x = s.trim().toUpperCase();
  if (x === "USDT0") x = "USDT";
  if (x === "CBBTC" || x === "WBTC" || x === "BTCB") x = "BTC";
  if (x === "WETH") x = "ETH";
  if (x === "WBNB") x = "BNB";
  if (x === "WSOL") x = "SOL";
  if (x === "WMATIC" || x === "WPOL") x = "POL";
  return x;
}

/** "WETH/cbBTC" → "BTC|ETH" (conjunto ordenado y normalizado). */
export function tokenSetKey(label: string): string {
  return label
    .split(/[/+·]/)
    .map((t) => normalizeSymbol(t))
    .filter(Boolean)
    .sort()
    .join("|");
}

export function protocolsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = (a ?? "").toLowerCase().replace(/\s+v\d+$/, "").trim();
  const nb = (b ?? "").toLowerCase().replace(/\s+v\d+$/, "").trim();
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function kindMatchesType(kind: string, positionType: string): boolean {
  const t = positionType.toLowerCase();
  if (kind === "liquidity") return t.includes("liquid") || t.includes("lp") || t.includes("pool");
  if (kind.startsWith("lending")) return t.includes("lending");
  if (kind === "staking" || kind === "reward") return t.includes("staking");
  if (kind === "wallet") return t.includes("hold") || t.includes("wallet");
  return false;
}

/** Barra de rango estilo Orca (misma visual que la tarjeta manual). */
function RangeBar({ range, label }: { range: NonNullable<LivePosition["range"]>; label: string }) {
  const { lower, upper, current, inRange } = range;
  const totalSpan = upper - lower;
  if (!(totalSpan > 0)) return <span className="text-xs text-[var(--muted)]">—</span>;
  const padding = totalSpan * 0.15;
  const visualMin = lower - padding;
  const visualSpan = totalSpan + padding * 2;
  const clamped = Math.max(visualMin, Math.min(visualMin + visualSpan, current));
  const markerPercent = ((clamped - visualMin) / visualSpan) * 100;
  const lowerPercent = ((lower - visualMin) / visualSpan) * 100;
  const rangeWidth = ((upper - lower) / visualSpan) * 100;

  const barColor = inRange ? "rgb(111,174,143)" : "rgb(206,139,130)";
  const barColorMuted = inRange ? "rgba(111,174,143,0.25)" : "rgba(206,139,130,0.25)";

  const formatNum = (n: number) =>
    n >= 100 ? n.toLocaleString("en-US", { maximumFractionDigits: 1 })
    : n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 3 })
    : n.toLocaleString("en-US", { maximumFractionDigits: 4 });

  return (
    <div className="min-w-[160px] max-w-[220px]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-[var(--muted)] font-medium tracking-wide">{label}</span>
        <span className={`text-[10px] font-semibold ${inRange ? "text-emerald-400" : "text-red-400"}`}>
          {inRange ? "En rango" : "Fuera"}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-[rgba(255,255,255,0.06)]">
        <div
          className="absolute top-0 h-full rounded-full"
          style={{
            left: `${lowerPercent}%`,
            width: `${rangeWidth}%`,
            background: `linear-gradient(90deg, ${barColorMuted}, ${barColor}80, ${barColorMuted})`,
          }}
        />
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2" style={{ left: `${markerPercent}%` }}>
          <div
            className="h-3.5 w-3.5 rounded-full border-2"
            style={{ borderColor: barColor, background: "var(--void-deep)", boxShadow: `0 0 8px ${barColor}80` }}
          />
        </div>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[9px] tabular-nums text-[var(--muted)]">{formatNum(lower)}</span>
        <span className={`text-[10px] tabular-nums font-semibold ${inRange ? "text-emerald-300" : "text-red-300"}`}>
          {formatNum(current)}
        </span>
        <span className="text-[9px] tabular-nums text-[var(--muted)]">{formatNum(upper)}</span>
      </div>
    </div>
  );
}

type RowMetrics = {
  deposited: number | null;
  harvested: number;
  value: number;
  pnl: number | null;
  roi: number | null;
  allocation: number;
  hf: number | null;
};

/** Métricas derivadas de una posición (compartidas por tabla y tarjeta móvil).
 *  `override` es el depositado manual del gestor: si existe, manda sobre la
 *  base contable derivada (columna DEPOSITADO / P&L). */
function computeMetrics(
  p: LivePosition,
  manual: ManualPositionRef | null,
  total: number,
  override: number | null = null,
): RowMetrics {
  const onchainAmount = p.tokens?.[0]?.amount ?? null;
  const derived =
    p.kind === "wallet" && manual?.averageEntryPrice && onchainAmount != null && manual.averageEntryPrice > 0
      ? manual.averageEntryPrice * Math.abs(onchainAmount)
      : manual?.depositedValue ?? null;
  // El depositado corregido por el gestor (override) MANDA sobre la base
  // derivada de transacciones: es la corrección explícita de una base que el
  // gestor sabe incorrecta. El header aplica el mismo override en
  // get-dashboard-data, así que columna y Total Depositado no divergen.
  const deposited = override != null && Number.isFinite(override) && override > 0
    ? override
    : derived;
  const value = p.valueUsd ?? 0;
  const pnl = deposited != null && deposited > 0 ? value - deposited : null;
  const roi = pnl != null && deposited ? (pnl / deposited) * 100 : null;
  const allocation = total > 0 ? (value / total) * 100 : 0;
  const hf = typeof p.meta?.healthFactor === "number" ? (p.meta.healthFactor as number) : null;
  return { deposited, harvested: manual?.totalHarvested ?? 0, value, pnl, roi, allocation, hf };
}

/** Fila colapsada en tarjeta para móvil (≤ md), como la pantalla 390 del mockup. */
function MobilePositionCard({
  p,
  m,
  showRange,
  portfolioId,
  canManage,
}: {
  p: LivePosition;
  m: RowMetrics;
  showRange: boolean;
  portfolioId: string;
  canManage: boolean;
}) {
  const currency = useCurrencyFmt();
  return (
    <div className="border-t border-[var(--line)] px-4 py-4 first:border-t-0">
      {/* Fila 1: activo + protocolo (izq) · valor + P&L (der) */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="token-emphasis text-sm">{p.label}</p>
          <p className="truncate text-[11px] text-[var(--muted)]">
            {p.protocol ?? "Wallet"}
            {p.chain ? ` · ${p.chain}` : ""}
            {p.walletLabel ? ` · ${p.walletLabel}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="value-emphasis text-sm font-semibold tabular-nums">{currency(m.value)}</p>
          {m.roi != null ? (
            <p className={`text-[11px] tabular-nums ${m.roi >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {m.roi >= 0 ? "+" : ""}{m.roi.toFixed(2)}%
            </p>
          ) : null}
        </div>
      </div>

      {/* Depositado: editable (alta o corrección) también en móvil */}
      {canManage && portfolioId ? (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--muted)]">
          <span className="font-mono">dep</span>
          <DepositedCell p={p} portfolioId={portfolioId} deposited={m.deposited} canManage={canManage} />
        </div>
      ) : null}

      {/* Fila 2: asignación · yield, en mono tenue */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[11px] text-[var(--muted)] tabular-nums">
        {!canManage && m.deposited != null ? (
          <span>dep <span className="text-[var(--ink-2)]">{currency(m.deposited)}</span></span>
        ) : null}
        <span>asig <span className="text-[var(--ink-2)]">{m.allocation.toFixed(2)}%</span></span>
        {p.unclaimedUsd && p.unclaimedUsd > 0.01 ? (
          <span className="text-emerald-300">+{currency(p.unclaimedUsd)} s/reclamar</span>
        ) : null}
        {m.harvested > 0 ? (
          <span title="Harvest total cosechado en esta posición">yield <span className="text-[#6FAE8F]">+{currency(m.harvested)}</span></span>
        ) : null}
        {m.hf != null ? (
          <span>HF <span className={m.hf < 1.2 ? "text-red-400" : m.hf < 2 ? "text-amber-300" : "text-emerald-400"}>{m.hf.toFixed(2)}</span></span>
        ) : null}
      </div>

      {/* Fila 3: rango full-width (solo pools con rango) */}
      {showRange && p.range ? (
        <div className="mt-3">
          <RangeBar range={p.range} label={p.label} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Adopción inline: cuando una posición no tiene base contable, el gestor
 * escribe cuánto depositó ahí mismo (celda DEPOSITADO) y la posición queda
 * sellada y en automático. Sustituye a la antigua sección de conciliación.
 */
function AdoptInline({
  p,
  portfolioId,
  initial = null,
  onCancel,
}: {
  p: LivePosition;
  portfolioId: string;
  /** Valor previo a corregir (edición); vacío = alta nueva. */
  initial?: number | null;
  onCancel?: () => void;
}) {
  const [usd, setUsd] = useState(initial != null && initial > 0 ? String(Math.round(initial * 100) / 100) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function adopt() {
    const deposited = Number(usd.replace(",", "."));
    if (!Number.isFinite(deposited) || deposited <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onchain/adopt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioId,
          onchainId: p.id,
          protocol: p.protocol ?? "Wallet",
          label: p.label,
          kind: p.kind,
          // Solo las patas de ACTIVO: la deuda (amount/valueUsd negativos en
          // lending) no forma parte de la base depositada — con Math.abs se
          // colaba como pata a precio 0 y el check de la BD tumbaba el alta.
          tokens: (p.tokens ?? [])
            .filter((t) => t.amount > 0 && (t.valueUsd == null || t.valueUsd > 0))
            .map((t) => ({ symbol: t.symbol, amount: t.amount, valueUsd: t.valueUsd })),
          // Rango real on-chain → metadata.lp de las filas de adopción (el
          // trigger de integridad lo exige en pools).
          range: p.range ? { lower: p.range.lower, upper: p.range.upper, current: p.range.current } : null,
          depositedUsd: deposited,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Error ${res.status}`);
      }
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "No se pudo guardar.");
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1" title={error ?? "Indica cuánto depositaste al abrir esta posición: fija su base y calcula ganancia/pérdida desde ahí. Puedes corregirlo cuando quieras."}>
      <input
        type="text"
        inputMode="decimal"
        value={usd}
        autoFocus={initial != null}
        onChange={(e) => setUsd(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void adopt();
          if (e.key === "Escape") onCancel?.();
        }}
        placeholder="$ depositado"
        className={`w-[92px] rounded-md border bg-transparent px-2 py-1 font-mono text-xs text-[var(--foreground)] placeholder:text-[var(--faint)] ${error ? "border-[var(--loss)]" : "border-[var(--line)]"}`}
      />
      <button
        type="button"
        onClick={adopt}
        disabled={busy || !usd.trim()}
        className="rounded-md border border-[var(--line)] px-1.5 py-1 text-xs text-[var(--muted)] transition-colors hover:border-[rgba(111,174,143,0.45)] hover:text-[var(--accent-primary)] disabled:opacity-40"
        aria-label="Guardar depositado de esta posición"
      >
        {busy ? "…" : "✓"}
      </button>
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md border border-[var(--line)] px-1.5 py-1 text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)] disabled:opacity-40"
          aria-label="Cancelar edición del depositado"
        >
          ✕
        </button>
      ) : null}
      {error ? (
        <span className="basis-full text-[10px] leading-tight text-[var(--loss)]">{error}</span>
      ) : null}
    </span>
  );
}

/**
 * Celda DEPOSITADO: muestra el valor con un lápiz para corregirlo, o el input
 * de alta si aún no hay base. El gestor puede fijar/editar el depositado en
 * CUALQUIER posición; sin permiso de gestión solo se ve el valor.
 */
function DepositedCell({
  p,
  portfolioId,
  deposited,
  canManage,
}: {
  p: LivePosition;
  portfolioId: string;
  deposited: number | null;
  canManage: boolean;
}) {
  const currency = useCurrencyFmt();
  const [editing, setEditing] = useState(false);
  const editable = canManage && !!portfolioId;

  if (deposited == null) {
    return editable ? (
      <AdoptInline p={p} portfolioId={portfolioId} />
    ) : (
      <span className="text-xs text-[var(--muted)]">—</span>
    );
  }

  if (editing) {
    return <AdoptInline p={p} portfolioId={portfolioId} initial={deposited} onCancel={() => setEditing(false)} />;
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular-nums">{currency(deposited)}</span>
      {editable ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[var(--muted)] transition-colors hover:text-[var(--accent-primary)]"
          aria-label="Corregir depositado de esta posición"
          title="Corregir el depositado"
        >
          <Pencil className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}

export function OnchainSections({
  positions,
  links,
  manualPositions,
  portfolioId = "",
  canManage = false,
}: {
  positions: LivePosition[];
  links: OnchainLinkRow[];
  manualPositions: ManualPositionRef[];
  portfolioId?: string;
  canManage?: boolean;
}) {
  const currency = useCurrencyFmt();
  const total = positions.reduce((s, p) => s + (p.valueUsd ?? 0), 0);
  const manualByKey = new Map(manualPositions.map((m) => [`${m.protocol}::${m.positionId}`, m]));
  const linkByOnchain = new Map(links.map((l) => [l.onchain_id, l]));

  /** Contable enlazada de una posición on-chain (para depositado/yield). */
  function linkedManual(p: LivePosition): ManualPositionRef | null {
    const link = linkByOnchain.get(p.id);
    if (!link) return null;
    return manualByKey.get(`${link.protocol}::${link.position_id}`) ?? null;
  }

  /** Depositado manual del gestor (override): manda sobre la base derivada. */
  function overrideOf(p: LivePosition): number | null {
    const v = linkByOnchain.get(p.id)?.deposited_override_usd;
    return v != null && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
  }

  const sections = Object.entries(SECTION_META)
    .map(([key, meta]) => ({
      key,
      meta,
      rows: positions.filter((p) => meta.kinds.includes(p.kind) && (p.valueUsd ?? 0) >= 0.5),
    }))
    .filter((s) => s.rows.length > 0);

  const thClass = "px-4 py-3 font-mono text-[11px] font-medium tracking-[0.14em] text-[var(--muted)]";

  return (
    <>
      {sections.map(({ key, meta, rows }) => {
        const isPools = key === "liquidity_pools";
        const isLending = key === "lending";
        const showYield = key !== "wallet";
        const subtotal = rows.reduce((s, p) => s + (p.valueUsd ?? 0), 0);

        return (
          <section key={key} className={`glass-panel page-section-card card-section-${key} p-5 md:p-6 mb-6`} aria-label={`Sección on-chain ${meta.label}`}>
            <div className="section-header-row mb-5 flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-designer text-2xl font-semibold tracking-tight text-[var(--foreground)]">
                {meta.label}
              </h2>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-[var(--foreground)]">{currency(subtotal)}</span>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  {rows.length} posición{rows.length !== 1 ? "es" : ""}
                </span>
              </div>
            </div>

            {/* Móvil: tarjetas apiladas (≤ md) */}
            <div className="rounded-[1rem] border border-[var(--glass-border)] md:hidden">
              {rows.map((p) => (
                <MobilePositionCard
                  key={p.id}
                  p={p}
                  m={computeMetrics(p, linkedManual(p), total, overrideOf(p))}
                  showRange={isPools}
                  portfolioId={portfolioId}
                  canManage={canManage}
                />
              ))}
            </div>

            {/* Desktop: tabla completa (≥ md) */}
            <div className="page-table-shell hidden overflow-x-auto rounded-[1rem] border border-[var(--glass-border)] md:block">
              <table className="w-full min-w-[900px] border-collapse">
                <thead className="bg-[rgba(10,11,14,0.55)] text-left backdrop-blur-md">
                  <tr>
                    <th scope="col" className={thClass}>ACTIVO</th>
                    <th scope="col" className={thClass}>SALDO</th>
                    <th scope="col" className={thClass}>DEPOSITADO</th>
                    <th scope="col" className={thClass}>VALOR ACTUAL</th>
                    <th scope="col" className={thClass}>ASIGNACIÓN</th>
                    <th scope="col" className={thClass}>PROTOCOLO</th>
                    {showYield ? <th scope="col" className={thClass}>YIELD</th> : null}
                    <th scope="col" className={thClass}>P&L / ROI</th>
                    {isLending ? <th scope="col" className={thClass}>HEALTH</th> : null}
                    {isPools ? <th scope="col" className={thClass}>RANGO</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const { deposited, harvested, value, pnl, roi, allocation, hf } = computeMetrics(p, linkedManual(p), total, overrideOf(p));

                    return (
                      <tr key={p.id} className="border-t border-[var(--line)]">
                        {/* ACTIVO */}
                        <td className="px-4 py-4">
                          <p className="token-emphasis text-sm inline-flex items-center gap-1.5">
                            {p.label}
                            {linkByOnchain.get(p.id)?.auto_ingest ? (
                              <span
                                className="inline-flex items-center rounded-full border border-[rgba(111,174,143,0.4)] bg-[rgba(111,174,143,0.08)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--accent-primary)]"
                                title="Ya contabilizada en el patrimonio (cabecera). No se suma dos veces."
                              >
                                ✓ contabilizada
                              </span>
                            ) : null}
                          </p>
                          {typeof p.meta?.collateralUsd === "number" && typeof p.meta?.debtUsd === "number" && (p.meta.debtUsd as number) > 0 ? (
                            <p className="text-[11px] tabular-nums">
                              <span className="text-[var(--muted)]">colateral {currency(p.meta.collateralUsd as number)}</span>
                              <span className="text-rose-300"> · deuda {currency(p.meta.debtUsd as number)}</span>
                            </p>
                          ) : null}
                          <p className="text-[11px] text-[var(--muted)]">
                            {p.walletLabel ?? ""} {p.chain ? `· ${p.chain}` : ""}
                          </p>
                        </td>

                        {/* SALDO — con deuda (lending): dos bloques rotulados
                            COLATERAL / DEUDA para que nada se mezcle. */}
                        <td className="px-4 py-4 font-mono text-sm text-[var(--foreground)]">
                          {p.tokens && p.tokens.length > 0 ? (
                            p.tokens.some((t) => t.amount < 0) ? (
                              <div className="space-y-1">
                                <p className="text-[9px] uppercase tracking-[0.14em] text-[var(--muted)]">Colateral</p>
                                {p.tokens.filter((t) => t.amount > 0).slice(0, 4).map((t, i) => (
                                  <p key={`c${i}`} className="tabular-nums">
                                    {formatTokenAmount(t.amount)}{" "}
                                    <span className="token-emphasis">{t.symbol.replace(/^-/, "")}</span>
                                  </p>
                                ))}
                                <p className="pt-1 text-[9px] uppercase tracking-[0.14em] text-rose-300/80">Deuda</p>
                                {p.tokens.filter((t) => t.amount < 0).slice(0, 3).map((t, i) => (
                                  <p key={`d${i}`} className="tabular-nums text-rose-300">
                                    {formatTokenAmount(Math.abs(t.amount))}{" "}
                                    <span className="token-emphasis text-rose-300">{t.symbol.replace(/^-/, "")}</span>
                                  </p>
                                ))}
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                {p.tokens.slice(0, 4).map((t, i) => (
                                  <p key={i} className="tabular-nums">
                                    {formatTokenAmount(Math.abs(t.amount))}{" "}
                                    <span className="token-emphasis">{t.symbol.replace(/^-/, "")}</span>
                                  </p>
                                ))}
                              </div>
                            )
                          ) : (
                            "—"
                          )}
                        </td>

                        {/* DEPOSITADO — editable en toda posición (alta o corrección) */}
                        <td className="px-4 py-4 value-emphasis text-sm">
                          <DepositedCell p={p} portfolioId={portfolioId} deposited={deposited} canManage={canManage} />
                        </td>

                        {/* VALOR ACTUAL */}
                        <td className="px-4 py-4 value-emphasis text-sm font-semibold">{currency(value)}</td>

                        {/* ASIGNACIÓN */}
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-1 rounded-full bg-[var(--accent-primary)] opacity-60"
                              style={{ width: `${Math.min(60, allocation)}px` }}
                              aria-hidden="true"
                            />
                            <span className="text-sm text-[var(--muted)] tabular-nums">{allocation.toFixed(2)}%</span>
                          </div>
                        </td>

                        {/* PROTOCOLO — pill de contorno neutro (única caja de la fila) */}
                        <td className="px-4 py-4">
                          <span className="inline-flex w-fit items-center whitespace-nowrap rounded-full border border-[var(--glass-border-strong)] px-2.5 py-1 text-xs font-medium text-[var(--ink-2)]">
                            {p.protocol ?? "Wallet"}
                          </span>
                        </td>

                        {/* YIELD: sin reclamar (on-chain) arriba + total cosechado (contable) debajo */}
                        {showYield ? (
                          <td className="px-4 py-4">
                            <div className="space-y-1">
                              {p.unclaimedUsd && p.unclaimedUsd > 0.01 ? (
                                <p className="text-[11px] text-emerald-300 tabular-nums">
                                  +{currency(p.unclaimedUsd)} sin reclamar
                                </p>
                              ) : null}
                              {harvested > 0 ? (
                                <span
                                  className="inline-flex items-center gap-1 whitespace-nowrap text-xs tabular-nums text-[#6FAE8F]"
                                  title="Harvest total cosechado en esta posición (histórico contable)"
                                >
                                  <BadgeDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
                                  {currency(harvested)}
                                </span>
                              ) : null}
                              {harvested <= 0 && !(p.unclaimedUsd && p.unclaimedUsd > 0.01) ? (
                                <span className="text-xs text-[var(--muted)]">—</span>
                              ) : null}
                            </div>
                          </td>
                        ) : null}

                        {/* P&L / ROI */}
                        <td className="px-4 py-4">
                          {roi == null ? (
                            <span className="text-xs text-[var(--muted)]" title="Sin posición contable enlazada aún">—</span>
                          ) : roi >= 0 ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold tabular-nums text-emerald-400">
                                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                                {roi.toFixed(2)}%
                              </span>
                              <p className="text-[11px] text-emerald-300 tabular-nums">+{currency(pnl)}</p>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold tabular-nums text-rose-400">
                                <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
                                {roi.toFixed(2)}%
                              </span>
                              <p className="text-[11px] text-rose-300 tabular-nums">{currency(pnl)}</p>
                            </div>
                          )}
                        </td>

                        {/* HEALTH (lending) */}
                        {isLending ? (
                          <td className="px-4 py-4">
                            {hf == null ? (
                              <span className="text-xs text-[var(--muted)]">N/A</span>
                            ) : hf < 1.2 ? (
                              <span className="inline-flex whitespace-nowrap rounded-md bg-[rgba(206,139,130,0.14)] px-2 py-0.5 text-xs font-semibold tabular-nums text-red-400">
                                {hf.toFixed(2)}
                              </span>
                            ) : (
                              <span
                                className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold tabular-nums ${
                                  hf < 2 ? "text-amber-300" : "text-emerald-400"
                                }`}
                              >
                                <span className={`h-1 w-1 rounded-full ${hf < 2 ? "bg-amber-300" : "bg-emerald-400"}`} aria-hidden="true" />
                                {hf.toFixed(2)}
                              </span>
                            )}
                          </td>
                        ) : null}

                        {/* RANGO (pools) */}
                        {isPools ? (
                          <td className="px-4 py-4">
                            {p.range ? (
                              <RangeBar range={p.range} label={p.label} />
                            ) : (
                              <span className="text-xs text-[var(--muted)]">—</span>
                            )}
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
      })}
    </>
  );
}
