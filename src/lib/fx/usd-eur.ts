/**
 * Cotización USD → EUR para mostrar valores en EUR sin tener que recachear
 * todos los precios. Todos los amounts internos siguen en USD; solo el
 * formatter visual multiplica por el rate cuando el usuario elige EUR.
 *
 * Fuente: Frankfurter (https://www.frankfurter.app) — gratis, sin API key,
 * datos del Banco Central Europeo. Si falla, fallback hardcoded conservador.
 *
 * Caché module-scoped con TTL de 30 minutos. En Vercel cada cold-start
 * resetea pero dentro de la misma instancia warm se reusa.
 */

const TTL_MS = 30 * 60 * 1000; // 30 min
const FALLBACK_RATE = 0.92;    // fallback razonable a 2026-05

let cached: { rate: number; fetchedAt: number } | null = null;
let inflight: Promise<number> | null = null;

async function fetchFromFrankfurter(): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR", {
      signal: controller.signal,
      next: { revalidate: 1800 },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { rates?: { EUR?: number } };
    const rate = data.rates?.EUR;
    if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
      return rate;
    }
    throw new Error("Respuesta sin EUR rate");
  } finally {
    clearTimeout(timeout);
  }
}

export async function getUsdToEurRate(): Promise<number> {
  const now = Date.now();
  if (cached && now - cached.fetchedAt < TTL_MS) {
    return cached.rate;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const rate = await fetchFromFrankfurter();
      cached = { rate, fetchedAt: now };
      return rate;
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("FX USD→EUR fetch failed, using fallback:", err);
      }
      // Mantén el último valor cacheado si existe, aunque sea viejo
      if (cached) return cached.rate;
      cached = { rate: FALLBACK_RATE, fetchedAt: now };
      return FALLBACK_RATE;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
