"use client";

import { memo } from "react";
import { FileSpreadsheet } from "lucide-react";
import { currency } from "../utils/formatters";
import type { DashboardData } from "@/lib/dashboard/get-dashboard-data";

type RecentActivityEntry = DashboardData["recentActivity"][number];

interface RecentActivityProps {
  recentActivity: DashboardData["recentActivity"];
  visibleRecentActivity: DashboardData["recentActivity"];
  visibleRecentActivityCount: number;
  setIsCsvModalOpen: (open: boolean) => void;
  setVisibleRecentActivityCount: React.Dispatch<React.SetStateAction<number>>;
  /** El gestor puede deshacer operaciones. */
  canUndo?: boolean;
  /** Clave de la operación que se está deshaciendo (loading). */
  undoingKey?: string;
  onUndo?: (item: RecentActivityEntry, mode: "operation" | "restore") => void;
}

/**
 * Decide si una fila de actividad se puede deshacer y con qué modo:
 *  - "restore": un borrado de posición (snapshot position_closed con reason "deleted").
 *  - "operation": cualquier operación de usuario con grupo (añadir, rebalanceo,
 *    harvest, edición). Se excluyen los cierres automáticos (no son acciones del gestor).
 */
export function undoModeFor(item: RecentActivityEntry): "operation" | "restore" | null {
  if (item.type === "position_closed") {
    return item.reason === "deleted" ? "restore" : null;
  }
  if (item.reason === "auto_closed") return null;
  if (item.operationGroupId) return "operation";
  // Caso legacy sin grupo: permitir deshacer una alta simple por posición… no es
  // seguro sin grupo, así que solo ofrecemos undo cuando hay operationGroupId.
  return null;
}

export function undoKeyFor(item: RecentActivityEntry, mode: "operation" | "restore"): string {
  return mode === "restore"
    ? `restore:${item.portfolioId}:${item.protocol}:${item.positionId}`
    : `op:${item.portfolioId}:${item.operationGroupId}`;
}

// Human-readable labels + badge class per transaction type
const TX_META: Record<string, { label: string; badgeClass: string }> = {
  deposit:             { label: "Depósito",       badgeClass: "tx-badge tx-badge-deposit" },
  withdrawal:          { label: "Retiro",          badgeClass: "tx-badge tx-badge-withdrawal" },
  staking_deposit:     { label: "Staking",         badgeClass: "tx-badge tx-badge-staking_deposit" },
  staking_withdrawal:  { label: "Retiro Staking",  badgeClass: "tx-badge tx-badge-staking_withdrawal" },
  lp_deposit:          { label: "LP Depósito",     badgeClass: "tx-badge tx-badge-lp_deposit" },
  lp_withdraw:         { label: "LP Retiro",       badgeClass: "tx-badge tx-badge-lp_withdraw" },
  lending_supply:      { label: "Préstamo",        badgeClass: "tx-badge tx-badge-lending_supply" },
  lending_withdraw:    { label: "Ret. Préstamo",   badgeClass: "tx-badge tx-badge-lending_withdraw" },
  lending_borrow:      { label: "Crédito",         badgeClass: "tx-badge tx-badge-lending_borrow" },
  harvest:             { label: "Harvest",         badgeClass: "tx-badge tx-badge-harvest" },
  rebalance:           { label: "Rebalanceo",      badgeClass: "tx-badge tx-badge-rebalance" },
  position_closed:     { label: "Pos. Cerrada",    badgeClass: "tx-badge tx-badge-position_closed" },
};

const TxTypeBadge = memo(function TxTypeBadge({ type }: { type: string }) {
  const meta = TX_META[type] ?? { label: type, badgeClass: "tx-badge" };
  return <span className={meta.badgeClass}>{meta.label}</span>;
});

