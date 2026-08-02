/**
 * =============================================================================
 * INFORME FISCAL — SISTEMA DE COLOR Y MEDIDAS PARA PAPEL
 * =============================================================================
 *
 * Este módulo NO es una variante del tema de pantalla. Es un sistema aparte,
 * y tiene que serlo: todo el color de PortCodex está medido sobre obsidiana
 * #070B12, y sobre papel esas mismas medidas se invierten. Dos ejemplos que lo
 * dejan claro:
 *
 *   • `--slate` #475467 está PROHIBIDO como tinta en pantalla (2,6:1 sobre
 *     obsidiana). Sobre papel da 7,69:1 y es una tinta terciaria excelente.
 *   • `--profit` #19B77A es AA en pantalla (7,6:1). Sobre papel cae a 2,59:1 y
 *     es ilegible.
 *
 * Por eso el tema del documento vive aquí y no en `globals.css`: mezclarlos
 * llevaría a que alguien reutilizara un token medido para la superficie
 * equivocada.
 *
 * -----------------------------------------------------------------------------
 * PALETA CLARA DERIVADA — CONTRASTES MEDIDOS (WCAG 2.1, no estimados)
 * -----------------------------------------------------------------------------
 *
 * Superficies del documento. Solo dos, y esto también es una decisión de
 * imprenta: un fondo de página relleno se imprime como un gris sucio y gasta
 * tóner. El papel va SIN pintar (#FFFFFF real) y solo la banda de cabecera de
 * tabla lleva un tinte, el mínimo que se distingue impreso.
 *
 *   Papel     #FFFFFF   (sin relleno)
 *   Banda     #EDF1F6   1,13:1 sobre papel — se ve, no ensucia
 *
 * Tintas. La columna «banda» es el peor caso y es la que manda:
 *
 *   ROL                     HEX        PAPEL     BANDA    VEREDICTO
 *   ─────────────────────────────────────────────────────────────────────────
 *   Tinta principal         #070B12    19,71:1   17,37:1  AAA
 *   Tinta secundaria        #22303F    13,44:1   11,85:1  AAA
 *   Tinta terciaria         #475467     7,69:1    6,78:1  AAA  ← el slate de marca
 *   Tinta de metadato       #5A6879     5,69:1    5,02:1  AA
 *   Azul de documento       #003DD4     8,02:1    7,07:1  AAA
 *   Positivo de documento   #0F6E4A     6,27:1    5,53:1  AA
 *   Negativo de documento   #C01320     6,26:1    5,52:1  AA
 *   Advertencia de doc.     #8A540B     6,26:1    5,52:1  AA
 *   ─────────────────────────────────────────────────────────────────────────
 *   Azul de marca           #2F6BFF     4,50:1    3,97:1  ⚠️ SOLO RELLENO
 *   Blanco sobre ese azul   #FFFFFF     4,50:1        —   AA justo
 *   Filo                    #D3DBE5     1,36:1        —   elemento, no tinta
 *   Filo fuerte             #A9B4C2     2,10:1        —   elemento, no tinta
 *
 * Los tres semánticos se derivaron BAJANDO LA LUMINOSIDAD HSL del color de
 * marca sin tocar tono ni saturación, para que sigan siendo reconociblemente
 * el mismo color y no unos verdes y rojos cualesquiera:
 *
 *   azul       hsl(222,7°  100%  59%) → 42%   #2F6BFF → #003DD4
 *   positivo   hsl(156,8°   76%  41%) → 25%   #19B77A → #0F6E4A
 *   negativo   hsl(355,3°   82%  67%) → 41%   #F0646F → #C01320
 *   advertencia hsl( 34,7°  86%  59%) → 29%   #F0A43C → #8A540B
 *
 * Se paró en ~5,5:1 sobre la banda y no en el 4,5 justo del AA porque el
 * cuerpo del documento son 8,5-9,5 pt: a ese tamaño, y sobre una impresora
 * láser doméstica, el AA exacto se lee peor de lo que su número promete.
 *
 * REGLA QUE SOBREVIVE DEL SISTEMA OSCURO: el azul de marca se rellena, no se
 * escribe. Aquí se cumple igual pero por otro número (3,97:1 sobre banda).
 *
 * EL CIAN NO APARECE. Está reservado a sincronización y datos en vivo, y en un
 * papel no hay nada en vivo: el documento es una fotografía de una fecha.
 *
 * -----------------------------------------------------------------------------
 * LEGIBILIDAD EN BLANCO Y NEGRO
 * -----------------------------------------------------------------------------
 * El asesor lo imprimirá en monocromo. Ningún dato de este informe depende del
 * color para entenderse:
 *   • El signo de una pérdida es el menos tipográfico «−», no el rojo. El rojo
 *     solo refuerza.
 *   • La base imponible de cada casilla va como PALABRA en su columna
 *     («Ahorro» / «General»), no como tono.
 *   • La obligación del Modelo 721 va en una frase afirmativa, sin color.
 *   • No hay categorías fiscales en chip de color (regla 10 del sistema): van
 *     como texto.
 */

