import type { TraceabilityEntry } from "@/lib/tax/compute-traceability";
import type { FiscalCategory, IncomeType, WalletKind } from "@/lib/tax/types";

/**
 * Datos de prueba del informe fiscal.
 *
 * Parten de las cifras de la maqueta 04-fiscalidad.html —base del ahorro
 * 161,37 €, con RCM staking 373,59 / pérdida −225,62 / GP permuta 13,40— y las
 * amplían a 58 operaciones con un propósito concreto: **forzar que la tabla de
 * detalle ocupe más de una página**. Con cuatro filas no se puede comprobar ni
 * la cabecera repetida, ni la numeración, ni que ninguna fila quede cortada, que
 * es justo lo que hay que verificar en un documento que se hojea.
 *
 * Incluye a propósito los casos que rompen una maqueta:
 *   • nombres de plataforma largos, para ver el recorte de celda
 *   • cantidades de 8 decimales y de 4 cifras enteras, para ver el tabular
 *   • operaciones no imponibles, que deben mostrar «—» y no «0,00 €»
 *   • una pérdida patrimonial, para el menos tipográfico y el rojo de documento
 *   • base general con dos airdrops, para la segunda mitad del desglose
 *
 * NUNCA se sirve en producción.
 */

interface Spec {
  day: number;
  month: number;
  type: string;
  protocol: string;
  walletKind: WalletKind;
  positionType: string;
  symbol: string;
  amount: number;
  category: FiscalCategory;
  incomeType: IncomeType;
  humanLabel: string;
  valueEur: number;
  costBasisEur: number;
  realizedGainEur: number;
}

const YEAR = 2026;

/** Quince recompensas de staking: 373,59 € en total, como la maqueta. */
const STAKING: Spec[] = Array.from({ length: 15 }, (_, i) => {
  const value = i === 14 ? 373.59 - 24.9 * 14 : 24.9;
  return {
    day: 1 + ((i * 24) % 27),
    month: 1 + Math.floor((i * 24) / 27),
    type: "harvest",
    protocol: i % 3 === 0 ? "Jito (Solana)" : i % 3 === 1 ? "Marinade Finance" : "Kamino Lend · Solana",
    walletKind: "dex" as WalletKind,
    positionType: "Staking",
    symbol: i % 2 === 0 ? "JTO" : "MSOL",
    amount: i % 2 === 0 ? 18.9292 + i : 0.4213 + i / 100,
    category: "staking_reward" as FiscalCategory,
    incomeType: "rendimiento_capital_mobiliario" as IncomeType,
    humanLabel: "Recompensa de staking",
    valueEur: Math.round(value * 100) / 100,
    costBasisEur: 0,
    realizedGainEur: 0,
  };
});

/** Cuatro pérdidas patrimoniales: −225,62 € en total. */
const LOSSES: Spec[] = [
  { v: -96.4, d: 12, m: 2, sym: "ETH", amt: 0.31402, cost: 812.55 },
  { v: -54.11, d: 3, m: 5, sym: "BTC", amt: 0.025986, cost: 604.2 },
  { v: -41.7, d: 19, m: 8, sym: "SOL", amt: 4.2891, cost: 388.9 },
  { v: -33.41, d: 27, m: 10, sym: "ARB", amt: 1240.5, cost: 402.16 },
].map(({ v, d, m, sym, amt, cost }) => ({
  day: d,
  month: m,
  type: "withdrawal",
  protocol: "Binance",
  walletKind: "cex_foreign" as WalletKind,
  positionType: "Hold",
  symbol: sym,
  amount: amt,
  category: "sell" as FiscalCategory,
  incomeType: "perdida_patrimonial" as IncomeType,
  humanLabel: "Venta a euros",
  valueEur: Math.round((cost + v) * 100) / 100,
  costBasisEur: cost,
  realizedGainEur: v,
}));

/** Dos permutas con ganancia: 13,40 € en total. */
const SWAPS: Spec[] = [
  { v: 9.12, d: 8, m: 3, sym: "USDC", amt: 4840.124, cost: 4468.9 },
  { v: 4.28, d: 21, m: 9, sym: "WETH", amt: 0.00004213, cost: 0.14 },
].map(({ v, d, m, sym, amt, cost }) => ({
  day: d,
  month: m,
  type: "swap",
  protocol: "Orca Whirlpools (Solana)",
  walletKind: "dex" as WalletKind,
  positionType: "Hold",
  symbol: sym,
  amount: amt,
  category: "swap_out" as FiscalCategory,
  incomeType: "ganancia_patrimonial" as IncomeType,
  humanLabel: "Permuta entre activos",
  valueEur: Math.round((cost + v) * 100) / 100,
  costBasisEur: cost,
  realizedGainEur: v,
}));

