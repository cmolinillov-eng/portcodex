import type { LivePosition } from "../types";

/**
 * Adaptador Jupiter Lend (Solana) — API pública de Jupiter, sin SDK.
 *
 * Jupiter Lend tiene dos productos:
 *  - BORROW: bóvedas de colateral+deuda (estilo Fluid). El colateral vive en
 *    la bóveda (no en la wallet del usuario) → Zerion no lo ve y sin este
 *    adaptador la posición no aparecía.
 *  - EARN: depósitos que rinden (jlTokens).
 *
 * La API lite-api.jup.ag es HTTP puro y devuelve cantidades crudas + precio
 * por token, así que encaja directo en las funciones serverless (misma
 * familia de endpoints que ya usamos para precios). Modelo de deuda idéntico
 * al adaptador de Aave: token con símbolo "-X" y valueUsd negativo;
 * valueUsd de la posición = colateral − deuda.
 */

type JupApiToken = {
  address?: string;
  symbol?: string;
  uiSymbol?: string;
  decimals?: number;
  price?: string;
};

type JupBorrowPosition = {
  address?: string;
  supply?: string;
  borrow?: string;
  isLiquidated?: boolean;
  vault?: {
    address?: string;
    supplyToken?: JupApiToken;
    borrowToken?: JupApiToken;
    /** En permil: 850 = 85% umbral de liquidación. */
    liquidationThreshold?: string;
    supplyRate?: string;
    borrowRate?: string;
  };
};

type JupEarnPosition = {
  token?: (JupApiToken & { asset?: JupApiToken; assetAddress?: string });
  underlyingAssets?: string;
};

const API = "https://lite-api.jup.ag/lend/v1";

function tokenAmount(raw: string | undefined, token: JupApiToken | undefined): { amount: number; valueUsd: number | null } {
  const dec = Number(token?.decimals ?? 0);
  const amount = Number(raw ?? 0) / 10 ** dec;
  const price = token?.price != null ? Number(token.price) : null;
  return { amount, valueUsd: price != null && price > 0 ? amount * price : null };
}

export async function enrichJupiterLend(
  ctx: { portfolioId: string; address: string },
): Promise<{ positions: LivePosition[]; warnings: string[] }> {
  const positions: LivePosition[] = [];
  const warnings: string[] = [];
  const headers: Record<string, string> = process.env.JUPITER_API_KEY
    ? { "x-api-key": process.env.JUPITER_API_KEY }
    : {};

  // ── BORROW: colateral + deuda ──────────────────────────────────────────────
  try {
    const res = await fetch(`${API}/borrow/positions?users=${ctx.address}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      warnings.push(`Jupiter Lend: HTTP ${res.status} (borrow).`);
    } else {
      const rows = (await res.json()) as JupBorrowPosition[];
      for (const p of rows) {
        if (p.isLiquidated) continue;
        const supTok = p.vault?.supplyToken;
        const borTok = p.vault?.borrowToken;
        const sup = tokenAmount(p.supply, supTok);
        const bor = tokenAmount(p.borrow, borTok);
        const collateralUsd = sup.valueUsd ?? 0;
        const debtUsd = bor.valueUsd ?? 0;
        if (collateralUsd < 0.5 && debtUsd < 0.5) continue; // polvo
        const supSym = (supTok?.uiSymbol ?? supTok?.symbol ?? "?").toUpperCase();
        const borSym = (borTok?.uiSymbol ?? borTok?.symbol ?? "?").toUpperCase();
        // liquidationThreshold viene en permil (850 = 85%). Health factor al
        // estilo Aave: colateral·umbral / deuda (>1 = sano).
        const lt = Number(p.vault?.liquidationThreshold ?? 0) / 1000;
        const healthFactor = debtUsd > 0 && lt > 0 ? (collateralUsd * lt) / debtUsd : null;
        positions.push({
          id: `solana:jupiter-lend:${p.address ?? p.vault?.address ?? supSym + borSym}`,
          portfolioId: ctx.portfolioId,
          walletAddress: ctx.address,
          chainKind: "solana",
          chain: "solana",
          protocol: "Jupiter Lend",
          kind: "lending_supply",
          label: `${supSym}/${borSym}`,
          tokens: [
            { symbol: supSym, address: supTok?.address ?? null, amount: sup.amount, valueUsd: sup.valueUsd },
            ...(bor.amount > 0
              ? [{ symbol: `-${borSym}`, address: borTok?.address ?? null, amount: bor.amount, valueUsd: debtUsd > 0 ? -debtUsd : null }]
              : []),
          ],
          valueUsd: collateralUsd - debtUsd,
          range: null,
          unclaimedUsd: null,
          meta: {
            vault: p.vault?.address ?? null,
            positionAddress: p.address ?? null,
            collateralUsd,
            debtUsd,
            healthFactor,
            supplyRateBps: Number(p.vault?.supplyRate ?? 0),
            borrowRateBps: Number(p.vault?.borrowRate ?? 0),
          },
          source: "jupiter-lend",
        });
      }
    }
  } catch {
    warnings.push("Jupiter Lend: sin respuesta (borrow); reintenta el refresco.");
  }

  // ── EARN: depósitos jlToken (rinden solos, sin claim) ─────────────────────
  try {
    const res = await fetch(`${API}/earn/positions?users=${ctx.address}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const rows = (await res.json()) as JupEarnPosition[];
      for (const p of rows) {
        const asset = p.token?.asset;
        const { amount, valueUsd } = tokenAmount(p.underlyingAssets, asset);
        if (!(amount > 0) || (valueUsd ?? 0) < 0.5) continue;
        const sym = (asset?.uiSymbol ?? asset?.symbol ?? "?").toUpperCase();
        positions.push({
          id: `solana:jupiter-earn:${p.token?.address ?? sym}`,
          portfolioId: ctx.portfolioId,
          walletAddress: ctx.address,
          chainKind: "solana",
          chain: "solana",
          protocol: "Jupiter Lend",
          kind: "lending_supply",
          label: `Earn ${sym}`,
          tokens: [{ symbol: sym, address: asset?.address ?? null, amount, valueUsd }],
          valueUsd,
          range: null,
          unclaimedUsd: null,
          meta: { jlToken: p.token?.address ?? null },
          source: "jupiter-lend",
        });
      }
    }
  } catch {
    /* earn opcional: sin respuesta no es fatal */
  }

  return { positions, warnings };
}
