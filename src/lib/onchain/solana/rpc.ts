import { createSolanaRpc } from "@solana/kit";

/**
 * RPC de Solana. Usa Helius (fiable) si hay HELIUS_API_KEY; si no, RPC público
 * (poco fiable, trunca). Genérico para todos los adaptadores de Solana.
 */
export function getSolanaRpc() {
  const key = process.env.HELIUS_API_KEY;
  const url = key
    ? `https://mainnet.helius-rpc.com/?api-key=${key}`
    : "https://api.mainnet-beta.solana.com";
  return createSolanaRpc(url);
}

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
