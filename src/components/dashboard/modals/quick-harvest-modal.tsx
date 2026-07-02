import { useState } from "react";
import { X } from "lucide-react";
import { currency } from "../utils/formatters";
import type { DefiPosition } from "@/types/portfolio";

export interface HarvestInfo {
  key: string;
  harvestedUsd: number;
  pendingUsd: number;
  pendingByToken: Array<{ tokenSymbol: string; amount: number }>;
}

export interface DepositTarget {
  key: string;
  label: string;
  positionId: string;
  protocol: string;
  positionType: string;
  availableTokens: string[];
}

interface QuickHarvestModalProps {
  isOpen: boolean;
  onClose: () => void;
  position: DefiPosition | null;
  harvestByPosition: HarvestInfo[];
  baseDepositTargets: DepositTarget[];
  onSuccess: () => void;
}

export function QuickHarvestModal({
  isOpen,
  onClose,
  position,
  harvestByPosition,
  baseDepositTargets,
  onSuccess,
}: QuickHarvestModalProps) {
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [reinvest, setReinvest] = useState(false);
  const [targetKey, setTargetKey] = useState("");
  const [targetToken, setTargetToken] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (!isOpen || !position) return null;

  async function handleSave() {
    if (!position) return;
    const cleanToken = token.trim().toUpperCase();
    const parsedAmount = Number(amount.replace(",", "."));
    
    if (!cleanToken) { setErrorMessage("Indica el token del harvest."); return; }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) { setErrorMessage("Indica la cantidad ganada en USD."); return; }

    const targetInfo = reinvest ? baseDepositTargets.find((t) => t.key === targetKey) : null;

    try {
      setErrorMessage("");
      setIsSaving(true);
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationType: "harvest",
          portfolioId: position.portfolioId,
          positionId: position.positionId,
          protocol: position.protocol,
          positionContextType: position.positionType,
          tokenSymbol: cleanToken,
          amount: parsedAmount,
          harvestSourcePositionId: position.positionId,
          harvestSourceProtocol: position.protocol,
          harvestNoReinvest: !reinvest,
          harvestTargetPositionId: targetInfo?.positionId ?? position.positionId,
          harvestTargetProtocol: targetInfo?.protocol ?? position.protocol,
          harvestTargetPositionType: targetInfo?.positionType ?? position.positionType,
          harvestTargetTokenSymbol: reinvest ? targetToken.trim().toUpperCase() : cleanToken,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Error al registrar harvest.");
      
      // Reset state on success
      setToken("");
      setAmount("");
      setReinvest(false);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative mx-4 flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
          <h2 className="text-lg font-semibold">Registrar Harvest</h2>
          <button type="button" onClick={() => { onClose(); setErrorMessage(""); }} className="text-[var(--muted)] hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <p className="text-xs text-[var(--muted)]">
            {position.tokenSymbol} · {position.protocol} · {position.positionId}
          </p>

          {harvestInfo ? (
            <div className="rounded-lg border border-[var(--line)] bg-black/20 px-3 py-2 text-xs">
              <span className="text-[var(--muted)]">Histórico harvest: </span>
              <span className="font-medium">{currency(harvestInfo.harvestedUsd)}</span>
              {harvestInfo.pendingByToken.length > 0 ? (
                <>
                  <span className="text-[var(--muted)]"> · Pendiente: </span>
                  <span className="font-medium text-amber-300">{currency(harvestInfo.pendingUsd)}</span>
                  <span className="text-[var(--muted)]"> ({harvestInfo.pendingByToken.map((t) => `${t.amount.toFixed(4)} ${t.tokenSymbol}`).join(", ")})</span>
                </>
              ) : null}
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-xs text-[var(--muted)]">Token del harvest</label>
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ej. ETH, USDC..."
              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--muted)]">Cantidad ganada (USD)</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-black/20 px-3 py-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={reinvest}
                onChange={(e) => setReinvest(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              Reinvertir ahora
            </label>
            {!reinvest ? (
              <span className="text-[10px] text-[var(--muted)]">Se acumulará como harvest pendiente</span>
            ) : null}
          </div>

          {reinvest ? (
            <div className="space-y-3 rounded-lg border border-[rgba(230,193,115,0.2)] bg-[rgba(230,193,115,0.05)] p-3">
              <div>
                <label className="mb-1 block text-xs text-[var(--muted)]">Posición destino</label>
                <select
                  value={targetKey}
                  onChange={(e) => {
                    setTargetKey(e.target.value);
                    const target = baseDepositTargets.find((t) => t.key === e.target.value);
                    if (target?.availableTokens[0]) setTargetToken(target.availableTokens[0]);
                  }}
                  className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 text-sm"
                >
                  {baseDepositTargets.map((target) => (
                    <option key={target.key} value={target.key}>{target.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--muted)]">Token destino</label>
                <input
                  type="text"
                  value={targetToken}
                  onChange={(e) => setTargetToken(e.target.value)}
                  placeholder="ej. ETH"
                  className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 text-sm"
                />
              </div>
            </div>
          ) : null}

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
            className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-50"
          >
            {isSaving ? "Guardando..." : (reinvest ? "Registrar y reinvertir" : "Solo acumular")}
          </button>
        </div>
      </div>
    </div>
  );
}
