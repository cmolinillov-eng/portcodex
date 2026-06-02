/**
 * Clasificación fiscal de wallets / custodios.
 *
 * Lee la tabla `wallet_protocols` (BD) y devuelve metadata fiscal para un
 * protocolo dado. Si el protocolo no está catalogado, devuelve fallback "other".
 *
 * Fuente de verdad: skills/spanish-crypto-tax-expert/SKILL.md sección
 * "Taxonomía de wallets — clasificación fiscal".
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WalletKind, WalletProtocolMeta } from "./types";

/**
 * Cache en memoria. Se construye en la primera llamada y se mantiene
 * durante el lifetime del proceso (server). Si añades nuevos protocolos
 * en BD, hay que reiniciar el server o invalidar el caché manualmente.
 */
let cache: Map<string, WalletProtocolMeta> | null = null;

const UNKNOWN_FALLBACK: WalletProtocolMeta = {
  name: "Unknown",
  walletKind: "other",
  countryCode: null,
  isForeign: false,
  custodial: false,
};

/**
 * Carga el catálogo entero a memoria. Idempotente.
 */
async function ensureCache(client: SupabaseClient): Promise<void> {
  if (cache !== null) return;

  cache = new Map<string, WalletProtocolMeta>();

  const { data, error } = await client
    .from("wallet_protocols")
    .select("name, wallet_kind, country_code, is_foreign, custodial");

  if (error || !data) {
    // Si la tabla no existe aún (migration no aplicada), dejamos cache vacío.
    // Toda lookup devolverá el fallback "other".
    return;
  }

  for (const row of data as Array<{
    name: string;
    wallet_kind: string;
    country_code: string | null;
    is_foreign: boolean;
    custodial: boolean;
  }>) {
    const key = normalizeProtocolName(row.name);
    cache.set(key, {
      name: row.name,
      walletKind: (row.wallet_kind as WalletKind) ?? "other",
      countryCode: row.country_code,
      isForeign: Boolean(row.is_foreign),
      custodial: Boolean(row.custodial),
    });
  }
}

/**
 * Normalización para matching case-insensitive y tolerante a espacios.
 */
export function normalizeProtocolName(name: string): string {
  return (name ?? "").trim().toLowerCase();
}

/**
 * Lookup principal — devuelve la metadata fiscal de un protocolo.
 * Si no se encuentra, devuelve fallback "other" sin lanzar excepción.
 */
export async function getWalletProtocolMeta(
  client: SupabaseClient,
  protocolName: string,
): Promise<WalletProtocolMeta> {
  await ensureCache(client);
  const key = normalizeProtocolName(protocolName);
  return cache!.get(key) ?? { ...UNKNOWN_FALLBACK, name: protocolName };
}

/**
 * Versión síncrona para tests / contextos sin cliente Supabase.
 * Usa un catálogo embebido mínimo (los más comunes).
 */
export function getWalletProtocolMetaSync(protocolName: string): WalletProtocolMeta {
  const key = normalizeProtocolName(protocolName);
  return EMBEDDED_CATALOG.get(key) ?? { ...UNKNOWN_FALLBACK, name: protocolName };
}

/**
 * Catálogo embebido mínimo para tests y categorización sin BD.
 * Mantener sincronizado con phase21_tax_module.sql INSERT inicial.
 */
