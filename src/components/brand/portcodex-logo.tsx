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
  //
  // Proporción y tracking tomados de las maquetas aprobadas: símbolo de 22 px
  // con nombre de 15 px. Antes iba a 0,86 y −0,03em, y el nombre se comía al
  // símbolo en la barra de navegación.
  const wordmark = (
    <span
      style={{
        color: ink,
        fontSize: Math.round(size * 0.68),
        fontWeight: 600,
        letterSpacing: "-0.01em",
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
 * Monograma C + P. Es el símbolo de PRODUCTO: el que vive en la navegación, el
 * favicon y el icono de aplicación.
 *
 * Se eligió sobre el «registro abierto» del tablero de marca por una razón
 * práctica: a 22 px —donde está el 99 % del tiempo— este se lee y aquel no.
 * Cumple igualmente lo que pide la identidad («las letras P y C»), y es el que
 * se aprobó a lo largo de las ocho maquetas.
 *
 * El registro abierto sigue siendo válido para marca, portada y presentaciones,
 * donde tiene espacio para respirar. Vive en
 * public/brand/logo/portcodex-symbol.svg.
 *
 * Trazado tomado literalmente de las maquetas (web/design/01-resumen.html), no
 * redibujado a ojo: así el producto y el diseño aprobado no divergen.
 */
function Symbol({ tone, size }: { tone: LogoTone; size: number; className?: string }) {
  const withAccent = size >= ACCENT_MIN_PX && tone !== "mono-claro" && tone !== "mono-oscuro";
  // El trazo escala con el tamaño: a 22 px son los 2,6 de la maqueta.
  const stroke = (2.6 / 22) * size;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      style={{ color: SYMBOL_INK[tone], flexShrink: 0, display: "block" }}
    >
      <g stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
        {/* C */}
        <path d="M13 5.5C8.3 5.5 5 9.3 5 14s3.3 8.5 8 8.5" />
        {/* P */}
        <path d="M16.4 22.5V5.5h3.1a4.3 4.3 0 0 1 0 8.6h-3.1" />
      </g>
      {/* Punto decimal — único uso del cian, y se retira por debajo de 20 px */}
      {withAccent ? <rect x="22" y="18.6" width="3.9" height="3.9" fill="#18BFD0" /> : null}
    </svg>
  );
}
