import type { ReactNode } from "react";

/**
 * Encabezado de sección: título de 15 px y, en la misma línea de base, una nota
 * que da el contexto ("2 estrategias activas · Staking y Lending sin
 * posiciones").
 *
 * Esa nota es donde se resuelven las categorías VACÍAS. Una tabla de Staking
 * con cero filas ocupa media pantalla para decir «nada»; una frase lo dice en
 * seis palabras.
 */
export function SectionHeading({
  title,
  note,
  action,
  spacing = 22,
}: {
  title: string;
  note?: string;
  /** Controles a la derecha: selector de rango, «Ver historial completo →». */
  action?: ReactNode;
  /** Aire hasta el contenido. Se baja cuando el contenido ya trae el suyo: el
   *  gráfico reserva una línea para el valor bajo el cursor, y la tabla abre
   *  con 14 px de relleno en la cabecera. */
  spacing?: number;
}) {
  return (
    <div className="flex items-baseline gap-4" style={{ marginBottom: spacing }}>
      <h2 style={{ margin: 0, fontSize: "var(--text-lead)", fontWeight: 600 }}>{title}</h2>
      {note ? (
        <span style={{ fontSize: "var(--text-label)", color: "var(--faint)" }}>{note}</span>
      ) : null}
      {action ? <div className="ml-auto flex items-center gap-1">{action}</div> : null}
    </div>
  );
}

/** Separación vertical entre secciones de una pantalla. */
export function Section({ children }: { children: ReactNode }) {
  return <section style={{ paddingTop: 52 }}>{children}</section>;
}
