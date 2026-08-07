/**
 * Modelo del informe fiscal en PDF.
 *
 * Función PURA de presentación: recibe lo que ya calcularon `lib/tax` y
 * devuelve el documento paginado. Aquí NO se calcula nada fiscal —ni FIFO, ni
 * conversión a euros, ni reparto por casillas—. Si una cifra del informe está
 * mal, está mal en `lib/tax` y se arregla allí, con su propia verificación.
 *
 * La paginación es EXPLÍCITA y se decide aquí, no la deja el navegador. El
 * motivo es que ningún navegador sabe pintar el número de página dentro de la
 * caja de márgenes de `@page` (Chrome no implementa las margin boxes de CSS
 * Paged Media). Si quiero «Página 3 de 7» y la fecha de generación en TODAS las
 * páginas —y el enunciado del documento lo exige—, tengo que saber cuántas hay
 * antes de pintar. Contando filas lo sé; dejando que el navegador reparta, no.
 *
 * Efecto secundario bienvenido: al repartir por número de filas, ninguna fila
 * puede quedar cortada entre dos páginas. No hace falta confiar en
 * `break-inside: avoid`.
 */

import {
  getAeatClassification,
  isRendimiento,
  type AeatBucket,
} from "@/lib/tax/aeat-mapping";
import type { TraceabilityEntry } from "@/lib/tax/compute-traceability";
// Los decimales de una cantidad de token tienen su regla y es la misma en las
// ocho pantallas: se importa, no se reescribe.
import { tokenAmount } from "@/lib/format/figures";

// =============================================================================
// FILAS
// =============================================================================

export interface OperationRow {
  id: string;
  /** «14/03/2026». Numérica y tabular: en un documento fiscal la fecha se
   *  compara en columna y se transcribe a un modelo. */
  date: string;
  /** Etiqueta llana del movimiento: «Permuta», «Recompensa de staking». */
  operation: string;
  /** «0,025986 BTC» o «—» si la operación no mueve una cantidad valorable. */
  asset: string;
  /** Plataforma / protocolo. Segunda línea de la celda de activo. */
  platform: string;
  /** Clasificación AEAT: «GP permuta», «RCM staking», «No imponible». */
  fiscalLabel: string;
  /** Casilla de referencia del Modelo 100, o «—». */
  casilla: string;
  /** Base imponible como PALABRA, para que se lea impreso en blanco y negro. */
  baseLabel: string;
  valueEur: number;
  costEur: number;
  /** Lo que suma a la casilla. En rendimientos es el valor íntegro; en
   *  ganancias, la plusvalía. Mismo criterio que la pantalla de Fiscalidad. */
  resultEur: number;
  /** Si la operación no genera hecho imponible, el resultado no se imprime:
   *  un 0,00 € en esa columna se lee como «ganancia nula», que es otra cosa. */
  taxRelevant: boolean;
}

export interface CasillaReportRow {
  id: string;
  casilla: string;
  category: string;
  baseLabel: string;
  operations: number;
  amountEur: number;
  concept: string;
}

// =============================================================================
// DOCUMENTO
// =============================================================================

export interface FiscalReportInput {
  /** Nombre del titular. Es lo primero que busca el asesor. */
  holderName: string;
  /** Cartera a la que se refiere el informe. */
  portfolioName: string;
  year: number;
  generatedAt: Date;
  entries: TraceabilityEntry[];
  buckets: AeatBucket[];
  totalBaseAhorro: number;
  totalBaseGeneral: number;
  modelo721: {
    obligado: boolean;
    /** Saldo estimado en custodios extranjeros a 31/12. */
    foreignBalanceEur: number;
    thresholdEur: number;
  };
  /** Procedencia del tipo de cambio. Va en la nota metodológica: un informe que
   *  no dice de dónde sale su euro no es un informe. */
  fxSource: "historical" | "current" | "fallback";
  /** Operaciones con cantidad pero sin precio: quedan FUERA del cómputo y hay
   *  que decirlo, no dejarlas desaparecer en silencio. */
  unpricedCount: number;
  /**
   * Operaciones que transmiten un activo sin histórico de compra completo.
   *
   * Sin lotes FIFO que consumir, el coste de adquisición imputable es menor del
   * real —en el peor caso, cero— y la ganancia se declara de MÁS. Este documento
   * es el que acaba en manos del asesor: es el último sitio donde ese aviso
   * puede faltar. La pantalla ya lo enseña.
   */
  uncoveredCount: number;
}

