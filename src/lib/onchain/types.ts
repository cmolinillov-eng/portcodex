/**
 * Tipos normalizados de la sincronización on-chain.
 *
 * Toda fuente (Zerion, lectores on-chain por protocolo, APIs de Solana) se
 * traduce a `LivePosition`, para que el resto de la app (panel "En vivo",
 * futura ingesta a `transactions`) no dependa del proveedor.
 *
 * Genérico por diseño: nada está atado a un portfolio o address concreta. La
 * lista de wallets sale de la tabla `portfolio_wallets`, así que añadir un
 * portfolio o una dirección nueva basta para que se lea.
 */

export type ChainKind = "evm" | "solana";

/** Una dirección pública a sincronizar, tal cual vive en portfolio_wallets. */
export type WalletRef = {
  id: string;
  portfolioId: string;
  chainKind: ChainKind;
  address: string;
  label: string | null;
};

/** Categoría funcional de la posición, alineada con el modelo de la app. */
export type LivePositionKind =
  | "wallet" // token suelto en la billetera (hold)
  | "liquidity" // LP (concentrada o no)
  | "lending_supply" // colateral aportado
  | "lending_borrow" // deuda
  | "staking" // staked / farming
  | "reward" // recompensa reclamable
  | "perp" // posición apalancada
  | "other";

/** Un token dentro de una posición (composición). */
export type LiveTokenAmount = {
  symbol: string;
  address: string | null; // mint en Solana, contract en EVM
  amount: number;
  valueUsd: number | null;
};

/** Rango de liquidez concentrada (Uniswap/Pancake V3, Orca whirlpools). */
export type LiveRange = {
  /** Precio mínimo y máximo (token1 por token0). */
  lower: number;
  upper: number;
  /** Precio actual del pool. */
  current: number;
  /** true si current está dentro de [lower, upper) → genera comisiones. */
  inRange: boolean;
};

/** Posición on-chain normalizada, fuente-agnóstica. */
export type LivePosition = {
  /** id estable: `${chain}:${protocol}:${ref}` (ref = nft id, pool, market…). */
  id: string;
  portfolioId: string;
  walletAddress: string;
  chainKind: ChainKind;
  /** Cadena concreta: "base", "ethereum", "solana", "hyperevm"… */
  chain: string;
  /** Protocolo: "PancakeSwap V3", "Aave", "Kamino", "Orca"… o null si hold. */
  protocol: string | null;
  kind: LivePositionKind;
  /** Etiqueta legible: "WETH/cbBTC 0.01%". */
  label: string;
  tokens: LiveTokenAmount[];
  valueUsd: number | null;
  /** Solo en LP concentrada. */
  range: LiveRange | null;
  /** Comisiones/recompensas sin reclamar, si se conocen. */
  unclaimedUsd: number | null;
  /** Datos crudos extra por protocolo (health factor, ticks, nft id…). */
  meta: Record<string, unknown>;
  /** Fuente que produjo la posición: "zerion", "pancakeswap-v3", "kamino"… */
  source: string;
};

/** Resultado de un sync de un portfolio. */
export type LiveSyncResult = {
  portfolioId: string;
  positions: LivePosition[];
  /** Avisos no fatales por fuente (rate limit, cobertura, etc.). */
  warnings: string[];
  syncedAt: string;
};
