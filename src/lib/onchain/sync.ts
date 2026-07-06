import { getActiveWallets } from "./wallets";
import { fetchZerionPositions, type ZerionPosition } from "./discovery/zerion";
import { getSupabaseServiceClient, getSupabaseServerClient } from "@/lib/supabase/server";
import { enrichPancakeV3 } from "./evm/pancakeswap-v3";
import { enrichUniswapV3 } from "./evm/uniswap-v3";
import { enrichAave } from "./evm/aave";
import { enrichProjectX } from "./evm/projectx";
import { enrichKamino } from "./solana/kamino";
import { enrichOrca } from "./solana/orca";
import { enrichMeteora } from "./solana/meteora";
import { syncBitcoinWallet } from "./bitcoin/balance";
import type { LivePosition, LiveSyncResult, WalletRef } from "./types";

type SolanaAdapter = (ctx: { portfolioId: string; address: string }) => Promise<{ positions: LivePosition[]; warnings: string[] }>;
const SOLANA_ADAPTERS: SolanaAdapter[] = [enrichKamino, enrichOrca, enrichMeteora];

/**
 * Orquestador de la lectura on-chain de un portfolio. Genérico: recorre las
 * wallets de `portfolio_wallets`. Para cada address EVM descubre con Zerion
 * (una sola llamada no_filter = balances + DeFi) y enriquece on-chain con los
 * adaptadores por protocolo. Añadir un adaptador = una línea más aquí.
 *
 * Diseñado para que cualquier portfolio/address nueva entre sin tocar nada.
 */

// Protocolos con adaptador específico (rango, fees, salud…): sus posiciones
// de Zerion NO deben duplicarse en el genérico.
const HANDLED_PROTOCOLS = ["pancakeswap v3", "uniswap v3", "aave"];

/**
 * Adaptador GENÉRICO: cualquier posición DeFi que Zerion descubre y ningún
 * adaptador específico cubre (ether.fi, Morpho, Pendle…) se muestra con su
 * valor, agrupada por protocolo y cadena. Sin esto, esas posiciones
 * desaparecían del panel (solo pasaban los holds) — p.ej. el liquidUSD de
 * ether.fi de un cliente. No da rango/fees; sí valor, tokens y deuda.
 */