export function RecentActivity({
  recentActivity,
  visibleRecentActivity,
  visibleRecentActivityCount,
  setIsCsvModalOpen,
  setVisibleRecentActivityCount,
  canUndo = false,
  undoingKey = "",
  onUndo,
}: RecentActivityProps) {
  const showUndoCol = canUndo && typeof onUndo === "function";
  const colCount = showUndoCol ? 7 : 6;
  return (
    <section
      className="glass-panel page-section-card p-5 md:p-6 mb-6 animate-fade-up stagger-4"
      aria-label="Actividad reciente"
    >
      {/* Header */}
      <div className="section-header-row mb-5 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
          Actividad Reciente
        </h2>
        <button
          type="button"
          onClick={() => setIsCsvModalOpen(true)}
          className="btn-secondary px-4 py-2 text-sm font-medium"
          aria-label="Exportar operaciones en formato CSV"
        >
          <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
          Exportar CSV
        </button>
      </div>

      {/* Table */}
      <div className="page-table-shell overflow-hidden rounded-[1rem] border border-[var(--glass-border)]">
        <table className="w-full min-w-[980px] border-collapse">
          <thead className="bg-[rgba(10,18,40,0.55)] text-left backdrop-blur-md">
            <tr>
              <th scope="col" className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">FECHA</th>
              <th scope="col" className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">TIPO</th>
              <th scope="col" className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">POSICIÓN</th>
              <th scope="col" className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">TOKENS</th>
              <th scope="col" className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">DETALLE</th>
              <th scope="col" className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">PRECIO</th>
              {showUndoCol ? (
                <th scope="col" className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">ACCIÓN</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {recentActivity.length === 0 ? (
              <tr>
                <td className="px-6 py-10 text-center" colSpan={colCount}>
                  <div className="flex flex-col items-center gap-2 text-[var(--muted)]">
                    <div
                      className="h-10 w-10 rounded-full border border-[var(--line)] bg-[rgba(160,210,255,0.05)] flex items-center justify-center"
                      aria-hidden="true"
                    >
                      <FileSpreadsheet className="h-5 w-5 opacity-40" />
                    </div>
                    <p className="text-sm">Sin movimientos en este portfolio.</p>
                  </div>
                </td>
              </tr>
            ) : (
              visibleRecentActivity.map((item, index) => (
                <tr
                  key={`${item.transactionDate}-${item.positionId}-${item.type}-${item.tokenInSymbol}-${item.tokenOutSymbol}-${index}`}
                  className="border-t border-[var(--line)]"
                >
                  {/* Date */}
                  <td className="px-4 py-3.5 text-sm text-[var(--muted)] whitespace-nowrap">
                    {item.transactionDate
                      ? new Date(item.transactionDate).toLocaleString("es-ES", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>

                  {/* Type + harvest reinvest indicator */}
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col gap-1">
                      <TxTypeBadge type={item.type || ""} />
                      {item.movementOrigin === "harvest_reinvest" ? (
                        <span className="inline-flex rounded-full border border-[rgba(16,185,129,0.35)] bg-[rgba(16,185,129,0.08)] px-2 py-0.5 text-[10px] text-emerald-300">
                          Reinv. harvest
                        </span>
                      ) : null}
                    </div>
                  </td>

                  {/* Position */}
                  <td className="px-4 py-3.5">
                    <div className="text-sm font-medium text-[var(--foreground)]">{item.positionId || "—"}</div>
                    <div className="text-xs text-[var(--muted)]">{item.protocol}</div>
                    {item.operationGroupId ? (
                      <div className="text-[10px] text-[var(--muted)] opacity-50 font-mono">
                        {item.operationGroupId.slice(0, 8)}…
                      </div>
                    ) : null}
                  </td>

                  {/* Tokens */}
                  <td className="px-4 py-3.5 text-sm font-mono text-[var(--foreground)]">
                    {[item.tokenInSymbol, item.tokenOutSymbol].filter((t) => t.length > 0).join(" / ") || "—"}
                  </td>

                  {/* Detail */}
                  <td className="px-4 py-3.5 text-sm text-[var(--foreground)]">
                    <div className="space-y-0.5">
                      {item.tokenInSymbol ? (
                        <p>
                          <span className="text-emerald-400 text-xs font-medium">IN</span>{" "}
                          <span className="font-mono">{item.tokenInAmount.toLocaleString("en-US")}</span>{" "}
                          <span className="text-[var(--accent)]">{item.tokenInSymbol}</span>
                        </p>
                      ) : null}
                      {item.tokenOutSymbol ? (
                        <p>
                          <span className="text-rose-400 text-xs font-medium">OUT</span>{" "}
                          <span className="font-mono">{item.tokenOutAmount.toLocaleString("en-US")}</span>{" "}
                          <span className="text-[var(--accent)]">{item.tokenOutSymbol}</span>
                        </p>
                      ) : null}
                      {!item.tokenInSymbol && !item.tokenOutSymbol ? <span className="text-[var(--muted)]">—</span> : null}
                    </div>
                  </td>

                  {/* Price */}
                  <td className="px-4 py-3.5 text-sm font-mono text-[var(--muted)]">
                    {item.spotPrice > 0 ? currency(item.spotPrice) : "—"}
                  </td>

                  {/* Acción: deshacer (solo gestor) */}
                  {showUndoCol ? (
                    (() => {
                      const mode = undoModeFor(item);
                      if (!mode) {
                        return <td className="px-4 py-3.5" />;
                      }
                      const key = undoKeyFor(item, mode);
                      const busy = undoingKey === key;
                      return (
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onUndo?.(item, mode)}
                            className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
                            aria-label={mode === "restore" ? "Deshacer borrado de posición" : "Deshacer operación"}
                            title={mode === "restore" ? "Restaurar la posición borrada" : "Deshacer esta operación"}
                          >
                            {busy ? "Deshaciendo…" : "Deshacer"}
                          </button>
                        </td>
                      );
                    })()
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Load more */}
      {recentActivity.length > visibleRecentActivityCount ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleRecentActivityCount((c) => c + 10)}
            className="btn-secondary px-5 py-2 text-sm"
            aria-label="Ver 10 movimientos anteriores"
          >
            Ver movimientos anteriores
          </button>
        </div>
      ) : null}
    </section>
  );
}
