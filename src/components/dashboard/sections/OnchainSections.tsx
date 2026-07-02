"use client";

import { BadgeDollarSign, Layers, TrendingDown, TrendingUp } from "lucide-react";
import type { LivePosition, ManualPositionRef } from "./OnchainLivePanel";

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
};

const SECTION_META: Record<string, { label: string; color: string; glowClass: string; kinds: string[] }> = {
  liquidity_pools: { label: "Liquidity Pools", color: "#4FDF9D", glowClass: "text-[#4FDF9D]", kinds: ["liquidity"] },
  lending: { label: "Lending", color: "#E8A855", glowClass: "text-[#E8A855]", kinds: ["lending_supply", "lending_borrow"] },
  staking: { label: "Staking", color: "#A79BE0", glowClass: "text-[#A79BE0]", kinds: ["staking", "reward"] },
  wallet: { label: "Hold", color: "#97AAC1", glowClass: "text-[#97AAC1]", kinds: ["wallet"] },
  other: { label: "Otros", color: "#E6C173", glowClass: "text-[#E6C173]", kinds: ["perp", "other"] },
};

const currency = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

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

  const barColor = inRange ? "rgb(16,185,129)" : "rgb(239,68,68)";
  const barColorMuted = inRange ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)";

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

export function OnchainSections({
  positions,
  links,
  manualPositions,
}: {
  positions: LivePosition[];
  links: OnchainLinkRow[];
  manualPositions: ManualPositionRef[];
}) {
  const total = positions.reduce((s, p) => s + (p.valueUsd ?? 0), 0);
  const manualByKey = new Map(manualPositions.map((m) => [`${m.protocol}::${m.positionId}`, m]));
  const linkByOnchain = new Map(links.map((l) => [l.onchain_id, l]));

  /** Contable enlazada de una posición on-chain (para depositado/yield). */
  function linkedManual(p: LivePosition): ManualPositionRef | null {
    const link = linkByOnchain.get(p.id);
    if (!link) return null;
    return manualByKey.get(`${link.protocol}::${link.position_id}`) ?? null;
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
              <h2
                className={`font-designer text-2xl font-semibold tracking-tight ${meta.glowClass}`}
                style={{ textShadow: `0 0 30px ${meta.color}22` }}
              >
                {meta.label}
              </h2>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-[var(--foreground)]">{currency(subtotal)}</span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-black/30 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  {rows.length} posición{rows.length !== 1 ? "es" : ""}
                </span>
              </div>
            </div>

            <div className="page-table-shell overflow-x-auto rounded-[1rem] border border-[var(--glass-border)]">
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
                    const manual = linkedManual(p);
                    // Holds: la posición contable puede tener más/menos saldo
                    // que esta wallet (p.ej. BTC repartido) → el depositado se
                    // prorratea con el precio medio de entrada × cantidad real.
                    const onchainAmount = p.tokens?.[0]?.amount ?? null;
                    const deposited =
                      p.kind === "wallet" && manual?.averageEntryPrice && onchainAmount != null && manual.averageEntryPrice > 0
                        ? manual.averageEntryPrice * Math.abs(onchainAmount)
                        : manual?.depositedValue ?? null;
                    const harvested = manual?.totalHarvested ?? 0;
                    const value = p.valueUsd ?? 0;
                    const pnl = deposited != null && deposited > 0 ? value - deposited : null;
                    const roi = pnl != null && deposited ? (pnl / deposited) * 100 : null;
                    const allocation = total > 0 ? (value / total) * 100 : 0;
                    const hf = typeof p.meta?.healthFactor === "number" ? (p.meta.healthFactor as number) : null;

                    return (
                      <tr key={p.id} className="border-t border-[var(--line)]">
                        {/* ACTIVO */}
                        <td className="px-4 py-4">
                          <p className="token-emphasis text-sm">{p.label}</p>
                          <p className="text-[11px] text-[var(--muted)]">
                            {p.walletLabel ?? ""} {p.chain ? `· ${p.chain}` : ""}
                          </p>
                        </td>

                        {/* SALDO */}
                        <td className="px-4 py-4 font-mono text-sm text-[var(--foreground)]">
                          {p.tokens && p.tokens.length > 0 ? (
                            <div className="space-y-0.5">
                              {p.tokens.slice(0, 4).map((t, i) => (
                                <p key={i} className="tabular-nums">
                                  {formatTokenAmount(Math.abs(t.amount))}{" "}
                                  <span className="token-emphasis">{t.symbol.replace(/^-/, "")}</span>
                                  {t.amount < 0 ? <span className="text-rose-300 text-[10px]"> (deuda)</span> : null}
                                </p>
                              ))}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>

                        {/* DEPOSITADO */}
                        <td className="px-4 py-4 value-emphasis text-sm">
                          {deposited != null ? currency(deposited) : <span className="text-xs text-[var(--muted)]">—</span>}
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

                        {/* PROTOCOLO */}
                        <td className="px-4 py-4">
                          <span
                            className="inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-medium"
                            style={{ borderColor: `${meta.color}44`, backgroundColor: `${meta.color}12`, color: meta.color }}
                          >
                            {p.protocol ?? "Wallet"}
                          </span>
                        </td>

                        {/* YIELD: cosechado (contable) + sin reclamar (on-chain) */}
                        {showYield ? (
                          <td className="px-4 py-4">
                            <div className="space-y-1">
                              {harvested > 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(230,193,115,0.35)] bg-[rgba(230,193,115,0.09)] px-2.5 py-1 text-xs text-[#E6C173]">
                                  <BadgeDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
                                  {currency(harvested)}
                                </span>
                              ) : null}
                              {p.unclaimedUsd && p.unclaimedUsd > 0.01 ? (
                                <p className="text-[11px] text-emerald-300 tabular-nums">
                                  +{currency(p.unclaimedUsd)} sin reclamar
                                </p>
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
                              <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(16,185,129,0.4)] bg-[rgba(16,185,129,0.1)] px-2.5 py-1 text-xs text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.12)]">
                                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                                {roi.toFixed(2)}%
                              </span>
                              <p className="text-[11px] text-emerald-300 tabular-nums">+{currency(pnl)}</p>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(248,113,113,0.4)] bg-[rgba(248,113,113,0.1)] px-2.5 py-1 text-xs text-rose-400 shadow-[0_0_10px_rgba(248,113,113,0.12)]">
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
                            ) : (
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                  hf < 1.2
                                    ? "border-[rgba(239,68,68,0.45)] bg-[rgba(239,68,68,0.1)] text-red-400"
                                    : hf < 2
                                      ? "border-[rgba(245,158,11,0.45)] bg-[rgba(245,158,11,0.1)] text-amber-300"
                                      : "border-[rgba(16,185,129,0.45)] bg-[rgba(16,185,129,0.1)] text-emerald-400"
                                }`}
                              >
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
