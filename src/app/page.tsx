import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LandingContent } from "@/components/landing/LandingContent";
import { landingMetadata } from "@/components/landing/landing-metadata";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { getDashboardData } from "@/lib/dashboard/get-dashboard-data";
import { buildResumenView } from "@/lib/dashboard/view/resumen";
import { getSyncInfo, getEvolution, provenanceLine } from "@/lib/dashboard/view/shell";
import { TopNav } from "@/components/shell/TopNav";
import { PageShell, DataProvenance } from "@/components/shell/PageShell";
import { WealthHeader, SyncStatus } from "@/components/dashboard/resumen/WealthHeader";
import { PortfolioComposition } from "@/components/dashboard/resumen/PortfolioComposition";
import { EvolutionChart } from "@/components/dashboard/resumen/EvolutionChart";
import { IdleYieldStrip } from "@/components/dashboard/resumen/IdleYieldStrip";
import { RecentMovements } from "@/components/dashboard/resumen/RecentMovements";
import { NetworkDistribution } from "@/components/dashboard/resumen/NetworkDistribution";
import { signedMoney, signedPercent, timeAgo } from "@/lib/format/figures";

/**
 * Los metadatos son los de la PORTADA, no los del dashboard: la raíz es la
 * dirección que se comparte, se indexa y se enlaza desde fuera. Lo que ve un
 * cliente ya identificado no lo lee ningún buscador.
 */
export const metadata: Metadata = landingMetadata;

/**
 * La raíz sirve DOS cosas según quién llame:
 *
 *  · Sin sesión → la portada comercial. Es la dirección del negocio, y mandar a
 *    un visitante a `/login` era pedirle la contraseña antes de contarle qué
 *    es esto.
 *  · Con sesión → el Resumen. Manda una sola cifra: el patrimonio.
 *
 * Se resuelve en la misma ruta y no con una redirección para que la dirección
 * que el cliente tiene guardada siga siendo la suya.
 */
export default async function HomePage() {
  const access = await getViewerAccess();
  if (!access.isAuthenticated) return <LandingContent />;
  if (access.canManageRoles) redirect("/admin");
  if (access.role === "admin") redirect("/manager");

  const data = await getDashboardData();
  const view = buildResumenView(data);
  const portfolioId = data.portfolioContext?.portfolioId ?? "";

  const [sync, evolution] = await Promise.all([
    getSyncInfo(portfolioId),
    getEvolution(portfolioId),
  ]);

  return (
    <div className="pcx-screen" style={{ minHeight: "100vh" }}>
      <TopNav portfolioName={data.portfolioContext?.portfolioName} />

      <PageShell>
        <WealthHeader
          totalValue={view.totalValue}
          currency={view.currency}
          changeAmount={view.changeAmount}
          changePercent={view.changePercent}
          isPositive={view.isPositive}
          pricesUpdatedLabel={`Precios actualizados ${timeAgo(data.pricesLastUpdatedAt)}`}
          deposited={view.deposited}
          yieldTotal={view.yieldTotal}
          pnl={view.pnl}
          pnlPercent={view.pnlPercent}
          syncStatus={
            <SyncStatus walletsLabel={sync.walletsLabel} syncedLabel={sync.syncedLabel} />
          }
        />

        <PortfolioComposition note={view.compositionNote} slices={view.composition} />

        {/* El gráfico necesita al menos dos puntos para ser una línea. Con menos
            no se enseña un gráfico vacío: se dice por qué no lo hay. */}
        {evolution.points.length >= 2 ? (
          <EvolutionChart
            points={evolution.points}
            stats={[
              {
                label: "TWR",
                value: evolution.twr !== null ? signedPercent(evolution.twr) : "—",
                tone: (evolution.twr ?? 0) >= 0 ? "profit" : "loss",
              },
              {
                label: "Máxima caída",
                value: evolution.maxDrawdown !== null ? `−${evolution.maxDrawdown.toFixed(2)} %` : "—",
                tone: "loss",
              },
              {
                label: "P&L acumulado",
                value: signedMoney(Number(data.summary.pnlUsd)),
                tone: "neutral",
              },
              { label: "Snapshots", value: String(evolution.snapshotCount), tone: "quiet" },
            ]}
          />
        ) : null}

        {view.idle ? <IdleYieldStrip amount={view.idle.amount} detail={view.idle.detail} /> : null}

        {view.movements.length > 0 ? (
          <RecentMovements movements={view.movements} historyHref="/movimientos" />
        ) : null}

        <NetworkDistribution note={view.networksNote} networks={view.networks} />

        <DataProvenance>
          {provenanceLine(sync, view.provenance)}
          {data.viewer.canOperate ? (
            <>
              {" · "}
              <Link href="/operar" style={{ color: "var(--muted)" }}>
                Panel de operación
              </Link>
            </>
          ) : null}
        </DataProvenance>
      </PageShell>
    </div>
  );
}

/** Las cifras cambian con cada lectura on-chain: nada de caché estática. */
export const dynamic = "force-dynamic";
