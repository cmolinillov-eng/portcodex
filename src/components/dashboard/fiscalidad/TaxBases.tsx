import { Section } from "@/components/shell/SectionHeading";
import { EuroFigure } from "./EuroFigure";

/**
 * Las dos bases imponibles del IRPF, ENFRENTADAS.
 *
 * Se dibujan a la par —mismo tamaño, mismo peso, separadas por un filo— porque
 * no hay una principal: son dos bolsas que tributan a tarifas distintas y que
 * no se compensan entre sí. Poner una encima de otra, o una más grande,
 * insinuaría una jerarquía que la ley no tiene.
 *
 * Debajo de cada cifra va QUÉ entra en ella. Sin esa línea, «base del ahorro» y
 * «base general» son dos etiquetas de gestoría: con ella, el cliente reconoce
 * sus propias operaciones.
 *
 * Medidas de web/design/04-fiscalidad.html.
 */

export interface TaxBase {
  label: string;
  /** Importe en euros, sin formatear: el formateo es de esta pantalla. */
  amountEur: number;
  /** Qué rentas entran en esta base. */
  explanation: string;
}

export function TaxBases({ savings, general }: { savings: TaxBase; general: TaxBase }) {
  return (
    <Section>
      <div className="grid grid-cols-2">
        <BaseFigure base={savings} />
        <BaseFigure base={general} divided />
      </div>
    </Section>
  );
}

function BaseFigure({ base, divided = false }: { base: TaxBase; divided?: boolean }) {
  return (
    <div
      style={{
        paddingRight: divided ? undefined : 56,
        paddingLeft: divided ? 56 : undefined,
        borderLeft: divided ? "1px solid var(--line)" : undefined,
      }}
    >
      <div style={{ fontSize: "var(--text-body)", color: "var(--faint)" }}>{base.label}</div>

      <div style={{ marginTop: 14 }}>
        <EuroFigure
          value={base.amountEur}
          size={31}
          weight={600}
          letterSpacing="-0.02em"
          symbolSize={17}
          symbolTone="muted"
        />
      </div>

      <div
        style={{
          fontSize: "var(--text-label)",
          color: "var(--faint)",
          marginTop: 14,
          maxWidth: 300,
          textWrap: "pretty",
        }}
      >
        {base.explanation}
      </div>
    </div>
  );
}
