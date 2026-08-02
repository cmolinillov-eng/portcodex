/**
 * Métricas derivadas de una serie de snapshots.
 *
 * Estaba dentro de `/api/snapshots/history`. Se extrae aquí porque ahora la
 * necesitan dos consumidores —esa ruta y el Resumen, que la pinta en servidor—
 * y tener la misma fórmula escrita dos veces es cómo acaban dando cifras
 * distintas para lo mismo.
 *
 * Función pura: entra una serie, sale una serie con métricas. Sin Supabase,
 * sin red.
 */

export interface SnapshotInput {
  capturedAt: string;
  totalValueUsd: number;
  totalDepositedUsd: number;
  pendingHarvestUsd: number;
  realizedPnlUsd: number;
}

export interface SnapshotPoint {
  date: string;
  value: number;
  deposited: number;
  harvest: number;
  realizedPnl: number;
  pnl: number;
  pnlPercent: number;
}

export interface SnapshotMetrics {
  twr: number | null;
  maxDrawdown: number | null;
  totalDays: number;
  firstDate?: string;
  lastDate?: string;
}

export function buildSnapshotSeries(snapshots: SnapshotInput[]): {
  points: SnapshotPoint[];
  metrics: SnapshotMetrics;
} {
  const points: SnapshotPoint[] = snapshots.map((s) => ({
    date: s.capturedAt,
    value: s.totalValueUsd,
    deposited: s.totalDepositedUsd,
    harvest: s.pendingHarvestUsd,
    realizedPnl: s.realizedPnlUsd,
    pnl: s.totalValueUsd - s.totalDepositedUsd + s.realizedPnlUsd,
    pnlPercent:
      s.totalDepositedUsd > 0
        ? ((s.totalValueUsd - s.totalDepositedUsd + s.realizedPnlUsd) / s.totalDepositedUsd) * 100
        : 0,
  }));

  if (points.length === 0) {
    return { points, metrics: { twr: null, maxDrawdown: null, totalDays: 0 } };
  }

  // TWR (Time-Weighted Return): producto de los retornos de cada tramo,
  // descontando los flujos de capital. Es lo que mide la GESTIÓN: meter dinero
  // nuevo sube el valor sin que nadie haya acertado nada, y esto lo neutraliza.
  let twr = 0;
  if (points.length >= 2) {
    let cumulativeReturn = 1;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const capitalFlow = curr.deposited - prev.deposited;
      const adjustedPrevValue = prev.value + capitalFlow;
      if (adjustedPrevValue > 0) {
        cumulativeReturn *= curr.value / adjustedPrevValue;
      }
    }
    twr = (cumulativeReturn - 1) * 100;
  }

  // Máxima caída: la mayor bajada de pico a valle. Es la pregunta que de verdad
  // se hace un cliente: «¿cuánto llegué a perder por el camino?».
  let maxDrawdown = 0;
  let peak = points[0].value;
  for (const point of points) {
    if (point.value > peak) peak = point.value;
    const drawdown = peak > 0 ? ((peak - point.value) / peak) * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  return {
    points,
    metrics: {
      twr: Number(twr.toFixed(2)),
      maxDrawdown: Number(maxDrawdown.toFixed(2)),
      totalDays: points.length,
      firstDate: points[0].date,
      lastDate: points[points.length - 1].date,
    },
  };
}
