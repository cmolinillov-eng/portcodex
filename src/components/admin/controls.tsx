"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

/**
 * Controles de las pantallas de administración.
 *
 * Administración y Editar usuario son las ÚNICAS pantallas del producto con
 * formularios y acciones destructivas, así que sus piezas viven aquí y no en
 * `components/shell`: no las usa nadie más. Todo sale de los tokens de
 * `globals.css` —las clases heredadas `.btn-primary` y `.input-base` son de la
 * etapa verde y siguen cableando `#0e1512` y `rgb(111 174 143)`, que están
 * derogados.
 *
 * Medidas tomadas de web/design/07-administracion.html y 08-editar-usuario.html.
 */

/* ── Botón de acción principal ──────────────────────────────────────────────
   Relleno azul de marca. El texto va en `--text-on-accent` (blanco puro), que
   es la ÚNICA excepción legítima a «nunca blanco puro»: sobre #2F6BFF el
   blanco da 4,50:1 y el blanco roto se queda en 4,15:1, por debajo del AA. */
export function PrimaryButton({
  children,
  onClick,
  href,
  disabled = false,
  type = "button",
  /** 07 usa 9/16; el «Guardar cambios» de 08 pesa un punto más: 10/18. */
  padding = "9px 16px",
}: {
  children: ReactNode;
  onClick?: () => void;
  /** Si la acción es una navegación —«Crear usuario»— se pinta como enlace: un
   *  botón que navega rompe el clic con el botón central y el «abrir en pestaña». */
  href?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  padding?: string;
}) {
  const [hover, setHover] = useState(false);

  const style = {
    display: "inline-block",
    padding,
    border: "none",
    borderRadius: "var(--radius-md)",
    // Apagado NO es «azul más oscuro»: es el azul de fondo de navegación
    // activa, que ya existe en el sistema como «azul sin acción».
    background: disabled
      ? "var(--accent-soft)"
      : hover
        ? "var(--accent-hover)"
        : "var(--accent-primary)",
    color: disabled ? "var(--faint)" : "var(--text-on-accent)",
    fontSize: "var(--text-body)",
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    // SIN transición, a propósito. Apagado y encendido no son un matiz
    // estético: dicen si la acción existe. Un fundido de 150 ms deja al botón
    // enseñando el color equivocado justo mientras se decide pulsarlo, y la
    // identidad reserva el movimiento al punto de sincronización.
  };

  if (href && !disabled) {
    return (
      <Link
        href={href}
        style={style}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={style}
    >
      {children}
    </button>
  );
}

/**
 * Botón destructivo: filo rojo, NUNCA relleno rojo.
 *
 * Un rectángulo rojo macizo pesa más que el botón de guardar y termina
 * invitando a pulsarlo. El filo avisa sin llamar: el peso visual de una acción
 * debe ser proporcional a lo que se quiere que ocurra, no a lo grave que es.
 */
export function DangerButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "9px 16px",
        borderRadius: "var(--radius-md)",
        border: `1px solid ${
          disabled ? "color-mix(in srgb, var(--loss) 35%, transparent)" : "var(--loss)"
        }`,
        background:
          !disabled && hover ? "color-mix(in srgb, var(--loss) 8%, transparent)" : "transparent",
        color: disabled ? "color-mix(in srgb, var(--loss) 50%, transparent)" : "var(--loss)",
        fontSize: "var(--text-body)",
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

/**
 * Acción secundaria en texto: «Descartar», «Cancelar», «Quitar cliente». Sin
 * peso ninguno.
 *
 * `tone="danger"` sube a rojo SOLO al apuntar. Es la acción que se repite en
 * cada fila de una lista, y un filo rojo por fila convertiría la lista en un
 * semáforo: cuando algo se señala en todas partes deja de señalar nada. El rojo
 * aparece justo cuando se va a pulsar, que es cuando avisa de verdad.
 */
export function QuietButton({
  children,
  onClick,
  tone = "neutral",
  disabled = false,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "neutral" | "danger";
  disabled?: boolean;
  /** Obligatorio cuando el mismo texto se repite en varias filas: «Quitar
   *  cliente» dice lo mismo en las seis y no distingue a cuál se refiere. */
  ariaLabel?: string;
}) {
  const [hover, setHover] = useState(false);
  const hot = hover && !disabled;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        fontSize: "var(--text-body)",
        color: disabled
          ? "var(--disabled)"
          : hot
            ? tone === "danger"
              ? "var(--loss)"
              : "var(--muted)"
            : "var(--faint)",
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

/* ── Campos ────────────────────────────────────────────────────────────────
   Etiqueta encima, control debajo. Nunca en línea: la columna es única y
   estrecha, y una etiqueta a la izquierda le robaría un tercio del ancho. */

function fieldStyle(focused: boolean) {
  return {
    width: "100%",
    padding: "11px 13px",
    background: "var(--float)",
    border: `1px solid ${focused ? "var(--accent-hover)" : "var(--line-strong)"}`,
    borderRadius: "var(--radius-md)",
    color: "var(--foreground)",
    fontSize: "var(--text-body)",
    appearance: "none" as const,
    outline: focused ? "2px solid var(--accent-hover)" : "none",
    outlineOffset: 0,
  };
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: "block",
        fontSize: "var(--text-label)",
        color: "var(--muted)",
        marginBottom: 8,
      }}
    >
      {children}
    </label>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete = "off",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email";
  autoComplete?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={fieldStyle(focused)}
      />
    </div>
  );
}

export function SelectField({
  id,
  label,
  note,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  /** Segunda línea de contexto bajo la etiqueta («Cartera: …»). */
  note?: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label
        htmlFor={id}
        style={{
          display: "block",
          fontSize: "var(--text-label)",
          color: "var(--muted)",
          marginBottom: note ? 6 : 8,
        }}
      >
        {label}
      </label>
      {note ? (
        <div style={{ fontSize: "var(--text-meta)", color: "var(--faint)", marginBottom: 10 }}>
          {note}
        </div>
      ) : null}
      <div style={{ position: "relative" }}>
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={fieldStyle(focused)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {/* La flecha la dibujamos nosotros porque `appearance:none` se lleva la
            del navegador, que además cambia de forma en cada sistema. */}
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 13,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 10,
            color: "var(--faint)",
            pointerEvents: "none",
          }}
        >
          ▾
        </span>
      </div>
    </div>
  );
}
