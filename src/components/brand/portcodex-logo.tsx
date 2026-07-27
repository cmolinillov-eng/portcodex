/**
 * Sistema de logotipo de PortCodex.
 *
 * Punto ÚNICO desde el que se pinta la marca. Ninguna página debe componer el
 * nombre a mano: así el kerning, la caja y el color viajan juntos y no vuelven
 * a aparecer "PORTCODEX" ni "Portcodex" por el camino.
 *
 * Jerarquía de uso (de mayor a menor preferencia):
 *   1. `principal`    símbolo + PortCodex, sin descriptor  ← la habitual
 *   2. `simbolo`      solo símbolo, cuando la marca ya se reconoce
 *   3. `corporativo`  símbolo + nombre + descriptor, en material explicativo
 *
 * El SÍMBOLO (Open Ledger Monogram) todavía no existe como vector: el plan
 * exige redibujarlo profesionalmente y prohíbe usar la imagen conceptual como
 * archivo final. Hasta que aparezca en public/brand/logo/, este componente
 * pinta solo el wordmark — que es correcto y está permitido — y basta con
 * rellenar `Symbol` más abajo para que toda la aplicación lo herede.
 */

export type LogoVariant = "principal" | "corporativo" | "simbolo";

/** Cómo se entinta la marca según el soporte. */
export type LogoTone =
  | "sobre-oscuro" // nombre #F3F6FA, símbolo azul   — dashboard, web, presentaciones
  | "sobre-claro" // nombre #070B12, símbolo azul   — documentos claros
  | "mono-claro" // todo #F3F6FA                   — una sola tinta sobre oscuro
  | "mono-oscuro" // todo #070B12                   — impresión, facturas, sellos
  | "azul"; // todo #2F6BFF                   — azul corporativo sobre blanco

const WORDMARK_INK: Record<LogoTone, string> = {
  "sobre-oscuro": "#F3F6FA",
  "sobre-claro": "#070B12",
  "mono-claro": "#F3F6FA",
  "mono-oscuro": "#070B12",
  azul: "#2F6BFF",
};

const DESCRIPTOR_INK: Record<LogoTone, string> = {
  "sobre-oscuro": "#A5B1C2",
  "sobre-claro": "#475467",
  "mono-claro": "#A5B1C2",
  "mono-oscuro": "#475467",
  azul: "#475467",
};

export const DESCRIPTOR = "Inteligencia patrimonial para activos digitales";

interface PortCodexLogoProps {
  variant?: LogoVariant;
  tone?: LogoTone;
  /** Altura del símbolo y escala del nombre, en píxeles. */
  size?: number;
  className?: string;
}

export function PortCodexLogo({
  variant = "principal",
  tone = "sobre-oscuro",
  size = 28,
  className = "",
}: PortCodexLogoProps) {
  const ink = WORDMARK_INK[tone];

  // Wordmark: Public Sans Semibold, UNA sola tinta, espaciado compacto. Sin
  // degradados, sin dos colores para "Port" y "Codex", sin efectos.
  const wordmark = (
    <span
      style={{
        color: ink,
        fontSize: size * 0.86,
        fontWeight: 600,
        letterSpacing: "-0.03em",
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      PortCodex
    </span>
  );

  if (variant === "simbolo") {
    return <Symbol tone={tone} size={size} className={className} />;
  }

  if (variant === "corporativo") {
    return (
      <span className={`inline-flex items-start gap-3 ${className}`}>
        <Symbol tone={tone} size={size} />
        {/* El descriptor se alinea con el ARRANQUE del nombre y pesa menos que
            él: caja normal, sin mayúsculas ni tracking abierto. */}
        <span className="flex flex-col gap-1">
          {wordmark}
          <span
            style={{
              color: DESCRIPTOR_INK[tone],
              fontSize: 14,
              fontWeight: 400,
              lineHeight: 1.35,
              letterSpacing: "-0.005em",
            }}
          >
            {DESCRIPTOR}
          </span>
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Symbol tone={tone} size={size} />
      {wordmark}
    </span>
  );
}

/**
 * Open Ledger Monogram. Debe leerse de tres maneras a la vez: registro abierto,
 * P interior y C formada por la apertura exterior.
 *
 * PENDIENTE DEL VECTOR DEFINITIVO. Mientras no exista, no se dibuja nada: es
 * preferible que la marca aparezca solo con su nombre —permitido y sobrio— a
 * usar una aproximación que acabaría colándose en producción. Para activarlo,
 * sustituye el cuerpo por el SVG de public/brand/logo/portcodex-symbol.svg.
 *
 * Al montarlo, recuerda: el acento cian solo si mantiene legibilidad, y NUNCA
 * por debajo de 16 px (a ese tamaño, símbolo entero en azul).
 */
function Symbol({ size }: { tone: LogoTone; size: number; className?: string }) {
  void size;
  return null;
}
