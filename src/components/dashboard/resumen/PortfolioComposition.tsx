import { Section, SectionHeading } from "@/components/shell/SectionHeading";
import { StackedShareBar, SeriesSwatch } from "@/components/dashboard/StackedShareBar";

/**
 * Composición de la cartera.
 *
 * Barra horizontal apilada, no gráfico circular: un anillo obliga a comparar
 * ángulos y a leer una leyenda aparte; una barra se lee de un vistazo y deja el
 * nombre, el importe y el porcentaje juntos, que es lo que se quiere comparar.
 *
 * Las categorías SIN posiciones no aparecen aquí — se dicen en la nota del
 * encabezado. Una fila a cero no informa, solo ocupa.
 */

export type StrategyKey = "wallet" | "lending" | "staking" | "lp";

/** Tono fijo por estrategia (ver --section-* en globals.css). */
const STRATEGY_COLOR: Record<StrategyKey, string> = {
  wallet: "var(--section-wallet)",
  lending: "var(--section-lending)",
  staking: "var(--section-staking)",
  lp: "var(--section-lp)",
};

export interface CompositionSlice {
  key: StrategyKey;
  name: string;
  /** Contexto: "Custodia propia · sin bloqueo", "3 posiciones · Kamino, PancakeSwap". */
  detail: string;
  value: string;
  percent: string;
  /** 0–100. Manda el reparto de la barra. */
  share: number;
}

export function PortfolioComposition({
  slices,
  note,
}: {
  slices: CompositionSlice[];
  note?: string;
}) {
  if (slices.length === 0) return null;

  return (
    <Section>
      <SectionHeading title="Composición de la cartera" note={note} />

      <StackedShareBar
        segments={slices.map((s) => ({
          key: s.key,
          share: s.share,
          color: STRATEGY_COLOR[s.key],
        }))}
      />

      {/* Dos columnas fijas: con cuatro estrategias son dos filas de dos, y las
          cifras siguen alineadas entre sí en lugar de estrecharse. */}
      <div className="grid grid-cols-2 pcx-cols-narrow" style={{ marginTop: 22 }}>
        {slices.map((s, i) => (
          <div
            key={s.key}
            className="flex items-baseline gap-4"
            style={
              i % 2 === 0
                ? { paddingRight: 48 }
                : { paddingLeft: 48, borderLeft: "1px solid var(--line)" }
            }
          >
            <SeriesSwatch color={STRATEGY_COLOR[s.key]} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "var(--text-body)", fontWeight: 500 }}>{s.name}</div>
              <div
                style={{
                  fontSize: "var(--text-label)",
                  color: "var(--faint)",
                  marginTop: 5,
                }}
              >
                {s.detail}
              </div>
            </div>
            <div
              className="ml-auto text-right"
              style={{ flex: "none", whiteSpace: "nowrap", paddingLeft: 20 }}
            >
              <div
                className="tabular-nums"
                style={{
                  fontSize: 19,
                  fontWeight: 500,
                  letterSpacing: "-0.01em",
                }}
              >
                {s.value}
              </div>
              <div
                className="tabular-nums"
                style={{
                  fontSize: "var(--text-label)",
                  color: "var(--muted)",
                  marginTop: 5,
                }}
              >
                {s.percent}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
