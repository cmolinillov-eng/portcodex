/**
 * Descubrimiento de posiciones EVM vía Zerion (capa "qué tengo + cuánto vale").
 * Genérico: funciona con cualquier address. NO da rango/fees (eso lo aporta el
 * lector on-chain por protocolo); aquí solo descubrimos qué posiciones existen,
 * en qué cadena, protocolo y pool, y su valor.
 */

export type ZerionPosition = {
  positionType: string; // wallet | staked | deposit | loan | reward | locked
  chain: string; // ethereum, base, binance-smart-chain…
  protocol: string | null; // "PancakeSwap V3", "Aave V3"…
  protocolModule: string | null; // farming, lending…
  poolAddress: string | null;
  groupId: string | null;
  name: string | null; // "PancakeSwap V3 Farming: WETH/cbBTC Pool (1497859)"
  symbol: string | null;
  tokenAddress: string | null;
  amount: number;
  valueUsd: number | null;
  /** nft id extraído del name si lo hay (p.ej. 1497859). */
  nftId: string | null;
};

function basicAuth(): string | null {
  const key = process.env.ZERION_API_KEY;
  if (!key) return null;
  return Buffer.from(`${key}:`).toString("base64");
}

function extractNftId(name: string | null): string | null {
  if (!name) return null;
  const m = name.match(/\((\d{3,})\)\s*$/); // "(1497859)" al final
  return m ? m[1] : null;
}

/**
 * Posiciones de una address EVM. `complex=true` trae solo DeFi de protocolo;
 * `false` trae también los tokens sueltos (hold).
 */
export async function fetchZerionPositions(
  address: string,
  opts: { filter?: "only_simple" | "only_complex" | "no_filter"; currency?: string } = {},
): Promise<ZerionPosition[]> {
  const auth = basicAuth();
  if (!auth) throw new Error("Falta ZERION_API_KEY en el entorno.");
  const currency = opts.currency ?? "usd";
  // Solana solo admite only_simple; EVM admite no_filter (balances + DeFi).
  const filter = opts.filter ?? "no_filter";
  // sync=true fuerza refresco; no soportado igual en todos los casos, lo dejamos.
  const url =
    `https://api.zerion.io/v1/wallets/${address}/positions/` +
    `?currency=${currency}&filter%5Bpositions%5D=${filter}&sync=true`;

  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, accept: "application/json" },
    // Datos de mercado: no cachear agresivamente.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Zerion ${res.status}: ${await res.text().catch(() => "")}`.slice(0, 200));
  }
  const json = (await res.json()) as { data?: Array<{ attributes?: Record<string, unknown>; relationships?: Record<string, unknown> }> };
  const out: ZerionPosition[] = [];
  for (const p of json.data ?? []) {
    const a = (p.attributes ?? {}) as Record<string, unknown>;
    const rel = (p.relationships ?? {}) as Record<string, unknown>;
    const chain = ((rel.chain as { data?: { id?: string } })?.data?.id ?? "") as string;
    const fungible = (a.fungible_info ?? {}) as { symbol?: string; implementations?: Array<{ chain_id?: string; address?: string }> };
    const impl = (fungible.implementations ?? []).find((i) => i.chain_id === chain);
    const name = (a.name as string) ?? null;
    out.push({
      positionType: (a.position_type as string) ?? "wallet",
      chain,
      protocol: (a.protocol as string) ?? null,
      protocolModule: (a.protocol_module as string) ?? null,
      poolAddress: (a.pool_address as string) ?? null,
      groupId: (a.group_id as string) ?? null,
      name,
      symbol: fungible.symbol ?? null,
      tokenAddress: impl?.address ?? null,
      amount: Number((a.quantity as { float?: number })?.float ?? 0),
      valueUsd: typeof a.value === "number" ? (a.value as number) : null,
      nftId: extractNftId(name),
    });
  }
  return out;
}