/** Base general: dos airdrops. */
const AIRDROPS: Spec[] = [
  { d: 14, m: 4, sym: "JUP", amt: 312.4, v: 148.9 },
  { d: 2, m: 11, sym: "ENA", amt: 1890.0, v: 61.35 },
].map(({ d, m, sym, amt, v }) => ({
  day: d,
  month: m,
  type: "deposit",
  protocol: "Phantom",
  walletKind: "hot_wallet" as WalletKind,
  positionType: "Hold",
  symbol: sym,
  amount: amt,
  category: "airdrop" as FiscalCategory,
  incomeType: "ganancia_patrimonial" as IncomeType,
  humanLabel: "Airdrop recibido",
  valueEur: v,
  costBasisEur: 0,
  realizedGainEur: v,
}));

/** Movimientos sin hecho imponible: rellenan el listado y son el caso donde la
 *  columna de resultado tiene que decir «—» y no «0,00 €». */
const NEUTRAL: Spec[] = Array.from({ length: 35 }, (_, i) => {
  const buy = i % 4 === 0;
  return {
    day: 1 + ((i * 11) % 28),
    month: 1 + ((i * 5) % 12),
    type: buy ? "deposit" : i % 3 === 0 ? "lp_deposit" : "transfer",
    protocol: [
      "Ledger Nano X",
      "Meteora DLMM · Solana",
      "Coinbase Advanced Trade",
      "MetaMask",
      "Safe (Arbitrum One)",
    ][i % 5],
    walletKind: (["cold_wallet", "dex", "cex_foreign", "hot_wallet", "smart_contract_wallet"] as WalletKind[])[i % 5],
    positionType: i % 3 === 0 ? "Liquidity Pool" : "Hold",
    symbol: ["USDC", "SOL", "BTC", "ETH", "WBTC"][i % 5],
    amount: [1250.75, 12.4218, 0.025986, 0.31402, 0.00004213][i % 5] * (1 + i / 20),
    category: (buy ? "buy" : i % 3 === 0 ? "lp_provide" : "non_taxable_transfer") as FiscalCategory,
    incomeType: "none" as IncomeType,
    humanLabel: buy ? "Compra con euros" : i % 3 === 0 ? "Aportación de liquidez" : "Traspaso entre wallets propias",
    valueEur: Math.round([1250.75, 890.4, 604.2, 812.55, 0.14][i % 5] * (1 + i / 20) * 100) / 100,
    costBasisEur: Math.round([1250.75, 890.4, 604.2, 812.55, 0.14][i % 5] * (1 + i / 20) * 100) / 100,
    realizedGainEur: 0,
  };
});

function toEntry(s: Spec, i: number): TraceabilityEntry {
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    id: `mock-${i}`,
    transactionDate: `${YEAR}-${p(s.month)}-${p(s.day)}T10:${p((i * 7) % 60)}:00.000Z`,
    type: s.type,
    protocol: s.protocol,
    walletKind: s.walletKind,
    positionType: s.positionType,
    tokenInSymbol: s.symbol,
    tokenInAmount: s.amount,
    tokenOutSymbol: null,
    tokenOutAmount: null,
    notes: null,
    fiscal: {
      category: s.category,
      incomeType: s.incomeType,
      valueEur: s.valueEur,
      costBasisEur: s.costBasisEur,
      realizedGainEur: s.realizedGainEur,
      notes: "",
      taxable: s.incomeType !== "none",
      humanLabel: s.humanLabel,
      humanDescription: "",
      inferred: true,
      walletKind: s.walletKind,
    },
  };
}

export const MOCK_ENTRIES: TraceabilityEntry[] = [
  ...STAKING,
  ...LOSSES,
  ...SWAPS,
  ...AIRDROPS,
  ...NEUTRAL,
]
  .map(toEntry)
  .sort((a, b) => Date.parse(a.transactionDate) - Date.parse(b.transactionDate));

export const MOCK_HOLDER = "Elena Cortés Vidal";
export const MOCK_PORTFOLIO = "Elena Cortés";
export const MOCK_YEAR = YEAR;
/** Fecha de emisión FIJA: si fuera `new Date()`, dos capturas del mismo
 *  documento diferirían y no se podría comparar contra la anterior. */
export const MOCK_GENERATED_AT = new Date("2026-07-30T09:41:00.000Z");
