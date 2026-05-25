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
