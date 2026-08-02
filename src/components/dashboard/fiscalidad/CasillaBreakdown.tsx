import { SectionHeading } from "@/components/shell/SectionHeading";
import { DataTable, DataRow, Cell, type Column } from "@/components/dashboard/DataTable";
import { EuroFigure } from "./EuroFigure";

/**
 * Desglose por casilla del Modelo 100.
 *
 * La categoría fiscal va como TEXTO. Es la decisión que más cambió esta
 * pantalla: con una insignia de color por categoría —y hay trece— la tabla se
 * convierte en un semáforo donde el color no significa nada, porque TODAS las
 * filas lo llevan. Solo se señala la excepción, y aquí la única excepción real
 * es el signo del importe: una pérdida va en rojo porque resta.
 *
 * El número de casilla va en monoespaciada: es un identificador administrativo
 * —se copia al Modelo 100—, no una cifra que se compare en vertical.
 *
 * Medidas de web/design/04-fiscalidad.html.
 */

const COLUMNS: Column[] = [
  { key: "casilla", label: "Casilla", width: 0.85, min: 92 },
  { key: "category", label: "Categoría", width: 1.2, min: 140 },
  { key: "operations", label: "Operaciones", width: 0.8, min: 88, align: "right" },
  { key: "amount", label: "Importe", width: 0.9, min: 96, align: "right" },
  { key: "concept", label: "Concepto", width: 2, min: 200 },
];

/** Hueco entre columnas de ESTA tabla. Lo fija la maqueta: 24, cuatro más que
 *  en el Resumen, porque «Operaciones» e «Importe» son dos cifras contiguas
 *  alineadas a la derecha y el aire es lo único que las separa. */
const COLUMN_GAP = 24;

/** La maqueta da a esta tabla más aire por fila que a las del Resumen: son
 *  cuatro filas y cada una lleva una frase de concepto que puede romper. */
const ROW_PADDING = "16px 0";

export interface CasillaRow {
  id: string;
  /** Rango de referencia del Modelo 100: «0027-0033». */
  casilla: string;
  /** Categoría fiscal en el vocabulario de lib/tax: «RCM staking», «GP permuta». */
  category: string;
  operations: number;
  /** Importe agregado en euros. Negativo = pérdida compensable. */
  amountEur: number;
  /** Qué es esa casilla, en una frase. */
  concept: string;
}

export function CasillaBreakdown({
  rows,
  totalLabel,
  totalOperations,
  totalEur,
}: {
  rows: CasillaRow[];
  /** «Total base del ahorro». Nombra QUÉ suma, no «Total» a secas. */
  totalLabel: string;
  totalOperations: number;
  totalEur: number;
}) {
  return (
    <section style={{ paddingTop: 64 }}>
      <div style={{ paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
        <SectionHeading
          title="Desglose por casilla"
          note="Modelo 100 · agregado por categoría fiscal"
          spacing={0}
        />
      </div>

      <DataTable columns={COLUMNS} gap={COLUMN_GAP}>
        {rows.map((row) => {
          const isLoss = row.amountEur < 0;
          return (
            <DataRow
              key={row.id}
              columns={COLUMNS}
              align="center"
              style={{ padding: ROW_PADDING, columnGap: COLUMN_GAP }}
            >
              <span
                className="technical"
                style={{
                  fontSize: "var(--text-label)",
                  color: "var(--muted)",
                  whiteSpace: "nowrap",
                }}
              >
                {row.casilla}
              </span>

              {/* Texto, nunca chip: ver cabecera del archivo. */}
              <Cell tone="strong" weight={500} label="Categoría">
                {row.category}
              </Cell>

              <Cell tone="strong" align="right" label="Operaciones">
                {row.operations}
              </Cell>

              <EuroFigure
                value={row.amountEur}
                size={13}
                weight={isLoss ? 500 : 400}
                tone={isLoss ? "loss" : "strong"}
                symbolSize={11}
                symbolTone={isLoss ? "loss" : "faint"}
                align="right"
              />

              <span
                style={{
                  fontSize: "var(--text-label)",
                  color: "var(--faint)",
                  textWrap: "pretty",
                }}
              >
                {row.concept}
              </span>
            </DataRow>
          );
        })}

        {/* Fila de total: sin filo inferior, para que cierre la tabla en vez de
            parecer una fila más a la que le falta la siguiente. */}
        <DataRow
          columns={COLUMNS}
          align="center"
          style={{ padding: ROW_PADDING, columnGap: COLUMN_GAP, borderBottom: "none" }}
        >
          <span />
          <Cell>{totalLabel}</Cell>
          <Cell align="right">{totalOperations}</Cell>
          <EuroFigure
            value={totalEur}
            size={14}
            weight={600}
            symbolSize={11}
            symbolTone="muted"
            align="right"
          />
          <span />
        </DataRow>
      </DataTable>
    </section>
  );
}
