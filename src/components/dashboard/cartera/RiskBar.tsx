/**
 * Barra de riesgo, bajo el nombre del activo.
 *
 * Misma convención en toda la cartera: **si hay barra, es información de
 * riesgo**. En un pool marca dónde cae el precio dentro del rango; en un
 * lending, el factor de salud. Que compartan sitio y forma es lo que hace que
 * el cliente no tenga que aprender dos lenguajes.
 *
 * La etiqueta con los números solo aparece al pasar el ratón, pero su hueco se
 * reserva SIEMPRE: si apareciera y desapareciera, la fila daría un salto de
 * 16 px cada vez que el ratón la cruza y la tabla entera bailaría.
 */

const TRACK = "#22313F";
const BAR_WIDTH = 108;
const KNOB = 7;

export function RiskBar({
  /** 0–100: dónde cae el valor actual dentro del rango. */
  position,
  /** Texto que se revela al pasar el ratón: «Rango 0,995 – 1,005 · actual 1,000». */
  label,
  hovered,
  /** Fuera de rango o factor de salud comprometido: el punto pasa a ámbar. */
  atRisk = false,
}: {
  position: number;
  label: string;
  hovered: boolean;
  atRisk?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, position));

  return (
    <>
      {/* El texto va en `aria-label` además de en la etiqueta visible: el
          detalle solo se pinta al pasar el ratón, así que sin esto el factor de
          salud de un lending sería inaccesible para quien no usa ratón. */}
      <div
        role="img"
        aria-label={label}
        style={{
          position: "relative",
          height: 3,
          background: TRACK,
          borderRadius: 2,
          marginTop: 10,
          maxWidth: BAR_WIDTH,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: `${clamped}%`,
            top: -2,
            width: KNOB,
            height: KNOB,
            marginLeft: -KNOB / 2,
            borderRadius: "50%",
            background: atRisk ? "var(--warn)" : "var(--foreground)",
          }}
        />
      </div>
      <div style={{ height: 16, marginTop: 5 }}>
        {hovered ? (
          <span style={{ fontSize: "var(--text-meta)", color: "var(--faint)" }}>{label}</span>
        ) : null}
      </div>
    </>
  );
}
