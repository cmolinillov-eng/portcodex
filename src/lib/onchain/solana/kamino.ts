import { getSupabaseServiceClient, getSupabaseServerClient } from "@/lib/supabase/server";
import type { LivePosition } from "../types";

/**
 * Adaptador Kamino (Liquidez en Solana) — LEE DE CACHÉ.
 *
 * Las posiciones de Kamino se leen con SDKs ESM+WASM que NO corren en las
 * funciones serverless de Vercel. Por eso un worker en Node normal (GitHub
 * Action, scripts/onchain-cache.mjs) las calcula y las cachea en la tabla
 * onchain_cache; aquí solo las leemos. Sin SDK → compatible con serverless.
 */
export async function enrichKamino(
  ctx: { portfolioId: string; address: string },
): Promise<{ positions: LivePosition[]; warnings: string[] }> {
  const client = getSupabaseServiceClient() ?? getSupabaseServerClient();
  const { data, error } = await client
    .from("onchain_cache")
    .select("positions, updated_at")
    .eq("portfolio_id", ctx.portfolioId)
    .eq("source", "kamino")
    .maybeSingle();

  if (error) {
    return { positions: [], warnings: [`Kamino (caché): ${error.message}`.slice(0, 140)] };
  }
  if (!data) {
    return { positions: [], warnings: ["Kamino: sin datos en caché todavía (el worker aún no ha corrido)."] };
  }

  const all = (data.positions ?? []) as LivePosition[];
  // Solo las de esta wallet (la caché puede tener varias wallets del portfolio).
  const positions = all.filter((p) => !p.walletAddress || p.walletAddress === ctx.address);
  const warnings: string[] = [];
  // Avisar si la caché está muy desactualizada (> 6 h).
  const age = data.updated_at ? Date.now() - new Date(data.updated_at as string).getTime() : 0;
  if (age > 6 * 60 * 60 * 1000) warnings.push("Kamino: caché desactualizada (>6h).");
  return { positions, warnings };
}
