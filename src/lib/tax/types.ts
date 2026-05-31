/**
 * Tipos del módulo fiscal España.
 *
 * Espejo TypeScript de las enums almacenadas como TEXT en la BD
 * (tablas tax_lots, tax_events, transactions.fiscal_*).
 *
 * Fuente de verdad: skills/spanish-crypto-tax-expert/SKILL.md
 */

// =============================================================================
// CATEGORÍAS FISCALES
// =============================================================================
//
// Cada transacción se etiqueta con UNA categoría fiscal según el catálogo
// definido en SKILL.md sección "Resumen rápido para el motor de categorización".

export type FiscalCategory =
  // ─── Adquisición / disposición ──────────────────────────────────────────
  | "buy"                      // fiat → cripto (NO tributa, crea lote)
  | "sell"                     // cripto → fiat (TRIBUTA, consume lote)
  | "swap_out"                 // entrega lado en permuta cripto-cripto
  | "swap_in"                  // recepción lado en permuta cripto-cripto
  | "payment_made"             // pago en cripto a comercio
  | "payment_received"         // recibir pago profesional en cripto
  | "salary_received"          // salario en cripto
  | "card_spend"               // gasto con tarjeta cripto
  | "card_cashback"            // cashback en cripto

  // ─── Rendimiento pasivo ─────────────────────────────────────────────────
  | "staking_reward"           // recompensa staking PoS
  | "restaking_reward"         // recompensa EigenLayer / LRTs
  | "slashing_loss"            // penalización slashing

  // ─── LP / DeFi ─────────────────────────────────────────────────────────
  | "lp_provide"               // depositar liquidez (permuta hacia LP token)
  | "lp_remove"                // retirar liquidez (permuta desde LP token)

  // ─── Lending ──────────────────────────────────────────────────────────
  | "lending_interest"         // interés cobrado por prestar
  | "liquidation"              // liquidación forzosa de colateral

  // ─── Transferencias y movimientos técnicos ─────────────────────────────
  | "non_taxable_transfer"     // entre wallets propias, supply/withdraw lending, etc.
  | "non_taxable_technical"    // approve, sign, vote (sin impacto fiscal)

  // ─── Eventos gratuitos / protocolares ─────────────────────────────────
  | "airdrop"                  // drop recibido (TRIBUTA al recibir)
  | "fork"                     // hard fork — cost basis = 0
  | "gift_received"            // donación recibida (ISyD, no IRPF)
  | "gift_sent"                // donación enviada

  // ─── NFTs ────────────────────────────────────────────────────────────
  | "nft_buy_fiat"             // compra NFT con fiat
  | "nft_buy_swap"             // compra NFT con cripto (permuta)
  | "nft_sell_fiat"            // venta NFT a fiat
  | "nft_sell_swap"            // venta NFT por cripto
  | "nft_mint"                 // mint NFT pagando con cripto
  | "nft_mint_free"            // mint gratis (solo gas)
  | "nft_royalty"              // royalties recibidos como creador

  // ─── Derivados ─────────────────────────────────────────────────────
  | "derivative_open"          // apertura posición (sin evento fiscal)
  | "derivative_close"         // cierre con PnL
  | "derivative_funding_paid"  // funding fee pagado
  | "derivative_funding_received" // funding fee recibido
  | "derivative_liquidation";  // liquidación forzosa de derivado

// =============================================================================
// TIPO DE RENTA (clasificación fiscal española)
// =============================================================================

export type IncomeType =
  | "ganancia_patrimonial"          // ventas, permutas → base ahorro
  | "perdida_patrimonial"           // pérdidas patrimoniales
  | "rendimiento_capital_mobiliario" // staking, lending interest → base ahorro
  | "rend_actividad_economica"      // ingresos profesionales → base general
  | "rend_trabajo"                  // salario → base general
  | "none";                         // operación sin impacto en renta

// =============================================================================
// CLASIFICACIÓN DE WALLETS
// =============================================================================

export type WalletKind =
  | "cex_es"                 // exchange centralizado España (NO Modelo 721)
  | "cex_foreign"            // exchange centralizado extranjero (SÍ Modelo 721 si >50K€)
  | "dex"                    // protocolo descentralizado
  | "hot_wallet"             // self-custody software online
  | "cold_wallet"            // self-custody hardware
  | "paper_wallet"           // seed escrita offline
  | "smart_contract_wallet"  // Safe, Argent, ZeroDev
  | "broker_es"              // broker tradicional España
  | "broker_foreign"         // broker tradicional extranjero
  | "payment_app"            // Revolut, PayPal Crypto
  | "other";

export interface WalletProtocolMeta {
  /** Nombre exacto del protocolo (matching transactions.protocol) */
  name: string;
  walletKind: WalletKind;
  /** ISO 3166-1 alpha-2 (ES, US, MT...) o null para DEX/self-custody */
  countryCode: string | null;
  /** True si cuenta para Modelo 721 (cex_foreign / broker_foreign) */
  isForeign: boolean;
  /** True si el custodio guarda tus claves (CEX, brokers) */
  custodial: boolean;
}

// =============================================================================
// LOTE FIFO
// =============================================================================
//
// Espejo TS de la tabla tax_lots. Representa una "compra" o "recepción"
// de un token con su cost basis en EUR.

export type LotOriginEvent =
  | "buy"
  | "swap_in"
  | "staking_reward"
  | "restaking_reward"
  | "lending_interest"
  | "airdrop"
  | "fork"
  | "lp_remove"
  | "nft_mint_free"
  | "card_cashback"
  | "payment_received"
  | "salary_received";

