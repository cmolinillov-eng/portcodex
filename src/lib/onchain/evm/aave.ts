import type { Address } from "viem";
import { getEvmClient, isSupportedEvmChain, normalizeChain } from "./clients";
import type { ZerionPosition } from "../discovery/zerion";
import type { LivePosition, LiveTokenAmount } from "../types";

/**
 * Adaptador Aave V3. Zerion descubre las posiciones (deposit = colateral,
 * loan = deuda) por cadena; on-chain leemos `getUserAccountData` (una sola
 * llamada) → colateral, deuda, LTV y HEALTH FACTOR. Genérico para cualquier
 * address.
 */

// Pool de Aave V3 por cadena.
const POOLS: Record<string, Address> = {
  ethereum: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  arbitrum: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  base: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
  polygon: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  bsc: "0x6807dc923806fE8Fd134338EABCA509979a7e0cB",
};

const poolAbi = [{
  name: "getUserAccountData", type: "function", stateMutability: "view",
  inputs: [{ name: "user", type: "address" }],
  outputs: [
    { name: "totalCollateralBase", type: "uint256" },
    { name: "totalDebtBase", type: "uint256" },
    { name: "availableBorrowsBase", type: "uint256" },
    { name: "currentLiquidationThreshold", type: "uint256" },
    { name: "ltv", type: "uint256" },
    { name: "healthFactor", type: "uint256" },
  ],
}] as const;

const isAave = (p: ZerionPosition) => (p.protocol ?? "").toLowerCase().includes("aave");
const BASE_DECIMALS = 1e8; // Aave V3 base currency = USD con 8 decimales

export async function enrichAave(
  zerionPositions: ZerionPosition[],
  ctx: { portfolioId: string; address: string },
): Promise<{ positions: LivePosition[]; warnings: string[] }> {
  const warnings: string[] = [];
  // Agrupar tokens Aave por cadena.
  const byChain = new Map<string, ZerionPosition[]>();
  for (const p of zerionPositions) {
    if (!isAave(p)) continue;
    const chain = normalizeChain(p.chain);
    if (!isSupportedEvmChain(chain) || !POOLS[chain]) { warnings.push(`Aave en cadena no soportada: ${p.chain}`); continue; }
    if (!byChain.has(chain)) byChain.set(chain, []);
    byChain.get(chain)!.push(p);
  }

  const positions: LivePosition[] = [];
  for (const [chain, group] of byChain) {
    try {
      const client = getEvmClient(chain);
      const d = await client.readContract({ address: POOLS[chain], abi: poolAbi, functionName: "getUserAccountData", args: [ctx.address as Address] });
      const collateralUsd = Number(d[0]) / BASE_DECIMALS;
      const debtUsd = Number(d[1]) / BASE_DECIMALS;
      const hfRaw = d[5] as bigint;
      // HF = 1e18; sin deuda Aave devuelve maxUint256 (infinito).
      const healthFactor = debtUsd > 0 ? Number(hfRaw) / 1e18 : null;

      const tokens: LiveTokenAmount[] = group.map((g) => ({
        symbol: (g.positionType === "loan" ? "-" : "") + (g.symbol ?? "?"),
        address: g.tokenAddress,
        amount: g.positionType === "loan" ? -g.amount : g.amount,
        valueUsd: g.positionType === "loan" ? -(g.valueUsd ?? 0) : g.valueUsd,
      }));

      positions.push({
        id: `${chain}:aave:${ctx.address}`,
        portfolioId: ctx.portfolioId,
        walletAddress: ctx.address,
        chainKind: "evm",
        chain,
        protocol: "Aave V3",
        kind: "lending_supply",
        // Etiqueta ESTABLE (antes llevaba los importes: cambiaban en cada
        // lectura y ensuciaban los ids de adopción). El desglose
        // colateral/deuda lo pinta la UI desde meta.collateralUsd/debtUsd.
        label: "Aave V3",
        tokens,
        valueUsd: collateralUsd - debtUsd,
        range: null,
        unclaimedUsd: null,
        meta: {
          collateralUsd, debtUsd, healthFactor,
          ltv: Number(d[4]) / 10000,
          liquidationThreshold: Number(d[3]) / 10000,
        },
        source: "aave",
      });
    } catch (e) {
      warnings.push(`No se pudo leer Aave en ${chain}: ${(e as Error).message}`.slice(0, 160));
    }
  }
  return { positions, warnings };
}
