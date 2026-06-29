import { getActiveWallets } from "./wallets";
import { fetchZerionPositions, type ZerionPosition } from "./discovery/zerion";
import { enrichPancakeV3 } from "./evm/pancakeswap-v3";
import type { LivePosition, LiveSyncResult, WalletRef } from "./types";

/**
 * Orquestador de la lectura on-chain de un portfolio. Genérico: recorre las
 * wallets de `portfolio_wallets`. Para cada address EVM descubre con Zerion
 * (una sola llamada no_filter = balances + DeFi) y enriquece on-chain con los
 * adaptadores por protocolo. Añadir un adaptador = una línea más aquí.
 *
 * Diseñado para que cualquier portfolio/address nueva entre sin tocar nada.
 */

/** Tokens sueltos (hold) → LivePosition kind "wallet". */
function holdsToPositions(zerion: ZerionPosition[], w: WalletRef): LivePosition[] {
  return zerion
    .filter((z) => z.positionType === "wallet" && (z.valueUsd ?? 0) > 0)
    .map((z) => ({
      id: `${z.chain}:hold:${z.tokenAddress ?? z.symbol}`,
      portfolioId: w.portfolioId,
      walletAddress: w.address,
      chainKind: "evm" as const,
      chain: z.chain,
      protocol: null,
      kind: "wallet" as const,
      label: z.symbol ?? "?",
      tokens: [{ symbol: z.symbol ?? "?", address: z.tokenAddress, amount: z.amount, valueUsd: z.valueUsd }],
      valueUsd: z.valueUsd,
      range: null,
      unclaimedUsd: null,
      meta: {},
      source: "zerion",
    }));
}

async function syncEvmWallet(w: WalletRef): Promise<{ positions: LivePosition[]; warnings: string[] }> {
  const positions: LivePosition[] = [];
  const warnings: string[] = [];

  let zerion: ZerionPosition[];
  try {
    zerion = await fetchZerionPositions(w.address, { complex: false }); // no_filter = todo
  } catch (e) {
    return { positions, warnings: [`Zerion falló para ${w.address}: ${(e as Error).message}`.slice(0, 160)] };
  }

  // Hold (tokens sueltos)
  positions.push(...holdsToPositions(zerion, w));

  // Adaptadores por protocolo (cada uno filtra lo suyo del descubrimiento):
  const pancake = await enrichPancakeV3(zerion, { portfolioId: w.portfolioId, address: w.address });
  positions.push(...pancake.positions);
  warnings.push(...pancake.warnings);
  // TODO: enrichUniswapV3, enrichAave, enrichProjectX… (se añaden aquí)

  return { positions, warnings };
}

export async function syncPortfolioLive(portfolioId: string): Promise<LiveSyncResult> {
  const wallets = await getActiveWallets(portfolioId);
  const positions: LivePosition[] = [];
  const warnings: string[] = [];

  for (const w of wallets) {
    if (w.chainKind === "evm") {
      const r = await syncEvmWallet(w);
      positions.push(...r.positions);
      warnings.push(...r.warnings);
    } else {
      warnings.push(`Solana aún no integrado para ${w.address} (Kamino/Orca/Jupiter pendientes).`);
    }
  }

  // Orden: mayor valor primero.
  positions.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
  return { portfolioId, positions, warnings, syncedAt: new Date().toISOString() };
}
