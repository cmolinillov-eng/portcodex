import type { Address } from "viem";
import { getEvmClient, isSupportedEvmChain } from "./clients";
import type { ZerionPosition } from "../discovery/zerion";
import type { LivePosition, LiveTokenAmount } from "../types";

/**
 * Núcleo compartido para LPs estilo Uniswap V3 (concentrada): Uniswap V3,
 * PancakeSwap V3 y otros forks. Lee on-chain el RANGO, si está DENTRO/FUERA y
 * la composición. Cada protocolo solo aporta sus direcciones de contrato.
 */

export type V3Config = {
  /** Coincidencia con Zerion attributes.protocol (lowercase includes). */
  protocolMatch: string;
  protocolLabel: string;
  /** NonfungiblePositionManager y Factory (suelen ser deterministas por fork). */
  npm: Address;
  factory: Address;
  source: string;
};

const npmAbi = [{
  name: "positions", type: "function", stateMutability: "view",
  inputs: [{ name: "tokenId", type: "uint256" }],
  outputs: [
    { type: "uint96" }, { type: "address" }, { name: "token0", type: "address" },
    { name: "token1", type: "address" }, { name: "fee", type: "uint24" },
    { name: "tickLower", type: "int24" }, { name: "tickUpper", type: "int24" },
    { name: "liquidity", type: "uint128" }, { type: "uint256" }, { type: "uint256" },
    { name: "tokensOwed0", type: "uint128" }, { name: "tokensOwed1", type: "uint128" },
  ],
}] as const;
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

const tickToPrice = (tick: number, dec0: number, dec1: number) =>
  Math.pow(1.0001, tick) * Math.pow(10, dec0 - dec1);

async function enrichOne(
  cfg: V3Config,
  chain: string,
  nftId: string,
  group: ZerionPosition[],
  ctx: { portfolioId: string; address: string },
): Promise<LivePosition> {
  const client = getEvmClient(chain);
  const pos = await client.readContract({ address: cfg.npm, abi: npmAbi, functionName: "positions", args: [BigInt(nftId)] });
  const token0 = pos[2] as Address, token1 = pos[3] as Address, fee = Number(pos[4]);
  const tickLower = Number(pos[5]), tickUpper = Number(pos[6]);
  const liquidity = pos[7] as bigint;

  const [pool, dec0, sym0, dec1, sym1] = await client.multicall({
    allowFailure: false,
    contracts: [
      { address: cfg.factory, abi: factoryAbi, functionName: "getPool", args: [token0, token1, fee] },
      { address: token0, abi: erc20Abi, functionName: "decimals" },
      { address: token0, abi: erc20Abi, functionName: "symbol" },
      { address: token1, abi: erc20Abi, functionName: "decimals" },
      { address: token1, abi: erc20Abi, functionName: "symbol" },
    ],
  });
  const slot0 = await client.readContract({ address: pool as Address, abi: poolAbi, functionName: "slot0" });
  const currentTick = Number(slot0[1]);
  const d0 = Number(dec0), d1 = Number(dec1);

  const inRange = tickLower <= currentTick && currentTick < tickUpper;
  const stakedValue = group.filter((g) => g.positionType === "staked" || g.positionType === "deposit").reduce((s, g) => s + (g.valueUsd ?? 0), 0);
  const rewardValue = group.filter((g) => g.positionType === "reward").reduce((s, g) => s + (g.valueUsd ?? 0), 0);
  const tokens: LiveTokenAmount[] = group
    .filter((g) => g.positionType === "staked" || g.positionType === "deposit")
    .map((g) => ({ symbol: g.symbol ?? "?", address: g.tokenAddress, amount: g.amount, valueUsd: g.valueUsd }));

  return {
    id: `${chain}:${cfg.source}:${nftId}`,
    portfolioId: ctx.portfolioId,
    walletAddress: ctx.address,
    chainKind: "evm",
    chain,
    protocol: cfg.protocolLabel,
    kind: "liquidity",
    label: `${sym0}/${sym1} ${fee / 10000}%`,
    tokens,
    valueUsd: stakedValue || null,
    range: { lower: tickToPrice(tickLower, d0, d1), upper: tickToPrice(tickUpper, d0, d1), current: tickToPrice(currentTick, d0, d1), inRange },
    unclaimedUsd: rewardValue || null,
    meta: { nftId, fee, tickLower, tickUpper, currentTick, liquidity: liquidity.toString(), pool },
    source: cfg.source,
  };
}

export async function enrichV3(
  cfg: V3Config,
  zerionPositions: ZerionPosition[],
  ctx: { portfolioId: string; address: string },
): Promise<{ positions: LivePosition[]; warnings: string[] }> {
  const warnings: string[] = [];
  const byNft = new Map<string, ZerionPosition[]>();
  for (const p of zerionPositions) {
    if (!(p.protocol ?? "").toLowerCase().includes(cfg.protocolMatch) || !p.nftId) continue;
    if (!isSupportedEvmChain(p.chain)) { warnings.push(`${cfg.protocolLabel} en cadena no soportada: ${p.chain}`); continue; }
    const key = `${p.chain}:${p.nftId}`;
    if (!byNft.has(key)) byNft.set(key, []);
    byNft.get(key)!.push(p);
  }

  const positions: LivePosition[] = [];
  for (const [key, group] of byNft) {
    const [chain, nftId] = key.split(":");
    try {
      positions.push(await enrichOne(cfg, chain, nftId, group, ctx));
    } catch (e) {
      warnings.push(`No se pudo leer ${cfg.protocolLabel} #${nftId} en ${chain}: ${(e as Error).message}`.slice(0, 160));
    }
  }
  return { positions, warnings };
}
