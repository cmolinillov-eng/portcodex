/**
 * Mapeo de categorías fiscales internas → casillas AEAT (Modelo 100 / IRPF).
 *
 * ⚠️ ORIENTATIVO. Esta app es de TRAZABILIDAD, no de declaración. Las casillas
 * del Modelo 100 cambian de numeración cada ejercicio; aquí se usan rangos
 * de referencia para indicar DÓNDE encaja cada tipo de renta. El cálculo y la
 * casilla exacta los confirma el asesor fiscal con el modelo del año en curso.
 *
 * Fuente de verdad fiscal: skills/spanish-crypto-tax-expert/SKILL.md
 * (sección "Mapeo income type → casilla Modelo 100").
 *
 * Estructura de bases en IRPF español:
 *   • BASE DEL AHORRO  → ganancias/pérdidas por transmisión + permuta + RCM
 *                        (tipos 19%-28% progresivos)
 *   • BASE GENERAL     → ganancias NO derivadas de transmisión (airdrops, forks),
 *                        rendimientos del trabajo y de actividad económica
 *                        (tarifa general progresiva)
 *
 * Función pura — no toca BD, no hace I/O.
 */

import type { FiscalCategory, IncomeType } from "./types";

export type AeatBase = "ahorro" | "general" | null;

/** Tono visual del badge (la UI lo mapea a clases CSS del tema oscuro). */
export type AeatTone =
  | "gain_savings" // GP base del ahorro (transmisión / permuta / derivados)
  | "gain_general" // GP base general (airdrop, fork)
  | "loss" // pérdida patrimonial
  | "rcm" // rendimiento de capital mobiliario (staking, lending)
  | "work" // rendimiento del trabajo / actividad económica
  | "isyd" // donaciones (Impuesto de Sucesiones y Donaciones, no IRPF)
  | "neutral"; // no imponible / técnico

export interface AeatClassification {
  /** Badge corto para la UI. Ej: "GP permuta", "RCM staking", "No imponible". */
  badge: string;
  /** Tono visual. */
  tone: AeatTone;
  /** Base imponible donde tributa, o null si no tributa. */
  base: AeatBase;
  /** Casilla(s) de referencia del Modelo 100. "—" si no aplica. */
  casilla: string;
  /** Nota breve para la columna "NOTAS" del desglose AEAT. */
  aeatNote: string;
  /**
   * Si esta categoría genera un importe a agregar en el resumen fiscal.
   * (Las "No imponible"/técnicas no suman.)
   */
  countsTowardTax: boolean;
}

// =============================================================================
// CASILLAS DE REFERENCIA (orientativas, ejercicio reciente)
// =============================================================================

const CASILLA_GP_TRANSMISION = "1800-1814"; // GP por transmisión de elementos patrimoniales (base ahorro)
const CASILLA_GP_GENERAL = "0304"; // GP que NO derivan de transmisión (base general)
const CASILLA_RCM = "0027-0033"; // RCM por cesión a terceros de capitales propios (base ahorro)
const CASILLA_TRABAJO = "0003-0018"; // Rendimientos del trabajo (base general)
const CASILLA_ACTIVIDAD = "0224-0233"; // Rendimientos de actividades económicas (base general)

// =============================================================================
// MAPEO PRINCIPAL
// =============================================================================

/**
 * Clasifica una operación según su categoría fiscal interna y su tipo de renta.
 *
 * `incomeType` desempata el signo (ganancia vs pérdida) y el caso de los
 * `non_taxable_*`. `realizedGainEur` (opcional) permite afinar el badge de
 * GP transmisión cuando hay pérdida.
 */
