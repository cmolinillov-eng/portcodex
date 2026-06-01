"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Info, Wallet } from "lucide-react";
import type { FiscalAnnotation, WalletKind } from "@/lib/tax/types";
import {
  getCategoryLabel,
  getWalletKindBadge,
  getWalletKindLabel,
} from "@/lib/tax/human-language";

/* ──────────────────────────────────────────────────────────────────
   Trazabilidad por Wallet (versión compacta colapsable, al pie de la página)
   ──────────────────────────────────────────────────────────────────
   - Sección al estilo "Actividad reciente": glass-panel + tabla
   - COLAPSADA por defecto: solo aparece si el usuario hace clic
   - Filtros por wallet en una fila
   - Aviso Modelo 721 si saldo agregado en CEX extranjeros > 50K€
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
  /** Valor del portfolio en USD; usado para calcular aviso Modelo 721 */
  foreignCexValueUsd?: number;
}

export function WalletTraceability({ portfolioId, foreignCexValueUsd }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeWallet, setActiveWallet] = useState<string>("__all__");
  const [visibleCount, setVisibleCount] = useState(15);

  // Solo cargamos cuando el usuario abre la sección (lazy)
  useEffect(() => {
    if (!open || data !== null || !portfolioId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/transactions/traceability?portfolioId=${encodeURIComponent(portfolioId)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? "Error al cargar.");
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
  }, [open, data, portfolioId]);

  const filteredEntries = useMemo(() => {
    if (!data) return [];
    if (activeWallet === "__all__") return data.entries;
    const [name, kind] = activeWallet.split("::");
    return data.entries.filter((e) => e.protocol === name && (e.walletKind ?? "other") === kind);
  }, [data, activeWallet]);

  const visibleEntries = filteredEntries.slice(0, visibleCount);

  // Aviso Modelo 721 — > 50.000 € en exchanges extranjeros
  const modelo721Alert = useMemo(() => {
    if (!data || !foreignCexValueUsd || !data.eurRate) return null;
    const foreignEur = foreignCexValueUsd * data.eurRate;
    if (foreignEur < 50_000) return null;
    return {
      foreignEur,
      excess: foreignEur - 50_000,
    };
  }, [data, foreignCexValueUsd]);

  return (
    <section
      className="glass-panel page-section-card p-5 md:p-6 mb-6 animate-fade-up"
      aria-label="Trazabilidad por wallet"
    >
      {/* Header colapsable */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full gap-3 text-left"
        aria-expanded={open}
        aria-controls="wallet-traceability-content"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] bg-[rgba(160,210,255,0.06)]">
            <Wallet className="h-4 w-4 text-[#A0D2FF]" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
              Trazabilidad fiscal
            </h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Cada movimiento clasificado por wallet — para llevarlo a tu asesor o software fiscal.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data ? (
            <span className="text-xs text-[var(--muted)] tabular-nums hidden sm:inline">
              {data.meta.total} {data.meta.total === 1 ? "movimiento" : "movimientos"}
            </span>
          ) : null}
          {open ? (
            <ChevronUp className="h-5 w-5 text-[var(--muted)]" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-5 w-5 text-[var(--muted)]" aria-hidden="true" />
          )}
        </div>
      </button>

      {/* Contenido colapsable */}
      {open ? (
        <div id="wallet-traceability-content" className="mt-5 space-y-4">
          {/* Aviso disclaimer */}
          <div className="rounded-xl border border-[rgba(160,210,255,0.18)] bg-[rgba(160,210,255,0.04)] p-3 flex items-start gap-2.5 text-xs leading-relaxed">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#A0D2FF] opacity-70" aria-hidden="true" />
            <p className="text-[var(--muted)]">
              <span className="text-[var(--foreground)] font-medium">Esto es trazabilidad, no es tu declaración fiscal.</span>{" "}
              Las categorías son orientativas y están pensadas para que tu asesor o un software fiscal trabaje más
              rápido. Cualquier obligación tributaria requiere validación profesional.
            </p>
          </div>

          {/* Aviso Modelo 721 si aplica */}
          {modelo721Alert ? (
            <div className="rounded-xl border border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.07)] p-3 flex items-start gap-2.5 text-xs leading-relaxed">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-400" aria-hidden="true" />
              <div>
                <p className="text-amber-200 font-medium mb-1">
                  Posible obligación Modelo 721
                </p>
                <p className="text-[var(--muted)]">
                  Tu saldo agregado en exchanges centralizados extranjeros (Binance, KuCoin, Bitget, etc.) supera
                  los 50.000 € (estimación actual: ~{Math.round(modelo721Alert.foreignEur).toLocaleString("es-ES")} €).
                  Es probable que tengas que presentar el Modelo 721 antes del 31 de marzo. Consulta a tu asesor fiscal.
                </p>
              </div>
            </div>
          ) : null}

          {/* Estados */}
          {loading ? (
            <div className="py-10 text-center text-sm text-[var(--muted)]">
              Cargando movimientos…
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : !data ? null : data.entries.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--muted)]">
              Sin movimientos registrados en este portfolio.
            </p>
          ) : (
            <>
              {/* Filtros por wallet */}
              <div className="flex flex-wrap items-center gap-1.5">
                <FilterPill
                  label="Todas"
                  count={data.meta.total}
                  active={activeWallet === "__all__"}
                  onClick={() => {
                    setActiveWallet("__all__");
                    setVisibleCount(15);
                  }}
                />
                {data.walletSummary.map((w) => {
                  const key = `${w.name}::${w.kind ?? "other"}`;
                  return (
                    <FilterPill
                      key={key}
                      label={w.name}
                      badge={getWalletKindBadge(w.kind)}
                      kind={w.kind}
                      count={w.count}
                      active={activeWallet === key}
                      onClick={() => {
                        setActiveWallet(key);
                        setVisibleCount(15);
                      }}
                    />
                  );
                })}
              </div>

              {/* Tabla */}
              <div className="overflow-hidden rounded-[1rem] border border-[var(--glass-border)] overflow-x-auto">
                <table className="w-full min-w-[920px] border-collapse">
                  <thead className="bg-[rgba(10,18,40,0.55)] text-left backdrop-blur-md">
                    <tr>
                      <th scope="col" className="px-3 py-2.5 text-[10px] font-medium tracking-[0.18em] text-[var(--muted)]">FECHA</th>
                      <th scope="col" className="px-3 py-2.5 text-[10px] font-medium tracking-[0.18em] text-[var(--muted)]">WALLET</th>
                      <th scope="col" className="px-3 py-2.5 text-[10px] font-medium tracking-[0.18em] text-[var(--muted)]">CATEGORÍA</th>
                      <th scope="col" className="px-3 py-2.5 text-[10px] font-medium tracking-[0.18em] text-[var(--muted)]">CONCEPTO</th>
                      <th scope="col" className="px-3 py-2.5 text-[10px] font-medium tracking-[0.18em] text-[var(--muted)] text-right">CANTIDAD</th>
                      <th scope="col" className="px-3 py-2.5 text-[10px] font-medium tracking-[0.18em] text-[var(--muted)] text-right">VALOR €</th>
                      <th scope="col" className="px-3 py-2.5 text-[10px] font-medium tracking-[0.18em] text-[var(--muted)] text-right">G/P €</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEntries.map((entry) => (
                      <Row key={entry.id} entry={entry} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer + load more */}
              <div className="flex flex-wrap justify-between items-center gap-3 pt-1">
                <p className="text-[10px] text-[var(--muted)] opacity-70">
                  Tipo de cambio aplicado: 1 USD ≈ {data.eurRate?.toFixed(4) ?? "0.92"} EUR ·{" "}
                  Las anotaciones <span className="text-amber-400">sugeridas</span> requieren validación del gestor.
                </p>
                {filteredEntries.length > visibleCount ? (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + 15)}
                    className="btn-secondary px-4 py-1.5 text-xs"
                  >
                    Ver más
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Row de la tabla
   ────────────────────────────────────────────────────────────────── */

function Row({ entry }: { entry: Entry }) {
  const { fiscal } = entry;
  const date = new Date(entry.transactionDate);
  const tone = classifyTone(fiscal);
  const sym = entry.tokenInSymbol ?? entry.tokenOutSymbol;
  const amt = entry.tokenInAmount ?? entry.tokenOutAmount;

  return (
    <tr className="border-t border-[var(--line)] hover:bg-[rgba(160,210,255,0.025)] transition-colors">
      <td className="px-3 py-2.5 text-xs text-[var(--muted)] whitespace-nowrap tabular-nums">
        {date.toLocaleString("es-ES", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </td>

      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <WalletBadge kind={fiscal.walletKind} />
          <span className="text-sm text-[var(--foreground)] font-medium">
            {entry.protocol}
          </span>
        </div>
        <span className="text-[10px] text-[var(--muted)] opacity-60 block leading-tight mt-0.5">
          {getWalletKindLabel(fiscal.walletKind)}
        </span>
      </td>

      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`trace-cat trace-cat-${tone}`}>
            {fiscal.humanLabel}
          </span>
          {fiscal.inferred ? (
            <span
              className="text-[9px] text-amber-400 italic border-b border-dotted border-amber-400/40 cursor-help"
              title="Categorización inferida automáticamente — el gestor puede revisarla"
            >
              sugerido
            </span>
          ) : null}
        </div>
      </td>

      <td className="px-3 py-2.5 text-xs text-[var(--foreground)] max-w-[280px]">
        <p className="leading-snug line-clamp-2">{fiscal.humanDescription}</p>
      </td>

      <td className="px-3 py-2.5 text-right text-xs font-mono tabular-nums whitespace-nowrap">
        {sym && amt ? (
          <>
            <span className="text-[var(--foreground)]">{formatAmount(amt)}</span>{" "}
            <span className="text-[var(--muted)] text-[10px]">{sym}</span>
          </>
        ) : (
          <span className="text-[var(--muted)]">—</span>
        )}
      </td>

      <td className="px-3 py-2.5 text-right text-xs font-mono tabular-nums whitespace-nowrap text-[var(--foreground)]">
        {fiscal.valueEur > 0 ? formatEur(fiscal.valueEur) : <span className="text-[var(--muted)]">—</span>}
      </td>

      <td className="px-3 py-2.5 text-right text-xs font-mono tabular-nums whitespace-nowrap">
        {fiscal.realizedGainEur !== 0 ? (
          <span
            className={
              fiscal.realizedGainEur > 0
                ? "text-emerald-400 font-medium"
                : "text-rose-400 font-medium"
            }
          >
            {fiscal.realizedGainEur > 0 ? "+" : ""}
            {formatEur(fiscal.realizedGainEur)}
          </span>
        ) : (
          <span className="text-[var(--muted)]">—</span>
        )}
      </td>

      <style jsx>{`
        .trace-cat {
          display: inline-block;
          font-size: 0.62rem;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          padding: 0.15rem 0.45rem;
          border-radius: 0.25rem;
          font-weight: 600;
          line-height: 1.4;
        }
        .trace-cat-neutral { background: rgba(255,255,255,0.04); color: rgba(240,240,245,0.65); border: 1px solid rgba(255,255,255,0.06); }
        .trace-cat-transfer { background: rgba(160,210,255,0.07); color: #a0d2ff; border: 1px solid rgba(160,210,255,0.18); }
        .trace-cat-income { background: rgba(192,144,232,0.08); color: #c090e8; border: 1px solid rgba(192,144,232,0.22); }
        .trace-cat-gain { background: rgba(52,211,153,0.08); color: #34d399; border: 1px solid rgba(52,211,153,0.22); }
        .trace-cat-loss { background: rgba(251,113,133,0.08); color: #fb7185; border: 1px solid rgba(251,113,133,0.22); }
      `}</style>
    </tr>
  );
}

function WalletBadge({ kind }: { kind: WalletKind | null }) {
  const badge = getWalletKindBadge(kind);
  const tone = walletKindTone(kind);
  return (
    <>
      <span className={`wb wb-${tone}`}>{badge}</span>
      <style jsx>{`
        .wb {
          font-size: 9px;
          letter-spacing: 0.1em;
          font-weight: 700;
          padding: 0.1rem 0.35rem;
          border-radius: 0.25rem;
          line-height: 1.3;
          font-family: var(--font-mono, "JetBrains Mono", "Fira Code", monospace);
        }
        .wb-cex {
          background: rgba(245,158,11,0.1);
          color: #fbbf24;
          border: 1px solid rgba(245,158,11,0.25);
        }
        .wb-hot {
          background: rgba(251,113,133,0.1);
          color: #fb7185;
          border: 1px solid rgba(251,113,133,0.25);
        }
        .wb-cold {
          background: rgba(96,165,250,0.1);
          color: #60a5fa;
          border: 1px solid rgba(96,165,250,0.25);
        }
        .wb-dex {
          background: rgba(192,144,232,0.1);
          color: #c090e8;
          border: 1px solid rgba(192,144,232,0.25);
        }
        .wb-other {
          background: rgba(255,255,255,0.05);
          color: rgba(240,240,245,0.5);
          border: 1px solid rgba(255,255,255,0.1);
        }
      `}</style>
    </>
  );
}

function walletKindTone(kind: WalletKind | null): "cex" | "hot" | "cold" | "dex" | "other" {
  if (!kind) return "other";
  if (kind === "cex_es" || kind === "cex_foreign" || kind === "broker_es" || kind === "broker_foreign" || kind === "payment_app") return "cex";
  if (kind === "hot_wallet") return "hot";
  if (kind === "cold_wallet" || kind === "paper_wallet") return "cold";
  if (kind === "dex" || kind === "smart_contract_wallet") return "dex";
  return "other";
}

/* ──────────────────────────────────────────────────────────────────
   FilterPill (estilo botón compacto)
   ────────────────────────────────────────────────────────────────── */

function FilterPill({
  label,
  badge,
  kind,
  count,
  active,
  onClick,
}: {
  label: string;
  badge?: string;
  kind?: WalletKind | null;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`fp ${active ? "is-active" : ""}`}
      aria-pressed={active}
    >
      {badge ? <span className={`fp-badge fp-badge-${walletKindTone(kind ?? null)}`}>{badge}</span> : null}
      <span>{label}</span>
      <span className="fp-count">{count}</span>
      <style jsx>{`
        .fp {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.3rem 0.65rem;
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--line);
          border-radius: 0.5rem;
          color: var(--muted);
          font-size: 0.75rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          font-family: inherit;
        }
        .fp:hover {
          background: rgba(160,210,255,0.05);
          color: var(--foreground);
        }
        .fp.is-active {
          background: rgba(160,210,255,0.1);
          border-color: rgba(160,210,255,0.35);
          color: #a0d2ff;
        }
        .fp-badge {
          font-size: 9px;
          letter-spacing: 0.1em;
          font-weight: 700;
          padding: 0.05rem 0.35rem;
          border-radius: 0.2rem;
        }
        .fp-badge-cex { background: rgba(245,158,11,0.15); color: #fbbf24; }
        .fp-badge-hot { background: rgba(251,113,133,0.15); color: #fb7185; }
        .fp-badge-cold { background: rgba(96,165,250,0.15); color: #60a5fa; }
        .fp-badge-dex { background: rgba(192,144,232,0.15); color: #c090e8; }
        .fp-badge-other { background: rgba(255,255,255,0.06); color: var(--muted); }
        .fp-count {
          font-variant-numeric: tabular-nums;
          font-size: 0.65rem;
          opacity: 0.6;
        }
      `}</style>
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────────── */

function classifyTone(fiscal: FiscalAnnotation): "neutral" | "gain" | "loss" | "income" | "transfer" {
  if (fiscal.realizedGainEur > 0 && fiscal.category !== "staking_reward" && fiscal.category !== "lending_interest") return "gain";
  if (fiscal.realizedGainEur < 0) return "loss";
  if (fiscal.category === "staking_reward" || fiscal.category === "lending_interest") return "income";
  if (fiscal.category === "non_taxable_transfer") return "transfer";
  return "neutral";
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
