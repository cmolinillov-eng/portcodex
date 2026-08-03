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
  const portfolioName = ctx.portfolios.find((p) => p.id === portfolioId)?.name ?? "la cartera";

  // Qué ejercicios tienen operaciones: un informe fiscal de un año vacío se
  // enseña apagado, no se esconde.
  let yearsWithData: number[] = [];
  if (portfolioId) {
    const { entries } = await computeTraceability(portfolioId);
    yearsWithData = [...new Set(entries.map((e) => getTaxYear(e.transactionDate)))].sort(
      (a, b) => b - a,
    );
  }

  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;
  const hasCurrent = yearsWithData.includes(currentYear);
  const hasPrevious = yearsWithData.includes(previousYear);

  return (
    <div className="pcx-screen" style={{ minHeight: "100vh" }}>
      <TopNav portfolioName={ctx.portfolios.find((p) => p.id === portfolioId)?.name} />

      <PageShell>
        <ReportsHeader section="Informes" title={`Documentación de la cartera de ${portfolioName}`} />

        <ReportRow
          title="Informe fiscal del ejercicio"
          description="Bases imponibles y desglose por casilla del Modelo 100"
          period={{ kind: "fixed", label: String(currentYear) }}
          format="PDF"
          action={hasCurrent ? { label: "Generar", variant: "primary" } : undefined}
          dimmed={!hasCurrent}
          note="El ejercicio fiscal comprende el año natural completo."
        />

        <ReportRow
          title="Informe patrimonial"
          description="Valor, evolución, composición y rendimiento del periodo"
          period={{ kind: "selectable" }}
          format="PDF"
          action={{ label: "Generar", variant: "primary" }}
        />

        <ReportRow
          title="Historial de operaciones"
          description="Todas las operaciones con su clasificación fiscal"
          period={{ kind: "selectable" }}
          format="CSV"
          action={{
            label: "Descargar",
            variant: "quiet",
            href: `/api/fiscal/export?portfolioId=${portfolioId}&formato=trazabilidad`,
          }}
        />

        {/* Mismos datos, formato que digiere el software fiscal español. Es una
            fila y no una tercera tarjeta en una pantalla aparte: para el cliente
            es «otro documento que me puedo bajar», igual que los de arriba. */}
        <ReportRow
          title="Operaciones para tu gestor fiscal"
          description="Formato CoinTracking, que aceptan la mayoría de gestores en España"
          period={{ kind: "fixed", label: "Todo el histórico" }}
          format="CSV"
          action={{
            label: "Descargar",
            variant: "quiet",
            href: `/api/fiscal/export?portfolioId=${portfolioId}&formato=cointracking`,
          }}
        />

        <ReportRow
          title="Posiciones a fecha"
          description="Fotografía de la cartera en un momento concreto"
          period={{ kind: "fixed", label: longDate(new Date().toISOString()) }}
          format="CSV"
          action={{ label: "Descargar", variant: "quiet" }}
        />

        <ReportRow
          title="Informe fiscal del ejercicio"
          description={hasPrevious ? "Bases imponibles del ejercicio anterior" : `Sin operaciones en ${previousYear}`}
          period={{ kind: "fixed", label: String(previousYear) }}
          format="PDF"
          action={hasPrevious ? { label: "Generar", variant: "primary" } : undefined}
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