export function getAeatClassification(
  category: FiscalCategory,
  incomeType: IncomeType,
  realizedGainEur?: number,
): AeatClassification {
  // ─── Pérdidas patrimoniales (tienen prioridad sobre la categoría) ────────
  if (incomeType === "perdida_patrimonial") {
    return {
      badge: "Pérdida patrimonial",
      tone: "loss",
      base: "ahorro",
      casilla: CASILLA_GP_TRANSMISION,
      aeatNote: "Pérdida patrimonial compensable en la base del ahorro.",
      countsTowardTax: true,
    };
  }

  switch (category) {
    // ─── Ganancia patrimonial por TRANSMISIÓN (venta a fiat) ───────────────
    case "sell":
    case "card_spend":
    case "nft_sell_fiat":
    case "payment_made":
      return {
        badge: realizedGainEur !== undefined && realizedGainEur < 0 ? "Pérdida patrimonial" : "GP transmisión",
        tone: realizedGainEur !== undefined && realizedGainEur < 0 ? "loss" : "gain_savings",
        base: "ahorro",
        casilla: CASILLA_GP_TRANSMISION,
        aeatNote: "Transmisión cripto → fiat / pago. Base del ahorro.",
        countsTowardTax: true,
      };

    // ─── Ganancia patrimonial por PERMUTA (cripto ↔ cripto) ────────────────
    case "swap_out":
    case "lp_provide":
    case "lp_remove":
    case "nft_sell_swap":
    case "nft_buy_swap":
      return {
        badge: "GP permuta",
        tone: "gain_savings",
        base: "ahorro",
        casilla: CASILLA_GP_TRANSMISION,
        aeatNote: "Permuta cripto-cripto. Base del ahorro (criterio DGT).",
        countsTowardTax: true,
      };

    // ─── Derivados ─────────────────────────────────────────────────────────
    case "derivative_close":
    case "derivative_liquidation":
    case "derivative_funding_received":
      return {
        badge: "GP derivados",
        tone: "gain_savings",
        base: "ahorro",
        casilla: CASILLA_GP_TRANSMISION,
        aeatNote: "Resultado de instrumentos derivados. Base del ahorro.",
        countsTowardTax: true,
      };

    // ─── Ganancia patrimonial NO derivada de transmisión (base general) ────
    case "airdrop":
    case "fork":
      return {
        badge: "GP base general",
        tone: "gain_general",
        base: "general",
        casilla: CASILLA_GP_GENERAL,
        aeatNote: "Ganancia en especie no derivada de transmisión. Base general.",
        countsTowardTax: true,
      };

    case "nft_royalty":
      return {
        badge: "GP base general",
        tone: "gain_general",
        base: "general",
        casilla: CASILLA_GP_GENERAL,
        aeatNote: "Royalty NFT. Base general (salvo actividad económica).",
        countsTowardTax: true,
      };

    // ─── Rendimiento de capital mobiliario (staking / lending / LP) ────────
    case "staking_reward":
    case "restaking_reward":
    case "lp_reward":
      return {
        badge: "RCM staking",
        tone: "rcm",
        base: "ahorro",
        casilla: CASILLA_RCM,
        aeatNote: "Rendimiento de capital mobiliario (cesión a terceros).",
        countsTowardTax: true,
      };

    case "lending_interest":
      return {
        badge: "RCM interés",
        tone: "rcm",
        base: "ahorro",
        casilla: CASILLA_RCM,
        aeatNote: "Rendimiento de capital mobiliario (cesión a terceros).",
        countsTowardTax: true,
      };

    case "card_cashback":
      return {
        badge: "RCM",
        tone: "rcm",
        base: "ahorro",
        casilla: CASILLA_RCM,
        aeatNote: "Cashback en cripto. Tratamiento orientativo como RCM.",
        countsTowardTax: true,
      };

    // ─── Rendimiento del trabajo / actividad económica (base general) ──────
    case "salary_received":
      return {
        badge: "Rdto. trabajo",
        tone: "work",
        base: "general",
        casilla: CASILLA_TRABAJO,
        aeatNote: "Salario en cripto. Rendimiento del trabajo. Base general.",
        countsTowardTax: true,
      };

    case "payment_received":
      return {
        badge: "Rdto. actividad",
        tone: "work",
        base: "general",
        casilla: CASILLA_ACTIVIDAD,
        aeatNote: "Cobro profesional en cripto. Actividad económica. Base general.",
        countsTowardTax: true,
      };

    // ─── Donaciones (ISyD, no IRPF) ────────────────────────────────────────
    case "gift_received":
    case "gift_sent":
      return {
        badge: "Donación (ISyD)",
        tone: "isyd",
        base: null,
        casilla: "—",
        aeatNote: "Impuesto sobre Sucesiones y Donaciones (autonómico), no IRPF.",
        countsTowardTax: false,
      };

    // ─── Pérdida por slashing ──────────────────────────────────────────────
    case "slashing_loss":
      return {
        badge: "Pérdida patrimonial",
        tone: "loss",
        base: "ahorro",
        casilla: CASILLA_GP_TRANSMISION,
        aeatNote: "Pérdida por slashing (criterio orientativo).",
        countsTowardTax: true,
      };

    // ─── No imponible / técnico ────────────────────────────────────────────
    case "buy":
    case "nft_buy_fiat":
    case "nft_mint":
    case "nft_mint_free":
    case "non_taxable_transfer":
    case "non_taxable_technical":
    case "liquidation":
    case "derivative_open":
    case "derivative_funding_paid":
      return {
        badge: "No imponible",
        tone: "neutral",
        base: null,
        casilla: "—",
        aeatNote: "No genera hecho imponible en IRPF.",
        countsTowardTax: false,
      };

    default:
      return {
        badge: "Sin clasificar",
        tone: "neutral",
        base: null,
        casilla: "—",
        aeatNote: "Pendiente de clasificación manual.",
        countsTowardTax: false,
      };
  }
}

