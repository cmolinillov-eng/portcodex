import { useState } from "react";
import { X, FileDown } from "lucide-react";

interface CsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePortfolioId: string | null;
}

interface TransactionExportRow {
  transaction_date?: string;
  type?: string;
  movement_origin?: string;
  operation_group_id?: string;
  position_id?: string;
  protocol?: string;
  token_in_symbol?: string;
  token_in_amount?: string | number | null;
  token_out_symbol?: string;
  token_out_amount?: string | number | null;
  spot_price?: string | number | null;
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function escapeCsv(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function CsvModal({ isOpen, onClose, activePortfolioId }: CsvModalProps) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (!isOpen) return null;

  async function handleExport() {
    setErrorMessage("");

    if (!activePortfolioId) {
      setErrorMessage("No se encontró portfolio activo para exportar.");
      return;
    }

    if (!startDate || !endDate) {
      setErrorMessage("Debes seleccionar fecha inicio y fecha fin.");
      return;
    }

    if (startDate > endDate) {
      setErrorMessage("La fecha inicio no puede ser mayor que la fecha fin.");
      return;
    }

    try {
      setIsExporting(true);
      const query = new URLSearchParams({
        portfolioId: activePortfolioId,
        startDate,
        endDate,
      });

      const response = await fetch(`/api/transactions/export?${query.toString()}`, {
        method: "GET",
      });

      const body = (await response.json()) as { rows?: TransactionExportRow[]; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo exportar el CSV.");
      }

      const rows = body.rows ?? [];
      const headers = [
        "Fecha",
        "Tipo",
        "Origen movimiento",
        "Grupo operación",
        "Posición ID",
        "Protocolo",
        "Tokens implicados",
        "Token Entrada",
        "Cantidad Entrada",
        "Token Salida",
        "Cantidad Salida",
        "Precio de Entrada (Fiat)",
      ];

      const csvLines = [headers.map(escapeCsv).join(",")];

      for (const row of rows) {
        const tokenIn = row.token_in_symbol ?? "";
        const tokenOut = row.token_out_symbol ?? "";
        const tokensInvolved = [tokenIn, tokenOut].filter((token) => token.length > 0).join("/");
        const line = [
          row.transaction_date ?? "",
          row.type ?? "",
          row.movement_origin ?? "Operación estándar",
          row.operation_group_id ?? "",
          row.position_id ?? "",
          row.protocol ?? "",
          tokensInvolved,
          row.token_in_symbol ?? "",
          String(toNumber(row.token_in_amount)),
          row.token_out_symbol ?? "",
          String(toNumber(row.token_out_amount)),
          String(toNumber(row.spot_price)),
        ];

        csvLines.push(line.map(escapeCsv).join(","));
      }

      const filename = `operaciones_${startDate}_${endDate}.csv`;
      downloadTextFile(filename, csvLines.join("\n"), "text/csv;charset=utf-8;");
      
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      setErrorMessage(message);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
      <div className="glass-panel-elevated mx-4 flex w-full max-w-sm flex-col p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileDown className="h-4 w-4" /> Exportar CSV
          </h2>
          <button type="button" onClick={() => { onClose(); setErrorMessage(""); }} className="text-[var(--muted)] hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--muted)]">Fecha Inicio</label>
            <input
              type="date"
              className="input-base w-full"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--muted)]">Fecha Fin</label>
            <input
              type="date"
              className="input-base w-full"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          {errorMessage && <p className="text-sm text-red-400">{errorMessage}</p>}
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="btn-secondary w-full"
          >
            {isExporting ? "Exportando..." : "Exportar Excel/CSV"}
          </button>
        </div>
      </div>
    </div>
  );
}
