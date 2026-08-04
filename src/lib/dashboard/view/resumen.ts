import type { DashboardData } from "@/lib/dashboard/get-dashboard-data";
import type { DashboardCategoryKey } from "@/types/portfolio";
import type { CompositionSlice, StrategyKey } from "@/components/dashboard/resumen/PortfolioComposition";
import type { NetworkSlice } from "@/components/dashboard/resumen/NetworkDistribution";
import type { MovementRow } from "@/components/dashboard/resumen/RecentMovements";
import { distributeByNetwork, resolveNetwork, UNKNOWN_NETWORK } from "@/lib/dashboard/networks";
import {
  money,
  moneyRound,
  signedMoney,
  signedPercent,
  sharePercent,
  tokenAmount,
  dateTime,
  plural,
} from "@/lib/format/figures";

/**
 * Traduce el modelo financiero a lo que pintan los componentes del Resumen.
 *
 * Vive aparte a propósito: es una función PURA y sin React, así que se puede
 * comprobar contra las carteras reales con un script, sin navegador. Y deja el
 * núcleo contable (`get-dashboard-data.ts`) intacto: aquí no se calcula nada de
 * dinero, solo se elige cómo enseñarlo.
 */

/** Las claves de categoría del dominio no son las de la rampa de color. */
const STRATEGY_KEY: Record<DashboardCategoryKey, StrategyKey> = {
  wallet: "wallet",
  lending: "lending",
  staking: "staking",
  liquidity_pools: "lp",
};

const STRATEGY_NAME: Record<DashboardCategoryKey, string> = {
  wallet: "Wallet (HODL)",
  lending: "Lending",
  staking: "Staking",
  liquidity_pools: "Liquidity Pools",
};

/** Orden fijo, para que la barra no se reordene de una carga a otra. */
const CATEGORY_ORDER: DashboardCategoryKey[] = ["wallet", "liquidity_pools", "lending", "staking"];

export interface ResumenView {
  totalValue: string;
  currency: string;
  changeAmount: string;
  changePercent: string;
  isPositive: boolean;
  deposited: string;
  yieldTotal: string;
  pnl: string;
  pnlPercent: string;
  composition: CompositionSlice[];
  compositionNote: string;
  networks: NetworkSlice[];
  networksNote: string;
  movements: MovementRow[];
  /** Rendimiento generado y todavía sin redesplegar. `null` si no hay nada. */
  idle: { amount: string; detail: string } | null;
  provenance: string;
}

