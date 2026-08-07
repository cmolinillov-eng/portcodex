import type { TraceabilityEntry } from "@/lib/tax/compute-traceability";
import { getAeatClassification, getCustodyClass } from "@/lib/tax/aeat-mapping";
import { getTaxYear } from "@/lib/tax/eur-conversion";
import { formatDate } from "./format";
import { csvAmount, csvMoney } from "@/lib/format/figures";

/**
 * Toda celda va ENTRECOMILLADA, sin excepción.
 *
 * Es lo que permite escribir los números con coma decimal —«1198,13»— sin que
 * la coma pueda confundirse nunca con un separador de columnas: dentro de las
 * comillas no separa nada. El separador de columnas real es `;`, y de ese ya se
 * encargan las comillas igual.
 */
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
 *
 * Este fichero lo abre una PERSONA en un Excel español —por eso se separa por
 * `;` y no por `,`—, así que sus números van en español: coma decimal. Con
 * punto, Excel no los reconoce como números y el asesor recibe cifras que no
 * suman ni se ordenan. Ver `csvMoney`/`csvAmount` en `lib/format/figures`.
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
      e.tokenInAmount != null ? csvAmount(e.tokenInAmount) : "",
      e.tokenOutSymbol ?? "",
      e.tokenOutAmount != null ? csvAmount(e.tokenOutAmount) : "",
      csvMoney(e.fiscal.valueEur),
      csvMoney(e.fiscal.costBasisEur),
      csvMoney(e.fiscal.realizedGainEur),
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
 *
 * AQUÍ LOS NÚMEROS VAN CON PUNTO, a diferencia del CSV de trazabilidad.
 *
 * No es un descuido ni una incoherencia: son dos ficheros con dos lectores
 * distintos. La trazabilidad la abre una persona en Excel; ESTE lo INGIERE una
 * herramienta, y sus columnas no son nuestras —«Type», «Buy Amount», «Sell
 * Currency», «Trade-Group»— sino las del importador de CoinTracking, escritas
 * en inglés y en su orden.
 *
 * Comprobado antes de tocarlo (agosto 2026): la plantilla oficial y los
 * ejemplos del importador escriben los importes en formato inglés («1.05»), y
 * la documentación del importador personalizado solo declara ajustable el
 * SEPARADOR DE COLUMNAS —«Column Separator: usually auto-detected»—, no el
 * decimal. Es decir: el punto está documentado y la coma no. Con coma, el
 * importador se come «1198,13» como 1198 o rechaza la fila, y ese error es
 * silencioso y fiscal.
 *
 * Vale más un fichero que la herramienta acepta que uno bonito que rechaza. Si
 * algún día CoinTracking documenta el decimal como configurable, esto se puede
 * revisar; mientras tanto, no se toca.
 */

/**
 * Número en el formato que ingiere CoinTracking: punto decimal, sin separador
 * de millar y SIN notación científica.
 *
 * Lo tercero es lo que arregla algo: los importes salían de `String(numero)`, y
 * `String(0.0000001)` devuelve «1e-7». Una cantidad de token pequeña —polvo de
 * un LP, una comisión— entraba en el fichero como «1e-7», que ningún importador
 * lee como un número. Con `toLocaleString` los decimales se escriben siempre en
 * posicional.
 *
 * No usa los ayudantes de `lib/format/figures` a propósito: aquellos son es-ES
 * —coma decimal— y este fichero tiene que salir en inglés.
 */
function ctNumber(value: number, min: number, max: number): string {
  if (!Number.isFinite(value)) return "";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
    useGrouping: false,
  });
}
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
      e.tokenInAmount != null ? ctNumber(e.tokenInAmount, 0, 18) : "",
      e.tokenInSymbol ?? "",
      e.tokenOutAmount != null ? ctNumber(e.tokenOutAmount, 0, 18) : "",
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
      e.tokenInSymbol ? ctNumber(e.fiscal.valueEur, 2, 2) : "",
      e.tokenOutSymbol ? ctNumber(e.fiscal.valueEur, 2, 2) : "",
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
