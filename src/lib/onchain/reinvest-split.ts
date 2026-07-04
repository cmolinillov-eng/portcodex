/**
 * Cesta harvest vs cesta redepositada (reinversión on-chain).
 *
 * La cesta que entra al pool en una reinversión puede NO coincidir con la
 * cobrada en el harvest: parte se permuta dentro de la misma tx (swap
 * implícito) y/o el usuario añade capital extra que la tolerancia ±50% del
 * match reinversión↔harvest absorbería en silencio. `computeReinvestSplit`
 * compara ambas cestas y devuelve:
 *
 *  - swapLegsBySymbol: por token comprado, qué se vendió para comprarlo. El
 *    motor fiscal (handleLpDeposit en src/lib/tax/categorize.ts) consume por
 *    FIFO el lote del vendido y crea el del comprado con base trasladada —
 *    sin esto el lote del vendido queda vivo y el comprado sale del pool a
 *    FMV: base duplicada.
 *  - capitalBySymbol: porción de cada token que EXCEDE el valor del harvest;
 *    es aportación genuina y se contabiliza como capital depositado.
 *
 * Función pura — no toca BD, no hace I/O.
 */

export type ReinvestEventToken = {
  symbol: string;
  amount: number;
  priceUsd: number | null;
};

export type SwapLeg = {
  soldSymbol: string;
  soldAmount: number;
  soldPriceUsd: number;
  boughtSymbol: string;
  boughtAmount: number;
  boughtPriceUsd: number;
};

export type ReinvestSplit = {
  swapLegsBySymbol: Map<string, SwapLeg[]>;
  capitalBySymbol: Map<string, number>;
  excessUsd: number;
};

export function computeReinvestSplit(
  harvestTokens: ReinvestEventToken[],
  depositTokens: ReinvestEventToken[],
  harvestValueUsd: number,
): ReinvestSplit | null {
  const aggregate = (list: ReinvestEventToken[]) => {
    const map = new Map<string, { amount: number; priceUsd: number }>();
    for (const t of list) {
      if (!(t.amount > 0)) continue;
      const sym = t.symbol.toUpperCase();
      const cur = map.get(sym);
      map.set(sym, {
        amount: (cur?.amount ?? 0) + t.amount,
        priceUsd: t.priceUsd != null && t.priceUsd > 0 ? t.priceUsd : cur?.priceUsd ?? 0,
      });
    }
    return map;
  };
  const harvested = aggregate(harvestTokens);
  const deposited = aggregate(depositTokens);

  type Leg = { symbol: string; amount: number; priceUsd: number };
  const sold: Leg[] = [];
  const bought: Leg[] = [];
  for (const sym of new Set([...harvested.keys(), ...deposited.keys()])) {
    const h = harvested.get(sym);
    const d = deposited.get(sym);
    const delta = (d?.amount ?? 0) - (h?.amount ?? 0);
    // Diferencias < 0.5% son ruido de redondeo del escáner, no un swap.
    if (Math.abs(delta) <= 0.005 * Math.max(h?.amount ?? 0, d?.amount ?? 0)) continue;
    const priceUsd = (delta < 0 ? h?.priceUsd : d?.priceUsd) || h?.priceUsd || d?.priceUsd || 0;
    // Sin precio no se puede valorar la permuta: mejor no anotar nada y que
    // el gestor revise (el evento ya exige priceUsd en los tokens usables).
    if (priceUsd <= 0) return null;
    if (delta < 0) sold.push({ symbol: sym, amount: -delta, priceUsd });
    else bought.push({ symbol: sym, amount: delta, priceUsd });
  }

  const soldUsd = sold.reduce((acc, l) => acc + l.amount * l.priceUsd, 0);
  const boughtUsd = bought.reduce((acc, l) => acc + l.amount * l.priceUsd, 0);
  // Exceso: valor comprado no cubierto por lo vendido del harvest → capital
  // genuino. Umbral mínimo (1 USD o 1% del harvest) para no trocear filas
  // por céntimos de deriva de precios entre harvest y depósito.
  const rawExcess = Math.max(0, boughtUsd - soldUsd);
  const excessUsd = rawExcess > Math.max(1, 0.01 * harvestValueUsd) ? rawExcess : 0;
  const capitalFraction = boughtUsd > 0 ? excessUsd / boughtUsd : 0;
  const swapUsdMatched = Math.min(soldUsd, boughtUsd - excessUsd);
  const soldScale = soldUsd > 0 ? swapUsdMatched / soldUsd : 0;

  const swapLegsBySymbol = new Map<string, SwapLeg[]>();
  const capitalBySymbol = new Map<string, number>();
  for (const b of bought) {
    const weight = boughtUsd > 0 ? (b.amount * b.priceUsd) / boughtUsd : 0;
    const capitalAmount = b.amount * capitalFraction;
    if (capitalAmount > 0) capitalBySymbol.set(b.symbol, capitalAmount);
    const boughtSwapAmount = b.amount - capitalAmount;
    if (boughtSwapAmount <= 0 || soldScale <= 0) continue;
    // Reparto proporcional: cada token comprado consume su parte (por peso
    // USD) de cada token vendido.
    const legs: SwapLeg[] = sold.map((s) => ({
      soldSymbol: s.symbol,
      soldAmount: s.amount * soldScale * weight,
      soldPriceUsd: s.priceUsd,
      boughtSymbol: b.symbol,
      boughtAmount: boughtSwapAmount * ((s.amount * s.priceUsd) / soldUsd),
      boughtPriceUsd: b.priceUsd,
    }));
    swapLegsBySymbol.set(b.symbol, legs);
  }

  return { swapLegsBySymbol, capitalBySymbol, excessUsd };
}
