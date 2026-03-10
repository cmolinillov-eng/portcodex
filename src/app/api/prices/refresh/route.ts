import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { validateCsrf } from "@/lib/security/csrf";
import { checkRateLimit } from "@/lib/security/rate-limit";

type CoinGeckoPriceResponse = Record<string, { usd?: number }>;

type TokenRow = {
  token_in_symbol: string | null;
  token_out_symbol: string | null;
};

const symbolToCoinGeckoId: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  USDC: "usd-coin",
  USDT: "tether",
  BNB: "binancecoin",
  XRP: "ripple",
  ADA: "cardano",
  AVAX: "avalanche-2",
  MATIC: "matic-network",
  POL: "matic-network",
  LINK: "chainlink",
  ARB: "arbitrum",
  OP: "optimism",
  DOT: "polkadot",
  DOGE: "dogecoin",
  UNI: "uniswap",
  AAVE: "aave",
  ATOM: "cosmos",
  NEAR: "near",
  FTM: "fantom",
  CRV: "curve-dao-token",
  MKR: "maker",
  SNX: "havven",
  COMP: "compound-governance-token",
  SUSHI: "sushi",
  YFI: "yearn-finance",
  LDO: "lido-dao",
  RPL: "rocket-pool",
  GMX: "gmx",
  PENDLE: "pendle",
  INJ: "injective-protocol",
  TIA: "celestia",
  SEI: "sei-network",
  SUI: "sui",
  APT: "aptos",
  STETH: "staked-ether",
  WETH: "weth",
  WBTC: "wrapped-bitcoin",
  DAI: "dai",
  FRAX: "frax",
  RETH: "rocket-pool-eth",
  CBETH: "coinbase-wrapped-staked-eth",
  SHIB: "shiba-inu",
  PEPE: "pepe",
  FET: "fetch-ai",
  RNDR: "render-token",
  GRT: "the-graph",
  FIL: "filecoin",
  ALGO: "algorand",
  HBAR: "hedera-hashgraph",
  ICP: "internet-computer",
  STX: "blockstack",
  IMX: "immutable-x",
  SAND: "the-sandbox",
  MANA: "decentraland",
  AXS: "axie-infinity",
  ENS: "ethereum-name-service",
  BAL: "balancer",
  "1INCH": "1inch",
  CVX: "convex-finance",
  FXS: "frax-share",
  LQTY: "liquity",
  BLUR: "blur",
  WOO: "woo-network",
  JUP: "jupiter-exchange-solana",
  RAY: "raydium",
  ONDO: "ondo-finance",
  ENA: "ethena",
  PYTH: "pyth-network",
  W: "wormhole",
  JTO: "jito-governance-token",
};

function normalizeSymbol(value: string | null): string | null {
  const symbol = (value ?? "").trim().toUpperCase();
  return symbol.length > 0 ? symbol : null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size));
  }
  return output;
}

function getClient(): SupabaseClient {
  const serviceClient = getSupabaseServiceClient();
  if (serviceClient) return serviceClient;
  return getSupabaseServerClient();
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPricesFromCoinGecko(coinIds: string[], apiKey?: string): Promise<CoinGeckoPriceResponse> {
  if (coinIds.length === 0) return {};

  const endpoint = new URL("https://api.coingecko.com/api/v3/simple/price");
  endpoint.searchParams.set("ids", coinIds.join(","));
  endpoint.searchParams.set("vs_currencies", "usd");

  const headers: HeadersInit = { accept: "application/json" };
  if (apiKey) headers["x-cg-demo-api-key"] = apiKey;

  const response = await fetch(endpoint, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`CoinGecko ${response.status}: ${body}`);
  }
  return (await response.json()) as CoinGeckoPriceResponse;
}

