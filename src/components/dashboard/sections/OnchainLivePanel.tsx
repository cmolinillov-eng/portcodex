"use client";

import { useState } from "react";
import { Radio, RefreshCw } from "lucide-react";

type LiveRange = { lower: number; upper: number; current: number; inRange: boolean };
type LivePosition = {
  id: string;
  chain: string;
  protocol: string | null;
  kind: string;
  label: string;
  valueUsd: number | null;
  range: LiveRange | null;
  unclaimedUsd: number | null;
};
type LiveResult = { positions: LivePosition[]; warnings: string[]; syncedAt: string };

const usd = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const num = (n: number) => (n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 4 }) : n.toPrecision(4));

const KIND_LABEL: Record<string, string> = {
  wallet: "Hold", liquidity: "Liquidez", lending_supply: "Colateral",
  lending_borrow: "Deuda", staking: "Staking", reward: "Recompensa", perp: "Perp", other: "Otro",
};

export function OnchainLivePanel({ portfolioId }: { portfolioId: string }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LiveResult | null>(null);
  const [error, setError] = useState("");

  async function load() {
    if (!portfolioId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/wallet/live?portfolioId=${encodeURIComponent(portfolioId)}`);
      const body = (await res.json()) as LiveResult & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "No se pudo leer on-chain.");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error leyendo on-chain.");
    } finally {
      setLoading(false);
    }
  }

  const total = data?.positions.reduce((s, p) => s + (p.valueUsd ?? 0), 0) ?? 0;

  return (
    <section className="glass-panel page-section-card p-5 md:p-6 mb-6" aria-label="Posiciones on-chain en vivo">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-emerald-400" aria-hidden="true" />
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">En vivo (on-chain)</h2>
          <span className="text-[10px] uppercase tracking-wider rounded-full border border-[var(--line)] px-2 py-0.5 text-[var(--muted)]">
            solo lectura
          </span>
        </div>
        <button type="button" onClick={load} disabled={loading || !portfolioId} className="btn-secondary px-4 py-2 text-sm disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          {loading ? "Leyendo blockchain…" : data ? "Actualizar" : "Leer desde blockchain"}
        </button>
      </div>

      {error ? <p className="text-sm text-rose-400 mb-3">{error}</p> : null}

      {!data && !error ? (
        <p className="text-sm text-[var(--muted)]">
          Lee las posiciones reales de las wallets conectadas a este portfolio (balances, LP con rango, lending…). No modifica la contabilidad manual.
        </p>
      ) : null}

      {data ? (
        <>
          <div className="text-sm text-[var(--muted)] mb-3">
            Valor on-chain leído: <span className="text-[var(--foreground)] font-semibold">{usd(total)}</span>
            {" · "}{data.positions.length} posiciones{" · "}
            {new Date(data.syncedAt).toLocaleTimeString("es-ES")}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs tracking-[0.18em] text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2">POSICIÓN</th>
                  <th className="px-3 py-2">TIPO</th>
                  <th className="px-3 py-2">CADENA</th>
                  <th className="px-3 py-2">RANGO / ESTADO</th>
                  <th className="px-3 py-2 text-right">SIN RECLAMAR</th>
                  <th className="px-3 py-2 text-right">VALOR</th>
                </tr>
              </thead>
              <tbody>
                {data.positions.map((p) => (
                  <tr key={p.id} className="border-t border-[var(--line)]">
                    <td className="px-3 py-3">
                      <div className="font-medium text-[var(--foreground)]">{p.label}</div>
                      {p.protocol ? <div className="text-xs text-[var(--muted)]">{p.protocol}</div> : null}
                    </td>
                    <td className="px-3 py-3 text-[var(--muted)]">{KIND_LABEL[p.kind] ?? p.kind}</td>
                    <td className="px-3 py-3 text-[var(--muted)]">{p.chain}</td>
                    <td className="px-3 py-3">
                      {p.range ? (
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-xs text-[var(--muted)]">
                            {num(p.range.lower)} – {num(p.range.upper)} · act. {num(p.range.current)}
                          </span>
                          <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] ${p.range.inRange
                            ? "border border-[rgba(16,185,129,0.35)] bg-[rgba(16,185,129,0.08)] text-emerald-300"
                            : "border border-[rgba(244,63,94,0.35)] bg-[rgba(244,63,94,0.08)] text-rose-300"}`}>
                            {p.range.inRange ? "✅ Dentro de rango" : "⚠️ Fuera de rango"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[var(--muted)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[var(--muted)]">
                      {p.unclaimedUsd ? usd(p.unclaimedUsd) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[var(--foreground)]">{usd(p.valueUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.warnings.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-amber-300/80">
              {data.warnings.map((w, i) => (
                <li key={i}>⚠️ {w}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
