import { Section, SectionHeading } from "@/components/shell/SectionHeading";
import { StackedShareBar, SeriesSwatch, rankColor } from "@/components/dashboard/StackedShareBar";

/**
 * Distribución por red.
 *
 * Es la sección que más información NUEVA aporta del Resumen: revela la
 * concentración (77 % en Solana) — riesgo real que no aparecía en ninguna otra
 * pantalla. Si una red cae o un puente falla, esto dice cuánto está expuesto.
 *
 * Se colorea por RANGO, no por red: el conjunto de redes es abierto y fijar un
 * tono a cada una obligaría a inventar uno cada vez que se añade uno nuevo.
 */

export interface NetworkSlice {
  name: string;
  value: string;
  percent: string;
  /** 0–100. */
  share: number;
}

export function NetworkDistribution({
  networks,
  note,
}: {
  networks: NetworkSlice[];
  note?: string;
}) {
  if (networks.length === 0) return null;

  return (
    <Section>
      <SectionHeading title="Distribución por red" note={note} />

      <StackedShareBar
        segments={networks.map((n, i) => ({
          key: n.name,
          share: n.share,
          color: rankColor(i),
        }))}
      />

      <div
        className="grid pcx-cols-narrow"
        style={{
          marginTop: 22,
          gridTemplateColumns: `repeat(${networks.length}, minmax(0, 1fr))`,
        }}
      >
        {networks.map((n, i) => {
          const first = i === 0;
          const last = i === networks.length - 1;
          return (
            <div
              key={n.name}
              style={{
                minWidth: 0,
                paddingLeft: first ? 0 : 32,
                paddingRight: last ? 0 : 32,
                borderLeft: first ? undefined : "1px solid var(--line)",
              }}
            >
              <div className="flex items-baseline" style={{ gap: 11 }}>
                <SeriesSwatch color={rankColor(i)} />
                <span style={{ fontSize: "var(--text-body)", fontWeight: 500 }}>{n.name}</span>
              </div>
              {/* Nombre a la izquierda, cifras a la derecha: la misma
                  convención que las tablas, para que la vista no cambie de
                  regla a mitad de pantalla. */}
              <div
                className="tabular-nums text-right"
                style={{
                  fontSize: "var(--text-lead)",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  marginTop: 10,
                }}
              >
                {n.value}
              </div>
              <div
                className="tabular-nums text-right"
                style={{
                  fontSize: "var(--text-label)",
                  color: "var(--muted)",
                  marginTop: 5,
                }}
              >
                {n.percent}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