export interface TaxLot {
  id: string;
  portfolioId: string;
  tokenSymbol: string;

  /** Estado actual (mutable tras consumos parciales) */
  amount: number;
  costBasisEur: number;

  /** Estado inicial al crear el lote (inmutable, para trazabilidad) */
  originalAmount: number;
  originalCostBasisEur: number;

  /** Origen */
  acquiredAt: string;       // ISO timestamp
  acquiredViaTransactionId: string | null;
  acquiredViaEvent: LotOriginEvent;

  /** Estado de consumo: null = activo, timestamp = agotado al 100% */
  exhaustedAt: string | null;
}

// =============================================================================
// EVENTO TRIBUTABLE
// =============================================================================
//
// Espejo TS de la tabla tax_events. Resultado del motor cuando una transacción
// genera un evento fiscal (venta, permuta, recompensa, etc.).

export interface ConsumedLotRef {
  lotId: string;
  amountConsumed: number;
  costBasisConsumedEur: number;
  acquiredAt: string;
}

export interface TaxEvent {
  /** Para que el caller pueda upsertarlo en BD; se rellena tras insertar */
  id?: string;
  portfolioId: string;
  transactionId: string | null;

  /** Categoría fiscal — coincide con FiscalCategory */
  eventType: FiscalCategory;

  /** Cuándo ocurrió (= fecha de la transacción que lo origina) */
  eventDate: string;
  taxYear: number;

  /** Montos en EUR */
  proceedsEur: number;
  costBasisEur: number;
  realizedGainEur: number; // proceeds − cost_basis (positiva=ganancia)

  incomeType: IncomeType;

  /** Token(s) involucrado(s). Para LPs puede ser "TOKEN_A/TOKEN_B" */
  tokenSymbol: string | null;
  tokenAmount: number | null;

  /** Detalle de los lotes consumidos (FIFO trace) */
  lotsConsumed: ConsumedLotRef[] | null;

  notes: string | null;
}

// =============================================================================
// ANOTACIÓN FISCAL (espejo de transactions.fiscal_*)
// =============================================================================
//
// Resumen "plano" que se guarda en la propia transacción para mostrarse
// directamente en el History modal sin necesidad de joinar tax_events.

export interface FiscalAnnotation {
  category: FiscalCategory;
  incomeType: IncomeType;
  valueEur: number;
  costBasisEur: number;
  realizedGainEur: number;
  notes: string;
  taxable: boolean;
  /** Etiqueta breve en español plano para el cliente. Ej: "Compra con fiat", "Permuta" */
  humanLabel: string;
  /** Descripción larga del movimiento. Ej: "Vendiste 0.5 BTC en Binance a fiat..." */
  humanDescription: string;
  /**
   * Si la categorización fue inferida automáticamente (TRUE) o confirmada
   * manualmente por el gestor (FALSE). Las inferidas pueden requerir revisión.
   */
  inferred: boolean;
  /**
   * Identificador del tipo de wallet involucrado para mostrarlo en la UI
   * sin necesidad de joinar wallet_protocols. Útil para agrupar movimientos
   * por wallet en la pestaña de trazabilidad.
   */
  walletKind: WalletKind | null;
}

/**
 * Disclaimer estándar que debe mostrarse en cualquier vista que use
 * anotaciones fiscales. La app NO es una herramienta fiscal — es de
 * trazabilidad. El cálculo definitivo debe hacerlo un asesor fiscal.
 */
export const TRACEABILITY_DISCLAIMER = `Esta clasificación es orientativa y está pensada para darte trazabilidad de tus movimientos cripto. No constituye asesoramiento fiscal. Para tu declaración de la renta o cualquier obligación tributaria, consulta a un asesor fiscal profesional.`;

// =============================================================================
// INPUT PARA EL CATEGORIZADOR
// =============================================================================
//
// Lo mínimo que necesita el motor para clasificar una transacción.
// Encaja con la fila de la tabla `transactions` (snake_case → camelCase).

export interface CategorizeInput {
  id?: string;
  portfolioId: string;
  type: string;                  // app's internal tx type (deposit, lp_deposit, ...)
  protocol: string;
  positionType: string;          // "Hold" | "Staking" | "Liquidity Pool" | "Lending"
  tokenInSymbol: string | null;
  tokenInAmount: number | null;
  tokenOutSymbol: string | null;
  tokenOutAmount: number | null;
  spotPriceUsd: number;          // precio USD del token al momento de la tx
  transactionDate: string;       // ISO timestamp
  metadata: Record<string, unknown> | null;
}

// =============================================================================
// RESULTADO DEL CATEGORIZADOR
// =============================================================================

export interface CategorizationResult {
  /** Anotación para guardar en transactions.fiscal_* */
  annotation: FiscalAnnotation;
  /** Nuevos lotes a crear (compras, swap_in, airdrops, staking_reward, etc.) */
  newLots: NewLotInput[];
  /** Eventos tributables generados (sell, swap, lp_provide, staking_reward, etc.) */
  taxEvents: TaxEvent[];
  /** Lotes consumidos por FIFO con sus deltas (para actualizar BD) */
  consumedLotUpdates: LotUpdate[];
}

export interface NewLotInput {
  tokenSymbol: string;
  amount: number;
  costBasisEur: number;
  acquiredAt: string;
  acquiredViaEvent: LotOriginEvent;
  acquiredViaTransactionId: string | null;
}

export interface LotUpdate {
  lotId: string;
  newAmount: number;
  newCostBasisEur: number;
  exhaustedAt: string | null;
}
