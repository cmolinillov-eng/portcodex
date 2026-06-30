import { getActiveWallets } from "./wallets";
import { fetchZerionPositions, type ZerionPosition } from "./discovery/zerion";
import { enrichPancakeV3 } from "./evm/pancakeswap-v3";
import { enrichUniswapV3 } from "./evm/uniswap-v3";
import { enrichAave } from "./evm/aave";
import { enrichKamino } from "./solana/kamino";
import { enrichOrca } from "./solana/orca";
import type { LivePosition, LiveSyncResult, WalletRef } from "./types";

type SolanaAdapter = (ctx: { portfolioId: string; address: string }) => Promise<{ positions: LivePosition[]; warnings: string[] }>;
const SOLANA_ADAPTERS: SolanaAdapter[] = [enrichKamino, enrichOrca];

/**
 * Orquestador de la lectura on-chain de un portfolio. Genérico: recorre las
 * wallets de `portfolio_wallets`. Para cada address EVM descubre con Zerion
 * (una sola llamada no_filter = balances + DeFi) y enriquece on-chain con los
 * adaptadores por protocolo. Añadir un adaptador = una línea más aquí.
 *
 * Diseñado para que cualquier portfolio/address nueva entre sin tocar nada.
 */

/** Tokens sueltos (hold) → LivePosition kind "wallet". Sirve para EVM y Solana. */
function holdsToPositions(zerion: ZerionPosition[], w: WalletRef): LivePosition[] {
  return zerion
    .filter((z) => z.positionType === "wallet" && (z.valueUsd ?? 0) > 0)
    .map((z) => ({
      id: `${z.chain}:hold:${z.tokenAddress ?? z.symbol}`,
      portfolioId: w.portfolioId,
      walletAddress: w.address,
      chainKind: w.chainKind,
      chain: z.chain || (w.chainKind === "solana" ? "solana" : "evm"),
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
    zerion = await fetchZerionPositions(w.address, { filter: "no_filter" }); // balances + DeFi
  } catch (e) {
    return { positions, warnings: [`Zerion falló para ${w.address}: ${(e as Error).message}`.slice(0, 160)] };
  }

  // Hold (tokens sueltos)
  positions.push(...holdsToPositions(zerion, w));

  // Adaptadores por protocolo (cada uno filtra lo suyo del descubrimiento):
  const ctx = { portfolioId: w.portfolioId, address: w.address };
  for (const enrich of [enrichPancakeV3, enrichUniswapV3, enrichAave]) {
    const r = await enrich(zerion, ctx);
    positions.push(...r.positions);
    warnings.push(...r.warnings);
  }
  // TODO: enrichAave, enrichProjectX, Solana… (se añaden a la lista de arriba)

  return { positions, warnings };
}

async function syncSolanaWallet(w: WalletRef): Promise<{ positions: LivePosition[]; warnings: string[] }> {
  const positions: LivePosition[] = [];
  const warnings: string[] = [];

  // Hold (tokens sueltos con valor) vía Zerion (Solana solo admite only_simple).
  try {
    const zerion = await fetchZerionPositions(w.address, { filter: "only_simple" });
    positions.push(...holdsToPositions(zerion, w));
  } catch (e) {
    warnings.push(`Zerion Solana falló para ${w.address}: ${(e as Error).message}`.slice(0, 160));
  }

  // Adaptadores DeFi de Solana (cada uno consulta la API pública del protocolo):
  const ctx = { portfolioId: w.portfolioId, address: w.address };
  for (const enrich of SOLANA_ADAPTERS) {
    try {
      const r = await enrich(ctx);
      positions.push(...r.positions);
      warnings.push(...r.warnings);
    } catch (e) {
      warnings.push(`Adaptador Solana falló: ${(e as Error).message}`.slice(0, 160));
    }
  }
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
      const r = await syncSolanaWallet(w);
      positions.push(...r.positions);
      warnings.push(...r.warnings);
    }
  }

  // Orden: mayor valor primero.
  positions.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
  return { portfolioId, positions, warnings, syncedAt: new Date().toISOString() };
}
