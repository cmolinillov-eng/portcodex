import type { Address } from "viem";
import { getEvmClient } from "./clients";
import type { LivePosition, LiveTokenAmount } from "../types";

/**
 * ProjectX (HyperEVM) — fork Uniswap V3 en Hyperliquid.
 * Lee posiciones LP directamente del NonfungiblePositionManager (no depende de
 * Zerion) porque Zerion no indexa HyperEVM DeFi.
 */

const NPM: Address = "0xeaD19AE861c29bBb2101E834922B2FEee69B9091";
const FACTORY: Address = "0xFF7B3e8C00e57ea31477c32A5B52a58Eea47b072";
const USDC_HE: Address = "0xb88339cb7199b77e23db6e890353e22632ba630f";

const npmAbi = [
  {
    name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }],
  },
  {
    name: "tokenOfOwnerByIndex", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "index", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "positions", type: "function", stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { type: "uint96" }, { type: "address" }, { name: "token0", type: "address" },
      { name: "token1", type: "address" }, { name: "fee", type: "uint24" },
      { name: "tickLower", type: "int24" }, { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint128" }, { type: "uint256" }, { type: "uint256" },
      { name: "tokensOwed0", type: "uint128" }, { name: "tokensOwed1", type: "uint128" },
    ],
  },
] as const;

const factoryAbi = [{
  name: "getPool", type: "function", stateMutability: "view",
  inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }],
  outputs: [{ type: "address" }],
}] as const;

const poolAbi = [{
  name: "slot0", type: "function", stateMutability: "view", inputs: [],
  outputs: [{ name: "sqrtPriceX96", type: "uint160" }, { name: "tick", type: "int24" }],
}] as const;

