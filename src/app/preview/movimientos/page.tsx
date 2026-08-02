import { notFound } from "next/navigation";
import { TopNav } from "@/components/shell/TopNav";
import { PageShell, DataProvenance } from "@/components/shell/PageShell";
import { SyncStatus } from "@/components/dashboard/resumen/WealthHeader";
import { MovementsHeader } from "@/components/dashboard/movimientos/MovementsHeader";
import { MovementFilters } from "@/components/dashboard/movimientos/MovementFilters";
import { MovementsTable } from "@/components/dashboard/movimientos/MovementsTable";
import { MOCK_MOVIMIENTOS } from "./mock-movimientos";

/**
 * Banco de pruebas de Movimientos, con los datos exactos de
 * web/design/03-movimientos.html. Nunca se sirve en producción.
 */
export default function PreviewMovimientos() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="pcx-screen" style={{ minHeight: "100vh" }}>
      <TopNav basePath="/preview" portfolioName="Elena Cortés" />

      <PageShell>
        <MovementsHeader
          count={52}
          periodLabel="en 2026"
          lastLabel="última hace 3 minutos"
          action={
            <button type="button" style={{ fontSize: "var(--text-body)", color: "var(--muted)" }}>
              Exportar CSV
            </button>
          }
          syncStatus={
            <SyncStatus walletsLabel="4 wallets · 4 redes" syncedLabel="Sincronizado hace 3 min" />
          }
        />

        <MovementFilters
          filters={[
            { key: "wallet", name: "Wallet", label: "Todas las wallets" },
            { key: "operation", name: "Tipo de operación", label: "Todas las operaciones" },
            { key: "year", name: "Ejercicio", label: "2026" },
          ]}
        />

        <MovementsTable
          movements={MOCK_MOVIMIENTOS}
          currency="EUR"
          loadMore={
            <button
              type="button"
              style={{ fontSize: "var(--text-body)", fontWeight: 500, color: "var(--muted)" }}
            >
              Cargar más
            </button>
          }
        />

        <DataProvenance>
          13 de 52 operaciones · valores en euros al tipo de la fecha de cada operación
        </DataProvenance>
      </PageShell>
    </div>
  );
}
