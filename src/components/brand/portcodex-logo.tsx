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

/**
 * ÁREA DE SEGURIDAD: alrededor del logo queda libre un espacio equivalente a la
 * altura de la "P". No es decorativo — es lo que impide que la marca acabe
 * pegada a un borde o a otro logotipo. Se aplica sola, como padding.
 */
const CLEAR_SPACE_RATIO = 0.62; // altura de la "P" ≈ 62 % del cuerpo

/** Por debajo de este ancho, el sistema exige usar SOLO el símbolo. */
export const MIN_LOCKUP_WIDTH_PX = 120;

interface PortCodexLogoProps {
  variant?: LogoVariant;
  tone?: LogoTone;
  /** Altura del símbolo y escala del nombre, en píxeles. */
  size?: number;
  /** Reserva el área de seguridad alrededor. Quítalo solo si el contenedor ya
   *  aporta ese aire; nunca para "ganar sitio". */
  clearSpace?: boolean;
  className?: string;
}

export function PortCodexLogo({
  variant = "principal",
  tone = "sobre-oscuro",
  size = 28,
  clearSpace = true,
  className = "",
}: PortCodexLogoProps) {
  const ink = WORDMARK_INK[tone];
  const pad = clearSpace ? Math.round(size * CLEAR_SPACE_RATIO) : 0;
  const frame = { padding: pad } as const;

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
      <span style={frame} className={`inline-flex items-start gap-3 ${className}`}>
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
    <span style={frame} className={`inline-flex items-center gap-2.5 ${className}`}>
      <Symbol tone={tone} size={size} />
      {wordmark}
    </span>
  );
}

/** Tinta del símbolo. En las versiones a color manda siempre el azul de marca;
 *  en las monocromáticas, una sola tinta sin depender del acento. */
const SYMBOL_INK: Record<LogoTone, string> = {
  "sobre-oscuro": "#2F6BFF",
  "sobre-claro": "#2F6BFF",
  "mono-claro": "#F3F6FA",
  "mono-oscuro": "#070B12",
  azul: "#2F6BFF",
};

/** Por debajo de este tamaño el acento cian ensucia más de lo que aporta. */
const ACCENT_MIN_PX = 20;

/**
 * Open Ledger Monogram. Se lee de tres maneras a la vez: registro abierto, C en
 * la hoja izquierda y P en la derecha.
 *
 * Cada hoja es UN trazo continuo — por tramos quedaban muescas donde se
 * encontraban. Fuente de verdad: public/brand/logo/portcodex-symbol.svg; va
 * en línea (no como <img>) para poder entintarlo por variante.
 *
 * PROVISIONAL: dibujado a partir del mockup para desbloquear el producto. Al
 * llegar el redibujo profesional se sustituyen estos dos `path` y toda la
 * aplicación lo hereda.
 */
function Symbol({ tone, size }: { tone: LogoTone; size: number; className?: string }) {
  const withAccent = size >= ACCENT_MIN_PX && tone !== "mono-claro" && tone !== "mono-oscuro";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden="true"
      style={{ color: SYMBOL_INK[tone], flexShrink: 0, display: "block" }}
    >
      <g
        stroke="currentColor"
        strokeWidth="8.5"
        strokeLinecap="butt"
        strokeLinejoin="miter"
        strokeMiterlimit="2.2"
      >
        <path d="M44 30.5 L15 17.5 L15 69.5 L44 82.5" />
        <path d="M63 54.5 L83 44.5 L83 18 L54 31 L54 82.5 L70 75.5" />
      </g>
      {withAccent ? <path d="M73.5 66.5 L82 62.8 L82 74 L73.5 77.7 Z" fill="#18BFD0" /> : null}
    </svg>
  );
}
