"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, BarChart3, Activity } from "lucide-react";
import { useMoneyFormatters } from "../utils/currency-context";
import { plainPercent } from "../utils/formatters";

interface SnapshotPoint {
  date: string;
  value: number;
  deposited: number;
  harvest: number;
  realizedPnl: number;
  pnl: number;
  pnlPercent: number;
}

interface Metrics {
  twr: number | null;
  maxDrawdown: number | null;
  totalDays: number;
  firstDate?: string;
  lastDate?: string;
}

interface Props {
  portfolioId: string;
}

type RangeKey = "7d" | "30d" | "90d" | "all";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "all", label: "Todo" },
];

function subtractDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function formatDateShort(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  } catch {
    return dateStr.slice(5, 10);
  }
}

/**
 * Gráfica de evolución temporal del portfolio.
 *
 * Muestra una area chart con el valor total del portfolio sobre el tiempo,
 * una línea de referencia del total depositado, y KPIs derivados:
 * TWR (Time-Weighted Return), Max Drawdown, P&L acumulado.
 *
 * Los datos vienen de /api/snapshots/history (portfolio_snapshots table).
 * Si hay < 2 puntos de datos, muestra un mensaje invitando a esperar.
 */
export function PortfolioEvolutionChart({ portfolioId }: Props) {
  const { fmtMoney: currency } = useMoneyFormatters();
  const [data, setData] = useState<SnapshotPoint[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [range, setRange] = useState<RangeKey>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ portfolioId });
      if (range !== "all") {
        const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
        params.set("from", subtractDays(new Date(), days));
      }
      const res = await fetch(`/api/snapshots/history?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Error al cargar snapshots.");
      }
      const body = (await res.json()) as { snapshots: SnapshotPoint[]; metrics: Metrics };
      setData(body.snapshots);
      setMetrics(body.metrics);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [portfolioId, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filtrar puntos para el rango seleccionado
  const chartData = useMemo(() => {
    return data.map((p) => ({
      ...p,
      label: formatDateShort(p.date),
    }));
  }, [data]);

  // Color P&L: verde si el último punto es positivo, rojo si negativo
  const lastPoint = chartData[chartData.length - 1];
  const isPnlPositive = lastPoint ? lastPoint.pnl >= 0 : true;
  const areaColor = isPnlPositive ? "#34d399" : "#fb7185";

  // El componente SIEMPRE se renderiza, incluso sin datos:
  // muestra empty state guiando al usuario sobre los snapshots.

  return (
    <section
      className="glass-panel page-section-card p-5 md:p-6 mb-6 animate-fade-up"
      aria-label="Evolución del portfolio"
    >
      {/* Header: título + rango selector */}
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-[#6FAE8F] opacity-70" aria-hidden="true" />
          <h2
            className="text-xl font-semibold tracking-tight text-[#CEC8F0]"
            style={{ textShadow: "0 0 30px rgba(167,155,224,0.22)" }}
          >
            Evolución del Portfolio
          </h2>
        </div>
        <div className="inline-flex items-center rounded-lg border border-[var(--line)] bg-black/30 p-0.5 text-xs">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`rounded-md px-3 py-1.5 font-medium transition ${
                range === r.key
                  ? "bg-[rgba(111,174,143,0.18)] text-[#6FAE8F]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
              aria-pressed={range === r.key}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center h-52">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#6FAE8F] border-t-transparent" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : data.length < 2 ? (
        /* Empty state — not enough data yet */
        <div className="rounded-xl border border-[var(--line)] bg-black/20 px-6 py-10 text-center">
          <BarChart3 className="mx-auto h-10 w-10 text-[var(--muted)] opacity-40 mb-3" />
          <p className="text-sm text-[var(--muted)]">
            {data.length === 0
              ? "Aún no hay snapshots. Se generan automáticamente cada medianoche."
              : "Solo hay 1 snapshot. La gráfica aparecerá cuando haya al menos 2 puntos de datos."}
          </p>
          <p className="mt-1 text-[11px] text-[var(--muted)] opacity-60">
            También puedes capturar uno manualmente desde el botón de Snapshot en la toolbar.
          </p>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          {metrics ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {/* TWR */}
              <div className="rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2.5">
                <p className="text-[9px] uppercase font-mono tracking-[0.18em] text-[var(--muted)] font-medium">
                  TWR
                </p>
                <p
                  className={`mt-0.5 text-lg font-bold tabular-nums ${
                    (metrics.twr ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {metrics.twr !== null ? `${metrics.twr >= 0 ? "+" : ""}${metrics.twr}%` : "—"}
                </p>
                <p className="text-[10px] text-[var(--muted)] opacity-60">Time-Weighted Return</p>
              </div>

              {/* Max Drawdown */}
              <div className="rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2.5">
                <p className="text-[9px] uppercase font-mono tracking-[0.18em] text-[var(--muted)] font-medium">
                  Max Drawdown
                </p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-rose-300">
                  {metrics.maxDrawdown !== null ? `-${metrics.maxDrawdown}%` : "—"}
                </p>
                <p className="text-[10px] text-[var(--muted)] opacity-60">Pico a valle</p>
              </div>

              {/* P&L actual */}
              <div className="rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2.5">
                <p className="text-[9px] uppercase font-mono tracking-[0.18em] text-[var(--muted)] font-medium">
                  P&L
                </p>
                <p
                  className={`mt-0.5 text-lg font-bold tabular-nums ${
                    isPnlPositive ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {lastPoint ? currency(lastPoint.pnl) : "—"}
                </p>
                <p className="text-[10px] text-[var(--muted)] opacity-60">
                  {lastPoint ? plainPercent(lastPoint.pnlPercent) : "—"}
                </p>
              </div>

              {/* Datos acumulados */}
              <div className="rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2.5">
                <p className="text-[9px] uppercase font-mono tracking-[0.18em] text-[var(--muted)] font-medium">
                  Datos
                </p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-[#6FAE8F]">
                  {metrics.totalDays}
                </p>
                <p className="text-[10px] text-[var(--muted)] opacity-60">
                  {metrics.totalDays === 1 ? "snapshot" : "snapshots"}
                </p>
              </div>
            </div>
          ) : null}

          {/* Chart */}
          <div className="h-64 md:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={areaColor} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={areaColor} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 6"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)
                  }
                  width={55}
                />
                <Tooltip content={<CustomTooltip currency={currency} />} />
                {/* Línea de referencia: total depositado (última lectura) */}
                {lastPoint ? (
                  <ReferenceLine
                    y={lastPoint.deposited}
                    stroke="rgba(111,174,143,0.35)"
                    strokeDasharray="6 4"
                    label={{
                      value: "Depositado",
                      position: "insideTopRight",
                      fill: "rgba(111,174,143,0.5)",
                      fontSize: 10,
                    }}
                  />
                ) : null}
                {/* Area principal: valor del portfolio */}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={areaColor}
                  strokeWidth={2}
                  fill="url(#valueGradient)"
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: areaColor,
                    stroke: "rgba(0,0,0,0.6)",
                    strokeWidth: 2,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center gap-4 text-[10px] text-[var(--muted)]">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-5 rounded-full"
                style={{ backgroundColor: areaColor }}
                aria-hidden="true"
              />
              Valor total
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="20" height="8" aria-hidden="true">
                <line
                  x1="0" y1="4" x2="20" y2="4"
                  stroke="rgba(111,174,143,0.5)"
                  strokeWidth="1.5"
                  strokeDasharray="3 2"
                />
              </svg>
              Total depositado
            </span>
          </div>
        </>
      )}
    </section>
  );
}

/* ── Custom Tooltip ────────────────────────────── */
function CustomTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ payload: SnapshotPoint & { label: string } }>;
  currency: (v: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  const isPnlPos = p.pnl >= 0;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[rgba(9,10,13,0.95)] px-4 py-3 text-xs shadow-xl backdrop-blur-md">
      <p className="text-[10px] text-[var(--muted)] mb-2 font-medium">{p.label}</p>
      <div className="space-y-1.5">
        <div className="flex justify-between gap-6">
          <span className="text-[var(--muted)]">Valor</span>
          <span className="font-semibold tabular-nums">{currency(p.value)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-[var(--muted)]">Depositado</span>
          <span className="tabular-nums">{currency(p.deposited)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-[var(--muted)]">P&L</span>
          <span
            className={`font-semibold tabular-nums ${isPnlPos ? "text-emerald-300" : "text-rose-300"}`}
          >
            {currency(p.pnl)} ({isPnlPos ? "+" : ""}{p.pnlPercent.toFixed(2)}%)
          </span>
        </div>
        {p.harvest > 0 ? (
          <div className="flex justify-between gap-6">
            <span className="text-[var(--muted)]">Harvest</span>
            <span className="tabular-nums text-[#6FAE8F]">{currency(p.harvest)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
