import { redirect } from "next/navigation";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { getDashboardData } from "@/lib/dashboard/get-dashboard-data";
import { buildCarteraView } from "@/lib/dashboard/view/cartera";
import { getSyncInfo, provenanceLine } from "@/lib/dashboard/view/shell";
import { TopNav } from "@/components/shell/TopNav";
import { PageShell, DataProvenance } from "@/components/shell/PageShell";
import { SyncStatus } from "@/components/dashboard/resumen/WealthHeader";
import { CarteraHeader } from "@/components/dashboard/cartera/CarteraHeader";
import { PositionsTable } from "@/components/dashboard/cartera/PositionsTable";
import { timeAgo } from "@/lib/format/figures";

/**
 * Cartera — el detalle posición a posición.
 *
 * Cuatro tablas con la MISMA rejilla, para poder recorrerlas en vertical y
 * comparar sin que la vista se reajuste en cada sección.
 */
export default async function CarteraPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolio?: string }>;
}) {
  const access = await getViewerAccess();
  if (!access.isAuthenticated) redirect("/login");

  // `?portfolio=` como en Movimientos y Fiscalidad. Sin él no había forma de
  // cambiar de cartera desde esta pantalla: un gestor con seis clientes veía
  // siempre la misma. El permiso lo comprueba `getDashboardData`, que rechaza
  // una cartera que no esté entre las del viewer.
  const { portfolio } = await searchParams;
  const pedida = (portfolio ?? "").trim();

  const data = await getDashboardData(pedida ? { targetPortfolioId: pedida } : undefined);
  const view = buildCarteraView(data);
  const sync = await getSyncInfo(data.portfolioContext?.portfolioId ?? "");

  return (
    <div className="pcx-screen" style={{ minHeight: "100vh" }}>
      <TopNav portfolioName={data.portfolioContext?.portfolioName} />

      <PageShell>
        <CarteraHeader
          total={view.total}
          positionsLabel={view.positionsLabel}
          readLabel={`· leído ${timeAgo(sync.lastSyncIso)}`}
          syncStatus={
            <SyncStatus walletsLabel={sync.walletsLabel} syncedLabel={sync.syncedLabel} />
          }
        />

        {view.sections.length > 0 ? (
          view.sections.map((section) => <PositionsTable key={section.key} section={section} />)
        ) : (
          <p style={{ marginTop: 52, fontSize: "var(--text-body)", color: "var(--faint)" }}>
            Todavía no hay posiciones abiertas en esta cartera.
          </p>
        )}

        <DataProvenance>{provenanceLine(sync, view.provenance)}</DataProvenance>
      </PageShell>
    </div>
  );
}

export const dynamic = "force-dynamic";
