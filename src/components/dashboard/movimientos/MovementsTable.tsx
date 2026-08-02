import type { ReactNode } from "react";
import { DataTable, DataRow, Cell, AmountCell, StackedCell } from "@/components/dashboard/DataTable";
import type { Column } from "@/components/dashboard/DataTable";
import { TokenAvatar } from "@/components/dashboard/cartera/TokenAvatar";
import { money, tokenAmount, plural, type Currency } from "@/lib/format/figures";
import { dayKey, groupDate, timeOfDay } from "./format";

/**
 * Historial de operaciones — un EXTRACTO BANCARIO, no un listado.
 *
 * La diferencia está en la fecha: agrupada por día y con el día como separador,
 * no repetida en cada línea. Trece filas con «12 julio 2026» delante son trece
 * veces el mismo dato ocupando la columna más ancha de la tabla; el separador lo
 * dice una vez, y de paso da la estructura que el ojo necesita para saber por
 * dónde va.
 *
 * Ninguna columna destaca sobre las demás. Lo que manda aquí es la secuencia de
 * días; si el importe fuera a 14 px y en trazo medio, el extracto se leería como
 * un ranking de operaciones grandes.
 *
 * Medidas tomadas de web/design/03-movimientos.html.
 */

/** Separación entre columnas de ESTA pantalla. Con ocho columnas el aire es lo
 *  único que separa dos cifras contiguas; los mínimos por columna hacen el
 *  resto cuando la ventana estrecha. */
const COLUMN_GAP = 24;

const COLUMNS: Column[] = [
  { key: "operation", label: "Operación", width: 1.25, min: 104 },
  { key: "quantity", label: "Cantidad", width: 0.9, min: 72, align: "right" },
  { key: "asset", label: "Activo", width: 1, min: 88 },
  { key: "platform", label: "Plataforma", width: 1.4, min: 118 },
  { key: "time", label: "Hora", width: 0.5, min: 38 },
  { key: "value", label: "Valor", width: 1, min: 80, align: "right" },
  { key: "tax", label: "Fiscal", width: 1.2, min: 100, align: "right" },
  // Sin rótulo: la acción no es un dato de la operación, y titular una columna
  // «Acciones» solo añade una palabra a la cabecera.
  { key: "undo", label: "", width: 0, fixed: 58, align: "right" },
];

/**
 * Cómo trata Hacienda la operación. Va como TEXTO y no como distintivo de
 * color: trece distintivos convierten la tabla en un semáforo y ninguno informa.
 */
export type TaxTone =
  /** Tributa: renta del capital, ganancia o pérdida patrimonial. */
  | "taxable"
  /** No imponible —mover fondos entre wallets propias no es un hecho fiscal. */
  | "exempt"
  /** Sin clasificar. LA EXCEPCIÓN, y lo único que se señala en ámbar. */
  | "unclassified";

export interface Movement {
  id: string;
  /** «Harvest rewards», «Añadir liquidez», «Depósito», «Retirada». */
  operation: string;
  /** Cantidad de token en crudo: los decimales los pone `tokenAmount`. */
  quantity: number;
  symbol: string;
  /** «Kamino (ORCA)», «Wallet». */
  platform: string;
  network: string;
  /** ISO con la hora local de la operación. De aquí salen el grupo y la hora. */
  timestamp: string;
  /** Valor en la moneda de la tabla, al tipo de la fecha de la operación. */
  value: number;
  tax: { label: string; tone: TaxTone };
}

