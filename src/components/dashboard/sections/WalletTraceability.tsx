"use client";

import { useEffect, useMemo, useState } from "react";
import type { FiscalAnnotation, WalletKind } from "@/lib/tax/types";
import { TRACEABILITY_DISCLAIMER } from "@/lib/tax/types";
import {
  getCategoryLabel,
  getWalletKindBadge,
  getWalletKindLabel,
} from "@/lib/tax/human-language";

/* ──────────────────────────────────────────────────────────────────
   "Trazabilidad por Wallet"
   ──────────────────────────────────────────────────────────────────
   Concepto: diario editorial dark. Vertical spine + dateline + headline.
   Cada movimiento es una entrada, no un card. La página respira asimétricamente.
   El color sólo aparece cuando significa algo (ganancia, pérdida, inferido).
   ────────────────────────────────────────────────────────────────── */

interface Entry {
  id: string;
  transactionDate: string;
  type: string;
  protocol: string;
  walletKind: WalletKind | null;
  positionType: string;
  tokenInSymbol: string | null;
  tokenInAmount: number | null;
  tokenOutSymbol: string | null;
  tokenOutAmount: number | null;
  notes: string | null;
  fiscal: FiscalAnnotation;
}

interface WalletSummary {
  name: string;
  kind: WalletKind | null;
  count: number;
}

interface ApiResponse {
  entries: Entry[];
  walletSummary: WalletSummary[];
  eurRate: number | null;
  meta: { total: number };
}

interface Props {
  portfolioId: string;
}

