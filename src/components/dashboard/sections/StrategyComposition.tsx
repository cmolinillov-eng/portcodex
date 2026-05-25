"use client";

import { useMemo } from "react";
import { Layers3 } from "lucide-react";
import type { PositionSection } from "@/types/portfolio";
import { plainPercent } from "../utils/formatters";
import { useMoneyFormatters } from "../utils/currency-context";

interface Props {
  sections: PositionSection[];
}

const PALETTE = [
  "#C090E8", "#A0D2FF", "#fcd34d", "#6ee7b7",
  "#FB7185", "#F97316", "#22D3EE", "#A78BFA",
  "#84CC16", "#F472B6",
];

/**
 * Donut con la composición del portfolio AGRUPADA POR ETIQUETA ESTRATÉGICA.
 *
 * Complementa la sección "por categoría" (Hold/Staking/LP/Lending) con una
 * vista del enfoque del gestor: cuánto valor hay en "Stablecoin yield" vs
 * "Blue-chip long" vs "Memecoin gamble", etc.
 *
 * Si NO hay ninguna posición etiquetada, el componente no se renderiza
 * (zero noise hasta que el gestor empieza a etiquetar).
 */
export function StrategyComposition({ sections }: Props) {
  const { fmtMoney: currency } = useMoneyFormatters();
  const data = useMemo(() => {
    const map = new Map<string, number>();
    let untaggedValue = 0;
    let totalValue = 0;
    let positionCount = 0;

    for (const section of sections) {
      for (const pos of section.positions) {
        const value = Math.max(0, pos.currentValue);
        if (value <= 0) continue;
        totalValue += value;
        positionCount += 1;
        const tag = pos.strategyTag?.trim();
        if (!tag) {
          untaggedValue += value;
        } else {
          map.set(tag, (map.get(tag) ?? 0) + value);
        }
      }
    }
    const tagged = Array.from(map.entries())
      .map(([tag, value]) => ({ tag, value }))
      .sort((a, b) => b.value - a.value);

    return { tagged, untaggedValue, totalValue, positionCount };
  }, [sections]);

  // No mostrar si nadie ha etiquetado nada
  if (data.tagged.length === 0) return null;

  const taggedTotal = data.tagged.reduce((s, t) => s + t.value, 0);
  if (taggedTotal <= 0) return null;

  // SVG donut
  const size = 140;
  const radius = 50;
  const stroke = 18;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const segments = data.tagged.map((row, idx) => {
    const pct = row.value / data.totalValue;
    const len = pct * circumference;
    const seg = (
      <circle
        key={row.tag}
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={PALETTE[idx % PALETTE.length]}
        strokeWidth={stroke}
        strokeDasharray={`${len} ${circumference - len}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    );
    offset += len;
    return seg;
  });

  // Segmento gris para "sin etiqueta" si hay
  if (data.untaggedValue > 0) {
    const pct = data.untaggedValue / data.totalValue;
    const len = pct * circumference;
    segments.push(
      <circle
        key="__untagged__"
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.10)"
        strokeWidth={stroke}
        strokeDasharray={`${len} ${circumference - len}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />,
    );
  }

  const taggedPositionCount = sections.reduce(
    (acc, sec) => acc + sec.positions.filter((p) => p.strategyTag).length,
    0,
  );

  return (
    <section
      className="glass-panel page-section-card p-5 md:p-6 mb-6 animate-fade-up"
      aria-label="Composición por estrategia"
    >
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <h2
          className="text-xl font-semibold tracking-tight text-[#D4C5FF]"
          style={{ textShadow: "0 0 30px rgba(186,160,255,0.22)" }}
        >
          Composición por estrategia
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-black/30 px-3 py-1 text-[11px] text-[var(--muted)]">
          <Layers3 className="h-3 w-3" aria-hidden="true" />
          {taggedPositionCount} de {data.positionCount} posiciones etiquetadas
        </span>
      </div>

      <div className="flex items-center gap-6 flex-wrap">
        <div className="shrink-0">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
            {segments}
          </svg>
        </div>
        <div className="flex-1 grid gap-2 min-w-[240px]">
          {data.tagged.map((row, idx) => {
            const pct = (row.value / data.totalValue) * 100;
            return (
              <div key={row.tag} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: PALETTE[idx % PALETTE.length] }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{row.tag}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--muted)] tabular-nums">
                  <span>{plainPercent(pct)}</span>
                  <span className="text-[var(--foreground)] font-medium">{currency(row.value)}</span>
                </div>
              </div>
            );
          })}
          {data.untaggedValue > 0 ? (
            <div className="flex items-center justify-between gap-3 text-sm border-t border-[var(--line)] pt-2 mt-1">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
                  aria-hidden="true"
                />
                <span className="text-[var(--muted)]">Sin etiqueta</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-[var(--muted)] tabular-nums">
                <span>{plainPercent((data.untaggedValue / data.totalValue) * 100)}</span>
                <span>{currency(data.untaggedValue)}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