// =============================================================================
// SUPERFICIES Y TINTAS
// =============================================================================

export const DOC = {
  /** Papel. No se pinta: es la ausencia de relleno. */
  paper: "#FFFFFF",
  /** Único tinte del documento: cabecera de tabla y panel de datos de portada. */
  band: "#EDF1F6",

  ink: "#070B12",
  ink2: "#22303F",
  ink3: "#475467",
  meta: "#5A6879",

  /** Azul de documento: tinta, filos de acento y numeración. 8,02:1. */
  blue: "#003DD4",
  /** Azul de marca. SOLO como relleno, nunca como tinta. */
  blueFill: "#2F6BFF",
  onBlue: "#FFFFFF",

  profit: "#0F6E4A",
  loss: "#C01320",
  warn: "#8A540B",

  rule: "#D3DBE5",
  ruleStrong: "#A9B4C2",
} as const;

// =============================================================================
// GEOMETRÍA DE PÁGINA (mm) — A4 vertical
// =============================================================================
//
// El margen izquierdo es MAYOR que el derecho a propósito: es el margen de
// encuadernación. Este documento se archiva —grapa, clip o carpeta de anillas—
// y con márgenes simétricos el primer taladro se come la columna de fechas.
// 24 mm sobreviven a una perforadora estándar (que muerde ~12 mm).
//
// Nada sangra a borde. Ni la portada.

export const PAGE = {
  width: 210,
  height: 297,
  marginTop: 18,
  marginBottom: 15,
  /** Margen de encuadernación. */
  marginLeft: 24,
  marginRight: 16,
} as const;

/** Ancho útil: 170 mm. Todas las rejillas de tabla suman exactamente esto. */
export const CONTENT_WIDTH = PAGE.width - PAGE.marginLeft - PAGE.marginRight;

/** Alto útil bruto: 264 mm. */
export const CONTENT_HEIGHT = PAGE.height - PAGE.marginTop - PAGE.marginBottom;

/** Banda de pie, reservada en TODAS las páginas (numeración + fecha). */
export const FOOTER_HEIGHT = 13;

/** Cabecerilla de continuación, en todas menos la portada. */
export const RUNNING_HEAD_HEIGHT = 11;

// =============================================================================
// ESCALA TIPOGRÁFICA DE DOCUMENTO (pt)
// =============================================================================
//
// No es la escala de pantalla convertida. Los 13 px de cuerpo del producto son
// otra medida: a 96 ppp equivalen a 9,75 pt, pero en pantalla se leen a 50 cm
// y en papel a 35, y el papel no tiene subpíxeles. La escala se rehízo con el
// criterio de imprenta: cuerpo 9,5 pt, tabla 8,5 pt, y nada por debajo de
// 6,5 pt en ningún sitio.

export const TYPE = {
  /** Titular de portada: «Ejercicio 2026». */
  cover: 32,
  /** Cifra de base imponible. */
  figure: 21,
  /** Símbolo de la cifra (proporción de EuroFigure: ~55 % de la cifra). */
  figureSymbol: 12,
  /** Título de sección. */
  section: 12.5,
  /** Subtítulo / nota de sección. */
  sectionNote: 8.5,
  /** Cuerpo de texto corrido. */
  body: 9.5,
  /** Celda de tabla. */
  cell: 8.5,
  /** Segunda línea de celda y cabecera de tabla. */
  cellMeta: 7,
  /** Etiquetas de portada y pie. */
  label: 7.5,
  /** Pie de página. */
  footer: 7,
} as const;

/** Interlineados. El documento NO hereda el `normal` de `.pcx-screen`: el texto
 *  corrido de un informe se lee en párrafo, no en fila de tabla. */
export const LEADING = {
  cover: 1.02,
  section: 1.15,
  body: 1.55,
  cell: 1.25,
} as const;