export function MovementsTable({
  movements,
  currency = "EUR",
  onUndo,
  loadMore,
}: {
  movements: Movement[];
  currency?: Currency;
  /** Solo desde una pantalla de cliente: pasar una función obliga a que quien
   *  renderice esta tabla sea un componente de cliente. */
  onUndo?: (id: string) => void;
  /** «Cargar más», cuando queda historial por traer. */
  loadMore?: ReactNode;
}) {
  return (
    <div style={{ marginTop: 20 }}>
      <DataTable columns={COLUMNS} gap={COLUMN_GAP}>
        {groupByDay(movements).map((day, i) => (
          <div key={day.key}>
            <DayHeading iso={day.iso} count={day.entries.length} first={i === 0} />
            {day.entries.map((m) => (
              <MovementRow key={m.id} movement={m} currency={currency} onUndo={onUndo} />
            ))}
          </div>
        ))}
      </DataTable>

      {loadMore ? (
        <div className="flex items-center justify-center" style={{ paddingTop: 26 }}>
          {loadMore}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Separador de día. La fecha a la izquierda, el recuento a la derecha y un filo
 * ocupando lo que queda: sin ese filo el rótulo flota y no se lee como corte.
 */
function DayHeading({ iso, count, first }: { iso: string; count: number; first: boolean }) {
  return (
    <div
      className="flex items-baseline"
      style={{ gap: 16, padding: `${first ? 20 : 26}px 0 10px` }}
    >
      <span style={{ fontSize: "var(--text-label)", fontWeight: 500, color: "var(--muted)" }}>
        {groupDate(iso)}
      </span>
      <span style={{ flex: 1, height: 1, background: "var(--line)" }} aria-hidden="true" />
      <span style={{ fontSize: "var(--text-label)", color: "var(--faint)" }}>
        {plural(count, "operación", "operaciones")}
      </span>
    </div>
  );
}

function MovementRow({
  movement: m,
  currency,
  onUndo,
}: {
  movement: Movement;
  currency: Currency;
  onUndo?: (id: string) => void;
}) {
  const [amount, suffix] = splitCurrency(money(m.value, currency));

  return (
    // La fila se centra verticalmente porque la celda de plataforma mide dos
    // líneas y las otras siete miden una.
    <DataRow
      columns={COLUMNS}
      gap={COLUMN_GAP}
      align="center"
      className="group"
      style={{ padding: "13px 0" }}
    >
      <Cell tone="strong" weight={500} label="Operación">
        {m.operation}
      </Cell>

      <span
        className="tabular-nums"
        style={{ fontSize: "var(--text-body)", textAlign: "right", whiteSpace: "nowrap" }}
      >
        {tokenAmount(m.quantity)}
      </span>

      <span className="flex items-center" style={{ gap: 8, minWidth: 0 }}>
        <TokenAvatar symbol={m.symbol} />
        <span style={{ fontSize: "var(--text-body)", color: "var(--muted)" }}>{m.symbol}</span>
      </span>

      <StackedCell compact primary={m.platform} secondary={m.network} label="Plataforma" />

      <span
        className="tabular-nums"
        style={{ fontSize: "var(--text-label)", color: "var(--faint)" }}
      >
        {timeOfDay(m.timestamp)}
      </span>

      {/* La moneda pesa menos que la cifra: el número es el dato. */}
      <AmountCell emphasis={false} label="Valor">
        {amount}{" "}
        <span style={{ fontSize: "var(--text-meta)", color: "var(--faint)" }}>{suffix}</span>
      </AmountCell>

      <span
        style={{
          fontSize: "var(--text-meta)",
          textAlign: "right",
          color: taxColor(m.tax.tone),
        }}
      >
        {m.tax.label}
      </span>

      {/* Deshacer solo al pasar por encima: en reposo, trece enlaces repetidos
          serían la columna más llamativa de la tabla. Sigue siendo alcanzable
          con el tabulador, y al recibir el foco se muestra. */}
      <span style={{ textAlign: "right" }}>
        <button
          type="button"
          onClick={onUndo ? () => onUndo(m.id) : undefined}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          style={{ fontSize: "var(--text-meta)", color: "var(--faint)", cursor: "pointer" }}
        >
          Deshacer
        </button>
      </span>
    </DataRow>
  );
}

/** «No imponible» en terciario: es la mitad de las filas y no es noticia. En
 *  ámbar SOLO lo que nadie ha clasificado todavía, que es lo que hay que
 *  resolver antes de declarar. */
function taxColor(tone: TaxTone): string {
  if (tone === "unclassified") return "var(--warn)";
  return tone === "exempt" ? "var(--faint)" : "var(--muted)";
}

interface DayGroup {
  key: string;
  iso: string;
  entries: Movement[];
}

/** Agrupa por día natural CONSERVANDO el orden recibido: el historial llega
 *  ordenado desde la contabilidad y esta tabla no es quién para reordenarlo. */
function groupByDay(movements: Movement[]): DayGroup[] {
  const days: DayGroup[] = [];
  for (const m of movements) {
    const key = dayKey(m.timestamp);
    const last = days[days.length - 1];
    if (last && last.key === key) last.entries.push(m);
    else days.push({ key, iso: m.timestamp, entries: [m] });
  }
  return days;
}

/** Separa «10,05 €» en cifra y moneda para poder darles peso distinto. El
 *  formato sigue saliendo entero de `figures.ts`; aquí solo se parte. */
function splitCurrency(formatted: string): [string, string] {
  const cut = formatted.lastIndexOf(" ");
  return cut === -1 ? [formatted, ""] : [formatted.slice(0, cut), formatted.slice(cut + 1)];
}