export function WalletTraceability({ portfolioId }: Props) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeWallet, setActiveWallet] = useState<string>("__all__");

  useEffect(() => {
    if (!portfolioId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/transactions/traceability?portfolioId=${encodeURIComponent(portfolioId)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? "Error al cargar la trazabilidad.");
        }
        return r.json() as Promise<ApiResponse>;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error inesperado");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [portfolioId]);

  const filteredEntries = useMemo(() => {
    if (!data) return [];
    if (activeWallet === "__all__") return data.entries;
    const [name, kind] = activeWallet.split("::");
    return data.entries.filter((e) => e.protocol === name && (e.walletKind ?? "other") === kind);
  }, [data, activeWallet]);

  // Agrupar por fecha (yyyy-mm-dd) para crear datelines
  const grouped = useMemo(() => groupByDate(filteredEntries), [filteredEntries]);

  return (
    <section className="trace-section" aria-label="Trazabilidad por wallet">
      {/* ─── Standfirst editorial ──────────────────────────── */}
      <header className="trace-header">
        <p className="trace-eyebrow">Capítulo · Trazabilidad</p>
        <h2 className="trace-title">
          Tu historia <em>cripto</em>, contada
          <br />
          movimiento a movimiento.
        </h2>
        <p className="trace-standfirst">
          {TRACEABILITY_DISCLAIMER}
        </p>
      </header>

      {/* ─── Filter strip ──────────────────────────────────── */}
      {!loading && !error && data && data.walletSummary.length > 0 ? (
        <nav className="trace-filters" aria-label="Filtrar por wallet">
          <FilterPill
            label="Todas las wallets"
            count={data.meta.total}
            active={activeWallet === "__all__"}
            onClick={() => setActiveWallet("__all__")}
          />
          {data.walletSummary.map((w) => {
            const key = `${w.name}::${w.kind ?? "other"}`;
            return (
              <FilterPill
                key={key}
                label={w.name}
                badge={getWalletKindBadge(w.kind)}
                count={w.count}
                active={activeWallet === key}
                onClick={() => setActiveWallet(key)}
              />
            );
          })}
        </nav>
      ) : null}

      {/* ─── States ────────────────────────────────────────── */}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : !data || data.entries.length === 0 ? (
        <EmptyState />
      ) : grouped.length === 0 ? (
        <EmptyFilterState walletName={activeWallet.split("::")[0]} onReset={() => setActiveWallet("__all__")} />
      ) : (
        <div className="trace-timeline" role="list">
          {grouped.map((group) => (
            <DateGroup key={group.dateKey} group={group} />
          ))}
        </div>
      )}

      {/* ─── Footer disclaimer (más sutil que un alert) ───── */}
      {data && data.entries.length > 0 ? (
        <footer className="trace-footer">
          <p>
            Tipo de cambio aplicado:{" "}
            {data.eurRate ? `1 USD ≈ ${data.eurRate.toFixed(4)} EUR` : "—"}
            {" · "}
            Las anotaciones marcadas con{" "}
            <span className="trace-footer-dot" aria-hidden="true" />
            son inferidas automáticamente y pueden requerir revisión.
          </p>
        </footer>
      ) : null}

      <style jsx>{styles}</style>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Sub-componentes
   ────────────────────────────────────────────────────────────────── */

function FilterPill({
  label,
  badge,
  count,
  active,
  onClick,
}: {
  label: string;
  badge?: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`trace-pill ${active ? "is-active" : ""}`}
      aria-pressed={active}
    >
      {badge ? <span className="trace-pill-badge">{badge}</span> : null}
      <span className="trace-pill-label">{label}</span>
      <span className="trace-pill-count">{count}</span>
      <style jsx>{`
        .trace-pill {
          display: inline-flex;
          align-items: baseline;
          gap: 0.5rem;
          padding: 0.35rem 0;
          margin: 0;
          background: none;
          border: none;
          color: rgba(240, 240, 245, 0.5);
          font-size: 0.85rem;
          font-weight: 400;
          cursor: pointer;
          position: relative;
          line-height: 1.4;
          transition: color 0.2s ease;
          font-family: var(--font-sans);
        }
        .trace-pill:hover {
          color: rgba(240, 240, 245, 0.85);
        }
        .trace-pill.is-active {
          color: #f0f0f5;
          font-weight: 500;
        }
        .trace-pill.is-active::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0.6rem;
          bottom: -0.4rem;
          height: 1.5px;
          background: linear-gradient(90deg, #a0d2ff 0%, #c090e8 100%);
        }
        .trace-pill-badge {
          font-size: 0.62rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 0.1rem 0.4rem;
          background: rgba(160, 210, 255, 0.08);
          border: 1px solid rgba(160, 210, 255, 0.15);
          border-radius: 0.25rem;
          color: rgba(160, 210, 255, 0.85);
          font-weight: 600;
          line-height: 1;
        }
        .trace-pill-label {
          letter-spacing: -0.005em;
        }
        .trace-pill-count {
          font-variant-numeric: tabular-nums;
          font-size: 0.7rem;
          color: rgba(240, 240, 245, 0.3);
          font-weight: 400;
        }
        .trace-pill.is-active .trace-pill-count {
          color: rgba(160, 210, 255, 0.6);
        }
      `}</style>
    </button>
  );
}

function DateGroup({ group }: { group: DateGroupData }) {
  return (
    <article className="trace-day" role="listitem">
      <header className="trace-dateline" aria-label={group.fullDate}>
        <span className="trace-dateline-day">{group.dayLabel}</span>
        <span className="trace-dateline-month">{group.monthLabel}</span>
        <span className="trace-dateline-year">{group.yearLabel}</span>
      </header>
      <div className="trace-entries">
        {group.entries.map((entry) => (
          <Entry key={entry.id} entry={entry} />
        ))}
      </div>
      <style jsx>{`
        .trace-day {
          display: grid;
          grid-template-columns: minmax(80px, 110px) 1fr;
          gap: 2.5rem;
          padding: 2.5rem 0;
          border-top: 1px solid rgba(255, 255, 255, 0.04);
          position: relative;
        }
        .trace-day:first-child {
          border-top: none;
          padding-top: 0;
        }
        .trace-dateline {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.1rem;
          position: sticky;
          top: 1rem;
          height: fit-content;
        }
        .trace-dateline-day {
          font-family: var(--font-serif, "Times New Roman", Georgia, serif);
          font-size: 2.5rem;
          font-weight: 200;
          line-height: 1;
          color: #f0f0f5;
          letter-spacing: -0.04em;
          font-variant-numeric: tabular-nums;
        }
        .trace-dateline-month {
          font-size: 0.6rem;
          letter-spacing: 0.32em;
          text-transform: uppercase;
          color: rgba(160, 210, 255, 0.7);
          font-weight: 600;
          margin-top: 0.4rem;
        }
        .trace-dateline-year {
          font-size: 0.6rem;
          letter-spacing: 0.18em;
          color: rgba(240, 240, 245, 0.3);
          font-weight: 400;
          font-variant-numeric: tabular-nums;
        }
        .trace-entries {
          display: flex;
          flex-direction: column;
          gap: 2.25rem;
        }
        @media (max-width: 720px) {
          .trace-day {
            grid-template-columns: 1fr;
            gap: 1.25rem;
          }
          .trace-dateline {
            position: static;
            flex-direction: row;
            align-items: baseline;
            gap: 0.6rem;
          }
          .trace-dateline-day {
            font-size: 1.75rem;
          }
        }
      `}</style>
    </article>
  );
}

function Entry({ entry }: { entry: Entry }) {
  const { fiscal, transactionDate } = entry;
  const dotColor = getDotColor(fiscal);
  const time = new Date(transactionDate).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Headline en lenguaje plano (extraída del humanDescription)
  const headline = extractHeadline(fiscal, entry);

  return (
    <article className="trace-entry" aria-label={fiscal.humanLabel}>
      {/* Spine + dot */}
      <span className="trace-spine" aria-hidden="true" style={{ background: dotColor }} />

      {/* Wallet meta (eyebrow) */}
      <p className="trace-entry-eyebrow">
        <span className="trace-entry-time">{time}</span>
        <span className="trace-entry-divider">·</span>
        <span className="trace-entry-wallet-kind">{getWalletKindLabel(fiscal.walletKind)}</span>
        <span className="trace-entry-divider">·</span>
        <span className="trace-entry-wallet-name">{entry.protocol}</span>
      </p>

      {/* Headline + category */}
      <h3 className="trace-entry-headline">
        {headline}
      </h3>
      <p className="trace-entry-category">
        <span className={`trace-category-label trace-category-${classifyTone(fiscal)}`}>
          {fiscal.humanLabel}
        </span>
        {fiscal.inferred ? (
          <span className="trace-inferred" title="Sugerencia automática — el gestor puede revisarla">
            sugerido
          </span>
        ) : null}
      </p>

      {/* Body description */}
      <p className="trace-entry-body">{fiscal.humanDescription}</p>

      {/* Stats inline (números) */}
      <dl className="trace-entry-numbers">
        {renderAmount(entry)}
        {fiscal.valueEur > 0 ? (
          <div className="trace-stat">
            <dt>Valor</dt>
            <dd className="trace-stat-value">{formatEur(fiscal.valueEur)}</dd>
          </div>
        ) : null}
        {fiscal.costBasisEur > 0 ? (
          <div className="trace-stat">
            <dt>Coste FIFO</dt>
            <dd className="trace-stat-value muted">{formatEur(fiscal.costBasisEur)}</dd>
          </div>
        ) : null}
        {fiscal.realizedGainEur !== 0 ? (
          <div className="trace-stat">
            <dt>{fiscal.realizedGainEur >= 0 ? "Ganancia" : "Pérdida"}</dt>
            <dd
              className={`trace-stat-value ${
                fiscal.realizedGainEur >= 0 ? "is-positive" : "is-negative"
              }`}
            >
              {fiscal.realizedGainEur >= 0 ? "+" : ""}
              {formatEur(fiscal.realizedGainEur)}
            </dd>
          </div>
        ) : null}
      </dl>
      <style jsx>{styles}</style>
    </article>
  );
}

function LoadingState() {
  return (
    <div className="trace-state">
      <div className="trace-loader" aria-hidden="true" />
      <p>Reconstruyendo tu historia…</p>
      <style jsx>{`
        .trace-state {
          padding: 6rem 0;
          text-align: center;
          color: rgba(240, 240, 245, 0.4);
          font-size: 0.85rem;
          letter-spacing: 0.02em;
        }
        .trace-loader {
          width: 32px;
          height: 1.5px;
          margin: 0 auto 1.5rem;
          background: linear-gradient(90deg, transparent, #a0d2ff, transparent);
          animation: shimmer 1.6s infinite;
          background-size: 200% 100%;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="trace-state">
      <p className="trace-state-headline">Aquí aparecerá tu historia</p>
      <p>Cuando registres movimientos, aparecerán aquí ordenados cronológicamente.</p>
      <style jsx>{`
        .trace-state {
          padding: 5rem 1rem;
          text-align: center;
          color: rgba(240, 240, 245, 0.4);
          max-width: 460px;
          margin: 0 auto;
        }
        .trace-state-headline {
          font-family: var(--font-serif, "Times New Roman", Georgia, serif);
          font-size: 1.6rem;
          font-weight: 300;
          color: rgba(240, 240, 245, 0.7);
          margin-bottom: 0.75rem;
          letter-spacing: -0.02em;
        }
        .trace-state p:not(.trace-state-headline) {
          font-size: 0.9rem;
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
}

function EmptyFilterState({ walletName, onReset }: { walletName: string; onReset: () => void }) {
  return (
    <div className="trace-state">
      <p className="trace-state-headline">No hay movimientos en {walletName}</p>
      <button type="button" onClick={onReset} className="trace-state-reset">
        Ver todas las wallets ↗
      </button>
      <style jsx>{`
        .trace-state {
          padding: 4rem 1rem;
          text-align: center;
          color: rgba(240, 240, 245, 0.4);
        }
        .trace-state-headline {
          font-family: var(--font-serif, "Times New Roman", Georgia, serif);
          font-size: 1.3rem;
          font-weight: 300;
          color: rgba(240, 240, 245, 0.7);
          margin-bottom: 1rem;
        }
        .trace-state-reset {
          background: none;
          border: none;
          color: #a0d2ff;
          cursor: pointer;
          font-size: 0.85rem;
          padding: 0.3rem 0;
          border-bottom: 1px solid rgba(160, 210, 255, 0.3);
        }
        .trace-state-reset:hover {
          border-bottom-color: #a0d2ff;
        }
      `}</style>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="trace-state">
      <p className="trace-state-headline">No pudimos cargar tus movimientos</p>
      <p>{message}</p>
      <style jsx>{`
        .trace-state {
          padding: 4rem 1rem;
          text-align: center;
          color: rgba(255, 200, 200, 0.5);
        }
        .trace-state-headline {
          font-family: var(--font-serif, "Times New Roman", Georgia, serif);
          font-size: 1.3rem;
          font-weight: 300;
          color: rgba(255, 200, 200, 0.85);
          margin-bottom: 0.75rem;
        }
      `}</style>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────────── */

interface DateGroupData {
  dateKey: string;
  dayLabel: string;
  monthLabel: string;
  yearLabel: string;
  fullDate: string;
  entries: Entry[];
}

function groupByDate(entries: Entry[]): DateGroupData[] {
  const map = new Map<string, Entry[]>();
  for (const e of entries) {
    const d = new Date(e.transactionDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a > b ? -1 : 1))
    .map(([key, items]) => {
      const d = new Date(items[0].transactionDate);
      return {
        dateKey: key,
        dayLabel: String(d.getDate()).padStart(2, "0"),
        monthLabel: d.toLocaleDateString("es-ES", { month: "short" }).replace(".", ""),
        yearLabel: String(d.getFullYear()),
        fullDate: d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }),
        entries: items,
      };
    });
}

function getDotColor(fiscal: FiscalAnnotation): string {
  if (fiscal.inferred && fiscal.category === "non_taxable_transfer") return "rgba(160,210,255,0.5)";
  if (fiscal.realizedGainEur > 0) return "rgba(52,211,153,0.85)";
  if (fiscal.realizedGainEur < 0) return "rgba(251,113,133,0.85)";
  if (fiscal.taxable) return "rgba(192,144,232,0.85)";
  return "rgba(240,240,245,0.35)";
}

function classifyTone(fiscal: FiscalAnnotation): "neutral" | "gain" | "loss" | "income" | "transfer" {
  if (fiscal.realizedGainEur > 0 && fiscal.category !== "staking_reward" && fiscal.category !== "lending_interest")
    return "gain";
  if (fiscal.realizedGainEur < 0) return "loss";
  if (fiscal.category === "staking_reward" || fiscal.category === "lending_interest") return "income";
  if (fiscal.category === "non_taxable_transfer") return "transfer";
  return "neutral";
}

function extractHeadline(fiscal: FiscalAnnotation, entry: Entry): string {
  // Si la descripción empieza con un verbo en español, lo usamos como headline corto.
  // Sino: derivamos del label + token.
  const desc = fiscal.humanDescription;
  // Tomamos la primera oración para el headline
  const firstSentence = desc.split(/[.!]/)[0]?.trim();
  if (firstSentence && firstSentence.length < 140) return firstSentence;
  // Fallback
  const symbol =
    (entry.tokenInSymbol ?? entry.tokenOutSymbol ?? "").toUpperCase() || "movimiento";
  return `${getCategoryLabel(fiscal.category)} de ${symbol}`;
}

function renderAmount(entry: Entry) {
  const sym = entry.tokenInSymbol ?? entry.tokenOutSymbol;
  const amt = entry.tokenInAmount ?? entry.tokenOutAmount;
  if (!sym || !amt) return null;
  return (
    <div className="trace-stat">
      <dt>Cantidad</dt>
      <dd className="trace-stat-value">
        {formatAmount(amt)} <span className="trace-stat-symbol">{sym}</span>
      </dd>
      <style jsx>{`
        .trace-stat-symbol {
          font-size: 0.65em;
          color: rgba(240, 240, 245, 0.35);
          margin-left: 0.15em;
          font-weight: 400;
        }
      `}</style>
    </div>
  );
}

function formatEur(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatAmount(value: number): string {
  if (Math.abs(value) >= 1) {
    return new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    }).format(value);
  }
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(value);
}

/* ──────────────────────────────────────────────────────────────────
   Styles (compartidos)
   ────────────────────────────────────────────────────────────────── */

const styles = `
  .trace-section {
    --c-fg: #f0f0f5;
    --c-fg-soft: rgba(240,240,245,0.7);
    --c-fg-mute: rgba(240,240,245,0.4);
    --c-fg-faint: rgba(240,240,245,0.2);
    --c-line: rgba(255,255,255,0.06);
    --c-accent-blue: #a0d2ff;
    --c-accent-purple: #c090e8;
    --c-positive: #34d399;
    --c-negative: #fb7185;
    --c-income: #c090e8;

    max-width: 920px;
    margin: 4rem auto;
    padding: 0 1.5rem;
    color: var(--c-fg);
    font-family: var(--font-sans, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
  }

  .trace-header { margin-bottom: 3rem; }

  .trace-eyebrow {
    font-size: 0.68rem;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: rgba(160, 210, 255, 0.7);
    margin-bottom: 1rem;
    font-weight: 500;
  }

  .trace-title {
    font-family: var(--font-serif, "Times New Roman", Georgia, serif);
    font-size: clamp(2rem, 5vw, 3.4rem);
    font-weight: 200;
    line-height: 1.05;
    letter-spacing: -0.025em;
    color: var(--c-fg);
    margin: 0 0 1.5rem;
    max-width: 720px;
  }

  .trace-title em {
    font-style: italic;
    font-weight: 300;
    color: var(--c-accent-purple);
  }

  .trace-standfirst {
    max-width: 580px;
    font-size: 0.95rem;
    line-height: 1.65;
    color: var(--c-fg-mute);
    font-style: italic;
    border-left: 2px solid rgba(160, 210, 255, 0.25);
    padding-left: 1rem;
    margin: 0;
  }

  .trace-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 2rem;
    padding-bottom: 1.5rem;
    margin-bottom: 2rem;
    border-bottom: 1px solid var(--c-line);
  }

  /* ─── Timeline & entries ─── */
  .trace-timeline { position: relative; }

  .trace-entry {
    position: relative;
    padding-left: 1.5rem;
  }

  .trace-spine {
    position: absolute;
    left: 0;
    top: 0.55rem;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.4), 0 0 8px currentColor;
  }

  .trace-entry::before {
    /* línea vertical sutil que conecta cada entry desde su dot hacia abajo */
    content: "";
    position: absolute;
    left: 3px;
    top: 1rem;
    width: 1px;
    height: calc(100% + 2.25rem);
    background: linear-gradient(to bottom, rgba(160,210,255,0.1), transparent);
  }

  .trace-entry:last-child::before { display: none; }

  .trace-entry-eyebrow {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
    font-size: 0.68rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--c-fg-mute);
    margin: 0 0 0.5rem;
    font-weight: 500;
  }

  .trace-entry-time {
    font-variant-numeric: tabular-nums;
    color: rgba(160, 210, 255, 0.7);
    letter-spacing: 0.1em;
  }

  .trace-entry-divider {
    color: var(--c-fg-faint);
    letter-spacing: 0;
  }

  .trace-entry-wallet-kind {
    color: var(--c-fg-mute);
  }

  .trace-entry-wallet-name {
    color: var(--c-fg);
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .trace-entry-headline {
    font-family: var(--font-serif, "Times New Roman", Georgia, serif);
    font-size: clamp(1.2rem, 2.2vw, 1.5rem);
    font-weight: 300;
    line-height: 1.3;
    color: var(--c-fg);
    margin: 0 0 0.4rem;
    letter-spacing: -0.015em;
  }

  .trace-entry-category {
    margin: 0 0 1rem;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .trace-category-label {
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0.18rem 0.55rem;
    border-radius: 0.25rem;
    font-weight: 600;
    line-height: 1.4;
  }

  .trace-category-neutral {
    background: rgba(255,255,255,0.04);
    color: rgba(240,240,245,0.65);
    border: 1px solid rgba(255,255,255,0.06);
  }
  .trace-category-transfer {
    background: rgba(160,210,255,0.07);
    color: var(--c-accent-blue);
    border: 1px solid rgba(160,210,255,0.18);
  }
  .trace-category-income {
    background: rgba(192,144,232,0.08);
    color: var(--c-income);
    border: 1px solid rgba(192,144,232,0.22);
  }
  .trace-category-gain {
    background: rgba(52,211,153,0.08);
    color: var(--c-positive);
    border: 1px solid rgba(52,211,153,0.22);
  }
  .trace-category-loss {
    background: rgba(251,113,133,0.08);
    color: var(--c-negative);
    border: 1px solid rgba(251,113,133,0.22);
  }

  .trace-inferred {
    font-size: 0.68rem;
    color: rgba(251,191,36,0.85);
    font-style: italic;
    letter-spacing: 0.02em;
    border-bottom: 1px dotted rgba(251,191,36,0.4);
    padding-bottom: 1px;
    cursor: help;
  }

  .trace-entry-body {
    font-size: 0.92rem;
    line-height: 1.65;
    color: var(--c-fg-soft);
    margin: 0 0 1.25rem;
    max-width: 600px;
  }

  .trace-entry-numbers {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem 2.5rem;
    margin: 0;
    padding-top: 1rem;
    border-top: 1px dashed rgba(255,255,255,0.05);
  }

  .trace-entry-numbers .trace-stat {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .trace-entry-numbers dt {
    font-size: 0.62rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--c-fg-mute);
    font-weight: 500;
    margin: 0;
  }

  .trace-entry-numbers dd {
    margin: 0;
    font-family: var(--font-mono, "JetBrains Mono", "Fira Code", monospace);
    font-size: 1rem;
    font-weight: 500;
    color: var(--c-fg);
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }

  .trace-stat-value.muted { color: var(--c-fg-mute); }
  .trace-stat-value.is-positive { color: var(--c-positive); }
  .trace-stat-value.is-negative { color: var(--c-negative); }

  /* ─── Footer ─── */
  .trace-footer {
    margin-top: 4rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--c-line);
    font-size: 0.72rem;
    color: var(--c-fg-mute);
    line-height: 1.6;
  }
  .trace-footer-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(251,191,36,0.7);
    margin: 0 0.25rem;
    vertical-align: middle;
  }
`;
