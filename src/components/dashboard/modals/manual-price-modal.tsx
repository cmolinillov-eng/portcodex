import { useState } from "react";
import { X } from "lucide-react";

interface ManualPriceModalProps {
  isOpen: boolean;
  onClose: () => void;
  unmappedTokens: string[];
  isRefreshingPrices: boolean;
  onSubmit: (prices: Array<{ symbol: string; price: number }>) => void;
}

export function ManualPriceModal({
  isOpen,
  onClose,
  unmappedTokens,
  isRefreshingPrices,
  onSubmit,
}: ManualPriceModalProps) {
  const [manualPriceInputs, setManualPriceInputs] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState("");

  if (!isOpen) return null;

  function handleSubmit() {
    const prices = unmappedTokens
      .map((symbol) => {
        const raw = (manualPriceInputs[symbol] ?? "").replace(",", ".");
        const price = Number(raw);
        if (!Number.isFinite(price) || price <= 0) return null;
        return { symbol, price };
      })
      .filter((item): item is { symbol: string; price: number } => item !== null);

    if (prices.length === 0) {
      setErrorMessage("Introduce al menos un precio válido.");
      return;
    }
    
    setErrorMessage("");
    onSubmit(prices);
  }

  function handleSkip() {
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="card-premium w-full max-w-md rounded-2xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--foreground)]">Precios no disponibles</h3>
          <button
            type="button"
            onClick={handleSkip}
            className="text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Los siguientes tokens no tienen precio en CoinGecko. Introduce el precio actual en USD para actualizar los cálculos.
        </p>
        <div className="grid gap-3">
          {unmappedTokens.map((symbol) => (
            <label key={symbol} className="text-sm">
              <span className="mb-1 block font-medium text-[var(--foreground)]">{symbol} (USD)</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Ej: 25.50"
                value={manualPriceInputs[symbol] ?? ""}
                onChange={(e) =>
                  setManualPriceInputs((prev) => ({ ...prev, [symbol]: e.target.value }))
                }
                className="input-base w-full"
              />
            </label>
          ))}
        </div>
        {errorMessage ? (
          <p className="mt-3 text-xs text-rose-400">{errorMessage}</p>
        ) : null}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isRefreshingPrices}
            className="flex-1 rounded-lg py-2 text-sm font-semibold text-[var(--background)] transition disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: "var(--brand)" }}
          >
            {isRefreshingPrices ? "Guardando..." : "Guardar precios"}
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="btn-secondary flex-1 py-2 text-sm font-semibold"
          >
            Omitir
          </button>
        </div>
      </div>
    </div>
  );
}
