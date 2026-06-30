import { address } from "@solana/kit";
import { getSolanaRpc } from "./rpc";
import type { LivePosition } from "../types";

// Los SDKs de Kamino arrastran WASM (@orca-so/whirlpools-core). Se importan de
// forma DINÁMICA dentro de la función: si el WASM falla en serverless, solo se
// pierde Kamino (capturado abajo), no tumba todo el panel.
type KaminoMod = typeof import("@kamino-finance/kliquidity-sdk");
type FarmsMod = typeof import("@kamino-finance/farms-sdk");

/**
 * Adaptador Kamino (Liquidez/strategies en Solana). Las posiciones de "Liquidity"
 * de Kamino son strategies cuyas shares se tienen STAKED en farms (no como tokens
 * en la wallet), así que se leen con el SDK oficial:
 *   - kliquidity-sdk.getUserPositions → strategies + shareMint + sharePrice.
 *   - farms-sdk.getAllUserStatesForUser → shares stakeadas (activeStakeScaled).
 *   valor = (activeStakeScaled / WAD / 10^decimals) · sharePrice.
 * Validado contra la wallet real (99.9% vs el portfolio de Kamino).
 *
 * Etiqueta del par desde /strategies/metrics (símbolos tokenA/tokenB).
 */

type Metrics = Record<string, { tokenA: string; tokenB: string }>;

async function strategyLabels(): Promise<Metrics> {
  try {
    const res = await fetch("https://api.kamino.finance/strategies/metrics?env=mainnet-beta&status=LIVE", { cache: "no-store" });
    if (!res.ok) return {};
    const arr = (await res.json()) as Array<{ strategy: string; tokenA: string; tokenB: string }>;
    const map: Metrics = {};
    for (const s of arr) map[s.strategy] = { tokenA: s.tokenA, tokenB: s.tokenB };
    return map;
  } catch {
    return {};
  }
}

export async function enrichKamino(
  ctx: { portfolioId: string; address: string },
): Promise<{ positions: LivePosition[]; warnings: string[] }> {
  const positions: LivePosition[] = [];
  const warnings: string[] = [];
  const rpc = getSolanaRpc();

  let userStrats: Array<{ strategy: unknown; shareMint: unknown; strategyDex?: string }> = [];
  try {
    const { Kamino } = (await import("@kamino-finance/kliquidity-sdk")) as KaminoMod;
    const { Farms, WAD, fetchFarmState } = (await import("@kamino-finance/farms-sdk")) as FarmsMod;

    const kamino = new Kamino("mainnet-beta", rpc);
    userStrats = (await kamino.getUserPositions(address(ctx.address))) as typeof userStrats;
    if (userStrats.length === 0) return { positions, warnings };

    // Shares stakeadas en farms, por shareMint.
    const farms = new Farms(rpc);
    const states = await farms.getAllUserStatesForUser(address(ctx.address));
    const stakedByMint = new Map<string, number>();
    for (const st of states) {
      const us = (st as { userState: { activeStakeScaled: unknown; farmState: unknown } }).userState;
      try {
        const fs = (await fetchFarmState(rpc, address(String(us.farmState)))) as unknown as {
          data: { token: { mint: unknown; decimals: bigint | number } };
        };
        const mint = String(fs.data.token.mint ?? "");
        const decimals = Number(fs.data.token.decimals ?? 0);
        const scaled = BigInt(String(us.activeStakeScaled));
        const shares = Number(scaled) / Number(WAD) / 10 ** decimals;
        if (mint) stakedByMint.set(mint, shares);
      } catch {
        /* farm ilegible: se omite */
      }
    }

    const labels = await strategyLabels();
    for (const p of userStrats) {
      const shareMint = String(p.shareMint);
      const strategyAddr = String(p.strategy);
      const shares = stakedByMint.get(shareMint) ?? 0;
      if (shares <= 0) continue;
      let sharePrice = 0;
      try {
        sharePrice = Number(await kamino.getStrategySharePrice(p.strategy as Parameters<typeof kamino.getStrategySharePrice>[0]));
      } catch { /* sin precio */ }
      const valueUsd = shares * sharePrice;
      const lab = labels[strategyAddr];
      const pair = lab ? `${lab.tokenA}/${lab.tokenB}` : "Kamino LP";

      positions.push({
        id: `solana:kamino:${strategyAddr}`,
        portfolioId: ctx.portfolioId,
        walletAddress: ctx.address,
        chainKind: "solana",
        chain: "solana",
        protocol: `Kamino (${p.strategyDex ?? "—"})`,
        kind: "liquidity",
        label: pair,
        tokens: [],
        valueUsd: valueUsd || null,
        range: null,
        unclaimedUsd: null,
        meta: { strategy: strategyAddr, shareMint, shares, sharePrice },
        source: "kamino",
      });
    }
  } catch (e) {
    warnings.push(`Kamino: ${(e as Error).message}`.slice(0, 160));
  }

  return { positions, warnings };
}
