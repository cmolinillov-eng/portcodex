/**
 * Reparto del importe de un rebalanceo entre los tokens del destino.
 *
 * Es la aritmética que sugiere cuántos tokens entran en la posición destino a
 * partir del USD que sale del origen. Estaba escrita dentro del `useMemo`
 * `rebalancePreview` de `dashboard-client.tsx`, donde no había forma de
 * comprobarla sin montar el componente entero: se extrae tal cual, sin cambiar
 * ni un signo, para que la prueba mida ESTA fórmula y no una copia suya.
 *
 * Funciones puras: no tocan estado, ni BD, ni red.
 */

/**
 * Normaliza el porcentaje que el gestor escribe en el campo del split.
 *
 * El input es texto: un valor no numérico (`Number("abc")` → NaN) cae al 50/50,
 * que es el reparto por defecto del formulario. Un número se recorta al rango
 * [0, 100] — escribir 150 no puede sacar más capital del que hay.
 *
 * Ojo: `Number("")` es 0 y SÍ es finito, así que el campo vacío reparte 0/100,
 * no 50/50. Es el comportamiento que ya tenía el panel.
 */
export function normalizeSplitPercentA(rawSplitPercentA: number): number {
  return Number.isFinite(rawSplitPercentA)
    ? Math.max(0, Math.min(100, rawSplitPercentA))
    : 50;
}

/**
 * Reparte `totalUsd` entre los dos tokens de un LP destino según el porcentaje
 * asignado al token A, y convierte cada mitad a cantidad de token con su precio.
 *
 * El USD del token B es el RESTO (`totalUsd − usdForA`), no un segundo
 * porcentaje: así el valor total se conserva exactamente aunque el porcentaje
 * tenga decimales. Un precio ausente (0) devuelve cantidad 0 para ese lado en
 * lugar de infinito.
 */
export function rebalanceLpSplitAmounts(
  totalUsd: number,
  rawSplitPercentA: number,
  priceA: number,
  priceB: number,
): { amountA: number; amountB: number } {
  const splitA = normalizeSplitPercentA(rawSplitPercentA);
  const usdForA = (totalUsd * splitA) / 100;
  const usdForB = totalUsd - usdForA;
  return {
    amountA: priceA > 0 ? usdForA / priceA : 0,
    amountB: priceB > 0 ? usdForB / priceB : 0,
  };
}

/**
 * Cantidad de token destino equivalente a `totalUsd` cuando el destino NO es un
 * pool (hold, staking o lending: un solo token). Sin precio no hay conversión
 * posible y devuelve 0.
 */
export function rebalanceTargetAmountFromUsd(totalUsd: number, price: number): number {
  return price > 0 ? totalUsd / price : 0;
}
