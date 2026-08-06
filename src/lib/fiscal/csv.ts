import type { TraceabilityEntry } from "@/lib/tax/compute-traceability";
import { getAeatClassification, getCustodyClass } from "@/lib/tax/aeat-mapping";
import { getTaxYear } from "@/lib/tax/eur-conversion";
import { formatDate } from "./format";

function csvCell(v: unknown): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

function toCsv(header: string[], rows: string[][]): string {
  const sep = ";";
  const lines = [header.map(csvCell).join(sep), ...rows.map((r) => r.map(csvCell).join(sep))];
  // BOM para que Excel/Numbers respeten UTF-8
  return "﻿" + lines.join("\r\n");
}

/**
 * CSV de trazabilidad fiscal completa (todas las columnas internas + AEAT).
 */
export function buildTraceabilityCsv(entries: TraceabilityEntry[]): string {
  const header = [
    "Fecha",
    "Ejercicio",
    "Tipo operacion",
    "Billetera",
    "Protocolo",
    "Activo entra",
    "Cantidad entra",
    "Activo sale",
    "Cantidad sale",
    "Valor EUR",
    "Coste EUR",
    "Ganancia/Perdida EUR",
    "Categoria fiscal",
    "Casilla AEAT",
    "Base imponible",
    "Imponible",
    "Notas",
  ];
  const rows = entries.map((e) => {
    const cls = getAeatClassification(e.fiscal.category, e.fiscal.incomeType, e.fiscal.realizedGainEur);
    return [
      formatDate(e.transactionDate),
      String(getTaxYear(e.transactionDate)),
      e.type,
      getCustodyClass(e.walletKind),
      e.protocol,
      e.tokenInSymbol ?? "",
      e.tokenInAmount != null ? String(e.tokenInAmount) : "",
      e.tokenOutSymbol ?? "",
      e.tokenOutAmount != null ? String(e.tokenOutAmount) : "",
      e.fiscal.valueEur.toFixed(2),
      e.fiscal.costBasisEur.toFixed(2),
      e.fiscal.realizedGainEur.toFixed(2),
      cls.badge,
      cls.casilla,
      cls.base ?? "—",
      e.fiscal.taxable ? "Si" : "No",
      /*
       * Manda la nota FISCAL, y la del operador se añade detrás.
       *
       * Estaba al revés (`e.notes ?? e.fiscal.notes`), y `transactions.notes` la
       * rellena SIEMPRE la ingesta on-chain, así que en la práctica la nota
       * fiscal no llegaba nunca al fichero. Con ella se perdía el aviso «⚠️
       * Lotes FIFO insuficientes», que es justo el que dice que esa ganancia
       * sale sobrevalorada por faltar histórico de compra.
       *
       * Medido: la pantalla avisaba de una operación así y el CSV de 52 filas
       * no contenía ni una ocurrencia del aviso. Este fichero es el que se le
       * entrega al asesor: es el último sitio donde debe faltar.
       */
      [e.fiscal.notes, e.notes].filter(Boolean).join(" · ").replace(/[\r\n;]+/g, " "),
    ];
  });
  return toCsv(header, rows);
}

/**
 * CSV en formato estilo CoinTracking (el que esperan la mayoría de gestores
 * fiscales en España). Mapea cada movimiento a Type/Buy/Sell.
 */
export function buildCointrackingCsv(entries: TraceabilityEntry[]): string {
  const header = [
    "Type",
    "Buy Amount",
    "Buy Currency",
    "Sell Amount",
    "Sell Currency",
    "Fee",
    "Fee Currency",
    "Exchange",
    "Trade-Group",
    "Comment",
    "Date",
    "Buy Value in EUR",
    "Sell Value in EUR",
  ];

  const TYPE_MAP: Record<string, string> = {
    buy: "Trade",
    sell: "Trade",
    swap_out: "Trade",
    swap_in: "Trade",
    staking_reward: "Staking",
    lp_reward: "Reward / Bonus",
    restaking_reward: "Staking",
    lending_interest: "Interest Income",
    airdrop: "Airdrop",
    non_taxable_transfer: "Transfer",
    non_taxable_technical: "Other Fee",
  };

  const rows = entries.map((e) => {
    const ctType = TYPE_MAP[e.fiscal.category] ?? "Trade";
    return [
      ctType,
      e.tokenInAmount != null ? String(e.tokenInAmount) : "",
      e.tokenInSymbol ?? "",
      e.tokenOutAmount != null ? String(e.tokenOutAmount) : "",
      e.tokenOutSymbol ?? "",
      "",
      "",
      e.protocol,
      e.positionType,
      /*
       * Manda la nota FISCAL, y la del operador se añade detrás.
       *
       * Estaba al revés (`e.notes ?? e.fiscal.notes`), y `transactions.notes` la
       * rellena SIEMPRE la ingesta on-chain, así que en la práctica la nota
       * fiscal no llegaba nunca al fichero. Con ella se perdía el aviso «⚠️
       * Lotes FIFO insuficientes», que es justo el que dice que esa ganancia
       * sale sobrevalorada por faltar histórico de compra.
       *
       * Medido: la pantalla avisaba de una operación así y el CSV de 52 filas
       * no contenía ni una ocurrencia del aviso. Este fichero es el que se le
       * entrega al asesor: es el último sitio donde debe faltar.
       */
      [e.fiscal.notes, e.notes].filter(Boolean).join(" · ").replace(/[\r\n;]+/g, " "),
      formatDate(e.transactionDate),
      e.tokenInSymbol ? e.fiscal.valueEur.toFixed(2) : "",
      e.tokenOutSymbol ? e.fiscal.valueEur.toFixed(2) : "",
    ];
  });

  return toCsv(header, rows);
}

export function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
