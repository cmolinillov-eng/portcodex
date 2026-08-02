"use client";

import { useId, useMemo, useState } from "react";
import { Section, SectionHeading } from "@/components/shell/SectionHeading";

/**
 * Evolución del patrimonio: valor total contra total depositado.
 *
 * Las DOS series juntas son lo que hace útil el gráfico. Una línea de valor a
 * secas sube y baja sin decir por qué; con el depositado al lado se distingue
 * de un vistazo lo que ha entrado de dinero nuevo de lo que ha ganado la
 * cartera. El depositado va discontinuo y en neutro justo para eso: es la
 * referencia, no la protagonista.
 *
 * No hay ejes dibujados ni marco. Cuatro líneas de rejilla, las etiquetas fuera
 * y nada más.
 */

export interface EvolutionPoint {
  label: string;
  value: number;
  deposited: number;
}

export interface EvolutionStat {
  label: string;
  value: string;
  tone?: "profit" | "loss" | "neutral" | "quiet";
}

export type RangeId = "7D" | "30D" | "90D" | "Todo";

/** Cuántos puntos entran en cada rango. */
const RANGE_POINTS: Record<RangeId, number> = {
  "7D": 7,
  "30D": 14,
  "90D": 21,
  Todo: Infinity,
};
const RANGES: RangeId[] = ["7D", "30D", "90D", "Todo"];

// Lienzo del SVG. Se estira al ancho disponible (preserveAspectRatio="none"),
// así que estas unidades son de trazado, no píxeles.
const W = 836;
const H = 250;
const PAD_TOP = 14;
const PAD_BOTTOM = 30; // sitio para las etiquetas del eje horizontal

/** Redondea a un paso "de persona" (1, 2, 2.5, 5, 10 ×10ⁿ) para que las líneas
 *  de rejilla caigan en cifras que se leen: 5.000, 10.000, 15.000. */
function niceStep(raw: number): number {
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
}

