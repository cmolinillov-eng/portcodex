import type { ReactNode } from "react";

/**
 * Cabecera de la Cartera.
 *
 * La cifra va a 31 px, la mitad que el patrimonio del Resumen. Es deliberado:
 * **una sola cifra protagonista por producto**. Si esta también fuera de 60 px,
 * el cliente tendría dos números gritándole y ninguno mandaría.
 */
export function CarteraHeader({
  title = "Cartera",
  total,
  positionsLabel,
  readLabel,
  action,
  syncStatus,
}: {
  title?: string;
  total: string;
  /** «en 17 posiciones». */
  positionsLabel: string;
  /** «· leído hace 3 minutos». */
  readLabel: string;
  action?: ReactNode;
  syncStatus?: ReactNode;
}) {
  return (
    <header className="pcx-stack-narrow flex items-start" style={{ paddingTop: 56, gap: 64 }}>
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <div className="flex items-baseline" style={{ gap: 16, marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontSize: "var(--text-body)", fontWeight: 400, color: "var(--faint)" }}>
            {title}
          </h1>
          {action ? <div className="ml-auto">{action}</div> : null}
        </div>
        <div>
          <span
            className="tabular-nums"
            style={{
              display: "block",
              fontSize: "var(--text-page)",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              whiteSpace: "nowrap",
            }}
          >
            {total}
          </span>
          {/* La CIFRA de arriba sí va en una línea —partirla sería ilegible—,
              pero esta línea NO. Llevaba `nowrap` heredado de la maqueta, donde
              el texto era corto («en 17 posiciones · leído hace 3 minutos»);
              desde que además puede explicar la diferencia con la suma de
              posiciones, mide 544 px y arrastraba la página entera 174 px a la
              derecha en un móvil de 390. Y se rompía justo cuando había algo
              importante que contar. */}
          <span
            style={{
              display: "block",
              fontSize: "var(--text-body)",
              color: "var(--muted)",
              marginTop: 10,
            }}
          >
            {positionsLabel} <span style={{ color: "var(--faint)" }}>{readLabel}</span>
          </span>
        </div>
      </div>

      {syncStatus ? <div style={{ flex: "none", marginLeft: "auto" }}>{syncStatus}</div> : null}
    </header>
  );
}
