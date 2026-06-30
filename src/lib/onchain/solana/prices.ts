/**
 * Precios USD + decimales de tokens de Solana vía Jupiter Price API v3
 * (requiere JUPITER_API_KEY). Reutilizable por los adaptadores (Orca, Kamino…).
 */
export type TokenPrice = { usdPrice: number; decimals: number };

export async function getSolanaPrices(mints: string[]): Promise<Map<string, TokenPrice>> {
  const out = new Map<string, TokenPrice>();
  const key = process.env.JUPITER_API_KEY;
  const unique = [...new Set(mints.filter(Boolean))];
  if (unique.length === 0 || !key) return out;
  try {
    const res = await fetch(`https://api.jup.ag/price/v3?ids=${unique.join(",")}`, {
      headers: { "x-api-key": key },
      cache: "no-store",
    });
    if (!res.ok) return out;
    const json = (await res.json()) as Record<string, { usdPrice?: number; decimals?: number }>;
    for (const mint of unique) {
      const p = json?.[mint]?.usdPrice;
      const d = json?.[mint]?.decimals;
      if (typeof p === "number" && Number.isFinite(p)) {
        out.set(mint, { usdPrice: p, decimals: typeof d === "number" ? d : 0 });
      }
    }
  } catch {
    /* sin precios: los adaptadores dejan valueUsd en null */
  }
  return out;
}
