import type { CSSProperties, ReactNode } from "react";

/**
 * Tabla de datos SIN tarjeta contenedora.
 *
 * Título, filo, filas. Nada más. En un producto que existe para leer cifras, el
 * contenedor solo añade dos bordes, un fondo y 24 px de aire por lado que no
 * dicen nada. Quitándolo, la columna de cifras de una tabla cae a plomo con la
 * de la siguiente, que es lo que permite compararlas.
 *
 * Todas las tablas del producto —Cartera, Movimientos, Fiscalidad— usan esta.
 */

export interface Column {
  key: string;
  label: string;
  /** Fracción de la rejilla. Se traduce a minmax(min, Nfr). Se ignora si hay `fixed`. */
  width: number;
  /**
   * Ancho mínimo en px. Por debajo de él la columna deja de encoger: es lo que
   * impide que «Kamino (METEORA)» se parta en dos líneas cuando la ventana
   * estrecha. Sin él la columna puede llegar a 0, que es el comportamiento
   * histórico y sigue siendo el de por defecto.
   */
  min?: number;
  /** Ancho FIJO en px. Para columnas que no llevan dato sino una acción. */
  fixed?: number;
  align?: "left" | "right";
}

function template(columns: Column[]): string {
  return columns
    .map((c) => (c.fixed !== undefined ? `${c.fixed}px` : `minmax(${c.min ?? 0}px, ${c.width}fr)`))
    .join(" ");
}

/** Separación mínima entre columnas. Por debajo, una cifra larga invade a la
 *  siguiente y la tabla deja de leerse por columnas. */
const COLUMN_GAP = 20;

export function DataTable({
  columns,
  children,
  /** Separación entre columnas. Sube a 24 en tablas de ocho columnas, donde el
   *  aire es lo único que separa dos cifras contiguas. */
  gap = COLUMN_GAP,
}: {
  columns: Column[];
  children: ReactNode;
  gap?: number;
}) {
  return (
    <div>
      {/* `pcx-grid-head`: la cabecera de columnas desaparece en móvil, donde
          cada celda lleva ya su propia etiqueta. */}
      <div
        className="grid pcx-grid pcx-grid-head"
        style={{
          ["--pcx-cols" as string]: template(columns),
          columnGap: gap,
          fontSize: "var(--text-label)",
          color: "var(--faint)",
          padding: "14px 0 10px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        {columns.map((c) => (
          <span key={c.key} style={{ textAlign: c.align ?? "left" }}>
            {c.label}
          </span>
        ))}
      </div>
      {children}
    </div>
  );
}

export function DataRow({
  columns,
  children,
  /**
   * Alineación vertical del contenido. `baseline` cuando todas las celdas son
   * de una línea; `center` cuando alguna trae varias —es lo que salva las filas
   * de altura desigual, como el colateral de lending frente al resto.
   */
  align = "baseline",
  gap = COLUMN_GAP,
  className,
  style,
}: {
  columns: Column[];
  children: ReactNode;
  align?: "baseline" | "center";
  /** El mismo que se le haya dado a su `DataTable`. */
  gap?: number;
  /** Para marcar la fila como `group` y descubrir su acción al pasar por
   *  encima sin necesidad de estado ni de cliente. */
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={className ? `grid pcx-grid ${className}` : "grid pcx-grid"}
      style={{
        ["--pcx-cols" as string]: template(columns),
        columnGap: gap,
        alignItems: align === "center" ? "center" : "baseline",
        padding: "14px 0",
        borderBottom: "1px solid var(--line)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Celda de texto normal. */
export function Cell({
  children,
  align = "left",
  tone = "muted",
  weight = 400,
  nowrap = false,
  label,
}: {
  children: ReactNode;
  align?: "left" | "right";
  tone?: "strong" | "muted" | "faint";
  weight?: 400 | 500;
  nowrap?: boolean;
  /** Nombre de la columna. Solo se ve en móvil, cuando la fila se apila y la
   *  cabecera desaparece: sin él, el dato queda sin decir de qué es. */
  label?: string;
}) {
  const color =
    tone === "strong" ? "var(--foreground)" : tone === "faint" ? "var(--faint)" : "var(--muted)";
  return (
    <span
      data-label={label}
      style={{
        fontSize: "var(--text-body)",
        fontWeight: weight,
        color,
        textAlign: align,
        whiteSpace: nowrap ? "nowrap" : undefined,
      }}
    >
      {children}
    </span>
  );
}

/** Celda de importe: un punto más grande que el resto y siempre a la derecha,
 *  porque es la columna que se recorre en vertical. */
export function AmountCell({
  children,
  /**
   * El punto de más y el trazo medio. Se quita cuando el importe NO es la
   * columna protagonista de la tabla: en Movimientos la estructura la da el
   * día, y destacar el valor de cada línea sobre las otras siete columnas
   * convertiría un extracto en un ranking.
   */
  emphasis = true,
  label,
}: {
  children: ReactNode;
  emphasis?: boolean;
  /** Nombre de la columna, para la ficha de móvil. */
  label?: string;
}) {
  return (
    <span
      className="tabular-nums"
      data-label={label}
      style={{
        fontSize: emphasis ? 14 : "var(--text-body)",
        fontWeight: emphasis ? 500 : 400,
        textAlign: "right",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** Celda de dos líneas: dato principal y su contexto debajo (la plataforma y su
 *  red, el activo y su nombre largo). */
export function StackedCell({
  primary,
  secondary,
  /** Baja la primera línea al cuerpo pequeño. En tablas de ocho columnas la
   *  plataforma es contexto, no dato principal. */
  compact = false,
  label,
}: {
  primary: ReactNode;
  secondary: ReactNode;
  compact?: boolean;
  /** Nombre de la columna, para la ficha de móvil. */
  label?: string;
}) {
  return (
    <div data-label={label} style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: compact ? "var(--text-label)" : "var(--text-body)",
          color: "var(--muted)",
          whiteSpace: compact ? "nowrap" : undefined,
        }}
      >
        {primary}
      </div>
      <div
        style={{
          fontSize: "var(--text-meta)",
          color: "var(--faint)",
          marginTop: 4,
        }}
      >
        {secondary}
      </div>
    </div>
  );
}
