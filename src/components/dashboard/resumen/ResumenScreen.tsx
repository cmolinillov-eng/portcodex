import type { ReactNode } from "react";
import type { DashboardData } from "@/lib/dashboard/get-dashboard-data";
import { buildResumenView } from "@/lib/dashboard/view/resumen";
import { getSyncInfo, getEvolution, provenanceLine } from "@/lib/dashboard/view/shell";
import { PageShell, DataProvenance } from "@/components/shell/PageShell";
import { WealthHeader, SyncStatus } from "./WealthHeader";
import { PortfolioComposition } from "./PortfolioComposition";
import { EvolutionChart } from "./EvolutionChart";
import { IdleYieldStrip } from "./IdleYieldStrip";
import { RecentMovements } from "./RecentMovements";
import { NetworkDistribution } from "./NetworkDistribution";
import { signedMoney, signedPercent, timeAgo } from "@/lib/format/figures";

/**
 * El Resumen, entero, para cualquier cartera.
 *
 * Existe porque hay DOS sitios que enseñan el patrimonio de una cartera: la
 * raíz, cuando entra su dueño, y el panel de administración, cuando un gestor
 * abre la de un cliente. Eran dos pantallas distintas —la segunda seguía siendo
 * el dashboard anterior al rediseño, con su barra lateral y sus tarjetas— y eso
 * significaba que gestor y cliente veían el mismo patrimonio dibujado de dos
 * maneras, y que cualquier arreglo había que hacerlo dos veces.
 *
 * Los datos ya venían bien de `getDashboardData`, que acepta cartera destino.
 * Lo único que cambiaba era quién los pintaba.
 *
 * Medidas de web/design/01-resumen.html.
 */
export async function ResumenScreen({
  data,
  nav,
  movementsHref = "/movimientos",
  provenanceExtra,
}: {
  data: DashboardData;
  /** Barra superior. La decide quien llama: el cliente ve el menú de cinco
   *  enlaces; el gestor, la barra de contexto con el nombre de quién mira. */
  nav?: ReactNode;
  /** A dónde lleva «Ver historial completo». `null` lo quita: ver
   *  RecentMovements, porque /movimientos resuelve la cartera por sesión. */
  movementsHref?: string | null;
  /** Se añade al pie de procedencia. Ahí cuelga el enlace al panel de
   *  operación, que solo ve quien puede operar. */
  provenanceExtra?: ReactNode;
}) {
  const view = buildResumenView(data);
  const portfolioId = data.portfolioContext?.portfolioId ?? "";

  const [sync, evolution] = await Promise.all([
    getSyncInfo(portfolioId),
    getEvolution(portfolioId),
  ]);

  return (
    <div className="pcx-screen" style={{ minHeight: "100vh" }}>
      {nav}

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
          syncStatus={<SyncStatus walletsLabel={sync.walletsLabel} syncedLabel={sync.syncedLabel} />}
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
                value:
                  evolution.maxDrawdown !== null ? `−${evolution.maxDrawdown.toFixed(2)} %` : "—",
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
          <RecentMovements movements={view.movements} historyHref={movementsHref} />
        ) : null}

        <NetworkDistribution note={view.networksNote} networks={view.networks} />

        <DataProvenance>
          {provenanceLine(sync, view.provenance)}
          {provenanceExtra}
        </DataProvenance>
      </PageShell>
    </div>
  );
}
