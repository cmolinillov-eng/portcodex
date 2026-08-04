import type { DashboardData } from "@/lib/dashboard/get-dashboard-data";
import type { DefiPosition, DashboardCategoryKey } from "@/types/portfolio";
import type {
  CarteraSectionData,
  CarteraPosition,
  YieldEntry,
} from "@/components/dashboard/cartera/PositionsTable";
import { resolveNetwork, UNKNOWN_NETWORK } from "@/lib/dashboard/networks";
import { money, signedMoney, signedPercent, tokenAmount, plural } from "@/lib/format/figures";

/**
 * Traduce el modelo financiero a las tablas de la Cartera.
 *
 * Función PURA: se comprueba contra las carteras reales con un script, sin
 * navegador. No calcula dinero — eso es del núcleo contable— solo decide cómo
 * enseñarlo.
 */

const SECTION_TITLE: Record<DashboardCategoryKey, string> = {
  wallet: "Hold",
  liquidity_pools: "Liquidity Pools",
  staking: "Staking",
  lending: "Lending",
};

/** Orden fijo: primero lo que más se mira. */
const SECTION_ORDER: DashboardCategoryKey[] = ["liquidity_pools", "wallet", "staking", "lending"];

export interface CarteraView {
  total: string;
  positionsLabel: string;
  sections: CarteraSectionData[];
  provenance: string;
}

/**
 * Clave de una posición para cruzar con sus rendimientos.
 *
 * Existe porque los dos lados del cruce se escribían a mano y NO coincidían: el
 * mapa se construía con las claves de `harvestByPosition`, que usan `::`, y se
 * consultaba con `|`. El `get()` fallaba siempre, en todas las posiciones, así
 * que `pendingUsd` era 0 y la línea «sin reclamar» no llegó a pintarse nunca.
 *
 * En Lending eso además cambiaba el significado del dato: al desaparecer la
 * primera línea, la única que quedaba era el interés COBRADO con la etiqueta
 * «pagado». El cliente leía que había pagado intereses que en realidad ganó.
 *
 * Se normaliza la caja del protocolo porque la contabilidad y la lectura
 * on-chain no siempre lo escriben igual («Kamino» / «kamino»).
 */
function claveDePosicion(portfolioId: string, protocol: string, positionId: string): string {
  return `${portfolioId}::${protocol.toLowerCase()}::${positionId}`;
}

export function buildCarteraView(data: DashboardData): CarteraView {
  const harvestByKey = new Map(
    data.harvestByPosition.map((h) => {
      // La clave viene ya formada; se re-normaliza para que las dos puntas usen
      // exactamente la misma regla, sin depender de cómo se construyó allí.
      const [portfolioId = "", protocol = "", positionId = ""] = h.key.split("::");
      return [claveDePosicion(portfolioId, protocol, positionId), h] as const;
    }),
  );

  const sections: CarteraSectionData[] = [];
  let totalValue = 0;
  let totalPositions = 0;

  for (const key of SECTION_ORDER) {
    const section = data.sections.find((s) => s.key === key);
    if (!section) continue;
    const active = section.positions.filter((p) => p.isActive);
    if (active.length === 0) continue; // Una sección a cero no se enseña.

    const sectionTotal = active.reduce((sum, p) => sum + (Number(p.currentValue) || 0), 0);
    totalValue += sectionTotal;
    totalPositions += active.length;

    const isLending = key === "lending";

    sections.push({
      key,
      title: SECTION_TITLE[key],
      total: money(sectionTotal),
      count: `· ${plural(active.length, "posición", "posiciones")}`,
      balanceLabel: isLending ? "Colateral y deuda" : "Saldo",
      // En lending el valor es colateral MENOS deuda. Llamarlo «Valor actual»,
      // como en un hold, haría creer al cliente que tiene el colateral entero.
      valueLabel: isLending ? "Valor neto" : "Valor actual",
      yieldLabel: key === "wallet" ? undefined : isLending ? "Interés" : "Rendimiento",
      positions: active.map((p) => toPosition(p, key, harvestByKey)),
    });
  }

  return {
    total: money(totalValue),
    positionsLabel: `en ${plural(totalPositions, "posición", "posiciones")}`,
    provenance: plural(totalPositions, "posición leída", "posiciones leídas"),
    sections,
  };
}

function toPosition(
  p: DefiPosition,
  category: DashboardCategoryKey,
  harvests: Map<string, { pendingUsd: number; harvestedUsd: number }>,
): CarteraPosition {
  const pnlUsd = Number(p.currentValue) - (Number(p.costBasisUsd) || 0);
  const harvest = harvests.get(claveDePosicion(p.portfolioId, p.protocol, p.positionId));

  return {
    key: `${p.portfolioId}|${p.protocol}|${p.positionId}|${p.tokenSymbol}`,
    symbols: symbolsOf(p),
    name: displayName(p),
    venue: venueOf(p),
    risk: riskOf(p),
    // En lending la celda la ocupan colateral y deuda; calcular además un saldo
    // que nadie pinta solo servía para que apareciera un «0 USDC» fantasma.
    balances: category === "lending" ? [] : balancesOf(p),
    lending: category === "lending" ? lendingOf(p) : undefined,
    deposited: money(Number(p.costBasisUsd) || 0),
    currentValue: money(Number(p.currentValue) || 0),
    pnl: signedMoney(pnlUsd),
    pnlPercent: signedPercent(Number(p.roiPercent) || 0),
    // Medio céntimo: por debajo, la cifra se imprime «0,00 US$» y pintarla de
    // color afirmaría un movimiento que no se ve. Mismo umbral que signedMoney.
    pnlTone: Math.abs(pnlUsd) < 0.005 ? "flat" : pnlUsd > 0 ? "profit" : "loss",
    yields: yieldsOf(p, category, harvest),
    // Solo se señala LA EXCEPCIÓN. Una insignia en todas las filas no informa.
    exception: p.dataQualityIssue ?? undefined,
  };
}