function genericDefiPositions(zerion: ZerionPosition[], w: WalletRef): LivePosition[] {
  const groups = new Map<string, ZerionPosition[]>();
  for (const z of zerion) {
    if (z.positionType === "wallet") continue;
    const proto = (z.protocol ?? "").toLowerCase();
    if (!proto) continue;
    if (HANDLED_PROTOCOLS.some((h) => proto.includes(h))) continue;
    if (!(Math.abs(z.valueUsd ?? 0) > 0.5)) continue;
    const key = `${z.chain}:${z.protocol}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(z);
  }
  return [...groups.entries()].map(([, rows]) => {
    const first = rows[0]!;
    const hasLoan = rows.some((r) => r.positionType === "loan");
    const tokens = rows.map((r) => ({
      symbol: r.symbol ?? "?",
      address: r.tokenAddress,
      amount: r.positionType === "loan" ? -r.amount : r.amount,
      valueUsd: r.positionType === "loan" ? -(r.valueUsd ?? 0) : r.valueUsd,
    }));
    const valueUsd = tokens.reduce((s, t) => s + (t.valueUsd ?? 0), 0);
    const protoSlug = (first.protocol ?? "defi").toLowerCase().replace(/[^\w]+/g, "-");
    return {
      id: `${first.chain}:generic:${protoSlug}`,
      portfolioId: w.portfolioId,
      walletAddress: w.address,
      chainKind: w.chainKind,
      chain: first.chain,
      protocol: first.protocol,
      kind: hasLoan ? ("lending_supply" as const) : ("staking" as const),
      label: rows.length === 1 && first.symbol ? `${first.protocol} · ${first.symbol}` : `${first.protocol}`,
      tokens,
      valueUsd,
      range: null,
      unclaimedUsd: null,
      meta: { generic: true },
      source: "zerion-generic",
    };
  });
}

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

/**
 * Respaldo ante caídas del descubridor (Zerion 5xx): reutiliza las posiciones
 * de esa wallet del último snapshot guardado, para que el panel nunca se
 * quede vacío por un fallo transitorio de un tercero.
 */
async function snapshotFallback(
  portfolioId: string,
  walletAddress: string,
  onlyKind?: string,
): Promise<LivePosition[]> {
  try {
    const client = getSupabaseServiceClient() ?? getSupabaseServerClient();
    const { data } = await client
      .from("onchain_cache")
      .select("positions")
      .eq("portfolio_id", portfolioId)
      .eq("source", "snapshot")
      .maybeSingle();
    const snap = data?.positions as { positions?: LivePosition[] } | undefined;
    return (snap?.positions ?? []).filter(
      (p) => p.walletAddress === walletAddress && (!onlyKind || p.kind === onlyKind),
    );
  } catch {
    return [];
  }
}

async function syncEvmWallet(w: WalletRef): Promise<{ positions: LivePosition[]; warnings: string[] }> {
  const positions: LivePosition[] = [];
  const warnings: string[] = [];

  let zerion: ZerionPosition[];
  try {
    zerion = await fetchZerionPositions(w.address, { filter: "no_filter" }); // balances + DeFi
  } catch (e) {
    const cached = await snapshotFallback(w.portfolioId, w.address);
    return {
      positions: cached,
      warnings: [
        `Zerion caído para ${w.address.slice(0, 8)}… (${(e as Error).message.slice(0, 60)}) — mostrando el último snapshot de esa wallet.`,
      ],
    };
  }

  // Hold (tokens sueltos)
  positions.push(...holdsToPositions(zerion, w));

  // DeFi sin adaptador específico (ether.fi, Morpho…): visible con su valor.
  positions.push(...genericDefiPositions(zerion, w));

  // Adaptadores por protocolo (cada uno filtra lo suyo del descubrimiento):
  const ctx = { portfolioId: w.portfolioId, address: w.address };
  for (const enrich of [enrichPancakeV3, enrichUniswapV3, enrichAave]) {
    const r = await enrich(zerion, ctx);
    positions.push(...r.positions);
    warnings.push(...r.warnings);
  }
  // Lectores directos (no dependen de Zerion; ProjectX no está indexado por Zerion)
  const directCtx = { portfolioId: w.portfolioId, address: w.address };
  for (const direct of [enrichProjectX]) {
    try {
      const r = await direct(directCtx);
      positions.push(...r.positions);
      warnings.push(...r.warnings);
    } catch (e) {
      warnings.push(`EVM directo: ${(e as Error).message}`.slice(0, 160));
    }
  }

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
    // Zerion caído: recupera los holds de esta wallet del último snapshot
    // (los adaptadores DeFi de abajo no dependen de Zerion y siguen en vivo).
    const cached = await snapshotFallback(w.portfolioId, w.address, "wallet");
    positions.push(...cached);
    warnings.push(
      `Zerion Solana caído para ${w.address.slice(0, 8)}… (${(e as Error).message.slice(0, 60)}) — holds del último snapshot.`,
    );
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
    const r =
      w.chainKind === "evm" ? await syncEvmWallet(w)
      : w.chainKind === "bitcoin" ? await syncBitcoinWallet(w)
      : await syncSolanaWallet(w);
    // Propagar el label de la wallet (Rabby, Phantom, Ledger…) a sus posiciones.
    positions.push(...r.positions.map((p) => ({ ...p, walletLabel: w.label })));
    warnings.push(...r.warnings);
  }

  // Orden: mayor valor primero.
  positions.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
  return { portfolioId, positions, warnings, syncedAt: new Date().toISOString() };
}
