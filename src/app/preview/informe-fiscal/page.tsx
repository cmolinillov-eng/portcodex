import { notFound } from "next/navigation";
import {
  aggregateByCasilla,
  isForeignCustodian,
  isRendimiento,
  MODELO_721_THRESHOLD,
  type AeatBucketInput,
} from "@/lib/tax/aeat-mapping";
import { buildFiscalReport } from "@/lib/reports/fiscal-report-model";
import { FiscalReportDocument } from "@/components/reports/FiscalReportDocument";
import {
  MOCK_ENTRIES,
  MOCK_GENERATED_AT,
  MOCK_HOLDER,
  MOCK_PORTFOLIO,
  MOCK_YEAR,
} from "./mock-informe";

/**
 * Banco de pruebas del informe fiscal.
 *
 * Existe por la misma razón que el resto de `/preview`: poder mirar el documento
 * sin iniciar sesión y sin datos reales. Aquí importa el doble, porque un PDF no
 * se revisa leyendo el código —se revisa abriéndolo y pasando páginas— y sin
 * esta ruta habría que tener una sesión con datos fiscales de un cliente para
 * comprobar un margen.
 *
 * La agregación por casillas se hace con las MISMAS funciones que la ruta real
 * (`aggregateByCasilla`, `isRendimiento`, `isForeignCustodian`): lo único de
 * prueba son las operaciones de entrada.
 *
 * Nunca se sirve en producción.
 */
export default function PreviewInformeFiscal() {
  if (process.env.NODE_ENV === "production") notFound();

  const bucketInputs: AeatBucketInput[] = MOCK_ENTRIES.map((e) => ({
    category: e.fiscal.category,
    incomeType: e.fiscal.incomeType,
    amountEur: isRendimiento(e.fiscal.incomeType) ? e.fiscal.valueEur : e.fiscal.realizedGainEur,
  }));

  const { buckets, totalBaseAhorro, totalBaseGeneral } = aggregateByCasilla(bucketInputs);

  let foreignNet = 0;
  for (const e of MOCK_ENTRIES) {
    if (!isForeignCustodian(e.walletKind)) continue;
    if (e.fiscal.category === "buy") foreignNet += e.fiscal.valueEur;
    else if (e.fiscal.category === "sell") foreignNet -= e.fiscal.valueEur;
  }
  const foreignBalance = Math.max(0, foreignNet);

  const report = buildFiscalReport({
    holderName: MOCK_HOLDER,
    portfolioName: MOCK_PORTFOLIO,
    year: MOCK_YEAR,
    generatedAt: MOCK_GENERATED_AT,
    entries: MOCK_ENTRIES,
    buckets,
    totalBaseAhorro,
    totalBaseGeneral,
    modelo721: {
      obligado: foreignBalance > MODELO_721_THRESHOLD,
      foreignBalanceEur: foreignBalance,
      thresholdEur: MODELO_721_THRESHOLD,
    },
    fxSource: "historical",
    unpricedCount: 0,
  });

  return <FiscalReportDocument report={report} />;
}
