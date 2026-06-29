import { createPublicClient, http, defineChain, type PublicClient } from "viem";
import { mainnet, arbitrum, base, polygon, bsc } from "viem/chains";

/**
 * Clientes viem por cadena EVM. El RPC se puede sobreescribir por variable de
 * entorno (RPC_<CHAIN>) para usar un free-tier más fiable; si no, fallback
 * público. Genérico: añadir una cadena aquí la habilita para todos los wallets.
 */

// HyperEVM no viene en viem; lo definimos.
const hyperevm = defineChain({
  id: 999,
  name: "HyperEVM",
  nativeCurrency: { name: "Hype", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.hyperliquid.xyz/evm"] } },
});

type ChainCfg = { chain: Parameters<typeof createPublicClient>[0]["chain"]; envKey: string; fallback: string };

// Claves = el `chain` string normalizado que usamos en LivePosition.
const CHAINS: Record<string, ChainCfg> = {
  ethereum: { chain: mainnet, envKey: "RPC_ETHEREUM", fallback: "https://eth.llamarpc.com" },
  arbitrum: { chain: arbitrum, envKey: "RPC_ARBITRUM", fallback: "https://arb1.arbitrum.io/rpc" },
  base: { chain: base, envKey: "RPC_BASE", fallback: "https://mainnet.base.org" },
  polygon: { chain: polygon, envKey: "RPC_POLYGON", fallback: "https://polygon-rpc.com" },
  bsc: { chain: bsc, envKey: "RPC_BSC", fallback: "https://bsc-dataseed.binance.org" },
  hyperevm: { chain: hyperevm, envKey: "RPC_HYPEREVM", fallback: "https://rpc.hyperliquid.xyz/evm" },
};

// Alias de nombres de cadena que llegan de fuentes externas (p.ej. Zerion).
const CHAIN_ALIASES: Record<string, string> = {
  "binance-smart-chain": "bsc",
  bnb: "bsc",
  "bnb-chain": "bsc",
  eth: "ethereum",
  matic: "polygon",
  "polygon-pos": "polygon",
  arb: "arbitrum",
};

export function normalizeChain(name: string): string {
  const k = (name || "").toLowerCase();
  return CHAIN_ALIASES[k] ?? k;
}

export function isSupportedEvmChain(name: string): boolean {
  return normalizeChain(name) in CHAINS;
}

const cache = new Map<string, PublicClient>();

export function getEvmClient(chainName: string): PublicClient {
  const key = normalizeChain(chainName);
  const cfg = CHAINS[key];
  if (!cfg) throw new Error(`Cadena EVM no soportada: ${chainName}`);
  if (!cache.has(key)) {
    const url = process.env[cfg.envKey] || cfg.fallback;
    cache.set(key, createPublicClient({ chain: cfg.chain, transport: http(url, { batch: true }) }) as PublicClient);
  }
  return cache.get(key)!;
}
