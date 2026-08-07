import Link from "next/link";
import { notFound } from "next/navigation";
import { TopNav } from "@/components/shell/TopNav";
import { PageShell, DataProvenance, StaleReadNotice } from "@/components/shell/PageShell";
import { SyncStatus } from "@/components/dashboard/resumen/WealthHeader";
import { CarteraHeader } from "@/components/dashboard/cartera/CarteraHeader";
import { PositionsTable } from "@/components/dashboard/cartera/PositionsTable";
import { MOCK_CARTERA } from "./mock-cartera";

/**
 * Banco de pruebas de la Cartera, con los datos exactos de
 * web/design/02-cartera.html. Nunca se sirve en producción.
 */
export default function PreviewCartera() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="pcx-screen" style={{ minHeight: "100vh" }}>
      <TopNav basePath="/preview" portfolioName="Elena Cortés" />

      <PageShell>
        <CarteraHeader
          total="14.217,63 US$"
          positionsLabel="en 17 posiciones"
          readLabel="· leído hace 3 minutos"
          action={
            <Link
              href="/preview/cartera/wallets"
              style={{ fontSize: "var(--text-body)", color: "var(--muted)" }}
            >
              Wallets
            </Link>
          }
          syncStatus={
            <SyncStatus walletsLabel="4 wallets · 4 redes" syncedLabel="Sincronizado hace 3 min" />
          }
        />

        {MOCK_CARTERA.map((section) => (
          <PositionsTable key={section.key} section={section} />
        ))}

        {/* Igual que en el Resumen: en la pantalla real depende de `isStale`,
            aquí se pinta siempre para poder revisarlo. */}
        <StaleReadNotice lastSyncIso={new Date(Date.now() - 14 * 3600_000).toISOString()} />

        <DataProvenance>
          4 wallets conectadas · 17 posiciones leídas · última lectura 28 jul, 13:43
        </DataProvenance>
      </PageShell>
    </div>
  );
}
