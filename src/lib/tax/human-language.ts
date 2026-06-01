/**
 * Traducción de categorías fiscales técnicas a lenguaje plano en español.
 *
 * El cliente final lee directamente las anotaciones — no puede ver términos
 * como "swap_out" o "rendimiento_capital_mobiliario". Este módulo centraliza
 * todas las traducciones a lenguaje natural.
 *
 * Mantener sincronizado con FiscalCategory en types.ts y SKILL.md.
 */

import type { FiscalCategory, WalletKind, IncomeType } from "./types";

// =============================================================================
// ETIQUETAS BREVES POR CATEGORÍA (badge en la UI)
// =============================================================================

const CATEGORY_LABEL: Record<FiscalCategory, string> = {
  // Adquisición / disposición
  buy: "Compra con fiat",
  sell: "Venta a fiat",
  swap_out: "Permuta (entrega)",
  swap_in: "Permuta (recepción)",
  payment_made: "Pago en cripto",
  payment_received: "Pago profesional recibido",
  salary_received: "Salario en cripto",
  card_spend: "Gasto con tarjeta cripto",
  card_cashback: "Cashback en cripto",
  // Rendimiento pasivo
  staking_reward: "Recompensa de staking",
  restaking_reward: "Recompensa de restaking",
  slashing_loss: "Pérdida por slashing",
  // LP / DeFi
  lp_provide: "Aporte a pool de liquidez",
  lp_remove: "Retirada de pool de liquidez",
  // Lending
  lending_interest: "Interés cobrado",
  liquidation: "Liquidación de colateral",
  // Transferencias
  non_taxable_transfer: "Transferencia interna",
  non_taxable_technical: "Operación técnica",
  // Eventos gratuitos
  airdrop: "Airdrop recibido",
  fork: "Hard fork",
  gift_received: "Donación recibida",
  gift_sent: "Donación enviada",
  // NFTs
  nft_buy_fiat: "Compra NFT con fiat",
  nft_buy_swap: "Compra NFT con cripto",
  nft_sell_fiat: "Venta NFT a fiat",
  nft_sell_swap: "Venta NFT por cripto",
  nft_mint: "Mint NFT",
  nft_mint_free: "Mint NFT gratuito",
  nft_royalty: "Royalty NFT",
  // Derivados
  derivative_open: "Apertura derivado",
  derivative_close: "Cierre derivado",
  derivative_funding_paid: "Funding pagado",
  derivative_funding_received: "Funding recibido",
  derivative_liquidation: "Liquidación derivado",
};

export function getCategoryLabel(category: FiscalCategory): string {
  return CATEGORY_LABEL[category] ?? category;
}

// =============================================================================
// ETIQUETAS DE TIPO DE WALLET (para mostrar en la pestaña de trazabilidad)
// =============================================================================

const WALLET_KIND_LABEL: Record<WalletKind, string> = {
  cex_es: "Exchange centralizado (España)",
  cex_foreign: "Exchange centralizado (extranjero)",
  dex: "Protocolo descentralizado",
  hot_wallet: "Wallet descentralizada caliente",
  cold_wallet: "Wallet descentralizada fría",
  paper_wallet: "Wallet en papel (frío)",
  smart_contract_wallet: "Smart contract wallet",
  broker_es: "Broker (España)",
  broker_foreign: "Broker (extranjero)",
  payment_app: "App de pagos",
  other: "Sin clasificar",
};

export function getWalletKindLabel(kind: WalletKind | null): string {
  if (!kind) return "Sin clasificar";
  return WALLET_KIND_LABEL[kind] ?? "Otro";
}

/** Devuelve etiqueta corta para badges. Ej: "Cold", "CEX" */
const WALLET_KIND_BADGE: Record<WalletKind, string> = {
  cex_es: "CEX",
  cex_foreign: "CEX",
  dex: "DEX",
  hot_wallet: "Hot",
  cold_wallet: "Cold",
  paper_wallet: "Cold",
  smart_contract_wallet: "Smart",
  broker_es: "Broker",
  broker_foreign: "Broker",
  payment_app: "Pay",
  other: "?",
};

export function getWalletKindBadge(kind: WalletKind | null): string {
  if (!kind) return "?";
  return WALLET_KIND_BADGE[kind] ?? "?";
}

// =============================================================================
// ETIQUETAS DE TIPO DE INCOME
// =============================================================================

const INCOME_TYPE_LABEL: Record<IncomeType, string> = {
  ganancia_patrimonial: "Ganancia patrimonial",
  perdida_patrimonial: "Pérdida patrimonial",
  rendimiento_capital_mobiliario: "Rendimiento de capital",
  rend_actividad_economica: "Actividad económica",
  rend_trabajo: "Rendimiento del trabajo",
  none: "Sin impacto fiscal directo",
};

export function getIncomeTypeLabel(type: IncomeType): string {
  return INCOME_TYPE_LABEL[type] ?? type;
}

// =============================================================================
// GENERADOR DE DESCRIPCIONES NATURALES POR MOVIMIENTO
// =============================================================================

export interface DescriptionContext {
  category: FiscalCategory;
  walletKind: WalletKind | null;
  walletName?: string;
  tokenSymbol: string;
  amount: number;
  valueEur: number;
  costBasisEur?: number;
  realizedGainEur?: number;
  positionType?: string;
}

