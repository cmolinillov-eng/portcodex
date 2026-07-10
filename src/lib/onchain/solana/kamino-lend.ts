import { getSupabaseServiceClient, getSupabaseServerClient } from "@/lib/supabase/server";
import type { LivePosition } from "../types";

/**
 * Adaptador Kamino Lend (kVaults en Solana) — LEE DE CACHÉ.
 *
 * Los depósitos en las bóvedas de préstamo de Kamino (p. ej. "Sentora PYUSD")
 * son cuentas de SHARES, distintas de la liquidez concentrada (source "kamino").
 * El SDK @kamino-finance/klend-sdk resuelve shares + valor por share, pero usa
 * @solana/kit y no encaja en las funciones serverless de Vercel. El worker
 * (scripts/onchain-cache.mjs, source "kamino_lend") lo calcula; aquí solo lo
 * leemos.
 */
export async function enrichKaminoLend(
  ctx: { portfolioId: string; address: string },
): Promise<{ positions: LivePosition[]; warnings: string[] }> {
  const client = getSupabaseServiceClient() ?? getSupabaseServerClient();
  const { data, error } = await client
    .from("onchain_cache")
    .select("positions, updated_at")
    .eq("portfolio_id", ctx.portfolioId)
    .eq("source", "kamino_lend")
    .maybeSingle();

  if (error || !data) {
    // Tabla/fila sin crear todavía: sin Kamino Lend, no es error.
    return { positions: [], warnings: [] };
  }

  const all = (data.positions ?? []) as LivePosition[];
  const positions = all.filter((p) => !p.walletAddress || p.walletAddress === ctx.address);
  const warnings: string[] = [];
  const age = data.updated_at ? Date.now() - new Date(data.updated_at as string).getTime() : 0;
  if (positions.length && age > 6 * 60 * 60 * 1000) warnings.push("Kamino Lend: caché desactualizada (>6h).");
  return { positions, warnings };
}