/** Los dos tokens de un par, o el único de un hold. */
function symbolsOf(p: DefiPosition): string[] {
  const fromBreakdown = p.valueBreakdown.map((v) => v.tokenSymbol);
  if (fromBreakdown.length >= 2) return fromBreakdown.slice(0, 2);

  const collateral = p.collateralBreakdown.map((c) => c.tokenSymbol);
  const debt = p.debtBreakdown.map((d) => d.tokenSymbol);
  if (collateral.length > 0) return [...new Set([...collateral, ...debt])].slice(0, 2);

  return [p.tokenSymbol];
}

/** «pyUSD/USDC» para un par, «BTC» para un hold. */
function displayName(p: DefiPosition): string {
  const symbols = symbolsOf(p);
  return symbols.length > 1 ? symbols.join("/") : p.tokenSymbol;
}

/** «Solana · Kamino (ORCA)»: red primero, plataforma después. */
function venueOf(p: DefiPosition): string {
  const network = resolveNetwork(p.protocol, p.tokenSymbol);
  if (p.protocol.trim().toLowerCase() === "wallet") {
    return network === UNKNOWN_NETWORK ? "Wallet" : network;
  }
  return network === UNKNOWN_NETWORK ? p.protocol : `${network} · ${p.protocol}`;
}

/**
 * Barra de riesgo: rango de precios en pools, factor de salud en lending.
 * Si no hay ninguno de los dos, no hay barra — y su ausencia también informa.
 */
function riskOf(p: DefiPosition): CarteraPosition["risk"] {
  if (p.healthFactor !== null && Number.isFinite(p.healthFactor)) {
    const hf = Number(p.healthFactor);
    // Se dibuja hasta 3,0: por encima el riesgo de liquidación es remoto y
    // estirar la escala solo aplastaría la zona que importa.
    const position = Math.min(100, (hf / 3) * 100);
    return {
      position,
      label: `Factor de salud ${hf.toLocaleString("es-ES", { maximumFractionDigits: 2 })}`,
      atRisk: p.healthStatus === "warning" || p.healthStatus === "critical",
    };
  }

  if (p.lpRangeLabel) {
    const atRisk = p.lpRangeStatus === "out_of_range";
    return {
      position: lpRangePosition(p),
      label: p.lpRangeLabel,
      atRisk,
    };
  }

  return undefined;
}

/**
 * Dónde cae el precio actual dentro del rango, en tanto por ciento.
 *
 * `lpRangeLabel` viene ya formateado («Rango 0,995 – 1,005 · actual 1,000»), y
 * de ahí se sacan los tres números. Si no se puede leer, la barra se pone al
 * medio: es más honesto que fingir una precisión que no se tiene.
 */
function lpRangePosition(p: DefiPosition): number {
  if (p.lpRangeStatus === "out_of_range") return 100;
  const numbers = (p.lpRangeLabel ?? "").match(/[\d.,]+/g);
  if (!numbers || numbers.length < 3) return 50;

  const [lower, upper, current] = numbers.slice(0, 3).map((n) => Number(n.replace(/\./g, "").replace(",", ".")));
  if (![lower, upper, current].every(Number.isFinite) || upper <= lower) return 50;

  return Math.max(0, Math.min(100, ((current - lower) / (upper - lower)) * 100));
}

function balancesOf(p: DefiPosition): string[] {
  if (p.valueBreakdown.length > 1) {
    return p.valueBreakdown.map((v) => `${tokenAmount(v.valueUsd)} ${v.tokenSymbol}`);
  }
  const label = p.balanceLabel ?? `${tokenAmount(Number(p.currentBalance) || 0)} ${p.tokenSymbol}`;
  return [label];
}

/** Colateral y deuda SEPARADOS. La deuda con signo, para que no se sume. */
function lendingOf(p: DefiPosition): { collateral: string[]; debt: string[] } {
  return {
    collateral: p.collateralBreakdown.map((c) => `${tokenAmount(c.amount)} ${c.tokenSymbol}`),
    debt: p.debtBreakdown.map((d) => `−${tokenAmount(Math.abs(d.amount))} ${d.tokenSymbol}`),
  };
}

function yieldsOf(
  p: DefiPosition,
  category: DashboardCategoryKey,
  harvest: { pendingUsd: number; harvestedUsd: number } | undefined,
): YieldEntry[] | undefined {
  if (category === "wallet") return undefined;

  const entries: YieldEntry[] = [];
  const pending = Number(harvest?.pendingUsd ?? 0);
  const collected = Number(harvest?.harvestedUsd ?? p.totalHarvested ?? 0);

  if (pending >= 0.01) {
    entries.push({
      value: money(pending),
      label: category === "lending" ? "generado" : "sin reclamar",
      strong: true,
    });
  }
  if (collected >= 0.01) {
    entries.push({ value: money(collected), label: category === "lending" ? "pagado" : "cobrado" });
  }

  return entries.length > 0 ? entries : undefined;
}
