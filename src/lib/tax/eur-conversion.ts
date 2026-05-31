/**
 * Conversión USD → EUR para anotación fiscal.
 *
 * Decisión de proyecto (sesión 2026-05-27): usar el tipo EUR/USD del momento
 * de la captura, NO el histórico. Para transacciones del pasado durante el
 * backfill se usa el tipo actual como aproximación (con disclaimer al usuario).
 *
 * Fuente del tipo: lib/fx/usd-eur.ts (Frankfurter / ECB, caché 30 min).
 */

import { getUsdToEurRate } from "@/lib/fx/usd-eur";

/**
 * Convierte un importe USD a EUR usando el tipo proporcionado.
 * Función pura — el rate viene desde fuera, no se llama a la red aquí.
 */
export function usdToEur(usdValue: number, rate: number): number {
  if (!Number.isFinite(usdValue) || !Number.isFinite(rate) || rate <= 0) return 0;
  return usdValue * rate;
}

/**
 * Redondeo fiscal a 2 decimales. La AEAT trabaja con céntimos.
 */
export function roundEur(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Cachea el último rate obtenido para que múltiples categorizaciones
 * en la misma "ronda" usen el mismo tipo. El motor de categorización
 * lo invoca una vez por sesión de procesamiento.
 *
 * Si la llamada a red falla, devuelve null y el caller decide qué hacer
 * (típicamente: abortar, no usar 0).
 */
export async function fetchCurrentEurRate(): Promise<number | null> {
  try {
    const rate = await getUsdToEurRate();
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return rate;
  } catch {
    return null;
  }
}

/**
 * Calcula la ganancia/pérdida realizada en EUR.
 * Positiva = ganancia patrimonial.
 * Negativa = pérdida patrimonial (compensable con ganancias).
 */
export function calculateRealizedGain(proceedsEur: number, costBasisEur: number): number {
  return roundEur(proceedsEur - costBasisEur);
}

/**
 * Devuelve el año fiscal de una fecha ISO.
 * En España coincide con año natural (1-ene a 31-dic).
 */
export function getTaxYear(isoDate: string): number {
  const d = new Date(isoDate);
  const year = d.getUTCFullYear();
  if (!Number.isFinite(year)) return new Date().getUTCFullYear();
  return year;
}
