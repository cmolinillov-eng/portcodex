import { getSupabaseServiceClient, getSupabaseServerClient } from "@/lib/supabase/server";
import type { LivePosition } from "../types";

/**
 * Adaptador Meteora (DLMM en Solana) — LEE DE CACHÉ.
 *
 * Las posiciones DLMM de Meteora se leen con el SDK @meteora-ag/dlmm (CJS +
 * @solana/web3.js), que no encaja en las funciones serverless de Vercel. Un
 * worker en Node normal (scripts/onchain-cache.mjs, source "meteora") calcula
 * valor + rango + fees sin reclamar y lo cachea; aquí solo lo leemos.
 */
export async function enrichMeteora(
  ctx: { portfolioId: string; address: string },
): Promise<{ positions: LivePosition[]; warnings: string[] }> {
  const client = getSupabaseServiceClient() ?? getSupabaseServerClient();
  const { data, error } = await client
    .from("onchain_cache")
    .select("positions, updated_at")
    .eq("portfolio_id", ctx.portfolioId)
    .eq("source", "meteora")
    .maybeSingle();

  if (error) {
    // Tabla/fila sin crear todavía: sin Meteora, no error.
    return { positions: [], warnings: [] };
  }
  if (!data) {
    return { positions: [], warnings: [] };
  }

  const all = (data.positions ?? []) as LivePosition[];
  const positions = all.filter((p) => !p.walletAddress || p.walletAddress === ctx.address);
  const warnings: string[] = [];
  const age = data.updated_at ? Date.now() - new Date(data.updated_at as string).getTime() : 0;
  if (positions.length && age > 6 * 60 * 60 * 1000) warnings.push("Meteora: caché desactualizada (>6h).");
  return { positions, warnings };
}
