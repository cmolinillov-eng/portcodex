import { redirect } from "next/navigation";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { getFiscalContext } from "@/lib/fiscal/get-fiscal-context";
import { computeTraceability } from "@/lib/tax/compute-traceability";
import {
  aggregateByCasilla,
  isForeignCustodian,
  isRendimiento,
  MODELO_721_THRESHOLD,
  type AeatBucketInput,
} from "@/lib/tax/aeat-mapping";
import { getTaxYear } from "@/lib/tax/eur-conversion";
import { TopNav } from "@/components/shell/TopNav";
import { PageShell, DataProvenance } from "@/components/shell/PageShell";
import { FiscalHeader } from "@/components/dashboard/fiscalidad/FiscalHeader";
import { ExportLink } from "@/components/dashboard/export/ExportLink";
import { TaxBases } from "@/components/dashboard/fiscalidad/TaxBases";
import { CasillaBreakdown } from "@/components/dashboard/fiscalidad/CasillaBreakdown";
import { Modelo721 } from "@/components/dashboard/fiscalidad/Modelo721";
import { money, longDate, plural } from "@/lib/format/figures";

/**
 * Fiscalidad — el cálculo orientativo del ejercicio.
 *
 * La contabilidad NO se toca aquí: el FIFO, la conversión a euros y el reparto
 * por casillas ya viven en `lib/tax`. Esta pantalla solo los enseña.
 */
export default async function FiscalidadPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolio?: string; ejercicio?: string }>;
}) {
  const access = await getViewerAccess();
  if (!access.isAuthenticated) redirect("/login");

  const { portfolio, ejercicio } = await searchParams;
  const ctx = await getFiscalContext(portfolio);
  const portfolioId = ctx.activePortfolioId;

  if (!portfolioId) {
    return (
      <div className="pcx-screen" style={{ minHeight: "100vh" }}>
        <TopNav />
        <PageShell>
          <FiscalHeader section="Fiscalidad" title="Sin cartera" note="No hay ninguna cartera disponible." />
        </PageShell>
      </div>
    );
  }

  const { entries } = await computeTraceability(portfolioId);

  // El Modelo 100 es ANUAL. El FIFO ya corrió sobre TODO el histórico —las
  // bases de coste vienen bien—; aquí solo se filtra qué operaciones suman.
  const years = [...new Set(entries.map((e) => getTaxYear(e.transactionDate)))].sort((a, b) => b - a);
  const requested = Number(ejercicio);
  const selectedYear =
    Number.isInteger(requested) && years.includes(requested)
      ? requested
      : (years[0] ?? new Date().getFullYear());
  const yearEntries = entries.filter((e) => getTaxYear(e.transactionDate) === selectedYear);

  const bucketInputs: AeatBucketInput[] = yearEntries.map((e) => ({
    category: e.fiscal.category,
    incomeType: e.fiscal.incomeType,
    amountEur: isRendimiento(e.fiscal.incomeType) ? e.fiscal.valueEur : e.fiscal.realizedGainEur,
  }));

  const { buckets, totalBaseAhorro, totalBaseGeneral } = aggregateByCasilla(bucketInputs);

  // Modelo 721: el saldo que cuenta es el de CIERRE del ejercicio, así que se
  // acumula el flujo neto en custodios extranjeros hasta el 31/12.
  let foreignNet = 0;
  for (const e of entries) {
    if (getTaxYear(e.transactionDate) > selectedYear) continue;
    if (!isForeignCustodian(e.walletKind)) continue;
    if (e.fiscal.category === "buy") foreignNet += e.fiscal.valueEur;
    else if (e.fiscal.category === "sell") foreignNet -= e.fiscal.valueEur;
  }
  const foreignBalance = Math.max(0, foreignNet);
  const obligado = foreignBalance > MODELO_721_THRESHOLD;

  const savingsBuckets = buckets.filter((b) => b.base === "ahorro");
  const savingsOperations = savingsBuckets.reduce((s, b) => s + b.operaciones, 0);

  return (
    <div className="pcx-screen" style={{ minHeight: "100vh" }}>
      <TopNav portfolioName={ctx.portfolios.find((p) => p.id === portfolioId)?.name} />

      <PageShell>
        <FiscalHeader
          section="Fiscalidad"
          title={`Ejercicio ${selectedYear}`}
          note={plural(yearEntries.length, "operación registrada", "operaciones registradas")}
          // Descarga la trazabilidad COMPLETA del ejercicio —con casilla AEAT y
          // base imponible por operación—, que es el documento que se le pasa al
          // asesor. Los otros dos formatos (CoinTracking y copia JSON) viven en
          // Informes, junto al resto de documentos descargables.
          action={
            yearEntries.length > 0 ? (
              <ExportLink
                href={`/api/fiscal/export?portfolioId=${portfolioId}&formato=trazabilidad&ejercicio=${selectedYear}`}
              />
            ) : null
          }
        />

        <TaxBases
          savings={{
            label: "Base del ahorro",
            amountEur: totalBaseAhorro,
            explanation: "Ganancias de transmisión y permuta, rendimientos de capital",
          }}
          general={{
            label: "Base general",
            amountEur: totalBaseGeneral,
            explanation: "Airdrops, forks, salario y actividad económica",
          }}
        />

        <CasillaBreakdown
          rows={savingsBuckets.map((b) => ({
            id: b.badge,
            casilla: b.casilla,
            category: b.badge,
            operations: b.operaciones,
            amountEur: b.importeEur,
            concept: b.aeatNote,
          }))}
          totalLabel="Total base del ahorro"
          totalOperations={savingsOperations}
          totalEur={totalBaseAhorro}
        />

        <Modelo721
          status={
            obligado
              ? "Con obligación de declarar en este ejercicio"
              : "Sin obligación de declarar en este ejercicio"
          }
          explanation={
            obligado
              ? `El conjunto de saldos en plataformas extranjeras supera el umbral de ${money(MODELO_721_THRESHOLD, "EUR")} a 31 de diciembre (estimado en ${money(foreignBalance, "EUR")}).`
              : `El conjunto de saldos en plataformas extranjeras no alcanza el umbral de ${money(MODELO_721_THRESHOLD, "EUR")} a 31 de diciembre.`
          }
        />

        <DataProvenance>
          Cálculo orientativo elaborado a partir de las operaciones registradas. No sustituye el
          criterio de un asesor fiscal ni constituye asesoramiento. Generado el{" "}
          {longDate(new Date().toISOString())}.
        </DataProvenance>
      </PageShell>
    </div>
  );
}

export const dynamic = "force-dynamic";
