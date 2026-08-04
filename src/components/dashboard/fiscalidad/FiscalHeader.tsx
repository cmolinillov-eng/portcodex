import type { ReactNode } from "react";

/**
 * Cabecera de Fiscalidad.
 *
 * A diferencia del Resumen, aquí NO hay cifra protagonista en la cabecera: las
 * dos que importan —base del ahorro y base general— van enfrentadas debajo, y
 * ponerlas también arriba sería decir dos veces lo mismo. Por eso el titular es
 * de 20 px y no de 60: nombra el ejercicio, no lo resume.
 *
 * Medidas de web/design/04-fiscalidad.html.
 */
export function FiscalHeader({
  section,
  title,
  note,
  yearControl,
  action,
}: {
  /** Nombre de la pantalla, en terciario: «Fiscalidad». */
  section: string;
  /** Titular: «Ejercicio 2026». */
  title: string;
  /** Contexto bajo el titular: «52 operaciones registradas». */
  note?: string;
  /** Selector de ejercicio. */
  yearControl?: ReactNode;
  /** Acción de la derecha: «Exportar». */
  action?: ReactNode;
}) {
  return (
    <header style={{ paddingTop: 48 }}>
      <div className="flex items-baseline gap-5">
        <h1
          style={{
            margin: 0,
            fontSize: "var(--text-body)",
            fontWeight: 400,
            color: "var(--faint)",
          }}
        >
          {section}
        </h1>
        {yearControl || action ? (
          <div className="ml-auto flex items-center gap-[18px]">
            {yearControl}
            {action}
          </div>
        ) : null}
      </div>

      <div
        style={{
          fontSize: 20,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          marginTop: 14,
        }}
      >
        {title}
      </div>

      {note ? (
        <div style={{ fontSize: "var(--text-body)", color: "var(--faint)", marginTop: 8 }}>
          {note}
        </div>
      ) : null}
    </header>
  );
}

/**
 * Selector de ejercicio. Es el control más pequeño de la pantalla y va en la
 * cabecera porque el ejercicio manda sobre TODO lo que hay debajo: cambiarlo
 * cambia las dos bases, la tabla y el 721.
 *
 * Es un `<details>` con ENLACES dentro, y no un botón con estado, porque
 * cambiar de ejercicio es navegar: cada año tiene su dirección (`?ejercicio=`).
 * Así se puede abrir en otra pestaña, compartir el enlace del ejercicio 2024 y
 * volver atrás con el botón del navegador. Y funciona sin JavaScript, que en
 * una pantalla que solo lee datos es lo que corresponde.
 *
 * Antes recibía un `onClick` que nadie pasaba nunca: el selector se dibujaba en
 * /preview y en producción no existía, así que el ejercicio solo se podía
 * cambiar editando la URL a mano.
 */
export function YearPicker({
  year,
  years,
  hrefFor,
}: {
  /** Ejercicio activo. */
  year: string;
  /** Ejercicios con operaciones, de más reciente a más antiguo. */
  years: string[];
  /** Dirección de cada ejercicio. */
  hrefFor: (year: string) => string;
}) {
  // Con un solo ejercicio no hay nada que elegir: se enseña como dato, sin
  // chevron. Un control que parece desplegable y no despliega es peor que un
  // texto.
  if (years.length <= 1) {
    return (
      <span
        style={{
          padding: "6px 11px",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-sm)",
          fontSize: "var(--text-label)",
          color: "var(--muted)",
        }}
      >
        {year}
      </span>
    );
  }

  return (
    <details className="pcx-year-picker" style={{ position: "relative" }}>
      <summary
        aria-label={`Ejercicio: ${year}`}
        className="flex items-center gap-2"
        style={{
          padding: "6px 11px",
          border: "1px solid var(--line)",
          // Radio de control pequeño, no de botón: ver PeriodBox.
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
          listStyle: "none",
        }}
      >
        <span style={{ fontSize: "var(--text-label)", color: "var(--muted)" }}>{year}</span>
        <span style={{ fontSize: 10, color: "var(--faint)" }} aria-hidden="true">
          ▾
        </span>
      </summary>

      <div
        style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          right: 0,
          zIndex: "var(--z-overlay)",
          minWidth: "100%",
          padding: 4,
          background: "var(--void-elevated)",
          border: "1px solid var(--line-strong)",
          borderRadius: "var(--radius-sm)",
        }}
      >
        {years.map((y) => (
          <a
            key={y}
            href={hrefFor(y)}
            style={{
              display: "block",
              padding: "6px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: "var(--text-label)",
              whiteSpace: "nowrap",
              background: y === year ? "var(--accent-soft)" : "transparent",
              color: y === year ? "var(--brand-soft)" : "var(--muted)",
            }}
          >
            {y}
          </a>
        ))}
      </div>
    </details>
  );
}