/**
 * El aviso legal y la nota metodológica van en HOJAS SEPARADAS y no en una.
 * Juntos median 20 mm más que la caja de la hoja, y la salida a esa medida son
 * dos: recortar el texto o darle su página. Se le da su página: en un documento
 * dirigido a un asesor fiscal, la salvedad y el método son lo que delimita hasta
 * dónde llega la responsabilidad de cada uno, y no se abrevian para cuadrar una
 * maqueta.
 */
export type Sheet =
  | { kind: "cover" }
  | { kind: "summary" }
  | { kind: "operations"; rows: OperationRow[]; from: number; to: number; part: number; parts: number }
  | { kind: "legal" }
  | { kind: "method" };

export interface FiscalReport {
  input: FiscalReportInput;
  casillaRows: CasillaReportRow[];
  savings: { operations: number; totalEur: number; rows: CasillaReportRow[] };
  general: { operations: number; totalEur: number; rows: CasillaReportRow[] };
  operations: OperationRow[];
  sheets: Sheet[];
  /** Nombre de archivo para archivar: cliente y ejercicio, sin espacios. */
  fileName: string;
}

// =============================================================================
// PAGINACIÓN
// =============================================================================
//
// Cuántas filas caben. Estas cifras están MEDIDAS en el navegador sobre el
// documento ya pintado (`getBoundingClientRect`), no deducidas de los márgenes:
// la primera versión las estimó y se equivocó en 6 mm, con lo que la última fila
// de cada hoja de continuación aterrizaba encima de la numeración de página.
//
//   caja de contenido de la hoja (.live)   234,0 mm   ← medido, no 240
//   − título de sección + nota + aire      −21,4  (primera hoja: 16,4 + 5)
//                                          −17,0  (continuación: 12,0 + 5)
//   − cabecera de tabla                    −12,3
//   − pie de tabla («continúa en…»)         −6,2  (3,7 + 2,5 de aire)
//   = disponible para filas                194,1 / 198,5 mm
//   ÷ alto de fila                           9,2 mm
//   = filas por hoja                          21  /  21
//
// Salen 21 en las dos, así que hay una sola constante. La fila es de alto FIJO
// —9,2 mm, lo que necesita la celda más alta: dos líneas de 8,5 pt más el
// relleno— y su contenido no puede crecer más allá de esas dos líneas, así que
// el reparto por número de filas es exacto.
//
// Estos números NO se dan por buenos: `scripts/generate-fiscal-report-pdf.mjs`
// comprueba en cada generación que ningún contenido invada la banda del pie. Si
// alguien cambia el alto de fila o los márgenes y se olvida de esta cuenta, el
// script falla en vez de entregar un PDF con una fila pisando el número.

const ROWS_PER_PAGE = 21;

const BASE_LABEL: Record<string, string> = { ahorro: "Ahorro", general: "General" };

function chunkOperations(rows: OperationRow[]): Sheet[] {
  if (rows.length === 0) return [];
  const chunks: OperationRow[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) {
    chunks.push(rows.slice(i, i + ROWS_PER_PAGE));
  }
  let cursor = 0;
  return chunks.map((chunk, idx) => {
    const from = cursor + 1;
    cursor += chunk.length;
    return {
      kind: "operations" as const,
      rows: chunk,
      from,
      to: cursor,
      part: idx + 1,
      parts: chunks.length,
    };
  });
}

// =============================================================================
// FORMATEO LOCAL DEL DOCUMENTO
// =============================================================================

