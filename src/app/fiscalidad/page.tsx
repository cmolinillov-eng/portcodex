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
import { moneyRound, longDate, plural } from "@/lib/format/figures";

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

  // Modelo 721. OJO: esto NO es el saldo que exige el modelo —que es el de
  // cierre a valor de mercado— sino el flujo neto de compraventa a coste
  // histórico. Es un SUELO, no una medida: si ya con esto se pasa el umbral,
  // hay obligación seguro; si no se pasa, no se puede concluir nada. Ver el
  // bloque Modelo721 más abajo, donde se explica por qué la pantalla no
  // absuelve a nadie con este número.
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
            // El mapeo AEAT sabe colocar airdrops, forks, salario y actividad
            // económica en esta base, pero el clasificador NO EMITE ninguna de
            // esas categorías: solo produce buy, sell, swap_in, swap_out,
            // lp_provide, lp_remove y non_taxable_transfer. Es decir, este cero
            // no es un cálculo que haya dado cero, es el único resultado
            // posible. Prometer «airdrops, forks, salario» al lado de un 0,00 €
            // le dice a alguien que cobró un airdrop que no tiene nada que
            // declarar. Mientras esas categorías no se clasifiquen, la línea
            // dice lo que de verdad hace.
            explanation:
              totalBaseGeneral !== 0
                ? "Airdrops, forks, salario y actividad económica"
                : "Los airdrops, forks y rendimientos del trabajo no se clasifican todavía de forma automática: revísalos con tu asesor.",
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

        {/* NUNCA se afirma «sin obligación de declarar».
         *
         * El 721 se calcula sobre el SALDO a valor de mercado a 31 de diciembre,
         * y lo que hay aquí es un flujo neto a coste histórico: suma compras y
         * resta ventas en custodios extranjeros. Eso deja fuera tres cosas que
         * cuentan para el umbral: el dinero que entra por transferencia desde
         * una wallet propia (se clasifica como movimiento no imponible y no
         * suma), los rendimientos cobrados en la propia plataforma, y la
         * revalorización —20.000 € comprados que hoy valen 80.000 € siguen
         * contando 20.000—.
         *
         * Con ese cálculo se puede tener seis cifras en un exchange extranjero y
         * leer «no alcanza el umbral». Declarar de menos el 721 tiene sanción,
         * así que mientras el saldo real no se calcule desde las posiciones
         * vivas valoradas a cierre, esta pantalla dice qué ha mirado y qué no,
         * y no absuelve a nadie. */}
        <Modelo721
          status={
            obligado
              ? "Con obligación de declarar en este ejercicio"
              : "Revisa tus saldos antes de descartarlo"
          }
          explanation={
            obligado
              ? `Solo con las compras y ventas registradas en plataformas extranjeras ya se supera el umbral de ${moneyRound(MODELO_721_THRESHOLD, "EUR")} a 31 de diciembre (${moneyRound(foreignBalance, "EUR")}).`
              : `Con las compras y ventas registradas en plataformas extranjeras salen ${moneyRound(foreignBalance, "EUR")}, por debajo del umbral de ${moneyRound(MODELO_721_THRESHOLD, "EUR")}. Este cálculo NO incluye lo que hayas transferido desde tus propias wallets, los rendimientos cobrados allí ni la revalorización, así que no basta para descartar la obligación: comprueba el saldo real a 31 de diciembre.`
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
