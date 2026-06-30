import type { LivePosition } from "../types";

/**
 * Adaptador Kamino (Solana). Lending + liquidez vía la API pública gratuita
 * (api.kamino.finance). Genérico: consulta las obligaciones del usuario en los
 * mercados principales de Kamino. Sin key.
 *
 * Nota: el parseo de valor usa `refreshedStats` de la obligación; validar contra
 * una wallet con posición real (mfita no tiene Kamino activo ahora mismo).
 */

const API = "https://api.kamino.finance";

// Mercados de lending principales de Kamino.
const MARKETS: Array<{ name: string; address: string }> = [
  { name: "Main", address: "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF" },
  { name: "JLP", address: "DxXdAyU3kCjnyggvHmY5nAwg5cRbbmdyX3npfDMjjMek" },
  { name: "Altcoins", address: "ByYiZxp8QrdN9qbdtaAiePN8AAr3qvTPppNJDpf5DVJ5" },
];

type Obligation = {
  obligationAddress?: string;
  refreshedStats?: {
    userTotalDeposit?: string | number;
    userTotalBorrow?: string | number;
    netAccountValue?: string | number;
    loanToValue?: string | number;
  };
};

const n = (v: unknown): number => {
  const x = typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(x) ? x : 0;
};

export async function enrichKamino(
  ctx: { portfolioId: string; address: string },
): Promise<{ positions: LivePosition[]; warnings: string[] }> {
  const positions: LivePosition[] = [];
  const warnings: string[] = [];

  for (const market of MARKETS) {
    let obligations: Obligation[] = [];
    try {
      const res = await fetch(`${API}/kamino-market/${market.address}/users/${ctx.address}/obligations`, { cache: "no-store" });
      if (!res.ok) { warnings.push(`Kamino ${market.name} ${res.status}`); continue; }
      obligations = (await res.json()) as Obligation[];
    } catch (e) {
      warnings.push(`Kamino ${market.name} falló: ${(e as Error).message}`.slice(0, 120));
      continue;
    }

    for (const ob of obligations ?? []) {
      const stats = ob.refreshedStats ?? {};
      const deposit = n(stats.userTotalDeposit);
      const borrow = n(stats.userTotalBorrow);
      const net = stats.netAccountValue != null ? n(stats.netAccountValue) : deposit - borrow;
      if (deposit <= 0 && borrow <= 0) continue;
      positions.push({
        id: `solana:kamino:${ob.obligationAddress ?? market.address}`,
        portfolioId: ctx.portfolioId,
        walletAddress: ctx.address,
        chainKind: "solana",
        chain: "solana",
        protocol: `Kamino (${market.name})`,
        kind: "lending_supply",
        label: `Kamino ${market.name} · colateral ${deposit.toFixed(0)}$ / deuda ${borrow.toFixed(0)}$`,
        tokens: [],
        valueUsd: net,
        range: null,
        unclaimedUsd: null,
        meta: { collateralUsd: deposit, debtUsd: borrow, loanToValue: n(stats.loanToValue) },
        source: "kamino",
      });
    }
  }
  return { positions, warnings };
}