const EMBEDDED_CATALOG = new Map<string, WalletProtocolMeta>([
  // CEX España
  ["bit2me",        { name: "Bit2Me",        walletKind: "cex_es",       countryCode: "ES", isForeign: false, custodial: true }],
  ["onyze",         { name: "Onyze",         walletKind: "cex_es",       countryCode: "ES", isForeign: false, custodial: true }],
  ["2gether",       { name: "2gether",       walletKind: "cex_es",       countryCode: "ES", isForeign: false, custodial: true }],
  // CEX extranjeras
  ["binance",       { name: "Binance",       walletKind: "cex_foreign",  countryCode: "MT", isForeign: true,  custodial: true }],
  ["coinbase",      { name: "Coinbase",      walletKind: "cex_foreign",  countryCode: "US", isForeign: true,  custodial: true }],
  ["kraken",        { name: "Kraken",        walletKind: "cex_foreign",  countryCode: "US", isForeign: true,  custodial: true }],
  ["okx",           { name: "OKX",           walletKind: "cex_foreign",  countryCode: "SC", isForeign: true,  custodial: true }],
  ["bybit",         { name: "Bybit",         walletKind: "cex_foreign",  countryCode: "AE", isForeign: true,  custodial: true }],
  ["kucoin",        { name: "KuCoin",        walletKind: "cex_foreign",  countryCode: "SC", isForeign: true,  custodial: true }],
  ["bitget",        { name: "Bitget",        walletKind: "cex_foreign",  countryCode: "SC", isForeign: true,  custodial: true }],
  ["mexc",          { name: "MEXC",          walletKind: "cex_foreign",  countryCode: "SC", isForeign: true,  custodial: true }],
  ["gate.io",       { name: "Gate.io",       walletKind: "cex_foreign",  countryCode: "KY", isForeign: true,  custodial: true }],
  ["htx",           { name: "HTX",           walletKind: "cex_foreign",  countryCode: "SC", isForeign: true,  custodial: true }],
  ["crypto.com",    { name: "Crypto.com",    walletKind: "cex_foreign",  countryCode: "SG", isForeign: true,  custodial: true }],
  ["bitstamp",      { name: "Bitstamp",      walletKind: "cex_foreign",  countryCode: "LU", isForeign: true,  custodial: true }],
  ["bitfinex",      { name: "Bitfinex",      walletKind: "cex_foreign",  countryCode: "VG", isForeign: true,  custodial: true }],
  // Brokers
  ["etoro",         { name: "eToro",         walletKind: "broker_foreign", countryCode: "CY", isForeign: true,  custodial: true }],
  ["trade republic",{ name: "Trade Republic",walletKind: "broker_foreign", countryCode: "DE", isForeign: true,  custodial: true }],
  ["revolut",       { name: "Revolut",       walletKind: "payment_app",  countryCode: "LT", isForeign: true,  custodial: true }],
  // DEX
  ["uniswap",       { name: "Uniswap",       walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["sushiswap",     { name: "Sushiswap",     walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["pancakeswap",   { name: "PancakeSwap",   walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["curve",         { name: "Curve",         walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["balancer",      { name: "Balancer",      walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["1inch",         { name: "1inch",         walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["jupiter",       { name: "Jupiter",       walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["raydium",       { name: "Raydium",       walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["orca",          { name: "Orca",          walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["aave",          { name: "Aave",          walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["compound",      { name: "Compound",      walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["morpho",        { name: "Morpho",        walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["yearn",         { name: "Yearn",         walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["beefy",         { name: "Beefy",         walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["eigenlayer",    { name: "EigenLayer",    walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["lido",          { name: "Lido",          walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["marinade",      { name: "Marinade",      walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["hyperliquid",   { name: "Hyperliquid",   walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["dydx",          { name: "dYdX",          walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["gmx",           { name: "GMX",           walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  // Solana DeFi (LP, lending, perps, liquid staking)
  ["kamino",        { name: "Kamino",        walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["projectx",      { name: "ProjectX",      walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["project x",     { name: "ProjectX",      walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["variational",   { name: "Variational",   walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["drift",         { name: "Drift",         walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["marginfi",      { name: "MarginFi",      walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["solend",        { name: "Solend",        walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["jito",          { name: "Jito",          walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["meteora",       { name: "Meteora",       walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["lifinity",      { name: "Lifinity",      walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["tulip",         { name: "Tulip",         walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["sanctum",       { name: "Sanctum",       walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  // EVM DeFi adicionales
  ["pendle",        { name: "Pendle",        walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["ethena",        { name: "Ethena",        walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["sky",           { name: "Sky",           walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["makerdao",      { name: "MakerDAO",      walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["spark",         { name: "Spark",         walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["rocket pool",   { name: "Rocket Pool",   walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["convex",        { name: "Convex",        walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["aura",          { name: "Aura",          walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["camelot",       { name: "Camelot",       walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["trader joe",    { name: "Trader Joe",    walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["traderjoe",     { name: "Trader Joe",    walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["vela",          { name: "Vela",          walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["vertex",        { name: "Vertex",        walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["aevo",          { name: "Aevo",          walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["synthetix",     { name: "Synthetix",     walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["morpho",        { name: "Morpho",        walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  // Restaking + LRTs
  ["karak",         { name: "Karak",         walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["ether.fi",      { name: "ether.fi",      walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["etherfi",       { name: "ether.fi",      walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["renzo",         { name: "Renzo",         walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["kelp",          { name: "Kelp DAO",      walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  ["puffer",        { name: "Puffer",        walletKind: "dex",          countryCode: null, isForeign: false, custodial: false }],
  // Wallets adicionales que el usuario mencionó
  ["solflare",      { name: "Solflare",      walletKind: "hot_wallet",   countryCode: null, isForeign: false, custodial: false }],
  ["backpack",      { name: "Backpack",      walletKind: "hot_wallet",   countryCode: null, isForeign: false, custodial: false }],
  ["bitbox",        { name: "BitBox",        walletKind: "cold_wallet",  countryCode: null, isForeign: false, custodial: false }],
  // Hot wallets
  ["metamask",      { name: "MetaMask",      walletKind: "hot_wallet",   countryCode: null, isForeign: false, custodial: false }],
  ["phantom",       { name: "Phantom",       walletKind: "hot_wallet",   countryCode: null, isForeign: false, custodial: false }],
  ["trust wallet",  { name: "Trust Wallet",  walletKind: "hot_wallet",   countryCode: null, isForeign: false, custodial: false }],
  ["rabby",         { name: "Rabby",         walletKind: "hot_wallet",   countryCode: null, isForeign: false, custodial: false }],
  ["rainbow",       { name: "Rainbow",       walletKind: "hot_wallet",   countryCode: null, isForeign: false, custodial: false }],
  ["coinbase wallet",{ name: "Coinbase Wallet",walletKind: "hot_wallet", countryCode: null, isForeign: false, custodial: false }],
  ["wallet",        { name: "Wallet",        walletKind: "hot_wallet",   countryCode: null, isForeign: false, custodial: false }],
  // Cold wallets
  ["ledger",        { name: "Ledger",        walletKind: "cold_wallet",  countryCode: null, isForeign: false, custodial: false }],
  ["trezor",        { name: "Trezor",        walletKind: "cold_wallet",  countryCode: null, isForeign: false, custodial: false }],
  ["coldcard",      { name: "Coldcard",      walletKind: "cold_wallet",  countryCode: null, isForeign: false, custodial: false }],
  ["keystone",      { name: "Keystone",      walletKind: "cold_wallet",  countryCode: null, isForeign: false, custodial: false }],
  ["hardware wallet",{ name: "Hardware Wallet",walletKind: "cold_wallet",countryCode: null, isForeign: false, custodial: false }],
  // Smart contract wallets
  ["safe",          { name: "Safe",          walletKind: "smart_contract_wallet", countryCode: null, isForeign: false, custodial: false }],
  ["argent",        { name: "Argent",        walletKind: "smart_contract_wallet", countryCode: null, isForeign: false, custodial: false }],
]);

/**
 * Invalida el caché (útil tras actualizar wallet_protocols en BD).
 */
export function invalidateWalletCache(): void {
  cache = null;
}

/**
 * Helper: ¿cuenta este protocolo para Modelo 721?
 * Solo custodios extranjeros profesionales (cex_foreign, broker_foreign).
 */
export function countsForModelo721(meta: WalletProtocolMeta): boolean {
  if (!meta.custodial) return false;
  if (!meta.isForeign) return false;
  return meta.walletKind === "cex_foreign" || meta.walletKind === "broker_foreign";
}