/**
 * Genera una descripción en lenguaje natural para mostrar al cliente.
 * Ej: "Compraste 0.5 BTC en Binance con fiat (27.600 €). Cost basis registrado."
 */
export function buildHumanDescription(ctx: DescriptionContext): string {
  const { category, walletName, tokenSymbol, amount, valueEur, costBasisEur, realizedGainEur } = ctx;
  const where = walletName ? ` en ${walletName}` : "";
  const formatAmount = (n: number) => {
    if (n === 0) return "0";
    if (Math.abs(n) < 0.0001) return n.toExponential(2);
    if (Math.abs(n) < 1) return n.toFixed(6).replace(/0+$/, "");
    return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  };
  const eur = (n: number) => `${n.toFixed(2)} €`;
  const amt = `${formatAmount(amount)} ${tokenSymbol}`;
  const gainText =
    realizedGainEur !== undefined && realizedGainEur !== 0
      ? realizedGainEur > 0
        ? ` Ganancia patrimonial: ${eur(realizedGainEur)}.`
        : ` Pérdida patrimonial: ${eur(Math.abs(realizedGainEur))}.`
      : "";

  switch (category) {
    case "buy":
      return `Compraste ${amt}${where} con fiat (${eur(valueEur)}). Se registra como cost basis del nuevo balance.`;
    case "sell":
      return `Vendiste ${amt}${where} a fiat (${eur(valueEur)}).${costBasisEur !== undefined ? ` Cost basis FIFO consumido: ${eur(costBasisEur)}.` : ""}${gainText}`;
    case "swap_out":
      return `Entregaste ${amt}${where} en una permuta.${gainText}`;
    case "swap_in":
      return `Recibiste ${amt}${where} en una permuta (FMV ${eur(valueEur)}).`;
    case "lp_provide":
      return `Aportaste ${amt}${where} a una pool de liquidez. Según criterio DGT, esto cuenta como permuta.${gainText}`;
    case "lp_remove":
      return `Retiraste ${amt}${where} de una pool de liquidez (FMV ${eur(valueEur)}).`;
    case "staking_reward":
      return `Recibiste ${amt}${where} como recompensa de staking (FMV ${eur(valueEur)}). Rendimiento de capital mobiliario.`;
    case "restaking_reward":
      return `Recibiste ${amt}${where} como recompensa de restaking (FMV ${eur(valueEur)}).`;
    case "lending_interest":
      return `Recibiste ${amt}${where} como interés del lending (FMV ${eur(valueEur)}). Rendimiento de capital mobiliario.`;
    case "liquidation":
      return `Liquidación forzosa de ${amt}${where}.${gainText}`;
    case "airdrop":
      return `Recibiste ${amt}${where} como airdrop (FMV ${eur(valueEur)}). Ganancia patrimonial al recibir.`;
    case "fork":
      return `Recibiste ${amt}${where} por hard fork. Cost basis inicial: 0 €.`;
    case "non_taxable_transfer":
      return `Movimiento interno de ${amt}${where}. No hay cambio de titularidad — sin impacto fiscal directo.`;
    case "non_taxable_technical":
      return `Operación técnica sin impacto fiscal directo${where}.`;
    case "payment_made":
      return `Pago en cripto de ${amt}${where} (FMV ${eur(valueEur)}).${gainText}`;
    case "payment_received":
      return `Pago profesional recibido: ${amt}${where} (FMV ${eur(valueEur)}). Tributa como rendimiento de actividad económica.`;
    case "salary_received":
      return `Salario en cripto: ${amt}${where} (FMV ${eur(valueEur)}). Tributa como rendimiento del trabajo (base general).`;
    case "card_spend":
      return `Gasto con tarjeta cripto: ${amt}${where} (FMV ${eur(valueEur)}). Equivale a una venta.${gainText}`;
    case "card_cashback":
      return `Cashback recibido en cripto: ${amt}${where} (FMV ${eur(valueEur)}).`;
    case "gift_received":
      return `Donación recibida: ${amt}${where} (FMV ${eur(valueEur)}). Sujeta a Impuesto sobre Sucesiones y Donaciones (autonómico).`;
    case "gift_sent":
      return `Donación enviada: ${amt}${where} (FMV ${eur(valueEur)}).`;
    case "slashing_loss":
      return `Pérdida por slashing: ${amt}${where} (FMV ${eur(valueEur)}).`;
    case "nft_buy_fiat":
    case "nft_buy_swap":
    case "nft_sell_fiat":
    case "nft_sell_swap":
    case "nft_mint":
    case "nft_mint_free":
    case "nft_royalty":
      return `Operación NFT: ${getCategoryLabel(category)}${where} (${eur(valueEur)}).${gainText}`;
    case "derivative_open":
    case "derivative_close":
    case "derivative_funding_paid":
    case "derivative_funding_received":
    case "derivative_liquidation":
      return `Operación de derivado: ${getCategoryLabel(category)}${where}.${gainText}`;
    default:
      return `Movimiento clasificado como ${getCategoryLabel(category)}${where}.`;
  }
}