const erc20Abi = [
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

const STABLES = new Set(["usdc", "usdt", "usd₮0", "usds", "dai", "pyusd", "usdc.e", "usdt.e"]);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

function tickToSqrt(tick: number): number {
  return Math.pow(1.0001, tick / 2);
}

function tickToPrice(tick: number, d0: number, d1: number): number {
  return Math.pow(1.0001, tick) * Math.pow(10, d0 - d1);
}

function clAmounts(
  liquidity: bigint, sqrtPriceX96: bigint,
  tickLower: number, tickUpper: number, d0: number, d1: number,
): { amount0: number; amount1: number } {
  const sqrtCur = Number(sqrtPriceX96) / 2 ** 96;
  const sqrtLo = tickToSqrt(tickLower);
  const sqrtHi = tickToSqrt(tickUpper);
  const L = Number(liquidity);
  let a0 = 0, a1 = 0;
  if (sqrtCur <= sqrtLo) {
    a0 = L * (1 / sqrtLo - 1 / sqrtHi);
  } else if (sqrtCur >= sqrtHi) {
    a1 = L * (sqrtHi - sqrtLo);
  } else {
    a0 = L * (1 / sqrtCur - 1 / sqrtHi);
    a1 = L * (sqrtCur - sqrtLo);
  }
  return { amount0: a0 / 10 ** d0, amount1: a1 / 10 ** d1 };
}

async function tokenPriceViaUsdc(
  token: Address, tokenDec: number,
  client: ReturnType<typeof getEvmClient>,
): Promise<number | null> {
  const usdcDec = 6;
  for (const fee of [500, 3000, 10000, 100]) {
    try {
      const pool = await client.readContract({
        address: FACTORY, abi: factoryAbi, functionName: "getPool",
        args: [token, USDC_HE, fee],
      }) as Address;
      if (pool === ZERO_ADDR) continue;
      const slot0 = await client.readContract({ address: pool, abi: poolAbi, functionName: "slot0" });
      const sqrtP = Number(slot0[0] as bigint) / 2 ** 96;
      const tokenIsT0 = token.toLowerCase() < USDC_HE.toLowerCase();
      const d0 = tokenIsT0 ? tokenDec : usdcDec;
      const d1 = tokenIsT0 ? usdcDec : tokenDec;
      const humanPrice = sqrtP * sqrtP * Math.pow(10, d0 - d1);
      return tokenIsT0 ? humanPrice : 1 / humanPrice;
    } catch { continue; }
  }
  return null;
}

export async function enrichProjectX(
  ctx: { portfolioId: string; address: string },
): Promise<{ positions: LivePosition[]; warnings: string[] }> {
  const client = getEvmClient("hyperevm");
  const warnings: string[] = [];
  const positions: LivePosition[] = [];

  let balance: number;
  try {
    balance = Number(
      await client.readContract({
        address: NPM, abi: npmAbi, functionName: "balanceOf",
        args: [ctx.address as Address],
      }),
    );
  } catch (e) {
    return { positions: [], warnings: [`ProjectX: ${(e as Error).message}`.slice(0, 160)] };
  }
  if (balance === 0) return { positions: [], warnings: [] };

  // Enumerate NFT token IDs
  const idCalls = Array.from({ length: balance }, (_, i) => ({
    address: NPM as Address, abi: npmAbi, functionName: "tokenOfOwnerByIndex" as const,
    args: [ctx.address as Address, BigInt(i)] as const,
  }));
  let tokenIds: bigint[];
  try {
    const res = await client.multicall({ allowFailure: true, contracts: idCalls });
    tokenIds = res.filter((r) => r.status === "success").map((r) => r.result as bigint);
  } catch {
    tokenIds = [];
    for (let i = 0; i < balance; i++) {
      try {
        tokenIds.push(
          (await client.readContract({
            address: NPM, abi: npmAbi, functionName: "tokenOfOwnerByIndex",
            args: [ctx.address as Address, BigInt(i)],
          })) as bigint,
        );
      } catch { /* skip */ }
    }
  }

  const priceCache = new Map<string, number | null>();

  for (const tokenId of tokenIds) {
    try {
      const pos = await client.readContract({ address: NPM, abi: npmAbi, functionName: "positions", args: [tokenId] });
      const token0 = pos[2] as Address, token1 = pos[3] as Address;
      const fee = Number(pos[4]);
      const tickLower = Number(pos[5]), tickUpper = Number(pos[6]);
      const liquidity = pos[7] as bigint;
      const tokensOwed0 = pos[10] as bigint, tokensOwed1 = pos[11] as bigint;

      if (liquidity === BigInt(0) && tokensOwed0 === BigInt(0) && tokensOwed1 === BigInt(0)) continue;

      const [pool, dec0, sym0, dec1, sym1] = await client.multicall({
        allowFailure: false,
        contracts: [
          { address: FACTORY, abi: factoryAbi, functionName: "getPool", args: [token0, token1, fee] },
          { address: token0, abi: erc20Abi, functionName: "decimals" },
          { address: token0, abi: erc20Abi, functionName: "symbol" },
          { address: token1, abi: erc20Abi, functionName: "decimals" },
          { address: token1, abi: erc20Abi, functionName: "symbol" },
        ],
      });

      const slot0 = await client.readContract({ address: pool as Address, abi: poolAbi, functionName: "slot0" });
      const sqrtPriceX96 = slot0[0] as bigint;
      const currentTick = Number(slot0[1]);
      const d0 = Number(dec0), d1 = Number(dec1);
      const s0 = (sym0 as string).toLowerCase(), s1 = (sym1 as string).toLowerCase();
      const inRange = tickLower <= currentTick && currentTick < tickUpper;

      const { amount0, amount1 } = clAmounts(liquidity, sqrtPriceX96, tickLower, tickUpper, d0, d1);

      // --- USD pricing ---
      let price0: number | null = STABLES.has(s0) ? 1 : null;
      let price1: number | null = STABLES.has(s1) ? 1 : null;

      const sqrtP = Number(sqrtPriceX96) / 2 ** 96;
      const poolPrice = sqrtP * sqrtP * Math.pow(10, d0 - d1);

      if (price0 != null && price1 == null) {
        price1 = price0 / poolPrice;
      } else if (price1 != null && price0 == null) {
        price0 = price1 * poolPrice;
      } else if (price0 == null && price1 == null) {
        const k0 = token0.toLowerCase();
        if (!priceCache.has(k0)) priceCache.set(k0, await tokenPriceViaUsdc(token0, d0, client));
        price0 = priceCache.get(k0) ?? null;
        if (price0 != null) {
          price1 = price0 / poolPrice;
        } else {
          const k1 = token1.toLowerCase();
          if (!priceCache.has(k1)) priceCache.set(k1, await tokenPriceViaUsdc(token1, d1, client));
          price1 = priceCache.get(k1) ?? null;
          if (price1 != null) price0 = price1 * poolPrice;
        }
      }

      const valueUsd =
        price0 != null && price1 != null ? amount0 * price0 + amount1 * price1 : null;

      const owed0 = Number(tokensOwed0) / 10 ** d0;
      const owed1 = Number(tokensOwed1) / 10 ** d1;
      const unclaimedUsd =
        price0 != null && price1 != null && (owed0 > 0 || owed1 > 0)
          ? owed0 * price0 + owed1 * price1
          : null;

      const tokens: LiveTokenAmount[] = [
        { symbol: sym0 as string, address: token0, amount: amount0, valueUsd: price0 != null ? amount0 * price0 : null },
        { symbol: sym1 as string, address: token1, amount: amount1, valueUsd: price1 != null ? amount1 * price1 : null },
      ];

      const feeLabel = fee > 0 ? ` ${fee / 10000}%` : "";
      positions.push({
        id: `hyperevm:projectx:${tokenId.toString()}`,
        portfolioId: ctx.portfolioId,
        walletAddress: ctx.address,
        chainKind: "evm",
        chain: "hyperevm",
        protocol: "ProjectX",
        kind: "liquidity",
        label: `${sym0}/${sym1}${feeLabel}`,
        tokens,
        valueUsd,
        range: {
          lower: tickToPrice(tickLower, d0, d1),
          upper: tickToPrice(tickUpper, d0, d1),
          current: tickToPrice(currentTick, d0, d1),
          inRange,
        },
        unclaimedUsd,
        meta: {
          nftId: tokenId.toString(), fee, tickLower, tickUpper, currentTick,
          liquidity: liquidity.toString(), pool,
        },
        source: "projectx",
      });
    } catch (e) {
      warnings.push(`ProjectX #${tokenId}: ${(e as Error).message}`.slice(0, 160));
    }
  }

  return { positions, warnings };
}
