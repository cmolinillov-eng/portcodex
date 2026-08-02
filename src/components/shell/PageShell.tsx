import type { ReactNode } from "react";

/**
 * Contenedor de página. Fija la rejilla —1240 px de ancho útil y 64 de aire
 * lateral— para TODAS las pantallas, que es lo que hace que el logotipo de la
 * barra caiga a plomo con la cifra de patrimonio y que las tablas de Cartera y
 * Movimientos empiecen en la misma vertical.
 *
 * Ninguna pantalla debe repetir estas medidas a mano.
 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="mx-auto"
      style={{
        maxWidth: "var(--shell-max)",
        padding: "0 var(--shell-pad) 44px",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Pie de procedencia de los datos. Va al final de cada pantalla: en un producto
 * que lee solo, decir de dónde sale cada cifra y cuándo se leyó es parte del
 * dato, no un adorno.
 */
export function DataProvenance({ children }: { children: ReactNode }) {
  return (
    <div
      className="border-t"
      style={{
        marginTop: 52,
        paddingTop: 16,
        borderColor: "var(--line)",
        /* 12 px. Las SEIS maquetas que llevan pie lo declaran así; el token
           `--text-meta` (11) venía de la tabla de escala, que se equivocaba.
           Manda la maqueta, y además es el texto más pequeño del producto. */
        fontSize: "var(--text-label)",
        color: "var(--faint)",
      }}
    >
      {children}
    </div>
  );
}