// =============================================================================
// AGREGACIÓN POR CASILLA (para el Resumen fiscal)
// =============================================================================

export interface AeatBucketInput {
  category: FiscalCategory;
  incomeType: IncomeType;
  /** Importe que suma a la casilla. Para GP/pérdidas = realizedGainEur; para RCM/rendimientos = valueEur. */
  amountEur: number;
}

export interface AeatBucket {
  /** Clave estable: badge. */
  badge: string;
  tone: AeatTone;
  base: AeatBase;
  casilla: string;
  aeatNote: string;
  operaciones: number;
  importeEur: number;
}

/**
 * Agrupa operaciones por badge AEAT y suma importes. Devuelve los buckets
 * ordenados (primero base del ahorro, luego base general, luego sin base).
 */
export function aggregateByCasilla(inputs: AeatBucketInput[]): {
  buckets: AeatBucket[];
  totalBaseAhorro: number;
  totalBaseGeneral: number;
} {
  const map = new Map<string, AeatBucket>();
  let totalBaseAhorro = 0;
  let totalBaseGeneral = 0;

  for (const input of inputs) {
    const cls = getAeatClassification(input.category, input.incomeType, input.amountEur);
    if (!cls.countsTowardTax) continue;

    const existing = map.get(cls.badge);
    if (existing) {
      existing.operaciones += 1;
      existing.importeEur += input.amountEur;
    } else {
      map.set(cls.badge, {
        badge: cls.badge,
        tone: cls.tone,
        base: cls.base,
        casilla: cls.casilla,
        aeatNote: cls.aeatNote,
        operaciones: 1,
        importeEur: input.amountEur,
      });
    }

    if (cls.base === "ahorro") totalBaseAhorro += input.amountEur;
    else if (cls.base === "general") totalBaseGeneral += input.amountEur;
  }

  const baseOrder: Record<string, number> = { ahorro: 0, general: 1 };
  const buckets = Array.from(map.values()).sort((a, b) => {
    const ba = a.base ? baseOrder[a.base] ?? 2 : 3;
    const bb = b.base ? baseOrder[b.base] ?? 2 : 3;
    if (ba !== bb) return ba - bb;
    return Math.abs(b.importeEur) - Math.abs(a.importeEur);
  });

  return {
    buckets,
    totalBaseAhorro: Math.round(totalBaseAhorro * 100) / 100,
    totalBaseGeneral: Math.round(totalBaseGeneral * 100) / 100,
  };
}

// =============================================================================
// CLASIFICACIÓN BILLETERA: CENTRALIZADA vs DESCENTRALIZADA
// =============================================================================
//
// El cliente NO debe ver "hot/cold/dex" mezclados. A nivel fiscal lo que importa
// es si hay un CUSTODIO (exchange/broker) o si es AUTOCUSTODIA. De ahí derivan
// implicaciones distintas (p.ej. Modelo 721 solo afecta a custodios extranjeros).

import type { WalletKind } from "./types";

export type CustodyClass = "centralizada" | "descentralizada" | "desconocida";

export function getCustodyClass(kind: WalletKind | null): CustodyClass {
  if (!kind) return "desconocida";
  switch (kind) {
    case "cex_es":
    case "cex_foreign":
    case "broker_es":
    case "broker_foreign":
    case "payment_app":
      return "centralizada";
    case "dex":
    case "hot_wallet":
    case "cold_wallet":
    case "paper_wallet":
    case "smart_contract_wallet":
      return "descentralizada";
    case "other":
    default:
      return "desconocida";
  }
}

export function getCustodyLabel(c: CustodyClass): string {
  switch (c) {
    case "centralizada":
      return "Billetera centralizada (CEX / bróker)";
    case "descentralizada":
      return "Billetera descentralizada (autocustodia / DEX)";
    default:
      return "Sin clasificar";
  }
}

/** True si el wallet es un custodio EXTRANJERO (cuenta para Modelo 721). */
export function isForeignCustodian(kind: WalletKind | null): boolean {
  return kind === "cex_foreign" || kind === "broker_foreign";
}