async function fetchPricesWithRetry(coinIds: string[], apiKey?: string, attempts = 4): Promise<CoinGeckoPriceResponse> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchPricesFromCoinGecko(coinIds, apiKey);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Error desconocido consultando CoinGecko");
      if (attempt === attempts) break;
      await wait(attempt * 800);
    }
  }
  throw lastError ?? new Error("Error desconocido consultando CoinGecko");
}

export async function POST(request: NextRequest) {
  try {
    const csrfCheck = validateCsrf(request);
    if (!csrfCheck.ok) {
      return NextResponse.json({ error: csrfCheck.error }, { status: csrfCheck.status });
    }

    const access = await getViewerAccess();
    if (!access.canRefreshPrices) {
      return NextResponse.json({ error: "Este perfil no puede actualizar precios." }, { status: 403 });
    }
    if (!access.isSuperAdmin && access.allowedPortfolioIds.length === 0) {
      return NextResponse.json({ error: "No tienes portfolios asignados para actualizar precios." }, { status: 403 });
    }

    const clientIp = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "unknown";
    const rateKey = `prices-refresh:${access.userId ?? "anon"}:${clientIp}`;
    const rateLimit = checkRateLimit(rateKey, { limit: 2, windowMs: 60_000 });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Demasiadas solicitudes de actualización de precios. Inténtalo de nuevo en unos segundos.",
          retryAfterSeconds: Math.ceil(rateLimit.retryAfterMs / 1000),
        },
        { status: 429 },
      );
    }

    const client = getClient();
    const tokensQuery = access.isSuperAdmin
      ? await client
          .from("transactions")
          .select("token_in_symbol, token_out_symbol")
          .limit(10000)
      : await client
          .from("transactions")
          .select("token_in_symbol, token_out_symbol")
          .in("portfolio_id", access.allowedPortfolioIds)
          .limit(10000);

    if (tokensQuery.error) {
      throw new Error(`No se pudieron leer tokens de transactions: ${tokensQuery.error.message}`);
    }

    const symbols = new Set<string>();
    for (const row of (tokensQuery.data ?? []) as TokenRow[]) {
      const inSymbol = normalizeSymbol(row.token_in_symbol);
      const outSymbol = normalizeSymbol(row.token_out_symbol);
      if (inSymbol) symbols.add(inSymbol);
      if (outSymbol) symbols.add(outSymbol);
    }

    const mapped = Array.from(symbols)
      .map((symbol) => ({ symbol, coinId: symbolToCoinGeckoId[symbol] }))
      .filter((item) => item.coinId) as Array<{ symbol: string; coinId: string }>;

    const uniqueCoinIds = Array.from(new Set(mapped.map((item) => item.coinId)));
    const batches = chunk(uniqueCoinIds, 100);

    const apiKey = process.env.COINGECKO_API_KEY;
    const coinIdToPrice = new Map<string, number>();
    for (const batch of batches) {
      const prices = await fetchPricesWithRetry(batch, apiKey);
      for (const coinId of Object.keys(prices)) {
        const price = prices[coinId]?.usd;
        if (typeof price === "number" && Number.isFinite(price)) {
          coinIdToPrice.set(coinId, price);
        }
      }
    }

    const nowIso = new Date().toISOString();
    const rows = mapped
      .map((item) => {
        const price = coinIdToPrice.get(item.coinId);
        if (price === undefined) return null;
        return {
          token_symbol: item.symbol,
          price,
          last_updated: nowIso,
        };
      })
      .filter((item) => item !== null);

    if (rows.length > 0) {
      const upsert = await client
        .from("cached_prices")
        .upsert(rows, { onConflict: "token_symbol" });
      if (upsert.error) {
        throw new Error(`No se pudieron actualizar precios: ${upsert.error.message}`);
      }
    }

    return NextResponse.json({
      ok: true,
      updatedRows: rows.length,
      trackedSymbols: symbols.size,
      mappedSymbols: mapped.length,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Price refresh error:", error);
    return NextResponse.json({ error: "Error inesperado actualizando precios." }, { status: 400 });
  }
}
