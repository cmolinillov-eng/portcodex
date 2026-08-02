import { money } from "@/lib/format/figures";

/**
 * Importe en euros con el SÍMBOLO más pequeño que la cifra.
 *
 * La maqueta separa los dos tamaños en todas partes —31/17 en las bases, 13/11
 * en la tabla— porque el dato es el número: el símbolo solo dice en qué unidad
 * está. Se resuelve aquí y no en cada componente para que la proporción sea
 * siempre la misma.
 *
 * El texto sale de `money()`, así que los decimales y el menos tipográfico
 * («−225,62 €») son los mismos que en las otras siete pantallas.
 */

type Tone = "strong" | "muted" | "faint" | "loss";

const COLOR: Record<Tone, string> = {
  strong: "var(--foreground)",
  muted: "var(--muted)",
  faint: "var(--faint)",
  loss: "var(--loss)",
};

/** Separa «161,37 €» en cifra y símbolo. El símbolo es siempre el último tramo. */
export function splitEuro(value: number): { amount: string; symbol: string } {
  const text = money(value, "EUR");
  const cut = text.lastIndexOf(" ");
  return { amount: text.slice(0, cut), symbol: text.slice(cut + 1) };
}

export function EuroFigure({
  value,
  size,
  weight = 400,
  tone = "strong",
  symbolSize,
  symbolTone = "faint",
  symbolWeight = 400,
  letterSpacing,
  align,
}: {
  value: number;
  /** Tamaño de la cifra, en px. La maqueta usa 31 en las bases y 13/14 en la tabla. */
  size: number;
  weight?: 400 | 500 | 600;
  tone?: Tone;
  /** Tamaño del símbolo. Por defecto, un tercio menos que la cifra. */
  symbolSize: number;
  symbolTone?: Tone;
  symbolWeight?: 400 | 500 | 600;
  letterSpacing?: string;
  align?: "left" | "right";
}) {
  const { amount, symbol } = splitEuro(value);

  return (
    <span
      className="tabular-nums"
      style={{
        fontSize: size,
        fontWeight: weight,
        color: COLOR[tone],
        letterSpacing,
        // Una cifra partida en dos tramos NO puede romper de línea: «161,37» y
        // «€» separados por un salto dejarían de leerse como un importe.
        whiteSpace: "nowrap",
        textAlign: align,
      }}
    >
      {amount}{" "}
      <span style={{ fontSize: symbolSize, fontWeight: symbolWeight, color: COLOR[symbolTone] }}>
        {symbol}
      </span>
    </span>
  );
}
