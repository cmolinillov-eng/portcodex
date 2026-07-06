import type { LivePosition, WalletRef } from "../types";
import { detectExtendedKey, sumExtendedKeyBalance, type AddressStats } from "./xpub";

/**
 * Adaptador Bitcoin (hold en cold wallet, p.ej. Ledger).
 *
 * Balance vía mempool.space (API pública, gratis, sin key):
 *   GET /api/address/{address} → chain_stats (satoshis fundados - gastados).
 * Precio BTC vía CoinGecko (gratis). Una posición kind "wallet" por wallet.
 *
 * Soporta dos formas de registrar la wallet:
 *  - Dirección individual (bc1…, 3…, 1…): lee el saldo de esa dirección.
 *  - Clave pública extendida (xpub/ypub/zpub) de un monedero HD: deriva y suma
 *    TODAS las direcciones con actividad (recepción + cambio). Es lo correcto
 *    para un Ledger Native SegWit, que reparte el saldo en muchas direcciones.
 */

type MempoolAddress = {
  chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number; tx_count?: number };
  mempool_stats?: { funded_txo_sum?: number; spent_txo_sum?: number; tx_count?: number };
};

// Indexadores con la MISMA API (/api/address/{addr}). Al derivar un monedero
// HD se consultan decenas de direcciones y mempool.space aplica rate-limit
// (429): reintentamos con backoff y, si insiste, caemos al espejo. Sin esto un
// solo 429 dejaría el saldo BTC completo en blanco.
const BTC_API_HOSTS = ["https://mempool.space/api", "https://blockstream.info/api"];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchAddressStats(address: string): Promise<AddressStats> {
  let lastErr: Error | null = null;
  for (let hostIdx = 0; hostIdx < BTC_API_HOSTS.length; hostIdx++) {
    const host = BTC_API_HOSTS[hostIdx]!;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${host}/address/${address}`, { cache: "no-store" });
        if (res.status === 429 || res.status >= 500) {
          // Rate-limited o caído: espera creciente y reintenta; agotados los
          // intentos, prueba el siguiente host.
          await sleep(400 * (attempt + 1));
          lastErr = new Error(`${host} ${res.status}`);
          continue;
        }
        if (!res.ok) throw new Error(`${host} ${res.status}`);
        const json = (await res.json()) as MempoolAddress;
        const cs = json.chain_stats ?? {};
        const ms = json.mempool_stats ?? {};
        const funded = (cs.funded_txo_sum ?? 0) + (ms.funded_txo_sum ?? 0);
        const spent = (cs.spent_txo_sum ?? 0) + (ms.spent_txo_sum ?? 0);
        const txCount = (cs.tx_count ?? 0) + (ms.tx_count ?? 0);
        return { sats: funded - spent, txCount };
      } catch (e) {
        lastErr = e as Error;
        await sleep(300 * (attempt + 1));
      }
    }
  }
  throw lastErr ?? new Error("No se pudo leer el saldo Bitcoin.");
}

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
  const extKind = detectExtendedKey(w.address);

  let sats = 0;
  try {
    if (extKind) {
      // Monedero HD: derivar y sumar todas las direcciones con actividad.
      const { totalSats } = await sumExtendedKeyBalance(w.address, extKind, fetchAddressStats);
      sats = totalSats;
    } else {
      const { sats: single } = await fetchAddressStats(w.address);
      sats = single;
    }
  } catch (e) {
    return { positions: [], warnings: [`Bitcoin (${w.address.slice(0, 10)}…): ${(e as Error).message}`.slice(0, 160)] };
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
