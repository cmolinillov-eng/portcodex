import Link from "next/link";
import { Download, Info } from "lucide-react";
import { getFiscalContext } from "@/lib/fiscal/get-fiscal-context";
import { computeTraceability } from "@/lib/tax/compute-traceability";
import {
  aggregateByCasilla,
  type AeatBucketInput,
} from "@/lib/tax/aeat-mapping";
import { isForeignCustodian } from "@/lib/tax/aeat-mapping";
import { FiscalPageHeader } from "@/components/fiscal/FiscalPageHeader";
import { FiscalBadge } from "@/components/fiscal/FiscalBadge";
import { formatEur } from "@/lib/fiscal/format";
import { TRACEABILITY_DISCLAIMER } from "@/lib/tax/types";
import { getTaxYear } from "@/lib/tax/eur-conversion";

export const dynamic = "force-dynamic";

const MODELO_721_THRESHOLD = 50000;

function isRendimiento(it: string): boolean {
  return (
    it === "rendimiento_capital_mobiliario" ||
    it === "rend_actividad_economica" ||
    it === "rend_trabajo"
  );
}

export default async function ResumenFiscalPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolio?: string; ejercicio?: string }>;
}) {
  const { portfolio, ejercicio } = await searchParams;
  const ctx = await getFiscalContext(portfolio);
  const portfolioId = ctx.activePortfolioId;

  if (!portfolioId) {
    return (
      <>
        <FiscalPageHeader title="Resumen fiscal" subtitle="Totales por casilla AEAT" />
        <EmptyState message="No hay ningún portfolio disponible." />
      </>
    );
  }

  const { entries, fxSource, unpricedCount } = await computeTraceability(portfolioId);

  // El Modelo 100 es ANUAL: agregamos solo el ejercicio seleccionado.
  // El FIFO ya corrió sobre TODO el histórico (las bases vienen bien);
  // aquí solo se filtra qué operaciones suman a las casillas.
  const years = [...new Set(entries.map((e) => getTaxYear(e.transactionDate)))].sort((a, b) => b - a);
  const requestedYear = Number(ejercicio);
  const selectedYear =
    Number.isInteger(requestedYear) && years.includes(requestedYear)
      ? requestedYear
      : years[0] ?? new Date().getFullYear();
  const yearEntries = entries.filter((e) => getTaxYear(e.transactionDate) === selectedYear);

  const bucketInputs: AeatBucketInput[] = yearEntries.map((e) => ({
    category: e.fiscal.category,
    incomeType: e.fiscal.incomeType,
    amountEur: isRendimiento(e.fiscal.incomeType) ? e.fiscal.valueEur : e.fiscal.realizedGainEur,
  }));

  const { buckets, totalBaseAhorro, totalBaseGeneral } = aggregateByCasilla(bucketInputs);

  // Modelo 721 — estimación por flujo neto en custodios extranjeros hasta el
  // 31/12 del ejercicio seleccionado (el saldo relevante es el de cierre).
  let foreignNet = 0;
  for (const e of entries) {
    if (getTaxYear(e.transactionDate) > selectedYear) continue;
    if (!isForeignCustodian(e.walletKind)) continue;
    if (e.fiscal.category === "buy") foreignNet += e.fiscal.valueEur;
    else if (e.fiscal.category === "sell") foreignNet -= e.fiscal.valueEur;
  }
  const foreignBalance = Math.max(0, foreignNet);
  const obligado721 = foreignBalance > MODELO_721_THRESHOLD;

  const yearHref = (y: number) =>
    `/fiscal?${new URLSearchParams({ ...(portfolio ? { portfolio } : {}), ejercicio: String(y) }).toString()}`;

  return (
    <>
      <FiscalPageHeader
        title="Resumen fiscal"
        subtitle="Totales por casilla AEAT · orientativo"
        action={
          <Link
            href={`/fiscal/exportar${portfolio ? `?portfolio=${portfolio}` : ""}`}
            className="inline-flex items-center gap-2 rounded-lg border border-[rgba(111,174,143,0.45)] bg-[rgba(111,174,143,0.10)] px-3.5 py-2 text-sm font-medium text-[#6FAE8F] transition-colors hover:bg-[rgba(111,174,143,0.18)]"
          >
            <Download className="h-4 w-4" /> Exportar
          </Link>
        }
      />

      <div className="mx-auto max-w-5xl space-y-6 px-7 py-7">
        {/* Selector de ejercicio fiscal */}
        {years.length > 0 ? (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] uppercase font-mono tracking-[0.18em] text-[var(--muted)]">Ejercicio</span>
            <div className="inline-flex items-center gap-0.5 rounded-lg border border-[var(--line)] bg-[var(--void-elevated)] p-0.5">
              {years.map((y) => (
                <Link
                  key={y}
                  href={yearHref(y)}
                  className={`rounded-md px-3 py-1.5 font-mono text-xs font-medium tracking-wide transition-colors ${
                    y === selectedYear
                      ? "bg-[rgba(111,174,143,0.16)] text-[var(--foreground)]"
                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {y}
                </Link>
              ))}
            </div>
            <span className="text-xs text-[var(--muted)]">· {yearEntries.length} operaciones en {selectedYear}</span>
          </div>
        ) : null}

        {fxSource === "fallback" ? (
          <p className="rounded-lg border border-[rgba(201,164,94,0.4)] bg-[rgba(201,164,94,0.08)] px-4 py-2.5 text-xs text-amber-300">
            ⚠️ No se pudo obtener el tipo de cambio EUR/USD (ni histórico ni actual): los importes usan un tipo aproximado. Reintenta más tarde antes de exportar.
          </p>
        ) : null}

        {unpricedCount > 0 ? (
          <p className="rounded-lg border border-[rgba(201,164,94,0.4)] bg-[rgba(201,164,94,0.08)] px-4 py-2.5 text-xs text-amber-300">
            ⚠️ {unpricedCount} operación{unpricedCount !== 1 ? "es" : ""} con cantidad pero sin precio no se {unpricedCount !== 1 ? "han podido" : "ha podido"} valorar y {unpricedCount !== 1 ? "quedan" : "queda"} fuera del cómputo fiscal. Revísalas en Operaciones antes de declarar.
          </p>
        ) : null}

        {/* Tarjetas base */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <BaseCard
            label="Base del ahorro"
            value={totalBaseAhorro}
            note="GP transmisión/permuta + RCM + derivados"
            dot="var(--accent-primary)"
          />
          <BaseCard
            label="Base general"
            value={totalBaseGeneral}
            note="Airdrops · forks · salario · actividad"
            dot="var(--warn)"
          />
        </div>

        {/* Desglose por casilla */}
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--void-surface)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-[var(--foreground)]">Desglose por casilla IRPF</h2>
              <p className="mt-0.5 text-xs text-[var(--muted)]">Modelo 100 · ejercicio {selectedYear} · agregado por categoría fiscal</p>
            </div>
          </div>

          {buckets.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-[var(--muted)]">
              Aún no hay operaciones con impacto fiscal registrado.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                    <th className="px-5 py-3 font-medium">Casilla</th>
                    <th className="px-5 py-3 font-medium">Categoría</th>
                    <th className="px-5 py-3 text-center font-medium">Ops.</th>
                    <th className="px-5 py-3 text-right font-medium">Importe agregado</th>
                    <th className="px-5 py-3 font-medium">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((b) => (
                    <tr key={b.badge} className="border-b border-[var(--line)]/60 last:border-0">
                      <td className="px-5 py-3.5 font-mono text-xs text-[var(--foreground)]">{b.casilla}</td>
                      <td className="px-5 py-3.5">
                        <FiscalBadge tone={b.tone} label={b.badge} />
                      </td>
                      <td className="px-5 py-3.5 text-center text-[var(--muted)]">{b.operaciones}</td>
                      <td
                        className={`px-5 py-3.5 text-right font-medium tabular-nums ${
                          b.importeEur < 0 ? "text-rose-300" : "text-[var(--foreground)]"
                        }`}
                      >
                        {formatEur(b.importeEur)}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[var(--muted)]">{b.aeatNote}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Modelo 721 */}
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--void-surface)] px-5 py-5">
          <h2 className="text-base font-semibold text-[var(--foreground)]">Modelo 721 · Cripto en exchanges extranjeros</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Obligatorio si el valor total custodiado por proveedores NO residentes en España supera 50.000 € a 31/12.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="Saldo estimado en CEX extranjeros" value={formatEur(foreignBalance)} />
            <Stat label="Umbral 721" value={formatEur(MODELO_721_THRESHOLD)} />
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">Estado</p>
              <p className={`mt-1 text-lg font-semibold ${obligado721 ? "text-amber-300" : "text-emerald-300"}`}>
                {obligado721 ? "Posible obligación" : "No obligado"}
              </p>
            </div>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-[var(--muted)]">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            Estimación por flujo neto de compras/ventas en custodios extranjeros. El saldo real a 31/12 debe confirmarlo tu asesor con el valor de mercado de cada activo.
          </p>
        </section>

        <p className="text-[11px] leading-relaxed text-[var(--muted)]">{TRACEABILITY_DISCLAIMER}</p>
      </div>
    </>
  );
}

function BaseCard({
  label,
  value,
  note,
  dot,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  note: string;
  accent?: string;
  dot: string;
}) {
  // Gran número al estilo «Instrumento»: etiqueta con punto de color, cifra
  // grande en Archivo con los decimales y el € que susurran.
  const [intPart, decPart] = Math.abs(value)
    .toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .split(",");
  return (
    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--void-surface)] px-6 py-6">
      <p className="flex items-center gap-2 text-[10px] uppercase font-mono tracking-[0.18em] text-[var(--muted)]">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
        {label}
      </p>
      <p className="mt-3 font-designer text-5xl font-bold tracking-tight text-[var(--foreground)]">
        {value < 0 ? "−" : ""}
        {intPart}
        <span className="text-[0.5em] font-semibold text-[var(--ink-2)]">,{decPart}</span>
        <span className="ml-2 text-[0.42em] font-semibold text-[var(--muted)]">€</span>
      </p>
      <p className="mt-2 text-xs text-[var(--muted)]">{note}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="px-7 py-16 text-center text-sm text-[var(--muted)]">{message}</div>;
}
