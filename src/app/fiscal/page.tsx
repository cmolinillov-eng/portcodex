import Link from "next/link";
import { Download, Scale, Layers, Info } from "lucide-react";
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
  searchParams: Promise<{ portfolio?: string }>;
}) {
  const { portfolio } = await searchParams;
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

  const { entries } = await computeTraceability(portfolioId);

  const bucketInputs: AeatBucketInput[] = entries.map((e) => ({
    category: e.fiscal.category,
    incomeType: e.fiscal.incomeType,
    amountEur: isRendimiento(e.fiscal.incomeType) ? e.fiscal.valueEur : e.fiscal.realizedGainEur,
  }));

  const { buckets, totalBaseAhorro, totalBaseGeneral } = aggregateByCasilla(bucketInputs);

  // Modelo 721 — estimación por flujo neto en custodios extranjeros
  let foreignNet = 0;
  for (const e of entries) {
    if (!isForeignCustodian(e.walletKind)) continue;
    if (e.fiscal.category === "buy") foreignNet += e.fiscal.valueEur;
    else if (e.fiscal.category === "sell") foreignNet -= e.fiscal.valueEur;
  }
  const foreignBalance = Math.max(0, foreignNet);
  const obligado721 = foreignBalance > MODELO_721_THRESHOLD;

  return (
    <>
      <FiscalPageHeader
        title="Resumen fiscal"
        subtitle="Totales por casilla AEAT · orientativo"
        action={
          <Link
            href={`/fiscal/exportar${portfolio ? `?portfolio=${portfolio}` : ""}`}
            className="inline-flex items-center gap-2 rounded-lg border border-[rgba(160,210,255,0.45)] bg-[rgba(160,210,255,0.10)] px-3.5 py-2 text-sm font-medium text-[#A0D2FF] transition-colors hover:bg-[rgba(160,210,255,0.18)]"
          >
            <Download className="h-4 w-4" /> Exportar
          </Link>
        }
      />

      <div className="mx-auto max-w-5xl space-y-6 px-7 py-7">
        {/* Tarjetas base */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <BaseCard
            icon={<Scale className="h-5 w-5" />}
            label="Base del ahorro"
            value={totalBaseAhorro}
            note="GP transmisión/permuta + RCM + derivados"
            accent="rgba(16,185,129,0.5)"
          />
          <BaseCard
            icon={<Layers className="h-5 w-5" />}
            label="Base general"
            value={totalBaseGeneral}
            note="Airdrops · forks · salario · actividad"
            accent="rgba(245,158,11,0.5)"
          />
        </div>

        {/* Desglose por casilla */}
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--void-surface)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-[var(--foreground)]">Desglose por casilla IRPF</h2>
              <p className="mt-0.5 text-xs text-[var(--muted)]">Modelo 100 · agregado por categoría fiscal</p>
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
  icon,
  label,
  value,
  note,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  note: string;
  accent: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border bg-[var(--void-surface)] px-5 py-5"
      style={{ borderColor: accent }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
        <span className="text-[var(--muted)]">{icon}</span>
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--foreground)] tabular-nums">{formatEur(value)}</p>
      <p className="mt-1.5 text-xs text-[var(--muted)]">{note}</p>
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