/** Fecha numérica completa. `figures.ts` da «14 mar 2026», que es lo correcto
 *  en pantalla; en una columna de 200 filas que se transcribe a un modelo
 *  tributario, la numérica se compara mejor y ocupa la mitad. */
function docDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Nombre de archivo archivable: «PortCodex-Informe-fiscal-M-Fita-2026.pdf». */
export function reportFileName(holderName: string, year: number): string {
  const slug = holderName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tildes fuera: el nombre de archivo viaja por correo
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `PortCodex-Informe-fiscal-${slug || "Titular"}-${year}.pdf`;
}

// =============================================================================
// CONSTRUCCIÓN
// =============================================================================

export function buildFiscalReport(input: FiscalReportInput): FiscalReport {
  // El detalle de un informe fiscal se lee en ORDEN CRONOLÓGICO: es como lo
  // revisa un asesor y como lo pide una comprobación. Sin ordenar aquí, las
  // operaciones salían en el orden en que las devuelve la contabilidad, que no
  // es ninguno en particular.
  //
  // Las que no traen fecha legible van al final en vez de colarse en medio: una
  // operación sin fecha no pertenece a ningún punto de la secuencia, y
  // esconderla entre las demás la haría pasar desapercibida justo cuando hay
  // que corregirla.
  const yearEntries = [...input.entries].sort((a, b) => {
    const ta = Date.parse(a.transactionDate);
    const tb = Date.parse(b.transactionDate);
    const va = Number.isFinite(ta);
    const vb = Number.isFinite(tb);
    if (!va && !vb) return 0;
    if (!va) return 1;
    if (!vb) return -1;
    return ta - tb;
  });

  const operations: OperationRow[] = yearEntries.map((e, i) => {
    const cls = getAeatClassification(e.fiscal.category, e.fiscal.incomeType, e.fiscal.realizedGainEur);
    const rendimiento = isRendimiento(e.fiscal.incomeType);
    const amount = e.tokenInAmount ?? e.tokenOutAmount ?? null;
    const symbol = e.tokenInSymbol ?? e.tokenOutSymbol ?? null;

    return {
      id: e.id || `op-${i}`,
      date: docDate(e.transactionDate),
      operation: e.fiscal.humanLabel || e.type,
      asset: amount != null && symbol ? `${tokenAmount(amount)} ${symbol}` : (symbol ?? "—"),
      platform: e.protocol || "—",
      fiscalLabel: cls.badge,
      casilla: cls.casilla,
      baseLabel: cls.base ? BASE_LABEL[cls.base] : "—",
      valueEur: e.fiscal.valueEur,
      costEur: e.fiscal.costBasisEur,
      resultEur: rendimiento ? e.fiscal.valueEur : e.fiscal.realizedGainEur,
      taxRelevant: cls.countsTowardTax,
    };
  });

  const toReportRow = (b: AeatBucket): CasillaReportRow => ({
    id: `${b.base ?? "none"}-${b.badge}`,
    casilla: b.casilla,
    category: b.badge,
    baseLabel: b.base ? BASE_LABEL[b.base] : "—",
    operations: b.operaciones,
    amountEur: b.importeEur,
    concept: b.aeatNote,
  });

  const savingsRows = input.buckets.filter((b) => b.base === "ahorro").map(toReportRow);
  const generalRows = input.buckets.filter((b) => b.base === "general").map(toReportRow);

  const sheets: Sheet[] = [
    { kind: "cover" },
    { kind: "summary" },
    ...chunkOperations(operations),
    { kind: "legal" },
    { kind: "method" },
  ];

  return {
    input,
    casillaRows: [...savingsRows, ...generalRows],
    savings: {
      rows: savingsRows,
      operations: savingsRows.reduce((s, r) => s + r.operations, 0),
      totalEur: input.totalBaseAhorro,
    },
    general: {
      rows: generalRows,
      operations: generalRows.reduce((s, r) => s + r.operations, 0),
      totalEur: input.totalBaseGeneral,
    },
    operations,
    sheets,
    fileName: reportFileName(input.holderName, input.year),
  };
}
