/**
 * Algoritmo FIFO (First In, First Out) obligatorio según Art. 37.2 LIRPF.
 *
 * Cuando vendes o permutas parte de tu balance de un token, se considera
 * vendida la fracción adquirida primero. NO se admite LIFO, HIFO ni Average
 * Cost en España.
 *
 * Esta función es pura: no toca BD, no hace I/O. La capa que la invoca
 * se encarga de persistir los cambios.
 */

import type { TaxLot, LotUpdate, ConsumedLotRef } from "./types";
import { roundEur } from "./eur-conversion";

export interface FifoResult {
  /** Cost basis total consumido en EUR (suma pro-rata de los lotes tocados) */
  consumedCostEur: number;
  /** Cantidad efectivamente consumida (puede ser menor que amountToConsume si lots insuficientes) */
  consumedAmount: number;
  /** True si se intentó consumir más cantidad de la disponible */
  insufficientLots: boolean;
  /** Detalle de lotes tocados, para trazabilidad en tax_events.lots_consumed */
  lotsConsumed: ConsumedLotRef[];
  /** Updates a aplicar sobre los lotes (nuevo amount, nuevo cost basis, exhausted_at) */
  lotUpdates: LotUpdate[];
}

const EPSILON = 1e-9;

/**
 * Aplica FIFO sobre los lotes activos de UN token concreto.
 *
 * @param tokenSymbol — símbolo del token (uppercase)
 * @param amountToConsume — cantidad a vender/permutar
 * @param allLots — todos los lotes del portfolio (se filtran internamente por token y por exhausted_at)
 *
 * @returns FifoResult con cost basis consumido, lotes tocados y updates a persistir.
 *
 * Comportamiento ante casos límite:
 * - Si amountToConsume <= 0 → resultado vacío (no se consume nada)
 * - Si no hay lotes activos para el token → insufficientLots=true, consumedAmount=0
 * - Si hay menos balance del que se quiere consumir → consume lo que haya e insufficientLots=true
 *   (la capa de validación decide si abortar o permitir balance negativo)
 */
export function applyFifo(
  tokenSymbol: string,
  amountToConsume: number,
  allLots: TaxLot[],
  // Fecha de la operación que consume los lotes. Se usa como exhaustedAt para
  // que el cómputo sea DETERMINISTA entre ejecuciones (antes se usaba
  // new Date() → informes/trazas no reproducibles). Fallback defensivo al
  // reloj solo si el caller no la pasa.
  consumedAt?: string,
): FifoResult {
  const upper = tokenSymbol.trim().toUpperCase();
  const exhaustedStamp = consumedAt ?? new Date().toISOString();

  if (amountToConsume <= EPSILON) {
    return {
      consumedCostEur: 0,
      consumedAmount: 0,
      insufficientLots: false,
      lotsConsumed: [],
      lotUpdates: [],
    };
  }

  // Filtrar: solo este token, solo activos, solo con amount > 0
  // Ordenar: por acquiredAt ascendente (FIFO = el más antiguo primero)
  const activeLots = allLots
    .filter(
      (lot) =>
        lot.tokenSymbol.trim().toUpperCase() === upper &&
        lot.exhaustedAt === null &&
        lot.amount > EPSILON,
    )
    .sort((a, b) => {
      // Fechas inválidas van AL FINAL (determinista): devolver 0 en el
      // comparador podía desordenar lotes válidos alrededor del inválido.
      const tsA = Date.parse(a.acquiredAt);
      const tsB = Date.parse(b.acquiredAt);
      const va = Number.isFinite(tsA) ? tsA : Number.POSITIVE_INFINITY;
      const vb = Number.isFinite(tsB) ? tsB : Number.POSITIVE_INFINITY;
      return va - vb;
    });

  let remaining = amountToConsume;
  let consumedCostEur = 0;
  let consumedAmount = 0;
  const lotsConsumed: ConsumedLotRef[] = [];
  const lotUpdates: LotUpdate[] = [];

  for (const lot of activeLots) {
    if (remaining <= EPSILON) break;

    if (lot.amount <= remaining + EPSILON) {
      // Consumir el lote entero
      consumedCostEur += lot.costBasisEur;
      consumedAmount += lot.amount;
      remaining -= lot.amount;

      lotsConsumed.push({
        lotId: lot.id,
        amountConsumed: lot.amount,
        costBasisConsumedEur: roundEur(lot.costBasisEur),
        acquiredAt: lot.acquiredAt,
      });

      lotUpdates.push({
        lotId: lot.id,
        newAmount: 0,
        newCostBasisEur: 0,
        exhaustedAt: exhaustedStamp,
      });
    } else {
      // Consumir parcialmente: pro-rata
      const fraction = remaining / lot.amount;
      const costConsumed = lot.costBasisEur * fraction;

      consumedCostEur += costConsumed;
      consumedAmount += remaining;

      const newAmount = lot.amount - remaining;
      const newCostBasis = lot.costBasisEur - costConsumed;

      lotsConsumed.push({
        lotId: lot.id,
        amountConsumed: remaining,
        costBasisConsumedEur: roundEur(costConsumed),
        acquiredAt: lot.acquiredAt,
      });

      lotUpdates.push({
        lotId: lot.id,
        newAmount,
        newCostBasisEur: newCostBasis,
        exhaustedAt: null,
      });

      remaining = 0;
    }
  }

  const insufficientLots = remaining > EPSILON;

  return {
    consumedCostEur: roundEur(consumedCostEur),
    consumedAmount,
    insufficientLots,
    lotsConsumed,
    lotUpdates,
  };
}

/**
 * Total balance activo de un token en lotes (suma de amount de lotes no exhausted).
 * Útil para validar antes de aplicar FIFO.
 */
export function getActiveBalance(tokenSymbol: string, lots: TaxLot[]): number {
  const upper = tokenSymbol.trim().toUpperCase();
  return lots
    .filter(
      (lot) =>
        lot.tokenSymbol.trim().toUpperCase() === upper && lot.exhaustedAt === null,
    )
    .reduce((sum, lot) => sum + lot.amount, 0);
}

/**
 * Total cost basis activo de un token en lotes.
 * Útil para mostrar al usuario "tu cost basis actual de BTC es X€".
 */
export function getActiveCostBasis(tokenSymbol: string, lots: TaxLot[]): number {
  const upper = tokenSymbol.trim().toUpperCase();
  const total = lots
    .filter(
      (lot) =>
        lot.tokenSymbol.trim().toUpperCase() === upper && lot.exhaustedAt === null,
    )
    .reduce((sum, lot) => sum + lot.costBasisEur, 0);
  return roundEur(total);
}
