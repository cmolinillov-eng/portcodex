import { redirect } from "next/navigation";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { getFiscalContext } from "@/lib/fiscal/get-fiscal-context";
import { computeTraceability, type TraceabilityEntry } from "@/lib/tax/compute-traceability";
import { getAeatClassification } from "@/lib/tax/aeat-mapping";
import { getTaxYear } from "@/lib/tax/eur-conversion";
import { resolveNetwork } from "@/lib/dashboard/networks";
import { TopNav } from "@/components/shell/TopNav";
import { PageShell, DataProvenance } from "@/components/shell/PageShell";
import { MovementsHeader } from "@/components/dashboard/movimientos/MovementsHeader";
import {
  MovementsTable,
  type Movement,
  type TaxTone,
} from "@/components/dashboard/movimientos/MovementsTable";
import { plural, timeAgo } from "@/lib/format/figures";

/**
 * Movimientos — el historial completo, como un extracto bancario.
 *
 * Agrupado por día, con la fecha de separador de grupo en vez de repetida en
 * cada fila. Los importes van en EUROS al tipo de la fecha de cada operación,
 * porque es la moneda en la que se declara.
 */

/** Cuántas operaciones se pintan de una vez. El resto, bajo «Cargar más». */
const PAGE_SIZE = 60;

const OPERATION_LABEL: Record<string, string> = {
  deposit: "Depósito",
  withdrawal: "Retirada",
  harvest: "Harvest rewards",
  swap: "Permuta",
  lp_deposit: "Añadir liquidez",
  lp_withdraw: "Retirar liquidez",
  borrow: "Préstamo",
  repay: "Devolución",
};

/**
 * El tono viene de si la operación TRIBUTA, no de su categoría.
 *
 * Es lo que evita que la tabla se convierta en un semáforo de trece colores:
 * solo hay tres estados, y únicamente el tercero —lo no clasificado— se señala
 * en ámbar, porque es la excepción que alguien tiene que mirar.
 */
/**
 * El TERCER argumento es obligatorio y faltaba.
 *
 * `getAeatClassification` decide con `realizedGainEur` si una transmisión es
 * «Ganancia patrimonial» o «Pérdida patrimonial». Sin él, TODA venta con
 * minusvalía se etiquetaba como ganancia — y el CSV, que sí lo pasaba, decía lo
 * contrario sobre la misma operación. Dos documentos del mismo producto
 * contradiciéndose sobre si alguien ganó o perdió dinero.
 */
function clasificar(entry: TraceabilityEntry) {
  return getAeatClassification(
    entry.fiscal.category,
    entry.fiscal.incomeType,
    entry.fiscal.realizedGainEur,
  );
}

function toneOf(entry: TraceabilityEntry): TaxTone {
  const aeat = clasificar(entry);
  // Se compara por la ETIQUETA y no por `!aeat`: la clasificación nunca es
  // falsy —su caso por defecto devuelve `badge: "Sin clasificar"`—, así que la
  // rama ámbar no se alcanzaba jamás y lo no clasificado se pintaba como si
  // estuviera resuelto. El ámbar existe justo para eso.
  if (!aeat || aeat.badge === "Sin clasificar") return "unclassified";
  return aeat.base === null ? "exempt" : "taxable";
}

function labelOf(entry: TraceabilityEntry): string {
  return clasificar(entry).badge || "Sin clasificar";
}

export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolio?: string; ejercicio?: string }>;
}) {
  const access = await getViewerAccess();
  if (!access.isAuthenticated) redirect("/login");

  const { portfolio, ejercicio } = await searchParams;
  const ctx = await getFiscalContext(portfolio);
  const portfolioId = ctx.activePortfolioId;

  if (!portfolioId) {
    return (
      <div className="pcx-screen" style={{ minHeight: "100vh" }}>
        <TopNav />
        <PageShell>
          <MovementsHeader count={0} periodLabel="" lastLabel="Sin cartera disponible" />
        </PageShell>
      </div>
    );
  }

  const { entries } = await computeTraceability(portfolioId);

  const years = [...new Set(entries.map((e) => getTaxYear(e.transactionDate)))].sort((a, b) => b - a);
  const requested = Number(ejercicio);
  const selectedYear =
    Number.isInteger(requested) && years.includes(requested) ? requested : (years[0] ?? null);

  const yearEntries = selectedYear
    ? entries.filter((e) => getTaxYear(e.transactionDate) === selectedYear)
    : entries;

  // Más recientes primero: un extracto se lee de hoy hacia atrás.
  const sorted = [...yearEntries].sort(
    (a, b) => Date.parse(b.transactionDate) - Date.parse(a.transactionDate),
  );

  const movements: Movement[] = sorted.slice(0, PAGE_SIZE).map((e) => ({
    id: e.id,
    operation: OPERATION_LABEL[e.type] ?? e.type.replace(/_/g, " "),
    quantity: Number(e.tokenInAmount ?? e.tokenOutAmount ?? 0),
    symbol: e.tokenInSymbol ?? e.tokenOutSymbol ?? "",
    platform: e.protocol,
    network: resolveNetwork(e.protocol, e.tokenInSymbol ?? e.tokenOutSymbol ?? ""),
    timestamp: e.transactionDate,
    value: Number(e.fiscal.valueEur) || 0,
    tax: { label: labelOf(e), tone: toneOf(e) },
  }));

  const lastAt = sorted[0]?.transactionDate ?? null;

  return (
    <div className="pcx-screen" style={{ minHeight: "100vh" }}>
      <TopNav portfolioName={ctx.portfolios.find((p) => p.id === portfolioId)?.name} />

      <PageShell>
        <MovementsHeader
          count={sorted.length}
          periodLabel={selectedYear ? `en ${selectedYear}` : "en todo el histórico"}
          // Sin el `·` de delante: la cabecera ya pone el separador, y con los
          // dos salía «en 2026 · · última hace 3 minutos» en cada carga.
          lastLabel={lastAt ? `última ${timeAgo(lastAt)}` : "sin operaciones"}
        />

        <MovementsTable movements={movements} currency="EUR" />

        <DataProvenance>
          {plural(sorted.length, "operación", "operaciones")}
          {movements.length < sorted.length ? `, ${movements.length} en pantalla` : ""} · valores en
          euros al tipo de la fecha de cada operación
        </DataProvenance>
      </PageShell>
    </div>
  );
}

export const dynamic = "force-dynamic";