export function buildResumenView(data: DashboardData): ResumenView {
  const { summary, sections } = data;

  const positions = sections.flatMap((s) => s.positions).filter((p) => p.isActive);

  // ── Composición ──────────────────────────────────────────────────────────
  const totalsByCategory = new Map<DashboardCategoryKey, { value: number; count: number }>();
  for (const section of sections) {
    const active = section.positions.filter((p) => p.isActive);
    const value = active.reduce((sum, p) => sum + (Number(p.currentValue) || 0), 0);
    if (active.length > 0) totalsByCategory.set(section.key, { value, count: active.length });
  }

  const compositionTotal = [...totalsByCategory.values()].reduce((s, c) => s + c.value, 0);

  const composition: CompositionSlice[] = CATEGORY_ORDER.filter((k) => totalsByCategory.has(k)).map(
    (key) => {
      const { value, count } = totalsByCategory.get(key)!;
      const share = compositionTotal > 0 ? (value / compositionTotal) * 100 : 0;
      return {
        key: STRATEGY_KEY[key],
        name: STRATEGY_NAME[key],
        detail:
          key === "wallet"
            ? "Custodia propia · sin bloqueo"
            : describeVenues(sections.find((s) => s.key === key)?.positions ?? [], count),
        value: money(value),
        percent: sharePercent(share),
        share,
      };
    },
  );

  // Las categorías vacías se resuelven en UNA línea, no ocupando una tabla a 0.
  const emptyCategories = CATEGORY_ORDER.filter((k) => !totalsByCategory.has(k)).map(
    (k) => STRATEGY_NAME[k],
  );
  const compositionNote = [
    plural(composition.length, "estrategia activa", "estrategias activas"),
    emptyCategories.length > 0 ? `${listAnd(emptyCategories)} sin posiciones` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // ── Distribución por red ─────────────────────────────────────────────────
  const rawNetworks = distributeByNetwork(
    positions.map((p) => ({
      protocol: p.protocol,
      tokenSymbol: p.tokenSymbol,
      currentValue: Number(p.currentValue) || 0,
    })),
  );
  const networks: NetworkSlice[] = rawNetworks.map((n) => ({
    name: n.name,
    value: money(n.valueUsd),
    percent: sharePercent(n.share),
    share: n.share,
  }));
  // «Otras redes» es un cajón de sastre, no una red: contarlo diría «5 redes»
  // teniendo cuatro. Se enseña en la barra, pero no se cuenta.
  const namedNetworks = rawNetworks.filter((n) => n.name !== UNKNOWN_NETWORK);
  const top = namedNetworks[0];
  const networksNote = [
    plural(namedNetworks.length, "red", "redes"),
    top ? `${Math.round(top.share)} % concentrado en ${top.name}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // ── Últimos movimientos ──────────────────────────────────────────────────
  const movements: MovementRow[] = data.recentActivity.slice(0, 5).map((a, i) => {
    // El importe con signo: lo que ENTRA en la cartera del cliente es positivo.
    const value = Number(a.tokenInAmount) * Number(a.spotPrice || 0);
    const isInflow = a.type === "deposit" || a.type === "harvest";
    return {
      id: `${a.operationGroupId}-${i}`,
      operation: operationLabel(a.type, a.movementOrigin),
      quantity: tokenAmount(Number(a.tokenInAmount) || 0),
      asset: a.tokenInSymbol,
      platform: a.protocol,
      // La MISMA función que usa el reparto por red, para que Movimientos y
      // Distribución por red nunca discrepen sobre a qué red pertenece algo.
      network: resolveNetwork(a.protocol, a.tokenInSymbol),
      date: dateTime(a.transactionDate),
      amount: signedMoney(isInflow ? Math.abs(value) : -Math.abs(value)),
    };
  });

  // ── Rendimiento ocioso ───────────────────────────────────────────────────
  const idleUsd = Number(summary.totalUnclaimedUsd || 0) + Number(summary.totalPendingHarvestUsd || 0);
  // Cuántas posiciones tienen algo SIN RECLAMAR — no cuántas hay en total.
  // Contar todas decía «sin reclamar en 7 posiciones» cuando solo 2 tenían
  // rendimiento pendiente, que es sencillamente falso.
  const idlePositions = data.harvestByPosition.filter((h) => Number(h.pendingUsd) >= 0.01).length;
  const idle =
    idleUsd >= 0.01
      ? {
          amount: money(idleUsd),
          detail: `generados sin reclamar en ${plural(idlePositions, "posición", "posiciones")}`,
        }
      : null;

  const pnlPositive = Number(summary.pnlUsd) >= 0;

  return {
    totalValue: money(Number(summary.totalValueUsd)).replace(" US$", ""),
    currency: "US$",
    changeAmount: signedMoney(Number(summary.pnlUsd)),
    changePercent: signedPercent(Number(summary.pnlPercent)),
    isPositive: pnlPositive,
    deposited: moneyRound(Number(summary.totalDepositedUsd)),
    yieldTotal: moneyRound(Number(summary.totalHarvestUsd)),
    pnl: moneyRound(Number(summary.pnlUsd)),
    pnlPercent: signedPercent(Number(summary.pnlPercent)),
    composition,
    compositionNote,
    networks,
    networksNote,
    movements,
    idle,
    provenance: `${plural(positions.length, "posición leída", "posiciones leídas")}`,
  };
}

/** «3 posiciones · Kamino, PancakeSwap»: cuántas y dónde. */
function describeVenues(positions: Array<{ protocol: string; isActive: boolean }>, count: number): string {
  const venues = [...new Set(positions.filter((p) => p.isActive).map((p) => baseProtocol(p.protocol)))];
  const label = plural(count, "posición", "posiciones");
  return venues.length > 0 ? `${label} · ${venues.slice(0, 3).join(", ")}` : label;
}

/** «Kamino (ORCA)» → «Kamino». Para la nota basta la casa, no la mesa. */
function baseProtocol(protocol: string): string {
  return protocol.replace(/\s*\(.*\)\s*$/, "").trim();
}

const OPERATION_LABEL: Record<string, string> = {
  deposit: "Depósito",
  withdrawal: "Retirada",
  harvest: "Harvest rewards",
  swap: "Permuta",
  lp_deposit: "Añadir liquidez",
  lp_withdraw: "Retirar liquidez",
  borrow: "Préstamo",
  repay: "Devolución",
};

function operationLabel(type: string, origin: string): string {
  if (origin === "harvest_reinvest") return "Reinversión de harvest";
  // Las filas de un rebalanceo son retiradas y depósitos corrientes: sin
  // decirlo, el listado daba a entender un movimiento de dinero del cliente.
  if (origin === "rebalance") return "Rebalanceo";
  return OPERATION_LABEL[type] ?? capitalize(type.replace(/_/g, " "));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** «Staking y Lending», no «Staking, Lending». */
function listAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}
