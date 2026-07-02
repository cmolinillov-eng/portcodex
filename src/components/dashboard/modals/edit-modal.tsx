import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { currency } from "../utils/formatters";
import type { DefiPosition } from "@/types/portfolio";

interface EditModalProps {
  isOpen: boolean;
  onClose: () => void;
  position: DefiPosition | null;
  tokenPriceMap: Map<string, number>;
  onSuccess: () => void;
}

export function EditModal({
  isOpen,
  onClose,
  position,
  tokenPriceMap,
  onSuccess,
}: EditModalProps) {
  const [activeTab, setActiveTab] = useState<"edit" | "lending">("edit");
  const [errorMessage, setErrorMessage] = useState("");

  const [editForm, setEditForm] = useState({
    tokenSymbol: "",
    amount: "",
    entryPrice: "",
    lpTokenSymbolB: "",
    lpAmountB: "",
    lpEntryPriceB: "",
    lpRangeLower: "",
    lpRangeUpper: "",
    isCorrelated: false,
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [lendingAdjustType, setLendingAdjustType] = useState<
    "add_collateral" | "remove_collateral" | "add_debt" | "repay_debt"
  >("add_collateral");
  const [lendingToken, setLendingToken] = useState("");
  const [lendingAmount, setLendingAmount] = useState("");
  const [isSavingLending, setIsSavingLending] = useState(false);

  useEffect(() => {
    if (isOpen && position) {
      const isLp = position.positionType.toLowerCase().includes("liquidity") || position.positionType.toLowerCase().includes("pool");
      const tokens = position.tokenSymbol.split("/").map((t) => t.trim());
      
      setEditForm({
        tokenSymbol: tokens[0] ?? position.tokenSymbol,
        amount: position.currentBalance > 0 ? String(position.currentBalance) : (position.balanceLabel?.split("+")[0]?.replace(/[^0-9.,]/g, "").trim() ?? ""),
        entryPrice: position.averageEntryPrice > 0 ? String(position.averageEntryPrice) : "",
        lpTokenSymbolB: isLp && tokens[1] ? tokens[1] : "",
        lpAmountB: isLp && position.balanceLabel ? (position.balanceLabel.split("+")[1]?.replace(/[^0-9.,]/g, "").trim() ?? "") : "",
        lpEntryPriceB: "",
        lpRangeLower: position.lpRangeLabel?.match(/Rango\s+([\d.,]+)/)?.[1]?.replace(",", "") ?? "",
        lpRangeUpper: position.lpRangeLabel?.match(/-\s+([\d.,]+)/)?.[1]?.replace(",", "") ?? "",
        isCorrelated: position.lpRangeStatus === "correlated",
      });
      setErrorMessage("");
      setActiveTab("edit");
      setLendingAdjustType("add_collateral");
      setLendingToken("");
      setLendingAmount("");
    }
  }, [isOpen, position]);

  if (!isOpen || !position) return null;

  async function handleSaveEdit() {
    if (!position) return;
    const isLp = position.positionType.toLowerCase().includes("liquidity") || position.positionType.toLowerCase().includes("pool");
    const amount = Number(editForm.amount.replace(",", "."));
    const entryPrice = Number(editForm.entryPrice.replace(",", "."));

    if (!Number.isFinite(amount) || amount < 0) {
      setErrorMessage("Cantidad inválida.");
      return;
    }
    if (!Number.isFinite(entryPrice) || entryPrice < 0) {
      setErrorMessage("Precio de entrada inválido.");
      return;
    }

    try {
      setErrorMessage("");
      setIsSavingEdit(true);
      const payload: Record<string, unknown> = {
        portfolioId: position.portfolioId,
        protocol: position.protocol,
        positionId: position.positionId,
        positionType: position.positionType,
        tokenSymbol: editForm.tokenSymbol.trim().toUpperCase(),
        amount,
        entryPrice,
      };

      if (isLp) {
        payload.lpTokenSymbolB = editForm.lpTokenSymbolB.trim().toUpperCase();
        payload.lpAmountB = Number(editForm.lpAmountB.replace(",", "."));
        payload.lpEntryPriceB = editForm.lpEntryPriceB ? Number(editForm.lpEntryPriceB.replace(",", ".")) : 0;
        payload.lpRangeLower = editForm.lpRangeLower ? Number(editForm.lpRangeLower.replace(",", ".")) : null;
        payload.lpRangeUpper = editForm.lpRangeUpper ? Number(editForm.lpRangeUpper.replace(",", ".")) : null;
        payload.isCorrelated = editForm.isCorrelated;
        if (!payload.lpTokenSymbolB) throw new Error("Falta el TOKEN B del LP.");
        if (!Number.isFinite(payload.lpAmountB) || (payload.lpAmountB as number) < 0) throw new Error("Cantidad B del LP inválida.");
      }

      const response = await fetch("/api/positions/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "No se pudo actualizar la posición.");
      
      onSuccess();
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Error modificando posición.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleSaveLending() {
    if (!position) return;
    const token = lendingToken.trim().toUpperCase();
    const amount = Number(lendingAmount.replace(",", "."));
    if (!token) { setErrorMessage("Indica el token."); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setErrorMessage("Indica una cantidad válida."); return; }

    try {
      setErrorMessage("");
      setIsSavingLending(true);
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationType: "lending_adjust",
          portfolioId: position.portfolioId,
          positionId: position.positionId,
          protocol: position.protocol,
          lendingAdjustType,
          lendingAdjustToken: token,
          lendingAdjustAmount: amount,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Error al ajustar posición lending.");
      
      onSuccess();
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Error desconocido.");
    } finally {
      setIsSavingLending(false);
    }
  }

  const isLending = position.positionType.toLowerCase().includes("lending");
  const isLp = position.positionType.toLowerCase().includes("liquidity") || position.positionType.toLowerCase().includes("pool");
  const adjustLabels: Record<string, { label: string; color: string; bg: string; border: string }> = {
    add_collateral: { label: "+Colateral", color: "text-[#E6C173]", bg: "bg-[rgba(230,193,115,0.1)]", border: "border-[rgba(230,193,115,0.3)]" },
    remove_collateral: { label: "−Colateral", color: "text-rose-300", bg: "bg-rose-500/10", border: "border-rose-500/30" },
    add_debt: { label: "+Préstamo", color: "text-amber-300", bg: "bg-amber-500/10", border: "border-amber-500/30" },
    repay_debt: { label: "−Préstamo", color: "text-indigo-300", bg: "bg-indigo-500/10", border: "border-indigo-500/30" },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="card-premium w-full max-w-lg rounded-2xl p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            Modificar posición · {position.tokenSymbol}
          </h3>
          <button type="button" onClick={() => { onClose(); setErrorMessage(""); }} className="text-[var(--muted)] hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLending ? (
          <div className="mb-6 flex space-x-2 border-b border-[var(--line)] px-1">
            <button
              type="button"
              onClick={() => { setActiveTab("edit"); setErrorMessage(""); }}
              className={`pb-2 text-sm font-medium transition ${
                activeTab === "edit"
                  ? "border-b-2 border-white text-white"
                  : "border-b-2 border-transparent text-[var(--muted)] hover:text-white"
              }`}
            >
              Datos Base
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab("lending"); setErrorMessage(""); }}
              className={`pb-2 text-sm font-medium transition ${
                activeTab === "lending"
                  ? "border-b-2 border-white text-white"
                  : "border-b-2 border-transparent text-[var(--muted)] hover:text-white"
              }`}
            >
              Ajustar Lending
            </button>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mb-4 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">
            {errorMessage}
          </div>
        ) : null}

        {activeTab === "edit" ? (
          <>
            <div className="space-y-4">
              <p className="text-xs text-[var(--muted)]">
                {position.protocol} · {position.positionId}
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="mb-1 block text-sm text-[var(--muted)]">{isLp ? "Token A" : "Token"}</span>
                  <input
                    type="text"
                    className="input-base w-full"
                    placeholder="ej: ETH"
                    value={editForm.tokenSymbol}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, tokenSymbol: e.target.value }))}
                  />
                </div>
                <div>
                  <span className="mb-1 block text-sm text-[var(--muted)]">Cantidad</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input-base w-full"
                    placeholder="ej: 1.5"
                    value={editForm.amount}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, amount: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <span className="mb-1 block text-sm text-[var(--muted)]">{isLp ? "Precio Entrada Token A (USD)" : "Precio de Entrada (USD)"}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="input-base w-full"
                  placeholder="ej: 1800.50"
                  value={editForm.entryPrice}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, entryPrice: e.target.value }))}
                />
              </div>

              {isLp ? (
                <>
                  <div className="mb-2 mt-6 border-t border-[var(--line)] pt-4">
                    <h4 className="text-sm font-semibold">Ajustes Liquidity Pool</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="mb-1 block text-sm text-[var(--muted)]">Token B</span>
                      <input
                        type="text"
                        className="input-base w-full"
                        placeholder="ej: USDC"
                        value={editForm.lpTokenSymbolB}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, lpTokenSymbolB: e.target.value }))}
                      />
                    </div>
                    <div>
                      <span className="mb-1 block text-sm text-[var(--muted)]">Cantidad B</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="input-base w-full"
                        placeholder="ej: 2500"
                        value={editForm.lpAmountB}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, lpAmountB: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <span className="mb-1 block text-sm text-[var(--muted)]">Precio Entrada Token B (USD)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="input-base w-full"
                      placeholder="ej: 1.00"
                      value={editForm.lpEntryPriceB}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, lpEntryPriceB: e.target.value }))}
                    />
                  </div>
                  <div className="mt-3">
                    <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-[var(--line)] bg-black/30 accent-[var(--brand)]"
                        checked={editForm.isCorrelated}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, isCorrelated: e.target.checked }))}
                      />
                      Activos Correlacionados (estable)
                    </label>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-4">
                    <div>
                      <span className="mb-1 block text-sm text-[var(--muted)]">Rango min (caro/barato)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="input-base w-full"
                        placeholder="ej: 15.0"
                        value={editForm.lpRangeLower}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, lpRangeLower: e.target.value }))}
                      />
                    </div>
                    <div>
                      <span className="mb-1 block text-sm text-[var(--muted)]">Rango máx (caro/barato)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="input-base w-full"
                        placeholder="ej: 25.0"
                        value={editForm.lpRangeUpper}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, lpRangeUpper: e.target.value }))}
                      />
                    </div>
                  </div>
                </  >
              ) : null}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="flex-1 rounded-lg py-2 text-sm font-semibold text-[var(--background)] transition"
                style={{ background: "var(--brand)" }}
              >
                {isSavingEdit ? "Guardando..." : "Guardar cambios"}
              </button>
              <button
                type="button"
                onClick={() => { onClose(); setErrorMessage(""); }}
                className="btn-secondary flex-1 py-2 text-sm font-semibold"
              >
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-4">
              <p className="text-xs text-[var(--muted)]">
                {position.tokenSymbol} · {position.protocol} · {position.positionId}
              </p>

              <div className="grid grid-cols-2 gap-2">
                {(["add_collateral", "remove_collateral", "add_debt", "repay_debt"] as const).map((type) => {
                  const info = adjustLabels[type];
                  const isActive = lendingAdjustType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => { setLendingAdjustType(type); setErrorMessage(""); }}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        isActive
                          ? `${info.border} ${info.bg} ${info.color} ring-1 ring-current`
                          : "border-[var(--line)] text-[var(--muted)] hover:border-white/20 hover:text-white"
                      }`}
                    >
                      {info.label}
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="mb-1 block text-xs text-[var(--muted)]">Token</label>
                <input
                  type="text"
                  value={lendingToken}
                  onChange={(e) => setLendingToken(e.target.value)}
                  placeholder="ej. USDC, ETH..."
                  className="input-base w-full"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-[var(--muted)]">Cantidad</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={lendingAmount}
                  onChange={(e) => setLendingAmount(e.target.value)}
                  placeholder="0.00"
                  className="input-base w-full"
                />
                {lendingToken.trim() && Number(lendingAmount.replace(",", ".")) > 0 ? (
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    ≈ {currency(Number(lendingAmount.replace(",", ".")) * (tokenPriceMap.get(lendingToken.trim().toUpperCase()) ?? 0))}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleSaveLending}
                disabled={isSavingLending}
                className="flex-1 rounded-lg py-2 text-sm font-semibold text-[var(--background)] transition"
                style={{ background: "var(--brand)" }}
              >
                {isSavingLending ? "Guardando..." : `Aplicar ${adjustLabels[lendingAdjustType].label}`}
              </button>
              <button
                type="button"
                onClick={() => { onClose(); setErrorMessage(""); }}
                className="btn-secondary flex-1 py-2 text-sm font-semibold"
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
