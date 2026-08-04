import type { ReactNode } from "react";
import { plural } from "@/lib/format/figures";

/**
 * Cabecera de Movimientos.
 *
 * La cifra protagonista de esta pantalla no es dinero: es un RECUENTO. «52
 * operaciones» a 31 px dice de un vistazo cuánto se ha movido la cartera en el
 * año, que es lo que trae aquí al cliente; el importe de cada línea vive en la
 * tabla. Va a 31 px y no a los 60 del patrimonio porque **solo hay una cifra
 * protagonista por producto**, y esa manda en el Resumen.
 *
 * Medidas tomadas de web/design/03-movimientos.html.
 */
export function MovementsHeader({
  title = "Movimientos",
  count,
  periodLabel,
  lastLabel,
  action,
  syncStatus,
}: {
  title?: string;
  /** Total de operaciones del periodo filtrado. */
  count: number;
  /** «en 2026». El periodo que están mirando, que lo fijan los filtros. */
  periodLabel: string;
  /** «última hace 3 minutos». Un producto que lee solo dice siempre cuándo leyó. */
  lastLabel: string;
  /** «Exportar CSV». */
  action?: ReactNode;
  syncStatus?: ReactNode;
}) {
  return (
    // `pcx-stack-narrow`, el mismo mecanismo que usa la cabecera de Cartera: en
    // pantalla estrecha el bloque de sincronización baja debajo del recuento en
    // vez de encajarse a su derecha, donde se le montaba encima.
    <header className="pcx-stack-narrow flex items-start" style={{ paddingTop: 44, gap: 40 }}>
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <div className="flex items-baseline" style={{ gap: 20, marginBottom: 12 }}>
          <h1 style={{ margin: 0, fontSize: "var(--text-body)", fontWeight: 400, color: "var(--faint)" }}>
            {title}
          </h1>
          {action ? <div className="ml-auto">{action}</div> : null}
        </div>

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
          {plural(count, "operación", "operaciones")}
        </span>

        <span
          style={{
            display: "block",
            fontSize: "var(--text-body)",
            color: "var(--muted)",
            whiteSpace: "nowrap",
            marginTop: 10,
          }}
        >
          {periodLabel} <span style={{ color: "var(--faint)" }}>· {lastLabel}</span>
        </span>
      </div>

      {syncStatus ? <div style={{ flex: "none", textAlign: "right" }}>{syncStatus}</div> : null}
    </header>
  );
}
