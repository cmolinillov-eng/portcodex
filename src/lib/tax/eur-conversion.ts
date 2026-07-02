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
 * Tipos de cambio USD→EUR HISTÓRICOS por fecha (Frankfurter/BCE, gratis).
 *
 * Con la ingesta on-chain el spot USD es del bloque (puede ser de meses
 * atrás): valorar con el FX de hoy desviaría los importes y haría los
 * informes no reproducibles. Devuelve Map "YYYY-MM-DD" → rate, con los días
 * sin cotización (fines de semana/festivos) rellenados con el día hábil
 * anterior. Si la API falla devuelve un Map vacío y el caller usa el tipo
 * actual como aproximación (comportamiento anterior, con disclaimer).
 */
export async function fetchEurRatesByDate(isoDates: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const days = [...new Set(isoDates.map((d) => d.slice(0, 10)))].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (!days.length) return out;
  // Empezar unos días antes para poder rellenar hacia delante el primer día.
  const start = new Date(`${days[0]}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 5);
  const startStr = start.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const end = days[days.length - 1] < today ? days[days.length - 1] : today;

  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/${startStr}..${end}?base=USD&symbols=EUR`, {
      cache: "no-store",
    });
    if (!res.ok) return out;
    const json = (await res.json()) as { rates?: Record<string, { EUR?: number }> };
    const series = json.rates ?? {};
    const seriesDays = Object.keys(series).sort();
    if (!seriesDays.length) return out;

    // Relleno hacia delante: cada día pedido usa la última cotización previa.
    let si = 0;
    let lastRate: number | null = null;
    for (const day of days) {
      while (si < seriesDays.length && seriesDays[si] <= day) {
        const r = series[seriesDays[si]]?.EUR;
        if (typeof r === "number" && r > 0) lastRate = r;
        si++;
      }
      if (lastRate != null) out.set(day, lastRate);
    }
  } catch {
    /* API caída: Map vacío → fallback al tipo actual */
  }
  return out;
}

/**
 * Devuelve el año fiscal de una fecha ISO, en hora peninsular española
 * (una operación del 1-ene 00:30 CET es del año nuevo aunque en UTC aún
 * sea 31-dic).
 */
export function getTaxYear(isoDate: string): number {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return new Date().getUTCFullYear();
  const year = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", year: "numeric" }).format(d),
  );
  return Number.isFinite(year) ? year : d.getUTCFullYear();
}
