"use client";

import { useEffect, useRef, useState } from "react";
import { timeAgoShort } from "@/lib/format/figures";
import { NetworkMarks, SUPPORTED_NETWORKS } from "./NetworkMarks";

/**
 * Módulo «Lectura continua» de la pantalla de Acceso.
 *
 * Es la prueba, antes de entrar, de que esto NO es un formulario más: el
 * contador de última sincronización avanza de verdad mientras el visitante mira
 * la pantalla. No es un adorno —es la promesa del producto hecha visible—, y por
 * eso es el único elemento que se mueve aquí junto al punto de sincronización.
 *
 * El cian está reservado por la identidad a sincronización y datos en vivo: el
 * punto que late es exactamente eso, y es su único uso en esta pantalla.
 *
 * Medidas tomadas de web/design/06-acceso.html.
 */

/** Filo de la maqueta: rgba(148,163,184,0.08), dos tercios de `--line`.
 *  Se deriva del token en vez de cablear el rgba: si `--line` cambia, esto
 *  cambia con él. */
const HAIRLINE = "1px solid color-mix(in srgb, var(--line) 67%, transparent)";

export interface ContinuousReadoutProps {
  /** Número de redes leídas. La lista de marcas vive en NetworkMarks. */
  networkCount?: number;
  protocolCount?: number;
  /** Cadencia de lectura, en palabras: «cada 30 min». */
  frequencyLabel?: string;
  /** Segundos transcurridos desde la última lectura al pintar la pantalla.
   *  Fijo a propósito: así el servidor y el cliente pintan lo mismo y no hay
   *  desajuste de hidratación. A partir de ahí el contador corre solo. */
  initialSeconds?: number;
  /** Segundos de un ciclo completo; al llegar, el contador vuelve a empezar
   *  porque acaba de producirse una lectura nueva. */
  cycleSeconds?: number;
  /** Nota al pie del módulo. */
  note?: string;
}

/**
 * Etiqueta del contador. Por debajo del minuto hace falta el SEGUNDO —es lo que
 * hace visible que la cifra corre—, granularidad que `figures.ts` no cubre
 * porque en el resto del producto no aporta. De ahí en adelante se delega en el
 * formateo común, para que «hace 3 min» se escriba igual en las ocho pantallas.
 */
function syncLabel(seconds: number): string {
  if (seconds < 60) return `hace ${seconds} s`;
  return timeAgoShort(new Date(Date.now() - seconds * 1000).toISOString());
}

export function ContinuousReadout({
  // Por defecto, las que realmente se pintan: si mañana se añade una marca y no
  // se toca este número, la pantalla mentiría.
  networkCount = SUPPORTED_NETWORKS.length,
  protocolCount = 12,
  frequencyLabel = "cada 30 min",
  initialSeconds = 14,
  cycleSeconds = 1800,
  note = "PortCodex lee las posiciones directamente de cada red, sin intermediarios.",
}: ContinuousReadoutProps) {
  const [seconds, setSeconds] = useState(initialSeconds);
  // Al reiniciar el ciclo la cifra sube 3 px y vuelve: el salto de «hace 29 min»
  // a «hace 1 s» sin movimiento parecería un error de dato.
  const [justReset, setJustReset] = useState(false);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev >= cycleSeconds) {
          setJustReset(true);
          if (settleRef.current) clearTimeout(settleRef.current);
          settleRef.current = setTimeout(() => setJustReset(false), 320);
          return 1;
        }
        return prev + 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      if (settleRef.current) clearTimeout(settleRef.current);
    };
  }, [cycleSeconds]);

  return (
    <div style={{ marginTop: 64, maxWidth: 400 }}>
      <div className="flex items-center" style={{ gap: 9 }}>
        <span
          className="pcx-pulse rounded-full"
          style={{ width: 6, height: 6, background: "var(--accent-secondary)" }}
          aria-hidden="true"
        />
        <span style={{ fontSize: "var(--text-label)", color: "var(--muted)" }}>
          Lectura continua
        </span>
      </div>

      <ReadoutRow label="Redes soportadas" value={String(networkCount)} />
      <ReadoutRow label="Protocolos monitorizados" value={String(protocolCount)} />
      <ReadoutRow label="Frecuencia de lectura" value={frequencyLabel} />
      <ReadoutRow
        label="Última sincronización"
        value={syncLabel(seconds)}
        live
        nudged={justReset}
      />

      <NetworkMarks />

      <p
        style={{
          fontSize: "var(--text-meta)",
          color: "var(--faint)",
          marginTop: 26,
          marginBottom: 0,
          maxWidth: "34em",
          textWrap: "pretty",
        }}
      >
        {note}
      </p>
    </div>
  );
}

function ReadoutRow({
  label,
  value,
  live = false,
  nudged = false,
}: {
  label: string;
  value: string;
  /** La fila del contador se anuncia como región viva para lectores de pantalla. */
  live?: boolean;
  nudged?: boolean;
}) {
  return (
    <div
      className="flex items-baseline justify-between"
      style={{ gap: 24, padding: "12px 0", borderBottom: HAIRLINE }}
    >
      <span style={{ fontSize: "var(--text-body)", color: "var(--muted)" }}>{label}</span>
      {/* SIN `aria-live`: el contador se actualiza cada segundo, y anunciarlo
          haría que un lector de pantalla dijera «hace 15 s… hace 16 s…» sin
          parar, dejando la pantalla de acceso inservible. El dato es ambiental
          —dice que el sistema está vivo—, no un cambio que haya que avisar. */}
      <span
        className={live ? "tabular-nums" : undefined}
        style={{
          fontSize: "var(--text-body)",
          color: "var(--foreground)",
          whiteSpace: "nowrap",
          transform: nudged ? "translateY(-3px)" : "translateY(0)",
          transition: live ? "transform 300ms var(--ease)" : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}
