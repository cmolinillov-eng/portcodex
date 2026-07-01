import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient, getSupabaseServerClient } from "@/lib/supabase/server";
import type { WalletRef } from "./types";

function getClient(): SupabaseClient {
  return getSupabaseServiceClient() ?? getSupabaseServerClient();
}

type Row = {
  id: string;
  portfolio_id: string;
  chain_kind: string;
  address: string;
  label: string | null;
};

function toRef(row: Row): WalletRef {
  return {
    id: row.id,
    portfolioId: row.portfolio_id,
    chainKind: row.chain_kind === "solana" ? "solana" : row.chain_kind === "bitcoin" ? "bitcoin" : "evm",
    address: row.address,
    label: row.label,
  };
}

/**
 * Devuelve las wallets activas a sincronizar. Genérico: lee toda la tabla
 * `portfolio_wallets`, así que cualquier portfolio o address nueva se incluye
 * sin tocar código. Opcionalmente filtra por portfolio.
 */
export async function getActiveWallets(portfolioId?: string): Promise<WalletRef[]> {
  const client = getClient();
  let query = client
    .from("portfolio_wallets")
    .select("id, portfolio_id, chain_kind, address, label")
    .eq("is_active", true);
  if (portfolioId) query = query.eq("portfolio_id", portfolioId);

  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron leer las wallets on-chain: ${error.message}`);
  return (data ?? []).map((r) => toRef(r as Row));
}
