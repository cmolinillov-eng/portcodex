"use client";

import { useState } from "react";
import { longDate } from "@/lib/format/figures";

/**
 * Selector de periodo de un informe. Tres estados, no tres controles:
 *
 *   1. CERRADO      — el periodo elegido, en una caja de 150 px.
 *   2. DESPLEGADO   — cuatro periodos frecuentes y «Personalizado…» detrás de
 *                     un filo, porque no es un periodo más: cambia el control.
 *   3. PERSONALIZADO— fecha de inicio y fecha de fin, con vuelta atrás.
 *
 * Los cuatro periodos frecuentes existen para que NADIE tenga que escribir dos
 * fechas para pedir lo de siempre. El rango a mano se gana un clic de más y, a
 * cambio, no ocupa sitio mientras no se usa.
 *
 * Las fechas se escriben como se leen —«28 jul 2026», el mismo formato que
 * `longDate()` imprime en toda la aplicación— y no como `28/07/2026`: si la
 * pantalla lo muestra de una forma, se teclea de esa forma.
 *
 * Medidas de web/design/05-informes.html.
 */

export const PERIOD_PRESETS = [
  "Año en curso",
  "Último trimestre",
  "Últimos 12 meses",
  "Desde el inicio",
] as const;

/** Abreviaturas de mes de `Intl` en es-ES, que es lo que imprime `longDate()`. */
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * Lee «28 jul 2026». Devuelve null si no es una fecha: el texto a medio
 * escribir NO es un error, solo todavía no es una fecha.
 *
 * Acepta cuatro letras porque `Intl` abrevia septiembre como «sept».
 */
export function parseSpanishDate(input: string): number | null {
  const match = input
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})\s+([a-záéíóú]{3,4})\.?\s+(\d{4})$/);
  if (!match) return null;

  const month = MONTHS.indexOf(match[2].slice(0, 3));
  if (month < 0) return null;

  const day = Number(match[1]);
  const date = new Date(Number(match[3]), month, day);
  // «31 feb» existiría como 3 de marzo si no se comprueba la vuelta atrás.
  if (date.getMonth() !== month || date.getDate() !== day) return null;
  return date.getTime();
}

export interface PeriodState {
  mode: "preset" | "custom";
  open: boolean;
  preset: string;
  from: string;
  to: string;
}

export interface PeriodInit {
  preset?: string;
  /** ISO. Se imprime con `longDate()`, como el resto de fechas del producto. */
  fromIso?: string;
  toIso?: string;
  mode?: "preset" | "custom";
  open?: boolean;
}

/**
 * Rango por defecto del modo «Personalizado…»: del 1 de enero de ESTE año a
 * hoy.
 *
 * Estaba cableado a «01 ene 2026 → 28 jul 2026», que son literalmente las
 * fechas que tenía la maqueta el día que se dibujó: el 28 de julio de 2026 era
 * «hoy». Congeladas en el componente, en 2027 alguien abriría «Personalizado…»
 * y se encontraría el año pasado ya escrito. Las constantes de la maqueta viven
 * en app/preview, no aquí.
 */
function rangoPorDefecto(): { desde: string; hasta: string } {
  const hoy = new Date();
  const primeroDeEnero = new Date(hoy.getFullYear(), 0, 1);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { desde: iso(primeroDeEnero), hasta: iso(hoy) };
}

export function usePeriod(init: PeriodInit = {}) {
  const [state, setState] = useState<PeriodState>(() => {
    const porDefecto = rangoPorDefecto();
    return {
      mode: init.mode ?? "preset",
      open: init.open ?? false,
      preset: init.preset ?? PERIOD_PRESETS[0],
      from: longDate(init.fromIso ?? porDefecto.desde),
      to: longDate(init.toIso ?? porDefecto.hasta),
    };
  });

  const from = parseSpanishDate(state.from);
  const to = parseSpanishDate(state.to);
  // Solo es un ERROR cuando las dos fechas se entienden y están del revés. Un
  // campo a medio teclear no se marca en rojo: se marca cuando ya se sabe que
  // está mal.
  const invalid = state.mode === "custom" && from !== null && to !== null && to <= from;

  const patch = (next: Partial<PeriodState>) => setState((s) => ({ ...s, ...next }));

  return {
    state,
    invalid,
    label: state.preset,
    toggle: () => patch({ open: !state.open }),
    pickPreset: (preset: string) => patch({ preset, mode: "preset", open: false }),
    startCustom: () => patch({ mode: "custom", open: false }),
    setFrom: (from_: string) => patch({ from: from_ }),
    setTo: (to_: string) => patch({ to: to_ }),
    backToPresets: () => patch({ mode: "preset", open: false }),
  };
}

export type PeriodApi = ReturnType<typeof usePeriod>;

/** Caja cerrada. También la usan los selectores que no despliegan nada —el
 *  ejercicio fiscal, la fecha de la fotografía—, para que todos los informes
 *  presenten su periodo igual. */
