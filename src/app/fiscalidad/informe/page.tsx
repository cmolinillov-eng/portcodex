import { notFound, redirect } from "next/navigation";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { getFiscalContext } from "@/lib/fiscal/get-fiscal-context";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { computeTraceability } from "@/lib/tax/compute-traceability";
import {
  aggregateByCasilla,
  isForeignCustodian,
  isRendimiento,
  MODELO_721_THRESHOLD,
  type AeatBucketInput,
} from "@/lib/tax/aeat-mapping";
import { getTaxYear } from "@/lib/tax/eur-conversion";
import { buildFiscalReport } from "@/lib/reports/fiscal-report-model";
import { FiscalReportDocument } from "@/components/reports/FiscalReportDocument";
import { PrintTrigger } from "@/components/reports/PrintTrigger";

/**
 * Informe fiscal en PDF — ruta de impresión.
 *
 * TÉCNICA: HTML pensado para papel que el navegador convierte en PDF. No se
 * añade ninguna dependencia. Las razones, por orden de peso:
 *
 *  1. NO HABÍA LIBRERÍA DE PDF en `package.json` y meter una es meter un motor
 *     de maquetación entero (Puppeteer arrastra un Chromium de ~170 MB; las de
 *     dibujo tipo pdfkit obligan a reescribir tipografía y tablas a mano). El
 *     navegador que el usuario ya tiene abierto es un motor de maquetación
 *     mejor que cualquiera de las dos, y en el proyecto ya hay precedente:
 *     `lib/reports/portfolio-report-html.ts` imprime así desde 2026.
 *  2. EL PDF SALE VECTORIAL. El texto queda seleccionable y buscable, que en un
 *     documento que un asesor va a copiar a un modelo tributario no es un
 *     detalle estético.
 *  3. LOS DATOS NO SALEN DEL SERVIDOR. Generar el PDF en servidor obligaría a
 *     mover las cifras fiscales de un cliente por una capa más.
 *
 * Lo que esta técnica NO da gratis, y por eso está resuelto en el documento: la
 * numeración de páginas. Chrome no implementa las margin boxes de `@page`, así
 * que el documento se pagina explícitamente en hojas A4 (ver
 * `lib/reports/fiscal-report-model.ts`) y cada una pinta su propio pie.
 *
 * CONTABILIDAD: aquí no se calcula nada. El bloque de datos es literalmente el
 * de `app/fiscalidad/page.tsx` —mismo FIFO, mismo filtro de ejercicio, mismo
 * criterio de importe por casilla, mismo cálculo del 721—, para que la pantalla
 * y el documento no puedan decir cifras distintas.
 */
export default async function InformeFiscalPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolio?: string; ejercicio?: string; auto?: string }>;
}) {
  const access = await getViewerAccess();
  if (!access.isAuthenticated) redirect("/login");

  const { portfolio, ejercicio, auto } = await searchParams;
  const ctx = await getFiscalContext(portfolio);
  const portfolioId = ctx.activePortfolioId;
  if (!portfolioId) notFound();

  const { entries, fxSource, unpricedCount } = await computeTraceability(portfolioId);

  // ── Bloque idéntico al de app/fiscalidad/page.tsx ─────────────────────────
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

  let foreignNet = 0;
  for (const e of entries) {
    if (getTaxYear(e.transactionDate) > selectedYear) continue;
    if (!isForeignCustodian(e.walletKind)) continue;
    if (e.fiscal.category === "buy") foreignNet += e.fiscal.valueEur;
    else if (e.fiscal.category === "sell") foreignNet -= e.fiscal.valueEur;
  }
  const foreignBalance = Math.max(0, foreignNet);
  // ── Fin del bloque compartido ─────────────────────────────────────────────

  const portfolioName = ctx.portfolios.find((p) => p.id === portfolioId)?.name ?? "Cartera";
  const holderName = await resolveHolderName(portfolioId, portfolioName);

  // El detalle se lee del más antiguo al más reciente: `computeTraceability`
  // devuelve descendente porque en pantalla manda lo último, pero un documento
  // que se archiva se lee como un libro diario.
  const chronological = [...yearEntries].sort(
    (a, b) => Date.parse(a.transactionDate) - Date.parse(b.transactionDate),
  );

  const report = buildFiscalReport({
    holderName,
    portfolioName,
    year: selectedYear,
    generatedAt: new Date(),
    entries: chronological,
    buckets,
    totalBaseAhorro,
    totalBaseGeneral,
    modelo721: {
      obligado: foreignBalance > MODELO_721_THRESHOLD,
      foreignBalanceEur: foreignBalance,
      thresholdEur: MODELO_721_THRESHOLD,
    },
    fxSource,
    unpricedCount,
  });

  return (
    <>
      {/* `?auto=1` abre el diálogo de impresión solo. Sin el parámetro la
          página se puede revisar antes de imprimir, que es lo que quiere el
          gestor la primera vez. */}
      <PrintTrigger enabled={auto === "1"} title={report.fileName.replace(/\.pdf$/, "")} />
      <FiscalReportDocument report={report} />
    </>
  );
}

/**
 * Nombre del titular. El informe se dirige a su asesor, así que la cabecera
 * tiene que llevar el nombre de la persona, no el de la cartera.
 *
 * Se resuelve aquí y no en `lib/dashboard` porque es una lectura de
 * presentación: el núcleo financiero no se toca para poner un nombre en una
 * portada. Si el perfil no se puede leer, cae al nombre de la cartera antes que
 * dejar la portada vacía.
 */
async function resolveHolderName(portfolioId: string, fallback: string): Promise<string> {
  try {
    const client = getSupabaseServiceClient() ?? getSupabaseServerClient();
    const { data } = await client
      .from("portfolios")
      .select("owner:profiles!owner_id(full_name, email)")
      .eq("id", portfolioId)
      .maybeSingle();

    const raw = (data as { owner?: { full_name?: string | null; email?: string | null } | Array<{ full_name?: string | null; email?: string | null }> | null } | null)?.owner;
    const owner = Array.isArray(raw) ? raw[0] : raw;
    const name = (owner?.full_name ?? "").trim() || (owner?.email ?? "").trim();
    return name || fallback;
  } catch {
    return fallback;
  }
}

export const dynamic = "force-dynamic";
