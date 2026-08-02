import { PortCodexLogo } from "@/components/brand/portcodex-logo";
import { ContinuousReadout, type ContinuousReadoutProps } from "./ContinuousReadout";

/**
 * Lado de marca de la pantalla de Acceso (58 % del ancho).
 *
 * Es el único sitio del producto donde la marca se presenta: quien llega aquí
 * puede no haber visto nunca PortCodex. De ahí el logotipo completo —con
 * descriptor—, un titular editorial y, debajo, la prueba de que el producto está
 * leyendo ahora mismo.
 *
 * Medidas tomadas de web/design/06-acceso.html.
 */

export interface AccessBrandPanelProps {
  headline?: string;
  lead?: string;
  readout?: ContinuousReadoutProps;
  /** Pie de la columna: los tres valores de la marca. */
  values?: string;
}

export function AccessBrandPanel({
  headline = "Una visión clara de tu patrimonio digital.",
  lead = "PortCodex reúne tus posiciones, mantiene la contabilidad al día y anticipa el impacto fiscal de cada operación.",
  readout,
  values = "Claridad · Control · Trazabilidad",
}: AccessBrandPanelProps) {
  return (
    <div
      className="flex flex-col"
      style={{
        // 64 px literales, NO `--shell-pad` (hoy 48): esta pantalla no usa el
        // patrón de página con barra superior, es una partida a sangre, y la
        // maqueta fija 64 px en esta columna.
        padding: "clamp(28px, 6vw, 40px) clamp(20px, 6vw, 64px) clamp(24px, 5vw, 32px)",
        background: "var(--void-deep)",
      }}
    >
      {/* Variante `principal`, sin descriptor: el descriptor dice «Inteligencia
          patrimonial para activos digitales» y el titular, tres centímetros más
          abajo, dice «Una visión clara de tu patrimonio digital». Es la misma
          frase dos veces, y la segunda está mejor escrita.

          `clearSpace` desactivado: el padding de la columna ya reserva mucho más
          aire que el área de seguridad de la marca. */}
      <PortCodexLogo variant="principal" tone="sobre-oscuro" size={26} clearSpace={false} />

      <div
        className="flex flex-1 flex-col justify-center"
        style={{ padding: "56px 0" }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "var(--text-display)",
            fontWeight: 600,
            lineHeight: 1.02,
            letterSpacing: "-0.035em",
            color: "var(--foreground)",
            maxWidth: "11em",
          }}
        >
          {headline}
        </h1>

        <p
          style={{
            margin: "30px 0 0",
            fontSize: "var(--text-lead)",
            fontWeight: 400,
            lineHeight: 1.6,
            color: "var(--muted)",
            maxWidth: "29em",
            textWrap: "pretty",
          }}
        >
          {lead}
        </p>

        <ContinuousReadout {...readout} />
      </div>

      <div
        style={{
          paddingTop: 18,
          borderTop: "1px solid var(--line)",
          fontSize: "var(--text-label)",
          color: "var(--faint)",
        }}
      >
        {values}
      </div>
    </div>
  );
}