export function PeriodBox({
  label,
  onClick,
  expanded,
}: {
  label: string;
  onClick?: () => void;
  expanded?: boolean;
}) {
  const content = (
    <>
      <span style={{ fontSize: "var(--text-label)", color: "var(--muted)" }}>{label}</span>
      <span style={{ fontSize: 10, color: "var(--faint)" }} aria-hidden="true">
        ▾
      </span>
    </>
  );

  const style = {
    width: 150,
    padding: "7px 11px",
    border: "1px solid var(--line)",
    // 6 px: el radio de los CONTROLES pequeños. El de 8 es el de los botones, y
    // mezclarlos hace que la fila parezca dibujada por dos manos.
    borderRadius: "var(--radius-sm)",
  } as const;

  if (!onClick) {
    return (
      <div className="flex items-center justify-between gap-2" style={style}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="listbox"
      aria-expanded={expanded ?? false}
      aria-label={`Periodo: ${label}`}
      className="flex items-center justify-between gap-2"
      style={style}
    >
      {content}
    </button>
  );
}

export function PeriodPicker({
  api,
  presets = [...PERIOD_PRESETS],
  /**
   * El desplegable flota SOBRE la fila siguiente: si empujara el contenido,
   * abrir el selector movería de sitio los otros tres informes. Solo el bloque
   * de referencia de estados lo pinta en el flujo, para poder verlo quieto.
   */
  menuInFlow = false,
}: {
  api: PeriodApi;
  presets?: string[];
  menuInFlow?: boolean;
}) {
  const { state, invalid } = api;

  return (
    <div style={{ minWidth: 0, position: menuInFlow ? undefined : "relative" }}>
      {state.mode === "preset" ? (
        <PeriodBox label={state.preset} onClick={api.toggle} expanded={state.open} />
      ) : (
        <div>
          <div className="flex items-center" style={{ gap: 10 }}>
            <DateField
              value={state.from}
              onChange={api.setFrom}
              label="Fecha de inicio"
              invalid={false}
            />
            <span
              style={{ fontSize: "var(--text-label)", color: "var(--faint)" }}
              aria-hidden="true"
            >
              →
            </span>
            {/* El rojo va en la fecha FINAL: es la que está mal colocada, y
                pintar las dos no diría cuál hay que mover. */}
            <DateField
              value={state.to}
              onChange={api.setTo}
              label="Fecha de fin"
              invalid={invalid}
            />
          </div>

          {invalid ? (
            <div
              role="alert"
              style={{ fontSize: "var(--text-meta)", color: "var(--loss)", marginTop: 7 }}
            >
              La fecha final debe ser posterior
            </div>
          ) : null}

          <button
            type="button"
            onClick={api.backToPresets}
            style={{
              display: "inline-block",
              fontSize: "var(--text-meta)",
              color: "var(--faint)",
              marginTop: 7,
            }}
          >
            Volver a periodos
          </button>
        </div>
      )}

      {state.open ? (
        <div
          role="listbox"
          style={{
            position: menuInFlow ? undefined : "absolute",
            top: menuInFlow ? undefined : "100%",
            left: menuInFlow ? undefined : 0,
            marginTop: 6,
            width: 176,
            background: "var(--float)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-md)",
            padding: "5px 0",
            zIndex: 20,
          }}
        >
          {presets.map((preset) => {
            const selected = preset === state.preset;
            return (
              <button
                key={preset}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => api.pickPreset(preset)}
                className="flex w-full items-center justify-between"
                style={{
                  gap: 10,
                  padding: "7px 12px",
                  fontSize: "var(--text-label)",
                  color: selected ? "var(--foreground)" : "var(--muted)",
                  textAlign: "left",
                }}
              >
                {preset}
                {selected ? (
                  <span style={{ fontSize: "var(--text-meta)", color: "var(--muted)" }}>✓</span>
                ) : null}
              </button>
            );
          })}

          {/* El filo separa los periodos hechos del que hay que escribir: no es
              una quinta opción, es otra manera de responder. */}
          <div
            style={{ height: 1, margin: "5px 0", background: "var(--line)" }}
            aria-hidden="true"
          />

          <button
            type="button"
            onClick={api.startCustom}
            className="w-full"
            style={{
              display: "block",
              padding: "7px 12px",
              fontSize: "var(--text-label)",
              color: "var(--muted)",
              textAlign: "left",
            }}
          >
            Personalizado…
          </button>
        </div>
      ) : null}
    </div>
  );
}

function DateField({
  value,
  onChange,
  label,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  invalid: boolean;
}) {
  return (
    <input
      value={value}
      aria-label={label}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: 108,
        padding: "7px 10px",
        border: `1px solid ${invalid ? "var(--loss)" : "var(--line)"}`,
        borderRadius: "var(--radius-sm)",
        background: "transparent",
        color: invalid ? "var(--loss)" : "var(--foreground)",
        fontSize: "var(--text-label)",
      }}
    />
  );
}
