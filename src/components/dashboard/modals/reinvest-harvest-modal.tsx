import { useState } from "react";
import { currency } from "../utils/formatters";
import type { DefiPosition } from "@/types/portfolio";
import type { HarvestInfo, DepositTarget } from "./quick-harvest-modal";

interface ReinvestHarvestModalProps {
  isOpen: boolean;
  onClose: () => void;
  position: DefiPosition | null;
  harvestByPosition: HarvestInfo[];
  baseDepositTargets: DepositTarget[];
  onSuccess: () => void;
}

export function ReinvestHarvestModal({
  isOpen,
  onClose,
  position,
  harvestByPosition,
  baseDepositTargets,
  onSuccess,
}: ReinvestHarvestModalProps) {
  const [amount, setAmount] = useState("");
  const [targetKey, setTargetKey] = useState("");
  const [targetToken, setTargetToken] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (!isOpen || !position) return null;

  async function handleSave() {
    if (!position) return;
    const parsedAmount = Number(amount.replace(",", "."));

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) { setErrorMessage("Indica la cantidad en USD."); return; }
    if (!targetKey) { setErrorMessage("Selecciona una posición destino."); return; }
    const cleanTargetToken = targetToken.trim().toUpperCase();
    if (!cleanTargetToken) { setErrorMessage("Indica el token a depositar en destino."); return; }

    const targetInfo = baseDepositTargets.find((t) => t.key === targetKey);

    try {
      setErrorMessage("");
      setIsSaving(true);
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationType: "reinvest_harvest",
          portfolioId: position.portfolioId,
          positionId: targetInfo?.positionId ?? position.positionId,
          protocol: targetInfo?.protocol ?? position.protocol,
          positionContextType: targetInfo?.positionType ?? position.positionType,
          tokenSymbol: cleanTargetToken,
          amount: parsedAmount,
          harvestSourcePositionId: position.positionId,
          harvestSourceProtocol: position.protocol,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Error al reinvertir harvest.");

      // Reset state
      setAmount("");
      setTargetKey("");
      setTargetToken("");

      onSuccess();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Error desconocido.");
    } finally {
      setIsSaving(false);
    }
  }

  const posKey = `${position.portfolioId}::${position.protocol}::${position.positionId}`;
  const harvestInfo = harvestByPosition.find((h) => h.key === posKey);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex-shrink-0 border-b border-[var(--line)] px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Reinvertir Harvest</h2>
          <button type="button" onClick={() => { onClose(); setErrorMessage(""); }} className="text-[var(--muted)] hover:text-white">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <p className="text-xs text-[var(--muted)]">
            Origen: {position.tokenSymbol} · {position.protocol} · {position.positionId}
          </p>

          {(() => {
            if (!harvestInfo || harvestInfo.pendingUsd <= 0) {
              return <p className="text-xs text-rose-400">No hay harvest pendiente en esta posición.</p>;
            }
            return (
              <div className="rounded-lg border border-[rgba(157,80,187,0.35)] bg-[rgba(157,80,187,0.08)] px-3 py-2 text-xs text-[var(--muted)]">
                <div>Harvest pendiente: <span className="text-white font-medium">{currency(harvestInfo.pendingUsd)}</span></div>
                {harvestInfo.pendingByToken.length > 0 ? (
                  <div className="mt-1 text-[11px] opacity-80">
                    {harvestInfo.pendingByToken.map((t) => `${t.amount.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${t.tokenSymbol}`).join(" + ")}
                  </div>
                ) : null}
              </div>
            );
          })()}

          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">Cantidad a reinvertir (USD)</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">Posición destino</label>
            <select
              value={targetKey}
              onChange={(e) => {
                setTargetKey(e.target.value);
                const target = baseDepositTargets.find((t) => t.key === e.target.value);
                if (target?.availableTokens[0]) setTargetToken(target.availableTokens[0]);
              }}
              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 text-sm"
            >
              <option value="">— Selecciona —</option>
              {baseDepositTargets.map((target) => (
                <option key={target.key} value={target.key}>{target.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">Token a depositar</label>
            <input
              type="text"
              value={targetToken}
              onChange={(e) => setTargetToken(e.target.value)}
              placeholder="ej. ETH"
              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 text-sm"
            />
          </div>

          {errorMessage ? (
            <p className="text-xs text-rose-400">{errorMessage}</p>
          ) : null}
        </div>

        <div className="flex-shrink-0 border-t border-[var(--line)] px-6 py-4 flex gap-3">
          <button
            type="button"
            onClick={() => { onClose(); setErrorMessage(""); }}
            className="flex-1 rounded-lg border border-[var(--line)] px-4 py-2 text-sm hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 rounded-lg bg-[rgba(157,80,187,0.9)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {isSaving ? "Guardando..." : "Reinvertir"}
          </button>
        </div>
      </div>
    </div>
  );
}
