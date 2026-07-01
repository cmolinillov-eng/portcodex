import type { LivePosition, WalletRef } from "../types";

/**
 * Adaptador Bitcoin (hold en cold wallet, p.ej. Ledger).
 *
 * Balance vía mempool.space (API pública, gratis, sin key):
 *   GET /api/address/{address} → chain_stats (satoshis fundados - gastados).
 * Precio BTC vía CoinGecko (gratis). Una posición kind "wallet" por address.
 *
 * Nota: es por ADDRESS individual. Si la wallet Ledger reparte fondos en varias
 * direcciones (xpub), basta con añadir cada address como fila en
 * portfolio_wallets; el orquestador las suma todas.
 */

type MempoolAddress = {
  chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
  mempool_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
};

async function fetchBtcPriceUsd(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { bitcoin?: { usd?: number } };
    return json.bitcoin?.usd ?? null;
  } catch {
    return null;
  }
}

export async function syncBitcoinWallet(
  w: WalletRef,
): Promise<{ positions: LivePosition[]; warnings: string[] }> {
  const warnings: string[] = [];

  let sats = 0;
  try {
    const res = await fetch(`https://mempool.space/api/address/${w.address}`, { cache: "no-store" });
    if (!res.ok) {
      return { positions: [], warnings: [`Bitcoin (${w.address.slice(0, 10)}…): mempool.space ${res.status}`] };
    }
    const json = (await res.json()) as MempoolAddress;
    const funded = (json.chain_stats?.funded_txo_sum ?? 0) + (json.mempool_stats?.funded_txo_sum ?? 0);
    const spent = (json.chain_stats?.spent_txo_sum ?? 0) + (json.mempool_stats?.spent_txo_sum ?? 0);
    sats = funded - spent;
  } catch (e) {
    return { positions: [], warnings: [`Bitcoin: ${(e as Error).message}`.slice(0, 160)] };
  }

  if (sats <= 0) return { positions: [], warnings };

  const amount = sats / 1e8;
  const price = await fetchBtcPriceUsd();
  if (price == null) warnings.push("Bitcoin: no se pudo obtener el precio (CoinGecko).");

  const positions: LivePosition[] = [{
    id: `bitcoin:hold:${w.address}`,
    portfolioId: w.portfolioId,
    walletAddress: w.address,
    chainKind: "bitcoin",
    chain: "bitcoin",
    protocol: null,
    kind: "wallet",
    label: "BTC",
    tokens: [{ symbol: "BTC", address: null, amount, valueUsd: price != null ? amount * price : null }],
    valueUsd: price != null ? amount * price : null,
    range: null,
    unclaimedUsd: null,
    meta: { sats },
    source: "mempool.space",
  }];
  return { positions, warnings };
}
