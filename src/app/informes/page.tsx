import { redirect } from "next/navigation";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { getFiscalContext } from "@/lib/fiscal/get-fiscal-context";
import { computeTraceability } from "@/lib/tax/compute-traceability";
import { getTaxYear } from "@/lib/tax/eur-conversion";
import { TopNav } from "@/components/shell/TopNav";
import { PageShell, DataProvenance } from "@/components/shell/PageShell";
import { ReportsHeader } from "@/components/dashboard/informes/ReportsHeader";
import { ReportRow } from "@/components/dashboard/informes/ReportRow";
import { longDate } from "@/lib/format/figures";

/**
 * Informes — la documentación que el cliente se lleva.
 *
 * Un informe **sin datos no se oculta: se apaga**. Que aparezca en gris
 * diciendo «sin operaciones en 2025» informa; que desaparezca deja al cliente
 * preguntándose si existe.
 */
export default async function InformesPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolio?: string }>;
}) {
  const access = await getViewerAccess();
  if (!access.isAuthenticated) redirect("/login");

  const { portfolio } = await searchParams;
  const ctx = await getFiscalContext(portfolio);
  const portfolioId = ctx.activePortfolioId;
  // Sin recurso a «la cartera»: el fallback anterior producía «Documentación de
  // la cartera de la cartera». Si no hay nombre, el titular se calla.
  const portfolioName = ctx.portfolios.find((p) => p.id === portfolioId)?.name?.trim() ?? "";

  // Qué ejercicios tienen operaciones: un informe fiscal de un año vacío se
  // enseña apagado, no se esconde.
  let yearsWithData: number[] = [];
  if (portfolioId) {
    const { entries } = await computeTraceability(portfolioId);
    yearsWithData = [...new Set(entries.map((e) => getTaxYear(e.transactionDate)))].sort(
      (a, b) => b - a,
    );
  }

  // Sin cartera no hay nada que descargar, y un enlace con `portfolioId`
  // indefinido interpola «undefined» en la URL y la ruta responde 400. Antes
  // que un botón que falla, ninguno.
  const puedeDescargar = Boolean(portfolioId);
  const informeHref = `/fiscalidad/informe?portfolio=${portfolioId ?? ""}&auto=1`;

  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;
  const hasCurrent = yearsWithData.includes(currentYear);
  const hasPrevious = yearsWithData.includes(previousYear);

  return (
    <div className="pcx-screen" style={{ minHeight: "100vh" }}>
      <TopNav
        portfolioName={ctx.portfolios.find((p) => p.id === portfolioId)?.name}
        portfolios={ctx.portfolios
          .filter((p) => p.id && p.name)
          .map((p) => ({ id: p.id, name: p.name as string }))}
      />

      <PageShell>
        <ReportsHeader
          section="Informes"
          title={
            portfolioName
              ? `Documentación de la cartera de ${portfolioName}`
              : "Documentación de la cartera"
          }
        />

        {/* El informe que casi todo el mundo viene a buscar. Su destino
            —/fiscalidad/informe— llevaba construido desde el principio, con el
            mismo FIFO y el mismo filtro de ejercicio que la pantalla; lo único
            que faltaba era el enlace. `auto=1` dispara la impresión al abrir. */}
        <ReportRow
          title="Informe fiscal del ejercicio"
          description="Bases imponibles y desglose por casilla del Modelo 100"
          period={{ kind: "fixed", label: String(currentYear) }}
          format="PDF"
          action={
            hasCurrent
              ? {
                  label: "Generar",
                  variant: "primary",
                  href: `${informeHref}&ejercicio=${currentYear}`,
                }
              : undefined
          }
          dimmed={!hasCurrent}
          note="El ejercicio fiscal comprende el año natural completo."
        />

        {/* Periodo FIJO y botón discreto, los dos a sabiendas.
         *
         *  · El generador que existe (buildPortfolioReportHtml) no acepta rango:
         *    es una foto del estado actual. Ofrecer «Último trimestre» en un
         *    selector que el informe no sabe honrar es prometer lo que no se
         *    cumple. Cuando acepte rango, vuelve el selector.
         *  · Sin relleno azul: solo el informe fiscal lo lleva. Dos botones
         *    azules seguidos no destacan ninguno —lo dice el propio comentario
         *    de ReportAction—, y aquí había dos. */}
        <ReportRow
          title="Informe patrimonial"
          description="Valor, composición y rendimiento a fecha de hoy"
          period={{ kind: "fixed", label: "A fecha de hoy" }}
          format="PDF"
          action={
            puedeDescargar
              ? {
                  label: "Generar",
                  variant: "quiet",
                  href: `/api/informes/patrimonial?portfolioId=${portfolioId}&auto=1`,
                }
              : undefined
          }
          dimmed={!puedeDescargar}
        />

        {/* Periodo fijo, y por la misma razón: el enlace descarga TODO el
            histórico. Con un selector puesto, la fila decía «Año en curso» y
            entregaba doce años. La ruta sabe filtrar por ejercicio, así que el
            corte por año vive arriba, en Fiscalidad, donde se elige. */}
        <ReportRow
          title="Historial de operaciones"
          description="Todas las operaciones con su clasificación fiscal"
          period={{ kind: "fixed", label: "Todo el histórico" }}
          format="CSV"
          action={
            puedeDescargar
              ? {
                  label: "Descargar",
                  variant: "quiet",
                  href: `/api/fiscal/export?portfolioId=${portfolioId}&formato=trazabilidad`,
                }
              : undefined
          }
          dimmed={!puedeDescargar}
        />

        {/* Mismos datos, formato que digiere el software fiscal español. Es una
            fila y no una tercera tarjeta en una pantalla aparte: para el cliente
            es «otro documento que me puedo bajar», igual que los de arriba. */}
        <ReportRow
          title="Operaciones para tu gestor fiscal"
          description="Formato CoinTracking, que aceptan la mayoría de gestores en España"
          period={{ kind: "fixed", label: "Todo el histórico" }}
          format="CSV"
          action={
            puedeDescargar
              ? {
                  label: "Descargar",
                  variant: "quiet",
                  href: `/api/fiscal/export?portfolioId=${portfolioId}&formato=cointracking`,
                }
              : undefined
          }
          dimmed={!puedeDescargar}
        />

        {/* Sin generador: no existe nada que construya el CSV de posiciones a
            fecha. La fila se queda —apagada, no escondida: la regla es que un
            informe que existe se ve aunque hoy no se pueda pedir— pero sin
            botón, para no ofrecer una descarga que no llega. */}
        <ReportRow
          title="Posiciones a fecha"
          description="Fotografía de la cartera en un momento concreto"
          period={{ kind: "fixed", label: longDate(new Date().toISOString()) }}
          format="CSV"
          dimmed
          note="Todavía no disponible: este informe aún no se genera."
        />

        <ReportRow
          title="Informe fiscal del ejercicio"
          description={
            hasPrevious
              ? "Bases imponibles del ejercicio anterior"
              : `Sin operaciones en ${previousYear}`
          }
          period={{ kind: "fixed", label: String(previousYear) }}
          format="PDF"
          action={
            hasPrevious
              ? {
                  label: "Generar",
                  variant: "primary",
                  href: `${informeHref}&ejercicio=${previousYear}`,
                }
              : undefined
          }
          dimmed={!hasPrevious}
        />

        <DataProvenance>
          Los informes fiscales son orientativos y no sustituyen el criterio de un asesor. Los
          documentos se generan con los datos disponibles en el momento de la descarga.
        </DataProvenance>
      </PageShell>
    </div>
  );
}

export const dynamic = "force-dynamic";
