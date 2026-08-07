import { notFound } from "next/navigation";
import { TopNav } from "@/components/shell/TopNav";
import { PageShell, DataProvenance, StaleReadNotice } from "@/components/shell/PageShell";
import { WealthHeader, SyncStatus } from "@/components/dashboard/resumen/WealthHeader";
import { PortfolioComposition } from "@/components/dashboard/resumen/PortfolioComposition";
import { EvolutionChart } from "@/components/dashboard/resumen/EvolutionChart";
import { IdleYieldStrip } from "@/components/dashboard/resumen/IdleYieldStrip";
import { RecentMovements } from "@/components/dashboard/resumen/RecentMovements";
import { NetworkDistribution } from "@/components/dashboard/resumen/NetworkDistribution";
import { MOCK_EVOLUTION, MOCK_MOVEMENTS } from "./mock-resumen";

/**
 * Banco de pruebas del rediseño.
 *
 * Existe para poder comparar componente contra maqueta sin iniciar sesión ni
 * tocar datos reales: los valores son EXACTAMENTE los de
 * web/design/01-resumen.html, así que cualquier diferencia visual es un fallo de
 * implementación, no de datos.
 *
 * Nunca se sirve en producción.
 */
export default function PreviewResumen() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="pcx-screen" style={{ minHeight: "100vh" }}>
      <TopNav basePath="/preview" portfolioName="Elena Cortés" />

      <PageShell>
        <WealthHeader
          totalValue="11.191,30"
          currency="US$"
          changeAmount="−754,89 US$"
          changePercent="−6,32 %"
          isPositive={false}
          pricesUpdatedLabel="Precios actualizados hace 8 minutos"
          onRefresh={
            <button type="button" style={{ fontSize: "var(--text-label)", color: "var(--muted)" }}>
              Actualizar precios
            </button>
          }
          deposited="11.946 US$"
          yieldTotal="432 US$"
          pnl="−755 US$"
          pnlPercent="−6,32 %"
          syncStatus={
            <SyncStatus walletsLabel="4 wallets · 4 redes" syncedLabel="Sincronizado hace 8 min" />
          }
        />

        <PortfolioComposition
          note="2 estrategias activas · Staking y Lending sin posiciones"
          slices={[
            {
              key: "wallet",
              name: "Wallet (HODL)",
              detail: "Custodia propia · sin bloqueo",
              value: "9.156,95 US$",
              percent: "49,35 %",
              share: 49.35,
            },
            {
              key: "lp",
              name: "Liquidity Pools",
              detail: "3 posiciones · Kamino, PancakeSwap",
              value: "9.397,48 US$",
              percent: "50,65 %",
              share: 50.65,
            },
          ]}
        />

        <EvolutionChart
          points={MOCK_EVOLUTION}
          stats={[
            { label: "TWR", value: "+45,85 %", tone: "profit" },
            { label: "Máxima caída", value: "−10,68 %", tone: "loss" },
            { label: "P&L acumulado", value: "4.417,62 US$", tone: "neutral" },
            { label: "Snapshots", value: "27", tone: "quiet" },
          ]}
        />

        <IdleYieldStrip
          amount="28,02 US$"
          detail="generados sin reclamar en 3 posiciones"
          action={
            <button type="button" style={{ fontSize: "var(--text-body)", fontWeight: 500 }}>
              Reclamar
            </button>
          }
        />

        <RecentMovements movements={MOCK_MOVEMENTS} historyHref="/preview/movimientos" />

        <NetworkDistribution
          note="4 redes · 77 % concentrado en Solana"
          networks={[
            {
              name: "Solana",
              value: "8.582,56 US$",
              percent: "77,4 %",
              share: 77.4,
            },
            {
              name: "Bitcoin",
              value: "1.648,79 US$",
              percent: "14,9 %",
              share: 14.9,
            },
            {
              name: "HyperEVM",
              value: "456,35 US$",
              percent: "4,1 %",
              share: 4.1,
            },
            { name: "Base", value: "397,67 US$", percent: "3,6 %", share: 3.6 },
          ]}
        />

        {/* El aviso de lectura vieja, en su sitio del pie. En la pantalla real
            solo aparece si `getSyncInfo` marca `isStale`; aquí se pinta siempre
            —con una lectura simulada de hace 14 horas— porque este banco existe
            justo para poder mirar el caso sin esperar a que ocurra. */}
        <StaleReadNotice lastSyncIso={new Date(Date.now() - 14 * 3600_000).toISOString()} />

        <DataProvenance>
          4 wallets conectadas · 14 posiciones leídas · última lectura 28 jul, 13:38
        </DataProvenance>
      </PageShell>
    </div>
  );
}
