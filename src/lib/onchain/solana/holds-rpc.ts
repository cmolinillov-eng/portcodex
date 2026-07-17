import type { LivePosition, WalletRef } from "../types";

/**
 * Holds de Solana leídos EN DIRECTO de la cadena (Jupiter Ultra balances), no
 * de Zerion.
 *
 * Zerion `only_simple` va con retraso: cuando el gestor mueve tokens de la
 * wallet a un pool (p. ej. reinvierte USDC en Kamino), Zerion sigue mostrando
 * esos tokens en la wallet un buen rato → el snapshot cuenta el capital DOS
 * veces (hold fantasma + posición del pool). Jupiter Ultra devuelve el saldo
 * al slot actual, así que el hold desaparece en cuanto se mueve.
 *
 * Filtro clave: solo se conservan tokens que Jupiter PRECIA. Los tokens-recibo
 * de DeFi (shares de kVault, kTokens, jlTokens, posiciones…) no cotizan en
 * Jupiter → quedan fuera y no duplican lo que ya cuentan los adaptadores DeFi.
 */

const SOL_MINT = "So11111111111111111111111111111111111111112";

// Símbolos conocidos (evita una llamada de búsqueda por los tokens habituales).
const KNOWN_SYMBOLS: Record<string, string> = {
  [SOL_MINT]: "SOL",
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
  USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA: "USDS",
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": "PYUSD",
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: "JITOSOL",
  jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v: "JUPSOL",
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: "MSOL",
  bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1: "BSOL",
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: "JUP",
  HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3: "PYTH",
};

const jupHeaders = (): Record<string, string> =>
  process.env.JUPITER_API_KEY ? { "x-api-key": process.env.JUPITER_API_KEY } : {};

type UltraBalance = { uiAmount?: number };

async function jupBalances(address: string): Promise<Map<string, number>> {
  const res = await fetch(`https://lite-api.jup.ag/ultra/v1/balances/${address}`, {
    headers: jupHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Jupiter balances HTTP ${res.status}`);
  const json = (await res.json()) as Record<string, UltraBalance>;
  const out = new Map<string, number>();
  for (const [key, v] of Object.entries(json)) {
    // La clave "SOL" es el nativo; el resto son mints.
    const mint = key === "SOL" ? SOL_MINT : key;
    const amt = Number(v?.uiAmount ?? 0);
    if (amt > 0) out.set(mint, amt);
  }
  return out;
}

async function jupPrices(mints: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < mints.length; i += 50) {
    const batch = mints.slice(i, i + 50);
    try {
      const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${batch.join(",")}`, {
        headers: jupHeaders(),
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) {
        const json = (await res.json()) as Record<string, { usdPrice?: number }>;
        for (const m of batch) {
          const p = json[m]?.usdPrice;
          if (typeof p === "number" && p > 0) out.set(m, p);
        }
      }
    } catch {
      /* lote sin precio: se omite */
    }
  }
  return out;
}

const symbolCache = new Map<string, string>();
async function jupSymbol(mint: string): Promise<string> {
  if (KNOWN_SYMBOLS[mint]) return KNOWN_SYMBOLS[mint];
  if (symbolCache.has(mint)) return symbolCache.get(mint)!;
  let sym = `${mint.slice(0, 4)}…`;
  try {
    const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`, {
      headers: jupHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const arr = (await res.json()) as Array<{ id?: string; symbol?: string }>;
      const hit = Array.isArray(arr) ? arr.find((t) => t.id === mint) : null;
      if (hit?.symbol) sym = String(hit.symbol).toUpperCase();
    }
  } catch {
    /* sin símbolo: prefijo del mint */
  }
  symbolCache.set(mint, sym);
  return sym;
}

const RECEIPT_RE = /^(a[A-Z]|k[A-Z]|jl[A-Z]|c[A-Z]{2,})/; // aTokens, kTokens, jlTokens…

export async function fetchSolanaHoldsRpc(
  w: WalletRef,
): Promise<{ positions: LivePosition[]; warnings: string[] }> {
  const balances = await jupBalances(w.address);
  const mints = [...balances.keys()];
  const prices = await jupPrices(mints);

  const positions: LivePosition[] = [];
  for (const [mint, amount] of balances) {
    const price = prices.get(mint);
    if (!price) continue; // sin precio Jupiter = token-recibo DeFi → lo cuenta su adaptador
    const valueUsd = amount * price;
    if (valueUsd < 0.5) continue; // polvo
    const symbol = await jupSymbol(mint);
    if (RECEIPT_RE.test(symbol)) continue; // aToken/kToken/jlToken → no duplicar colateral
    const isSol = mint === SOL_MINT;
    positions.push({
      id: `solana:hold:${isSol ? "SOL" : mint}`,
      portfolioId: w.portfolioId,
      walletAddress: w.address,
      chainKind: "solana",
      chain: "solana",
      protocol: null,
      kind: "wallet",
      label: symbol,
      tokens: [{ symbol, address: isSol ? null : mint, amount, valueUsd }],
      valueUsd,
      range: null,
      unclaimedUsd: null,
      meta: {},
      source: "jupiter-balances",
    });
  }
  return { positions, warnings: [] };
}
