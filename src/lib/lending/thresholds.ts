/**
 * Liquidation thresholds por token, expresados como fracción entre 0 y 1.
 *
 * El threshold representa la fracción del valor del colateral que cuenta
 * para el cálculo del Health Factor: a mayor threshold, más conservador
 * (más holgura ante movimientos de precio).
 *
 * Referencia: Aave V3 mainnet (parámetros típicos a 2026-05). Si tu
 * protocolo concreto usa parámetros distintos, ajusta aquí o expón una
 * UI para que el gestor sobreescriba por portfolio.
 *
 * Health Factor = Σ(colateral_i × precio_i × threshold_i) / Σ(deuda_j × precio_j)
 *
 * Si el HF cae por debajo de 1.0, la posición es candidata a liquidación.
 * Convención conservadora en la app: alerta visual cuando HF < 1.5.
 */

export const LIQUIDATION_THRESHOLDS: Record<string, number> = {
  // Blue chips
  BTC: 0.78,
  WBTC: 0.78,
  CBBTC: 0.78,
  TBTC: 0.75,
  ETH: 0.83,
  WETH: 0.83,
  STETH: 0.79,
  WSTETH: 0.79,
  RETH: 0.79,
  CBETH: 0.79,

  // L1/L2 majors
  SOL: 0.65,
  AVAX: 0.65,
  MATIC: 0.65,
  POL: 0.65,
  BNB: 0.70,
  ARB: 0.60,
  OP: 0.60,
  LINK: 0.65,
  AAVE: 0.70,
  UNI: 0.65,
  CRV: 0.55,
  LDO: 0.55,
  MKR: 0.65,

  // Liquid staking solana
  JITOSOL: 0.65,
  MSOL: 0.65,
  BSOL: 0.60,

  // Stablecoins major
  USDC: 0.87,
  USDT: 0.86,
  DAI: 0.87,
  USDS: 0.85,
  PYUSD: 0.80,
  USDE: 0.78,
  USDM: 0.78,
  FRAX: 0.80,

  // Stablecoins menores / yield-bearing
  GHO: 0.75,
  CRVUSD: 0.75,
  LUSD: 0.75,
  SUSDE: 0.72,
};

/**
 * Threshold por defecto para tokens no listados arriba.
 * Conservador: asume volatilidad alta / liquidez baja.
 */
export const DEFAULT_THRESHOLD = 0.50;

/**
 * Threshold de alerta visual: si el HF cae por debajo, mostrar rojo/aviso.
 */
export const HEALTH_FACTOR_ALERT = 1.5;

/**
 * Threshold de liquidación inminente: HF < 1.0 implica que la posición es
 * candidata a liquidación en el protocolo real.
 */
export const HEALTH_FACTOR_LIQUIDATION = 1.0;

export function getLiquidationThreshold(symbol: string): number {
  const normalized = (symbol ?? "").trim().toUpperCase();
  if (!normalized) return DEFAULT_THRESHOLD;
  return LIQUIDATION_THRESHOLDS[normalized] ?? DEFAULT_THRESHOLD;
}

/**
 * Calcula Health Factor a partir de breakdowns colateral/deuda en USD.
 *
 * collateralBreakdown: lista de { symbol, valueUsd } por token aportado.
 * debtBreakdown: lista de { symbol, valueUsd } por token prestado.
 *
 * Devuelve null si no hay deuda (HF infinito).
 *
 * Si totalEffectiveCollateral es 0 pero hay deuda → HF = 0 (peor caso).
 */
export function calculateHealthFactor(
  collateralBreakdown: Array<{ symbol: string; valueUsd: number }>,
  debtBreakdown: Array<{ symbol: string; valueUsd: number }>,
): number | null {
  const totalDebtUsd = debtBreakdown.reduce((acc, d) => acc + Math.max(0, d.valueUsd), 0);
  if (totalDebtUsd <= 0) return null;

  const totalEffectiveCollateralUsd = collateralBreakdown.reduce((acc, c) => {
    const value = Math.max(0, c.valueUsd);
    const threshold = getLiquidationThreshold(c.symbol);
    return acc + value * threshold;
  }, 0);

  if (totalEffectiveCollateralUsd <= 0) return 0;
  return totalEffectiveCollateralUsd / totalDebtUsd;
}

