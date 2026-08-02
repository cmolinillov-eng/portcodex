import type { ReactNode } from "react";

/**
 * Modelo 721 — declaración informativa de criptomonedas en el extranjero.
 *
 * Aparece SIEMPRE, también —y sobre todo— cuando no hay obligación. Un bloque
 * que solo se enseña al superar el umbral deja al cliente sin saber si la
 * aplicación miró: «sin obligación» es una respuesta, la ausencia no lo es.
 *
 * Por eso el estado va en una línea afirmativa y el porqué debajo, con el
 * umbral y la fecha de corte explícitos. No lleva color: no es una alerta, es
 * el resultado de una comprobación.
 *
 * Medidas de web/design/04-fiscalidad.html.
 */
export function Modelo721({
  status,
  explanation,
}: {
  /** El estado, en afirmativo: «Sin obligación de declarar en este ejercicio». */
  status: string;
  /** El porqué: umbral, fecha de corte y qué saldos se han mirado. */
  explanation: ReactNode;
}) {
  return (
    <section
      style={{
        marginTop: 56,
        paddingTop: 20,
        borderTop: "1px solid var(--line)",
      }}
    >
      <h2 style={{ margin: 0, fontSize: "var(--text-lead)", fontWeight: 600 }}>
        Modelo 721 · Criptomonedas en el extranjero
      </h2>
      <div style={{ fontSize: "var(--text-label)", color: "var(--faint)", marginTop: 8 }}>
        Declaración informativa de saldos en plataformas no residentes
      </div>

      <div style={{ fontSize: 14, fontWeight: 500, marginTop: 26 }}>{status}</div>

      <div
        style={{
          fontSize: "var(--text-body)",
          color: "var(--muted)",
          marginTop: 10,
          maxWidth: 620,
          textWrap: "pretty",
        }}
      >
        {explanation}
      </div>
    </section>
  );
}
