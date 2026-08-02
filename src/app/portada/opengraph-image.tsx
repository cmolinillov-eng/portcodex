import { ImageResponse } from "next/og";

/**
 * Imagen de Open Graph de la portada.
 *
 * Se genera aquí en lugar de guardarse como PNG para que el titular y la marca
 * no se queden desfasados el día que cambien en la página.
 *
 * Los colores van escritos a mano porque el generador de imágenes no ve el CSS
 * del proyecto y por tanto no puede leer `var(--…)`. Son EXACTAMENTE los mismos
 * valores de los tokens de `globals.css` —obsidiana, tinta principal, azul de
 * marca, cian y secundario—; no hay ningún color nuevo.
 */
const OBSIDIAN = "#070B12"; // --void-deep
const INK = "#F3F6FA"; // --foreground
const INK_2 = "#A5B1C2"; // --muted
const BLUE = "#2F6BFF"; // --accent-primary
const CYAN = "#18BFD0"; // --accent-secondary
const LINE = "#26364A"; // --line-strong

export const alt = "PortCodex — Tu patrimonio digital, bien explicado.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: OBSIDIAN,
          padding: "72px 80px",
        }}
      >
        {/* Marca: el mismo monograma C + P del producto, redibujado aquí porque
            el generador no puede montar componentes de React del proyecto. */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="40" height="40" viewBox="0 0 28 28" fill="none">
            <g stroke={BLUE} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 5.5C8.3 5.5 5 9.3 5 14s3.3 8.5 8 8.5" />
              <path d="M16.4 22.5V5.5h3.1a4.3 4.3 0 0 1 0 8.6h-3.1" />
            </g>
            <rect x="22" y="18.6" width="3.9" height="3.9" fill={CYAN} />
          </svg>
          <span style={{ color: INK, fontSize: 30, fontWeight: 600, letterSpacing: "-0.01em" }}>
            PortCodex
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              color: INK,
              fontSize: 76,
              fontWeight: 600,
              lineHeight: 1.04,
              letterSpacing: "-0.035em",
              maxWidth: 880,
            }}
          >
            Tu patrimonio digital, bien explicado.
          </div>
          <div style={{ width: "100%", height: 1, background: LINE, margin: "44px 0 24px" }} />
          <div style={{ color: INK_2, fontSize: 26, letterSpacing: "-0.01em" }}>
            Posiciones, contabilidad e información fiscal. Solo lectura.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
