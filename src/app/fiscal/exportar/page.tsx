import { getFiscalContext } from "@/lib/fiscal/get-fiscal-context";
import { computeTraceability } from "@/lib/tax/compute-traceability";
import { FiscalPageHeader } from "@/components/fiscal/FiscalPageHeader";
import { ExportarClient } from "@/components/fiscal/ExportarClient";

export const dynamic = "force-dynamic";

export default async function ExportarPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolio?: string }>;
}) {
  const { portfolio } = await searchParams;
  const ctx = await getFiscalContext(portfolio);
  const portfolioId = ctx.activePortfolioId;

  if (!portfolioId) {
    return (
      <>
        <FiscalPageHeader title="Exportar datos" subtitle="CSV compatible con CoinTracking / asesor fiscal" />
        <div className="px-7 py-16 text-center text-sm text-[var(--muted)]">
          No hay ningún portfolio disponible.
        </div>
      </>
    );
  }

  const { entries } = await computeTraceability(portfolioId);

  return (
    <>
      <FiscalPageHeader title="Exportar datos" subtitle="CSV compatible con CoinTracking / asesor fiscal" />
      <ExportarClient entries={entries} />
    </>
  );
}
