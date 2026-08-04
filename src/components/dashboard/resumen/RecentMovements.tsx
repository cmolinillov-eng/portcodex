import Link from "next/link";
import { SectionHeading } from "@/components/shell/SectionHeading";
import {
  DataTable,
  DataRow,
  Cell,
  AmountCell,
  StackedCell,
  type Column,
} from "@/components/dashboard/DataTable";

/**
 * Últimos movimientos del Resumen: las cinco operaciones más recientes.
 *
 * Es un ASOMO al historial, no el historial. Por eso no lleva filtros ni
 * paginación: quien quiera buscar algo va a Movimientos, y el enlace de la
 * derecha lo lleva allí.
 */

/* Los mínimos impiden que una columna se estreche hasta romper su contenido.
   Era la única de las cuatro tablas que no los tenía: a 1024 px «Activo» caía a
   79 px, por debajo del suelo de 92 que fija el contrato. */
const COLUMNS: Column[] = [
  { key: "operation", label: "Operación", width: 1.35, min: 120 },
  { key: "quantity", label: "Cantidad", width: 1.05, min: 92, align: "right" },
  { key: "asset", label: "Activo", width: 0.65, min: 56 },
  { key: "platform", label: "Plataforma", width: 1.5, min: 132 },
  { key: "date", label: "Fecha", width: 1, min: 96 },
  { key: "amount", label: "Importe", width: 1.2, min: 104, align: "right" },
];

export interface MovementRow {
  id: string;
  operation: string;
  /** Ya formateada con los decimales que la unidad exige, sin ceros de relleno. */
  quantity: string;
  asset: string;
  platform: string;
  network: string;
  date: string;
  /** Con signo: "+10,05 US$", "−4.233,84 US$". */
  amount: string;
}

export function RecentMovements({
  movements,
  historyHref,
}: {
  movements: MovementRow[];
  /**
   * Sin destino no se pinta el enlace. Pasa cuando un gestor mira la cartera de
   * un cliente: /movimientos resuelve la cartera por la SESIÓN, no por la URL,
   * así que ese enlace le habría enseñado los movimientos de su propia cartera
   * bajo el nombre de otra persona. Antes que un enlace que miente, ninguno.
   */
  historyHref?: string | null;
}) {
  return (
    <section style={{ paddingTop: 48 }}>
      <SectionHeading
        title="Últimos movimientos"
        spacing={4}
        action={
          historyHref ? (
            <Link href={historyHref} style={{ fontSize: "var(--text-body)", color: "var(--muted)" }}>
              Ver historial completo →
            </Link>
          ) : null
        }
      />

      <DataTable columns={COLUMNS}>
        {movements.map((m) => (
          <DataRow key={m.id} columns={COLUMNS}>
            <Cell tone="strong" weight={500} label="Operación">
              {m.operation}
            </Cell>
            <span
              className="tabular-nums"
              data-label="Cantidad"
              style={{
                fontSize: "var(--text-body)",
                textAlign: "right",
                whiteSpace: "nowrap",
              }}
            >
              {m.quantity}
            </span>
            <Cell label="Activo">{m.asset}</Cell>
            <StackedCell primary={m.platform} secondary={m.network} label="Plataforma" />
            <Cell tone="faint" nowrap label="Fecha">
              {m.date}
            </Cell>
            <AmountCell label="Importe">{m.amount}</AmountCell>
          </DataRow>
        ))}
      </DataTable>
    </section>
  );
}
