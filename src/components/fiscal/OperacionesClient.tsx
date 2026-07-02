"use client";

import { useMemo, useState } from "react";
import { Search, Download, ArrowLeftRight, Building2, Globe } from "lucide-react";
import type { TraceabilityEntry } from "@/lib/tax/compute-traceability";
import {
  getAeatClassification,
  getCustodyClass,
  type CustodyClass,
} from "@/lib/tax/aeat-mapping";
import { FiscalBadge } from "./FiscalBadge";
import { formatDate, formatEur, formatAmount } from "@/lib/fiscal/format";
import { buildTraceabilityCsv, downloadCsv } from "@/lib/fiscal/csv";

const OPERATION_LABEL: Record<string, string> = {
  deposit: "Depósito",
  withdrawal: "Retirada",
  lp_deposit: "Añadir liquidez",
  lp_withdraw: "Retirar liquidez",
  staking_deposit: "Stake",
  staking_withdrawal: "Unstake",
  lending_supply: "Depositar (supply)",
  lending_withdraw: "Retirar + intereses",
  lending_borrow: "Préstamo",
  harvest: "Harvest rewards",
  position_closed: "Cerrar posición",
  swap: "Swap",
};

function operationLabel(type: string): string {
  return OPERATION_LABEL[type.toLowerCase()] ?? type;
}

function assetsLabel(e: TraceabilityEntry): string {
  const inn = e.tokenInSymbol && e.tokenInAmount ? `${formatAmount(e.tokenInAmount)} ${e.tokenInSymbol}` : "";
  const out = e.tokenOutSymbol && e.tokenOutAmount ? `${formatAmount(e.tokenOutAmount)} ${e.tokenOutSymbol}` : "";
  if (inn && out) return `${out} → ${inn}`;
  return inn || out || "—";
}

const CUSTODY_FILTERS: Array<{ value: CustodyClass | "todas"; label: string }> = [
  { value: "todas", label: "Todas las billeteras" },
  { value: "centralizada", label: "Centralizada (CEX)" },
  { value: "descentralizada", label: "Descentralizada" },
];

export function OperacionesClient({ entries }: { entries: TraceabilityEntry[] }) {
  const [custody, setCustody] = useState<CustodyClass | "todas">("todas");
  const [fiscalFilter, setFiscalFilter] = useState<string>("todas");
  const [query, setQuery] = useState("");

  // Badges presentes (para el desplegable de categoría fiscal)
  const fiscalOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      set.add(getAeatClassification(e.fiscal.category, e.fiscal.incomeType, e.fiscal.realizedGainEur).badge);
    }
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (custody !== "todas" && getCustodyClass(e.walletKind) !== custody) return false;
      const cls = getAeatClassification(e.fiscal.category, e.fiscal.incomeType, e.fiscal.realizedGainEur);
      if (fiscalFilter !== "todas" && cls.badge !== fiscalFilter) return false;
      if (q) {
        const hay = `${e.protocol} ${e.tokenInSymbol ?? ""} ${e.tokenOutSymbol ?? ""} ${e.notes ?? ""} ${operationLabel(e.type)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, custody, fiscalFilter, query]);

  function exportCsv() {
    downloadCsv(buildTraceabilityCsv(filtered), `operaciones-fiscal-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  return (
    <div className="px-7 py-6">
      {/* Filtros */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select
          value={custody}
          onChange={(e) => setCustody(e.target.value as CustodyClass | "todas")}
          className="rounded-lg border border-[var(--line)] bg-[var(--void-surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[rgba(230,193,115,0.55)] focus:outline-none"
        >
          {CUSTODY_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        <select
          value={fiscalFilter}
          onChange={(e) => setFiscalFilter(e.target.value)}
          className="rounded-lg border border-[var(--line)] bg-[var(--void-surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[rgba(230,193,115,0.55)] focus:outline-none"
        >
          <option value="todas">Todas las categorías fiscales</option>
          {fiscalOptions.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar protocolo, token, nota…"
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--void-surface)] py-2 pl-9 pr-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-[rgba(230,193,115,0.55)] focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--void-surface)] px-3.5 py-2 text-sm text-[var(--foreground)] transition-colors hover:border-[rgba(230,193,115,0.45)] disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> CSV
        </button>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--void-surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                <th className="px-5 py-3 font-medium">Fecha</th>
                <th className="px-5 py-3 font-medium">Operación</th>
                <th className="px-5 py-3 font-medium">Activos</th>
                <th className="px-5 py-3 font-medium">Protocolo</th>
                <th className="px-5 py-3 text-right font-medium">Valor EUR</th>
                <th className="px-5 py-3 font-medium">Fiscal</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-[var(--muted)]">
                    No hay operaciones que coincidan con los filtros.
                  </td>
                </tr>
              ) : (
                filtered.map((e) => {
                  const cls = getAeatClassification(e.fiscal.category, e.fiscal.incomeType, e.fiscal.realizedGainEur);
                  const custodyClass = getCustodyClass(e.walletKind);
                  return (
                    <tr key={e.id} className="border-b border-[var(--line)]/60 last:border-0 hover:bg-white/[0.02]">
                      <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-[var(--muted)]">
                        {formatDate(e.transactionDate)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="flex items-center gap-2 text-[var(--foreground)]">
                          <ArrowLeftRight className="h-3.5 w-3.5 text-[var(--muted)]" />
                          {operationLabel(e.type)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-[var(--foreground)]">
                        {assetsLabel(e)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="flex items-center gap-2 text-[var(--foreground)]">
                          {e.protocol}
                          {custodyClass !== "desconocida" ? (
                            <span
                              className={`inline-flex items-center gap-1 whitespace-nowrap text-[9px] uppercase tracking-wide ${
                                custodyClass === "centralizada"
                                  ? "text-amber-300/90"
                                  : "text-emerald-300/90"
                              }`}
                              title={custodyClass === "centralizada" ? "Billetera centralizada (CEX/bróker)" : "Billetera descentralizada (autocustodia/DEX)"}
                            >
                              {custodyClass === "centralizada" ? <Building2 className="h-2.5 w-2.5" /> : <Globe className="h-2.5 w-2.5" />}
                              {custodyClass === "centralizada" ? "CEX" : "DeFi"}
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-right font-medium tabular-nums text-[var(--foreground)]">
                        {formatEur(e.fiscal.valueEur)}
                      </td>
                      <td className="px-5 py-3.5">
                        <FiscalBadge tone={cls.tone} label={cls.badge} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-[var(--muted)]">
        {filtered.length} de {entries.length} operaciones · clasificación orientativa de trazabilidad.
      </p>
    </div>
  );
}
