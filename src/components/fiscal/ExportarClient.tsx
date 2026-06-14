"use client";

import { FileSpreadsheet, FileJson, Download } from "lucide-react";
import type { TraceabilityEntry } from "@/lib/tax/compute-traceability";
import { buildTraceabilityCsv, buildCointrackingCsv, downloadCsv, downloadJson } from "@/lib/fiscal/csv";

const TRACE_COLUMNS = [
  "Fecha",
  "Tipo operación",
  "Billetera (centralizada/descentralizada)",
  "Protocolo",
  "Activo entra / sale",
  "Cantidades",
  "Valor EUR",
  "Coste EUR (FIFO)",
  "Ganancia/Pérdida EUR",
  "Categoría fiscal",
  "Casilla AEAT",
  "Base imponible",
  "Imponible (Sí/No)",
  "Notas",
];

export function ExportarClient({ entries }: { entries: TraceabilityEntry[] }) {
  const stamp = new Date().toISOString().slice(0, 10);
  const disabled = entries.length === 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-7 py-7">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* CSV CoinTracking */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--void-surface)] p-5">
          <div className="flex items-center gap-2 text-[#A0D2FF]">
            <FileSpreadsheet className="h-5 w-5" />
            <h2 className="text-sm font-semibold text-[var(--foreground)]">CSV CoinTracking (recomendado)</h2>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Formato estándar que aceptan la mayoría de gestores fiscales en España.
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => downloadCsv(buildCointrackingCsv(entries), `cointracking-${stamp}.csv`)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-[rgba(160,210,255,0.5)] bg-[rgba(160,210,255,0.12)] px-4 py-2.5 text-sm font-medium text-[#A0D2FF] transition-colors hover:bg-[rgba(160,210,255,0.2)] disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Descargar CSV
          </button>
        </div>

        {/* JSON backup */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--void-surface)] p-5">
          <div className="flex items-center gap-2 text-[#D4C5FF]">
            <FileJson className="h-5 w-5" />
            <h2 className="text-sm font-semibold text-[var(--foreground)]">JSON completo (backup)</h2>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Copia de seguridad con todos los campos de trazabilidad calculados.
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => downloadJson(entries, `trazabilidad-${stamp}.json`)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--void-elevated)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors hover:border-[rgba(186,160,255,0.45)] disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Descargar JSON
          </button>
        </div>
      </div>

      {/* CSV trazabilidad completa */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--void-surface)] p-5">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">CSV trazabilidad fiscal completa</h2>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Incluye categoría fiscal, casilla AEAT y base imponible de cada movimiento. Útil para entregar al asesor.
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => downloadCsv(buildTraceabilityCsv(entries), `trazabilidad-fiscal-${stamp}.csv`)}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--void-elevated)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors hover:border-[rgba(160,210,255,0.45)] disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Descargar CSV completo
        </button>
      </div>

      {/* Columnas */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--void-surface)] p-5">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Columnas del CSV completo</h2>
        <div className="mt-3 grid grid-cols-1 gap-y-2 sm:grid-cols-2">
          {TRACE_COLUMNS.map((c) => (
            <span key={c} className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-primary)]" />
              {c}
            </span>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-[var(--muted)]">
        {entries.length} movimientos disponibles para exportar. La clasificación es orientativa de trazabilidad, no
        constituye asesoramiento fiscal.
      </p>
    </div>
  );
}