function formatMiles(v: number): string {
  return Math.round(v)
    .toFixed(0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatUsd(v: number, decimals: number): string {
  return (
    v.toLocaleString("es-ES", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) + " US$"
  );
}

export function EvolutionChart({
  points,
  stats,
  defaultRange = "Todo",
  showDeposited = true,
}: {
  points: EvolutionPoint[];
  stats: EvolutionStat[];
  defaultRange?: RangeId;
  showDeposited?: boolean;
}) {
  const [range, setRange] = useState<RangeId>(defaultRange);
  const [hover, setHover] = useState<number | null>(null);
  // El degradado se identifica por id, y en una página puede haber más de un
  // gráfico: sin esto compartirían relleno.
  const fillId = useId();

  const g = useMemo(() => {
    const take = RANGE_POINTS[range];
    const slice = take === Infinity ? points : points.slice(-take);
    const k = slice.length;

    const all = slice.flatMap((p) => [p.value, p.deposited]);
    const min = Math.min(...all);
    const max = Math.max(...all);
    const span = max - min || 1;
    const step = niceStep(span / 2.6);
    // Un 5 % de holgura arriba y abajo para que la línea no toque el borde.
    const lo = Math.floor((min - span * 0.05) / step) * step;
    const hi = Math.ceil((max + span * 0.05) / step) * step;

    const ticks: number[] = [];
    for (let t = hi; t >= lo - 1e-6; t -= step) ticks.push(t);

    const x = (i: number) => (k > 1 ? (i * W) / (k - 1) : 0);
    const y = (v: number) => PAD_TOP + ((hi - v) / (hi - lo)) * (H - PAD_TOP - PAD_BOTTOM);

    const line = (get: (p: EvolutionPoint) => number) =>
      slice.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(get(p)).toFixed(1)}`).join(" ");

    const valuePath = line((p) => p.value);
    const baseline = (H - PAD_BOTTOM).toFixed(1);

    return {
      slice,
      k,
      ticks,
      x,
      y,
      valuePath,
      areaPath: `${valuePath} L${x(k - 1).toFixed(1)} ${baseline} L0 ${baseline} Z`,
      depositedPath: showDeposited ? line((p) => p.deposited) : "",
    };
  }, [points, range, showDeposited]);

  // Cinco marcas como mucho en el eje horizontal, y siempre la última: sin ella
  // el gráfico parece terminar antes de hoy.
  const xTicks = useMemo(() => {
    const step = Math.max(1, Math.round((g.k - 1) / 4));
    const out: Array<{
      label: string;
      frac: number;
      first: boolean;
      last: boolean;
    }> = [];
    for (let i = 0; i < g.k; i += step) {
      out.push({
        label: g.slice[i].label,
        frac: g.x(i) / W,
        first: i === 0,
        last: false,
      });
    }
    const lastLabel = g.slice[g.k - 1]?.label;
    if (out[out.length - 1]?.label !== lastLabel && lastLabel) {
      // La última fecha se pone SIEMPRE: sin ella el gráfico parece acabar
      // antes de hoy. Pero si el paso regular deja una marca pegada al final
      // —con 14 puntos caen «27 jul» y «28 jul» encima— se retira la anterior:
      // dos fechas superpuestas no se leen ninguna de las dos.
      const MIN_SEPARATION = 0.09; // ~9 % del ancho, sitio para «28 jul»
      if (out.length > 1 && 1 - out[out.length - 1].frac < MIN_SEPARATION) {
        out.pop();
      }
      out.push({ label: lastLabel, frac: 1, first: false, last: true });
    }
    return out;
  }, [g]);

  const hovered = hover !== null && hover >= 0 && hover < g.k ? g.slice[hover] : null;

  return (
    <Section>
      <SectionHeading
        title="Evolución del patrimonio"
        note="Valor total frente a total depositado"
        spacing={6}
        action={RANGES.map((id) => {
          const on = id === range;
          return (
            <button
              key={id}
              type="button"
              // Grupo de opciones excluyentes: sin esto, el rango elegido solo
              // se distingue por color y borde, que un lector no ve.
              aria-pressed={on}
              onClick={() => {
                setRange(id);
                setHover(null);
              }}
              style={{
                padding: "5px 11px",
                border: `1px solid ${on ? "rgba(148,163,184,0.28)" : "transparent"}`,
                borderRadius: "var(--radius-sm)",
                background: on ? "var(--void-elevated)" : "transparent",
                color: on ? "var(--foreground)" : "var(--faint)",
                fontSize: "var(--text-label)",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {id}
            </button>
          );
        })}
      />

      <div className="flex items-stretch" style={{ gap: 40, marginTop: 18 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Renglón reservado para el valor bajo el cursor. Se reserva SIEMPRE
              aunque esté vacío: si apareciera y desapareciera, el gráfico daría
              un salto de 20 px cada vez que el ratón entra. */}
          <div className="flex items-baseline" style={{ gap: 12, height: 20 }}>
            {hovered ? (
              <>
                <span
                  style={{
                    fontSize: "var(--text-label)",
                    color: "var(--faint)",
                  }}
                >
                  {hovered.label}
                </span>
                <span
                  className="tabular-nums"
                  style={{ fontSize: "var(--text-body)", fontWeight: 500 }}
                >
                  {formatUsd(hovered.value, 2)}
                </span>
                <span
                  className="tabular-nums"
                  style={{
                    fontSize: "var(--text-label)",
                    color: "var(--muted)",
                  }}
                >
                  depositado {formatUsd(hovered.deposited, 0)}
                </span>
              </>
            ) : null}
          </div>

          <div className="flex items-start" style={{ gap: 14 }}>
            <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                style={{ display: "block", width: "100%", height: H }}
              >
                {g.ticks.map((t) => (
                  <line
                    key={t}
                    x1={0}
                    y1={g.y(t)}
                    x2={W}
                    y2={g.y(t)}
                    stroke="rgba(148,163,184,0.12)"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                <defs>
                  <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={g.areaPath} fill={`url(#${fillId})`} stroke="none" />
                {g.depositedPath ? (
                  <path
                    d={g.depositedPath}
                    fill="none"
                    stroke="var(--section-lp)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
                <path
                  d={g.valuePath}
                  fill="none"
                  stroke="var(--accent-primary)"
                  strokeWidth={1.75}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                {hover !== null && hovered ? (
                  <g>
                    <line
                      x1={g.x(hover)}
                      y1={0}
                      x2={g.x(hover)}
                      y2={H - PAD_BOTTOM + 4}
                      stroke="rgba(148,163,184,0.28)"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle
                      cx={g.x(hover)}
                      cy={g.y(hovered.value)}
                      r={3.5}
                      fill="var(--background)"
                      stroke="var(--accent-primary)"
                      strokeWidth={1.75}
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                ) : null}
                {/* Zona de captura: cubre todo el lienzo, así que el punto más
                    cercano responde sin tener que acertar sobre la línea. */}
                <rect
                  x={0}
                  y={0}
                  width={W}
                  height={H}
                  fill="transparent"
                  onMouseMove={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    const frac = (e.clientX - r.left) / r.width;
                    const idx = Math.max(0, Math.min(g.k - 1, Math.round(frac * (g.k - 1))));
                    if (idx !== hover) setHover(idx);
                  }}
                  onMouseLeave={() => setHover(null)}
                />
              </svg>

              {xTicks.map((t) => (
                <span
                  key={`${t.label}-${t.frac}`}
                  style={{
                    position: "absolute",
                    top: H - PAD_BOTTOM + 4,
                    left: `${(t.frac * 100).toFixed(2)}%`,
                    transform: t.first ? "none" : t.last ? "translateX(-100%)" : "translateX(-50%)",
                    fontSize: "var(--text-meta)",
                    color: "var(--faint)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.label}
                </span>
              ))}
            </div>

            {/* Escala vertical FUERA del lienzo: dentro obligaría a reservar
                margen y el trazado perdería ancho. */}
            <div
              style={{
                width: 58,
                flex: "none",
                position: "relative",
                height: H,
              }}
            >
              {g.ticks.map((t) => (
                <span
                  key={t}
                  className="tabular-nums"
                  style={{
                    position: "absolute",
                    top: g.y(t) - 8,
                    left: 0,
                    fontSize: "var(--text-meta)",
                    color: "var(--faint)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatMiles(t)}
                </span>
              ))}
            </div>
          </div>
        </div>

        <EvolutionStats stats={stats} />
      </div>
    </Section>
  );
}

/** Columna de indicadores del periodo. Va al lado del gráfico y no debajo: son
 *  el resumen numérico de la misma curva, y separarlos rompería la lectura. */
function EvolutionStats({ stats }: { stats: EvolutionStat[] }) {
  const color = (tone: EvolutionStat["tone"]) =>
    tone === "profit"
      ? "var(--profit)"
      : tone === "loss"
        ? "var(--loss)"
        : tone === "quiet"
          ? "var(--muted)"
          : "var(--foreground)";

  return (
    <div
      className="flex flex-col"
      style={{
        width: 262,
        flex: "none",
        paddingLeft: 36,
        paddingTop: 20,
        gap: 22,
        borderLeft: "1px solid var(--line)",
      }}
    >
      {stats.map((s, i) => (
        <div
          key={s.label}
          className="flex items-baseline justify-between"
          style={
            // El último indicador se separa con un filo: es de otra naturaleza
            // (cuántas lecturas hay detrás), no una cifra de rentabilidad.
            i === stats.length - 1 && stats.length > 1
              ? { gap: 12, paddingTop: 20, borderTop: "1px solid var(--line)" }
              : { gap: 12 }
          }
        >
          <span
            style={{
              fontSize: "var(--text-label)",
              color: "var(--faint)",
              whiteSpace: "nowrap",
            }}
          >
            {s.label}
          </span>
          <span
            className="tabular-nums"
            style={{
              fontSize: s.tone === "quiet" ? 14 : 17,
              fontWeight: 500,
              whiteSpace: "nowrap",
              color: color(s.tone),
            }}
          >
            {s.value}
          </span>
        </div>
      ))}
    </div>
  );
}