/**
 * LTV (Loan-to-Value) actual: deuda / colateral total (sin ponderar).
 *
 * Es el ratio "crudo" de apalancamiento. Devuelve null si no hay colateral.
 */
export function calculateLtv(
  collateralBreakdown: Array<{ valueUsd: number }>,
  debtBreakdown: Array<{ valueUsd: number }>,
): number | null {
  const totalCollateral = collateralBreakdown.reduce((acc, c) => acc + Math.max(0, c.valueUsd), 0);
  if (totalCollateral <= 0) return null;
  const totalDebt = debtBreakdown.reduce((acc, d) => acc + Math.max(0, d.valueUsd), 0);
  return totalDebt / totalCollateral;
}

/**
 * LTV máximo: el ratio ponderado de thresholds por valor de colateral.
 * Representa el porcentaje máximo del colateral que puedes pedir prestado
 * antes de tocar el umbral de liquidación.
 *
 * maxLtv = Σ(colateral_i × threshold_i) / Σ(colateral_i)
 *
 * Devuelve null si no hay colateral.
 */
export function calculateMaxLtv(
  collateralBreakdown: Array<{ symbol: string; valueUsd: number }>,
): number | null {
  const totalCollateral = collateralBreakdown.reduce((acc, c) => acc + Math.max(0, c.valueUsd), 0);
  if (totalCollateral <= 0) return null;
  const weighted = collateralBreakdown.reduce((acc, c) => {
    const value = Math.max(0, c.valueUsd);
    const threshold = getLiquidationThreshold(c.symbol);
    return acc + value * threshold;
  }, 0);
  return weighted / totalCollateral;
}

/**
 * Precio de liquidación por activo de colateral, asumiendo que el resto
 * de precios se mantienen constantes y la deuda no varía.
 *
 * Para cada activo i: encuentra el precio p_i_liq tal que HF = 1.0:
 *   Σ_{j≠i}(amount_j × price_j × threshold_j) + amount_i × p_i_liq × threshold_i = totalDebt
 *   ⇒ p_i_liq = (totalDebt - otherEffective) / (amount_i × threshold_i)
 *
 * Si p_i_liq ≤ 0 significa que el resto del colateral ya cubre la deuda
 * con margen — no hay riesgo de liquidación por este activo aislado.
 *
 * dropPercent: cuánto puede caer el precio actual antes de tocar el de
 * liquidación. Positivo = todavía hay margen; negativo = ya estás por
 * debajo (HF < 1.0 antes de empezar).
 */
export function calculateLiquidationPrices(
  collateralBreakdown: Array<{ symbol: string; amount: number; valueUsd: number }>,
  debtBreakdown: Array<{ valueUsd: number }>,
): Array<{
  symbol: string;
  currentPrice: number;
  liquidationPrice: number | null;
  dropPercent: number | null;
}> {
  const totalDebt = debtBreakdown.reduce((acc, d) => acc + Math.max(0, d.valueUsd), 0);
  const enriched = collateralBreakdown.map((c) => {
    const amount = Math.max(0, c.amount);
    const value = Math.max(0, c.valueUsd);
    const threshold = getLiquidationThreshold(c.symbol);
    const currentPrice = amount > 0 ? value / amount : 0;
    return { ...c, amount, value, threshold, currentPrice, effective: value * threshold };
  });
  const totalEffective = enriched.reduce((acc, e) => acc + e.effective, 0);

  return enriched.map((e) => {
    if (totalDebt <= 0 || e.amount <= 0 || e.threshold <= 0) {
      return { symbol: e.symbol, currentPrice: e.currentPrice, liquidationPrice: null, dropPercent: null };
    }
    const otherEffective = totalEffective - e.effective;
    const required = totalDebt - otherEffective;
    if (required <= 0) {
      // El resto del colateral ya cubre la deuda con margen → este token puede ir a 0 sin liquidar.
      return { symbol: e.symbol, currentPrice: e.currentPrice, liquidationPrice: 0, dropPercent: 100 };
    }
    const liquidationPrice = required / (e.amount * e.threshold);
    const dropPercent = e.currentPrice > 0 ? ((e.currentPrice - liquidationPrice) / e.currentPrice) * 100 : null;
    return { symbol: e.symbol, currentPrice: e.currentPrice, liquidationPrice, dropPercent };
  });
}
