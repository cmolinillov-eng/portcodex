/**
 * A qué red pertenece una posición.
 *
 * La contabilidad NO guarda la red: `defi_positions_analytics` tiene protocolo,
 * tipo y token, pero no cadena. La red vive en la lectura on-chain
 * (`onchain_cache`), que hoy está caducada para la mayoría de carteras. Así que
 * aquí se deduce de lo que sí hay.
 *
 * Es una inferencia de PRESENTACIÓN, no un dato contable: sirve para enseñar
 * concentración de riesgo, no para cuadrar cifras. Cuando no se puede saber, se
 * dice —«Otras redes»— en vez de inventar una.
 *
 * Los nombres de protocolo en la base de datos están sin normalizar: conviven
 * «Aave V3» y «Aave», «ORCA» y «Orca», «Pancakeswap» y «PancakeSwap V3»,
 * «Project X» y «ProjectX», «ETHER.FI» y «ether.fi». Por eso se compara en
 * minúsculas y por prefijo.
 */

export const UNKNOWN_NETWORK = "Otras redes";

/** Protocolo (en minúsculas, por prefijo) → red. */
const PROTOCOL_NETWORK: Array<[string, string]> = [
  // Solana
  ["kamino", "Solana"],
  ["orca", "Solana"],
  ["meteora", "Solana"],
  ["raydium", "Solana"],
  ["jito", "Solana"],
  ["marinade", "Solana"],
  // HyperEVM
  ["hyperliquid", "HyperEVM"],
  ["project x", "HyperEVM"],
  ["projectx", "HyperEVM"],
  // Base
  ["pancakeswap", "Base"],
  ["pancakeswap v3", "Base"],
  // Ethereum
  ["ether.fi", "Ethereum"],
  ["lido", "Ethereum"],
];

/**
 * Token → red, SOLO para holds, donde no hay protocolo que mire.
 *
 * Deliberadamente corto: se limita a monedas cuya red es inequívoca. USDC vive
 * en media docena de cadenas, así que no está aquí — adivinarlo sería peor que
 * decir que no se sabe.
 */
const TOKEN_NETWORK: Record<string, string> = {
  BTC: "Bitcoin",
  SOL: "Solana",
  JITOSOL: "Solana",
  JUPSOL: "Solana",
  PYUSD: "Solana",
  USDS: "Solana",
  HYPE: "HyperEVM",
};

export function resolveNetwork(protocol: string, tokenSymbol: string): string {
  const p = protocol.trim().toLowerCase();

  // «Wallet» es un hold: el protocolo no dice nada, manda el token.
  if (p !== "wallet") {
    // Se recorre de más largo a más corto para que «pancakeswap v3» gane a
    // «pancakeswap» si algún día divergen.
    const hit = [...PROTOCOL_NETWORK]
      .sort((a, b) => b[0].length - a[0].length)
      .find(([key]) => p.startsWith(key));
    if (hit) return hit[1];
  }

  return TOKEN_NETWORK[tokenSymbol.trim().toUpperCase()] ?? UNKNOWN_NETWORK;
}

/**
 * Reparto por red de un conjunto de posiciones, de mayor a menor.
 *
 * «Otras redes» siempre va al final aunque pese mucho: es un cajón de sastre, y
 * encabezar la lista le daría una entidad que no tiene.
 */
export function distributeByNetwork(
  positions: Array<{ protocol: string; tokenSymbol: string; currentValue: number }>,
): Array<{ name: string; valueUsd: number; share: number }> {
  const byNetwork = new Map<string, number>();
  let total = 0;

  for (const p of positions) {
    const value = Number(p.currentValue) || 0;
    if (value <= 0) continue;
    const net = resolveNetwork(p.protocol, p.tokenSymbol);
    byNetwork.set(net, (byNetwork.get(net) ?? 0) + value);
    total += value;
  }

  if (total <= 0) return [];

  return [...byNetwork.entries()]
    .map(([name, valueUsd]) => ({ name, valueUsd, share: (valueUsd / total) * 100 }))
    .sort((a, b) => {
      if (a.name === UNKNOWN_NETWORK) return 1;
      if (b.name === UNKNOWN_NETWORK) return -1;
      return b.valueUsd - a.valueUsd;
    });
}
