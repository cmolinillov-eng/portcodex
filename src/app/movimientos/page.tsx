import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { getFiscalContext } from "@/lib/fiscal/get-fiscal-context";
import { computeTraceability, type TraceabilityEntry } from "@/lib/tax/compute-traceability";
import { getAeatClassification } from "@/lib/tax/aeat-mapping";
import { getTaxYear } from "@/lib/tax/eur-conversion";
import { resolveNetwork } from "@/lib/dashboard/networks";
import { getSyncInfo } from "@/lib/dashboard/view/shell";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { TopNav } from "@/components/shell/TopNav";
import { PageShell, DataProvenance } from "@/components/shell/PageShell";
import { SyncStatus } from "@/components/dashboard/resumen/WealthHeader";
import { ExportLink } from "@/components/dashboard/export/ExportLink";
import { MovementsHeader } from "@/components/dashboard/movimientos/MovementsHeader";
import {
  MovementFilters,
  type MovementFilter,
} from "@/components/dashboard/movimientos/MovementFilters";
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
 *
 * Todo el filtrado ocurre AQUÍ, en el servidor, y viaja en la URL. Es lo que
 * permite que la cabecera («N operaciones»), el pie de procedencia, el CSV y la
 * tabla hablen siempre del mismo conjunto, y evita mandar el histórico entero
 * al navegador para poder recortarlo allí.
 */

/** Cuántas operaciones se pintan de una vez. El resto, bajo «Cargar más». */
const PAGE_SIZE = 60;

/** Tope de lo que puede pedir un `?mostrar=` manipulado a mano. Con el
 *  histórico completo de una cartera real muy por encima, sirve solo para que
 *  nadie convierta la pantalla en una descarga de la tabla entera. */
const MAX_ROWS = 2000;

