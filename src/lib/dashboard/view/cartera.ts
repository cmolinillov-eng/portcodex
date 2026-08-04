import type { DashboardData } from "@/lib/dashboard/get-dashboard-data";
import type { DefiPosition, DashboardCategoryKey } from "@/types/portfolio";
import type {
  CarteraSectionData,
  CarteraPosition,
  YieldEntry,
} from "@/components/dashboard/cartera/PositionsTable";
import { resolveNetwork, UNKNOWN_NETWORK } from "@/lib/dashboard/networks";
import {
  money,
  signedMoney,
  signedPercent,
  tokenAmount,
  plainNumber,
  plural,
} from "@/lib/format/figures";

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
      label: `Factor de salud ${plainNumber(hf)}`,
      atRisk: p.healthStatus === "warning" || p.healthStatus === "critical",
    };
  }

  // Solo hay barra si hay RANGO que medir, y eso lo dice `lpRangeStatus`, no
  // `lpRangeLabel`: ese campo también vale «Pool correlacionado» y «Rango no
  // disponible (falta metadata LP)». Filtrando por el label se pintaba una
  // barra con el punto al 50 % justo en las posiciones de las que NO se sabe
  // nada — un indicador de riesgo fabricado sobre la ausencia de datos. Si hay
  // barra es riesgo, así que su ausencia también informa.
  if (p.lpRangeStatus === "in_range" || p.lpRangeStatus === "out_of_range") {
    return lpRisk(p);
  }

  return undefined;
}

/** Rango de un pool: «Rango 0,995 – 1,005 · actual 1,000», con el punto donde toca. */
function lpRisk(p: DefiPosition): CarteraPosition["risk"] {
  const range = parseLpRange(p.lpRangeLabel);
  const current = parseLpCurrentPrice(p.currentPriceLabel);
  // Sin los tres números no hay nada que medir: antes que una barra al 50 %
  // —que el cliente lee como «a mitad de rango, tranquilo»— es mejor no pintar
  // ninguna. Pasa en los LP de un solo token, donde el núcleo no escribe label.
  if (!range || current === null) return undefined;

  const position = Math.max(
    0,
    Math.min(100, ((current.value - range.lower) / (range.upper - range.lower)) * 100),
  );

  const outOfRange = p.lpRangeStatus === "out_of_range";
  const atEdge = !outOfRange && (position <= EDGE_MARGIN || position >= 100 - EDGE_MARGIN);
  const state = outOfRange ? " · fuera de rango" : atEdge ? " · al borde" : "";

  // Los tres números con los MISMOS decimales, los que trae el dato. Comparar
  // «0,029» con «0,0355» cuesta; «0,0290 – 0,0355» se lee de un vistazo. El par
  // de tokens que el núcleo mete en el label se descarta: ya está en el nombre
  // de la fila, y repetirlo dentro de 108 px no cabe.
  const decimals = Math.max(range.lowerDecimals, range.upperDecimals, current.decimals);
  const n = (value: number) => plainNumber(value, decimals);

  return {
    position,
    label: `Rango ${n(range.lower)} – ${n(range.upper)} · actual ${n(current.value)}${state}`,
    atRisk: outOfRange || atEdge,
  };
}

/**
 * A partir de aquí el precio está «al borde», en tanto por ciento del rango.
 *
 * Es una decisión de presentación, no un dato: a menos de un décimo del
 * extremo, un movimiento pequeño saca la posición de rango y deja de generar
 * comisiones. Es lo que hace ámbar la fila del par volátil de la maqueta.
 */
const EDGE_MARGIN = 10;

/**
 * Los dos extremos del rango, leídos de `lpRangeLabel`.
 *
 * El núcleo escribe **«Rango 1.148 - 1.196»**: dos números, en en-US, SIN par de
 * tokens y SIN dos puntos. Verificado sobre el único sitio que lo construye; las
 * otras dos formas del campo son texto («Pool correlacionado», «Rango no
 * disponible»), que aquí no casan y devuelven null, como debe ser.
 *
 * Este parseo se ha equivocado ya dos veces, en direcciones opuestas, y las dos
 * pasaron desapercibidas porque el fallo era silencioso:
 *
 *  1. Buscaba TRES números con coma decimal. No casaba nunca y devolvía 50 fijo,
 *     así que todos los pools parecían estar a mitad de rango.
 *  2. Al arreglarlo se exigió «Rango TOKEN/TOKEN: n - n», un formato que no
 *     existe. Tampoco casaba nunca y esta vez desaparecía la barra entera.
 *
 * Por eso el prefijo de tokens es OPCIONAL: si algún día el núcleo lo añade, la
 * barra no se vuelve a caer en silencio. Y por eso hay prueba con la cadena
 * literal del núcleo, no con una inventada.
 */
function parseLpRange(
  label: string | null,
): { lower: number; upper: number; lowerDecimals: number; upperDecimals: number } | null {
  if (!label) return null;
  const match = label.match(/Rango\s+(?:\S+:\s*)?([\d.,]+)\s*-\s*([\d.,]+)/);
  if (!match) return null;

  const lower = enUsNumber(match[1]);
  const upper = enUsNumber(match[2]);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || upper <= lower) return null;

  return {
    lower,
    upper,
    lowerDecimals: enUsDecimals(match[1]),
    upperDecimals: enUsDecimals(match[2]),
  };
}

/**
 * El precio actual, de `currentPriceLabel`. El núcleo escribe «Actual
 * JITOSOL/SOL: 1.161» —aquí el par de tokens SÍ va, con dos puntos—, pero se
 * acepta también sin él por la misma razón que en el rango: que un cambio de
 * formato en el núcleo no borre la barra sin que nadie se entere.
 */
function parseLpCurrentPrice(label: string | null): { value: number; decimals: number } | null {
  if (!label) return null;
  const match = label.match(/Actual\s+(?:\S+:\s*)?([\d.,]+)/);
  if (!match) return null;

  const value = enUsNumber(match[1]);
  return Number.isFinite(value) ? { value, decimals: enUsDecimals(match[1]) } : null;
}

/**
 * Número en en-US: la coma es MILLAR y el punto es decimal — justo al revés que
 * en la pantalla. Quitar solo las comas es lo único correcto: cambiar la coma
 * por punto convertiría «3,456.78» en «3.456.78», que se lee como 3,456.
 */
function enUsNumber(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

/** Cuántos decimales trae el dato de verdad, para no fingir precisión ni perderla. */
function enUsDecimals(raw: string): number {
  const dot = raw.indexOf(".");
  return dot === -1 ? 0 : raw.length - dot - 1;
}

/**
 * Saldo de la posición: CANTIDAD de token, nunca su valor en dólares.
 *
 * `valueBreakdown[].valueUsd` son dólares, y usarlo aquí hacía que un pool con
 * 2,54 SOL enseñara «615,58 SOL». En stablecoins no se notaba —un USDC vale un
 * dólar—, así que el fallo pasó desapercibido hasta que hubo un par volátil.
 * La cantidad buena es `amount`. `balanceLabel` no vale: viene formateado en
 * en-US, y «4,216.61» en una pantalla en español son cuatro tokens y pico.
 */
function balancesOf(p: DefiPosition): string[] {
  const withAmount = p.valueBreakdown.filter(
    (v): v is typeof v & { amount: number } => typeof v.amount === "number",
  );
  if (withAmount.length > 0) {
    return withAmount.map((v) => `${tokenAmount(v.amount)} ${v.tokenSymbol}`);
  }
  return [`${tokenAmount(Number(p.currentBalance) || 0)} ${p.tokenSymbol}`];
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
