"use client";

import { useState, type CSSProperties } from "react";
import { PeriodBox, PeriodPicker, usePeriod, type PeriodInit } from "./PeriodPicker";

/**
 * Una fila = un informe.
 *
 * Los cuatro informes se leen como una lista y no como cuatro tarjetas: son la
 * misma acción —elegir periodo y descargar— repetida cuatro veces, y cuatro
 * cajas iguales solo añadirían bordes. La rejilla es única, así que el selector
 * de periodo de los cuatro cae en la misma vertical y se comparan de un vistazo.
 *
 * Un informe SIN DATOS se apaga, no se esconde: si desapareciera, el cliente no
 * sabría que existe y creería que el año pasado no puede consultarse.
 *
 * Medidas de web/design/05-informes.html.
 */

const GRID = "minmax(0,1fr) 260px 56px 132px";
const COLUMN_GAP = 28;

export type ReportPeriod =
  /** Periodo que no se elige aquí: el ejercicio fiscal, la fecha de la foto. */
  | { kind: "fixed"; label: string }
  /** Selector completo de tres estados. */
  | { kind: "selectable"; init?: PeriodInit; menuInFlow?: boolean };

export interface ReportRowProps {
  title: string;
  description: string;
  period: ReportPeriod;
  /** «PDF» o «CSV». El formato no se elige: cada informe tiene el suyo. */
  format: string;
  /** Sin acción, la fila es solo informativa (informe sin datos). */
  action?: {
    label: string;
    variant?: "primary" | "quiet";
    /**
     * Destino de la descarga. Con `href` la acción es un ENLACE de verdad; sin
     * él es un botón inerte, que es lo que eran las cinco filas de esta pantalla
     * hasta ahora: se veían perfectas y no descargaban nada.
     */
    href?: string;
  };
  /** Informe sin operaciones en el periodo: se apaga entero. */
  dimmed?: boolean;
  /** Aclaración bajo la fila, en terciario. */
  note?: string;
  align?: "center" | "start";
  style?: CSSProperties;
}

export function ReportRow({
  title,
  description,
  period,
  format,
  action,
  dimmed = false,
  note,
  align = "center",
  style,
}: ReportRowProps) {
  const api = usePeriod(period.kind === "selectable" ? period.init : undefined);
  const disabled = period.kind === "selectable" && api.invalid;

  return (
    <>
      <div
        className="grid pcx-grid"
        style={{
          ["--pcx-cols" as string]: GRID,
          columnGap: COLUMN_GAP,
          alignItems: align === "start" ? "start" : "center",
          padding: "30px 0",
          borderBottom: "1px solid var(--line)",
          // SIN opacidad global: el 0.45 dejaba el texto en 2,02:1, y el
          // propósito de esta fila es justo el contrario —que se vea que el
          // informe existe aunque no haya datos—. Se apaga por token, que sí
          // pasa contraste.
          ...style,
        }}
      >
        <div style={{ minWidth: 0 }}>
          {/* Apagado por TOKEN: el título baja a terciario y la descripción a
              deshabilitado. Ambos siguen leyéndose, que es el objetivo — con la
              opacidad global el texto caía a 2:1 y el informe desaparecía de
              facto, justo lo que este componente existe para evitar. */}
          <div
            style={{ fontSize: 14, fontWeight: 500, color: dimmed ? "var(--faint)" : undefined }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: "var(--text-label)",
              color: dimmed ? "var(--disabled)" : "var(--faint)",
              marginTop: 6,
            }}
          >
            {description}
          </div>
        </div>

        {period.kind === "fixed" ? (
          <PeriodBox label={period.label} />
        ) : (
          <PeriodPicker api={api} menuInFlow={period.menuInFlow} />
        )}

        <span
          style={{
            fontSize: "var(--text-label)",
            color: "var(--faint)",
            paddingTop: align === "start" ? 8 : undefined,
          }}
        >
          {format}
        </span>

        {action ? (
          <ReportAction
            label={action.label}
            variant={action.variant ?? "quiet"}
            href={action.href}
            disabled={disabled}
            paddingTop={align === "start" ? 7 : undefined}
          />
        ) : (
          <span />
        )}
      </div>

      {note ? (
        <div
          style={{
            fontSize: "var(--text-meta)",
            color: "var(--faint)",
            paddingBottom: 24,
            borderBottom: "1px solid var(--line)",
          }}
        >
          {note}
        </div>
      ) : null}
    </>
  );
}

/**
 * El botón de generar. Solo el informe fiscal —el que casi todo el mundo viene
 * a buscar— lleva relleno azul; los demás son enlaces. Cuatro botones azules
 * seguidos no destacarían ninguno.
 *
 * Con el rango del revés se apaga en vez de desaparecer: el sitio del botón no
 * se mueve mientras se corrige la fecha.
 */
function ReportAction({
  label,
  variant,
  href,
  disabled,
  paddingTop,
}: {
  label: string;
  variant: "primary" | "quiet";
  href?: string;
  disabled: boolean;
  paddingTop?: number;
}) {
  const [hovered, setHovered] = useState(false);

  const base: CSSProperties = {
    justifySelf: "end",
    fontSize: "var(--text-body)",
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : undefined,
    marginTop: paddingTop,
  };

  const skin: CSSProperties =
    variant === "primary"
      ? {
          padding: "9px 16px",
          border: "none",
          borderRadius: "var(--radius-md)",
          background:
            hovered && !disabled ? "var(--accent-hover)" : "var(--accent-primary)",
          // El único sitio del producto donde el blanco puro es legítimo: sobre
          // el relleno azul es el que pasa el AA.
          color: "var(--text-on-accent)",
        }
      : { color: hovered && !disabled ? "var(--foreground)" : "var(--muted)" };

  // Con destino es un ENLACE, no un botón: se abre en otra pestaña, se copia y
  // funciona sin JavaScript. Un botón que solo navega es un enlace disfrazado.
  if (href && !disabled) {
    return (
      <a
        href={href}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ ...base, ...skin, display: "inline-block", textDecoration: "none" }}
      >
        {label}
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...base, ...skin }}
    >
      {label}
    </button>
  );
}