const OPERATION_LABEL: Record<string, string> = {
  deposit: "Depósito",
  withdrawal: "Retirada",
  harvest: "Harvest rewards",
  swap: "Permuta",
  lp_deposit: "Añadir liquidez",
  lp_withdraw: "Retirar liquidez",
  borrow: "Préstamo",
  repay: "Devolución",
  // Los cuatro que faltaban: salían en inglés y en minúscula («staking
  // deposit») porque el respaldo es `type.replace(/_/g, " ")`. En lending el
  // nombre dice COLATERAL a propósito: es lo que separa el depósito de garantía
  // del préstamo recibido, que en esa tabla van por columnas distintas.
  staking_deposit: "Depósito en staking",
  staking_withdrawal: "Retirada de staking",
  lending_supply: "Aportar colateral",
  lending_withdraw: "Retirar colateral",
  lending_borrow: "Préstamo recibido",
  position_closed: "Cierre de posición",
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

function operationLabel(type: string): string {
  return OPERATION_LABEL[type] ?? type.replace(/_/g, " ");
}

/** Para buscar: sin acentos y en minúscula, que es como se escribe en una caja
 *  de búsqueda («permuta» tiene que encontrar «Permuta», y «solana» «Solana»). */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Lo que la contabilidad NO expone y esta pantalla necesita.
 *
 * `computeTraceability` devuelve la anotación fiscal de cada operación, pero no
 * su `operation_group_id` (lo que hace falta para deshacerla) ni su `metadata`
 * (donde vive la otra pata de una permuta). Se leen aparte, en una consulta, en
 * vez de tocar el núcleo fiscal, que es compartido con Fiscalidad e Informes.
 *
 * Si la columna `operation_group_id` no existe todavía en la base —hay código
 * en /api/transactions que contempla ese caso—, la consulta falla entera y se
 * devuelve un mapa vacío: sin grupo no hay «Deshacer», y el resto de la
 * pantalla sigue funcionando.
 */
interface RowExtras {
  operationGroupId: string | null;
  /** Permuta detectada on-chain: las dos patas, ya en crudo. */
  swap: { sold: Leg | null; bought: Leg | null } | null;
}

interface Leg {
  quantity: number;
  symbol: string;
}

/** «0.030000 SOL» → { quantity: 0.03, symbol: "SOL" }. La ingesta on-chain lo
 *  guarda ya escrito; aquí se deshace para que los decimales los ponga
 *  `tokenAmount` y no un `toFixed` de hace tres meses. */
function parseLeg(raw: unknown): Leg | null {
  if (typeof raw !== "string") return null;
  const cut = raw.trim().lastIndexOf(" ");
  if (cut === -1) return null;
  const quantity = Number(raw.slice(0, cut));
  const symbol = raw.slice(cut + 1).trim().toUpperCase();
  if (!Number.isFinite(quantity) || quantity <= 0 || !symbol) return null;
  return { quantity, symbol };
}

async function getRowExtras(portfolioId: string): Promise<Map<string, RowExtras>> {
  const db = getSupabaseServiceClient() ?? getSupabaseServerClient();
  const { data, error } = await db
    .from("transactions")
    .select("id, operation_group_id, metadata")
    .eq("portfolio_id", portfolioId)
    .is("deleted_at", null);

  const extras = new Map<string, RowExtras>();
  if (error || !data) return extras;

  for (const row of data as Array<{
    id: string;
    operation_group_id: string | null;
    metadata: Record<string, unknown> | null;
  }>) {
    const meta = row.metadata ?? {};
    let swap: RowExtras["swap"] = null;

    if (meta.source === "onchain_swap") {
      // La ingesta escribe las dos patas en las DOS filas de la permuta, así
      // que cada una sabe con qué se cambió sin tener que buscar a su gemela.
      swap = { sold: parseLeg(meta.swapSold), bought: parseLeg(meta.swapBought) };
    } else if (Array.isArray(meta.swapLegs) && meta.swapLegs.length === 1) {
      // Permuta implícita en un rebalanceo o en una reinversión: esta fila es
      // la COMPRADA y el leg dice qué se vendió para pagarla. Con más de un leg
      // se deja fuera: en una celda de dos líneas no caben tres tokens, y
      // inventarse un «+2 más» sería peor que no decirlo.
      const leg = meta.swapLegs[0] as Record<string, unknown>;
      const quantity = Number(leg.soldAmount);
      const symbol = typeof leg.soldSymbol === "string" ? leg.soldSymbol.toUpperCase() : "";
      if (Number.isFinite(quantity) && quantity > 0 && symbol) {
        swap = { sold: { quantity, symbol }, bought: null };
      }
    }

    extras.set(row.id, { operationGroupId: row.operation_group_id, swap });
  }

  return extras;
}

/** La otra pata, vista desde ESTA fila: si la fila entregó, la contraparte es
 *  lo recibido; si la fila recibió, lo entregado. */
function counterpartOf(
  entry: TraceabilityEntry,
  extras: RowExtras | undefined,
): Movement["counterpart"] {
  const swap = extras?.swap;
  if (!swap) return undefined;

  const gave = entry.tokenOutSymbol !== null && entry.tokenInSymbol === null;
  const leg = gave ? swap.bought : swap.sold;
  if (!leg) return undefined;
  // No se repite el propio token: en la pata comprada de una permuta implícita
  // «← 1.229 USDS» informa, «← 1.228 USDC» sobre una fila de USDC, no.
  if (leg.symbol === (entry.tokenInSymbol ?? entry.tokenOutSymbol ?? "").toUpperCase()) {
    return undefined;
  }
  return { quantity: leg.quantity, symbol: leg.symbol, received: gave };
}

export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: Promise<{
    portfolio?: string;
    ejercicio?: string;
    plataforma?: string;
    tipo?: string;
    q?: string;
    mostrar?: string;
  }>;
}) {
  const access = await getViewerAccess();
  if (!access.isAuthenticated) redirect("/login");

  const params = await searchParams;
  const { portfolio, ejercicio } = params;
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

  const [{ entries }, extras, sync] = await Promise.all([
    computeTraceability(portfolioId),
    getRowExtras(portfolioId),
    getSyncInfo(portfolioId),
  ]);

  const years = [...new Set(entries.map((e) => getTaxYear(e.transactionDate)))].sort((a, b) => b - a);
  // «todos» es explícito: sin parámetro se entra en el ejercicio en curso, que
  // es lo que viene a mirar el cliente, y el histórico completo se pide.
  const allYears = ejercicio === "todos";
  const requested = Number(ejercicio);
  const selectedYear = allYears
    ? null
    : Number.isInteger(requested) && years.includes(requested)
      ? requested
      : (years[0] ?? null);

  const yearEntries = selectedYear
    ? entries.filter((e) => getTaxYear(e.transactionDate) === selectedYear)
    : entries;

  // Más recientes primero: un extracto se lee de hoy hacia atrás.
  const sorted = [...yearEntries].sort(
    (a, b) => Date.parse(b.transactionDate) - Date.parse(a.transactionDate),
  );

  const all: Movement[] = sorted.map((e) => {
    const symbol = e.tokenInSymbol ?? e.tokenOutSymbol ?? "";
    const extra = extras.get(e.id);
    return {
      id: e.id,
      operation: operationLabel(e.type),
      quantity: Number(e.tokenInAmount ?? e.tokenOutAmount ?? 0),
      symbol,
      counterpart: counterpartOf(e, extra),
      platform: e.protocol,
      network: resolveNetwork(e.protocol, symbol),
      timestamp: e.transactionDate,
      value: Number(e.fiscal.valueEur) || 0,
      tax: { label: labelOf(e), tone: toneOf(e) },
      undoGroupId: extra?.operationGroupId ?? undefined,
    };
  });

  // Las opciones salen del EJERCICIO elegido y no del histórico entero: ofrecer
  // «Aave V3» en un año en el que no hubo lending lleva a una tabla vacía.
  const platforms = [...new Set(all.map((m) => m.platform))].sort((a, b) => a.localeCompare(b, "es"));
  const types = [...new Set(sorted.map((e) => e.type))]
    .map((type) => ({ value: type, label: operationLabel(type) }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));

  const platform = platforms.includes(params.plataforma ?? "") ? (params.plataforma ?? "") : "";
  const type = types.some((t) => t.value === params.tipo) ? (params.tipo ?? "") : "";
  const query = (params.q ?? "").trim();
  const needle = normalize(query);

  // El tipo en crudo no viaja en la fila —la tabla enseña su etiqueta—, pero el
  // filtro sí tiene que ir por él: dos tipos distintos podrían compartir rótulo.
  const typeById = new Map(sorted.map((e) => [e.id, e.type]));

  const filtered = all.filter((m) => {
    if (platform && m.platform !== platform) return false;
    if (type && typeById.get(m.id) !== type) return false;
    if (!needle) return true;
    // Se busca por lo que se VE en la fila: si el cliente lee «Harvest
    // rewards» y escribe eso, tiene que encontrarlo, aunque dentro se llame
    // «harvest».
    const haystack = [
      m.operation,
      m.symbol,
      m.counterpart?.symbol ?? "",
      m.platform,
      m.network,
      m.tax.label,
    ];
    return haystack.some((field) => normalize(field).includes(needle));
  });

  const requestedRows = Number(params.mostrar);
  const rows =
    Number.isInteger(requestedRows) && requestedRows > 0
      ? Math.min(requestedRows, MAX_ROWS)
      : PAGE_SIZE;

  const movements = filtered.slice(0, rows);
  const hasMore = filtered.length > movements.length;
  const lastAt = filtered[0]?.timestamp ?? null;

  /** Enlace que conserva el filtro y solo sube el corte. */
  const loadMoreHref = `/movimientos?${new URLSearchParams({
    ...(portfolio ? { portfolio } : {}),
    ...(ejercicio ? { ejercicio } : {}),
    ...(platform ? { plataforma: platform } : {}),
    ...(type ? { tipo: type } : {}),
    ...(query ? { q: query } : {}),
    mostrar: String(Math.min(rows + PAGE_SIZE, MAX_ROWS)),
  }).toString()}`;

  const filters: MovementFilter[] = [
    {
      key: "plataforma",
      // La maqueta dice «Todas las wallets», pero una operación no está atada a
      // una wallet en el modelo: lo que sí tiene es CUSTODIO/plataforma, que es
      // la columna que la propia tabla enseña. Se filtra por lo que existe y se
      // llama por su nombre; inventar un filtro de wallets sería enseñar un
      // dato que no tenemos.
      name: "Plataforma",
      label: platform || "Todas las plataformas",
      value: platform,
      options: [{ value: "", label: "Todas las plataformas" }, ...platforms.map((p) => ({ value: p, label: p }))],
    },
    {
      key: "tipo",
      name: "Tipo de operación",
      label: types.find((t) => t.value === type)?.label ?? "Todas las operaciones",
      value: type,
      options: [{ value: "", label: "Todas las operaciones" }, ...types],
    },
    {
      key: "ejercicio",
      name: "Ejercicio",
      label: selectedYear ? String(selectedYear) : "Todo el histórico",
      value: selectedYear ? String(selectedYear) : "todos",
      options: [
        ...years.map((y) => ({ value: String(y), label: String(y) })),
        { value: "todos", label: "Todo el histórico" },
      ],
    },
  ];

  return (
    <div className="pcx-screen" style={{ minHeight: "100vh" }}>
      <TopNav portfolioName={ctx.portfolios.find((p) => p.id === portfolioId)?.name} />

      <PageShell>
        <MovementsHeader
          count={filtered.length}
          periodLabel={selectedYear ? `en ${selectedYear}` : "en todo el histórico"}
          // Sin el `·` de delante: la cabecera ya pone el separador, y con los
          // dos salía «en 2026 · · última hace 3 minutos» en cada carga.
          lastLabel={lastAt ? `última ${timeAgo(lastAt)}` : "sin operaciones"}
          action={
            // El CSV sigue al EJERCICIO de la pantalla y no al resto de filtros:
            // es un documento fiscal —la trazabilidad completa del año, con su
            // casilla AEAT— y recortarlo por «plataforma» daría un fichero que
            // no cuadra con ninguna declaración.
            all.length > 0 ? (
              <ExportLink
                href={`/api/fiscal/export?portfolioId=${portfolioId}&formato=trazabilidad${
                  selectedYear ? `&ejercicio=${selectedYear}` : ""
                }`}
                label="Exportar CSV"
              />
            ) : null
          }
          syncStatus={<SyncStatus walletsLabel={sync.walletsLabel} syncedLabel={sync.syncedLabel} />}
        />

        <MovementFilters filters={filters} search={query} keep={{ portfolio }} />

        <MovementsTable
          movements={movements}
          currency="EUR"
          // Solo quien puede operar ve «Deshacer». La API lo vuelve a comprobar
          // —esto es presentación, no seguridad—, pero enseñarle a un cliente
          // un botón que le va a responder 403 es enseñarle un error.
          undoPortfolioId={access.canOperate ? portfolioId : undefined}
          loadMore={
            hasMore ? (
              // `scroll={false}`: «Cargar más» añade filas debajo; saltar arriba
              // después de pulsarlo obligaría a rehacer todo el recorrido.
              <Link
                href={loadMoreHref}
                scroll={false}
                style={{ fontSize: "var(--text-body)", fontWeight: 500, color: "var(--muted)" }}
              >
                Cargar más
              </Link>
            ) : null
          }
        />

        <DataProvenance>
          {plural(filtered.length, "operación", "operaciones")}
          {movements.length < filtered.length ? `, ${movements.length} en pantalla` : ""} · valores
          en euros al tipo de la fecha de cada operación
        </DataProvenance>
      </PageShell>
    </div>
  );
}

export const dynamic = "force-dynamic";
