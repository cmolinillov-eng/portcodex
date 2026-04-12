import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { currency, signedCurrency } from "../utils/formatters";

export interface HistoryRow {
  tokenSymbol: string;
  protocol: string;
  positionId: string;
  positionType: string;
  closedAt: string;
  reason: string;
  totalDeposited: number;
  valueAtClose: number;
  realizedPnl: number;
  destToken?: string;
}

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HistoryModal({ isOpen, onClose }: HistoryModalProps) {
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    async function loadHistory() {
      setIsLoading(true);
      try {
        const response = await fetch("/api/positions/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const json = await response.json();
        const rows = (json.data ?? []) as Array<{
          token_in_symbol?: string;
          protocol?: string;
          position_id?: string;
          position_type?: string;
          transaction_date?: string;
          metadata?: {
            closure?: {
              totalDeposited?: number;
              valueAtClose?: number;
              realizedPnl?: number;
              reason?: string;
              closedAt?: string;
              destToken?: string;
            };
          };
        }>;
        setHistoryRows(
          rows
            .filter((r) => r.metadata?.closure)
            .map((r) => {
              const c = r.metadata!.closure!;
              return {
                tokenSymbol: r.token_in_symbol ?? "",
                protocol: r.protocol ?? "",
                positionId: r.position_id ?? "",
                positionType: r.position_type ?? "",
                closedAt: c.closedAt ?? r.transaction_date ?? "",
                reason: c.reason ?? "deleted",
                totalDeposited: c.totalDeposited ?? 0,
                valueAtClose: c.valueAtClose ?? 0,
                realizedPnl: c.realizedPnl ?? 0,
                destToken: c.destToken,
              };
            })
        );
      } catch {
        setHistoryRows([]);
      } finally {
        setIsLoading(false);
      }
    }

    loadHistory();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="card-premium flex w-full max-w-3xl flex-col rounded-2xl" style={{ maxHeight: "90vh" }}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--line)] px-6 py-4">
          <div>
            <h3 className="text-xl font-semibold">Historial de posiciones cerradas</h3>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Registro de posiciones eliminadas y rebalanceadas con su P&L realizado.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--muted)] hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-[var(--muted)]">Cargando historial...</p>
          ) : historyRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--muted)]">
              No hay posiciones cerradas en el historial.
            </p>
          ) : (
            <div className="space-y-3">
              {/* Summary */}
              <div className="rounded-xl border border-[var(--line)] bg-black/20 px-4 py-3">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--muted)]">Posiciones cerradas</div>
                    <p className="mt-1 text-lg font-semibold">{historyRows.length}</p>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--muted)]">Total depositado</div>
                    <p className="mt-1 text-lg font-semibold">
                      {currency(historyRows.reduce((a, r) => a + r.totalDeposited, 0))}
                    </p>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--muted)]">P&L realizado total</div>
                    {(() => {
                      const total = historyRows.reduce((a, r) => a + r.realizedPnl, 0);
                      return (
                        <p className={`mt-1 text-lg font-semibold ${total >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                          {signedCurrency(total)}
                        </p>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Individual rows */}
              {historyRows.map((row, index) => (
                <div
                  key={`${row.positionId}-${row.closedAt}-${index}`}
                  className="rounded-xl border border-[var(--line)] bg-black/20 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{row.tokenSymbol}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          row.reason === "rebalanced"
                            ? "bg-blue-500/20 text-blue-300"
                            : "bg-red-500/20 text-red-300"
                        }`}>
                          {row.reason === "rebalanced" ? "Rebalanceado" : "Eliminado"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {row.protocol} · {row.positionType}
                        {row.reason === "rebalanced" && row.destToken ? ` → ${row.destToken}` : ""}
                      </p>
                      <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                        {row.closedAt ? new Date(row.closedAt).toLocaleString("es-ES") : "—"}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-[9px] uppercase text-[var(--muted)]">Depositado</div>
                          <p className="font-medium">{currency(row.totalDeposited)}</p>
                        </div>
                        <div>
                          <div className="text-[9px] uppercase text-[var(--muted)]">Valor cierre</div>
                          <p className="font-medium">{currency(row.valueAtClose)}</p>
                        </div>
                      </div>
                      <div className="mt-1">
                        <div className="text-[9px] uppercase text-[var(--muted)]">P&L realizado</div>
                        <p className={`text-sm font-semibold ${row.realizedPnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                          {signedCurrency(row.realizedPnl)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 border-t border-[var(--line)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-[var(--line)] px-4 py-2 text-sm hover:bg-white/5"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
