import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { ensurePortfolioAccess, getViewerAccess } from "@/lib/auth/viewer-access";
import { getPortfolioSnapshots } from "@/lib/snapshots/capture";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * GET /api/snapshots/history?portfolioId=xxx&from=2026-05-01&to=2026-06-01
 *
 * Devuelve los snapshots del portfolio en orden cronológico para las gráficas.
 * Incluye métricas derivadas: TWR, max drawdown, P&L por punto.
 */

function getClient(): SupabaseClient {
  const serviceClient = getSupabaseServiceClient();
  if (serviceClient) return serviceClient;
  return getSupabaseServerClient();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get("portfolioId") ?? "";
    const fromDate = searchParams.get("from") ?? undefined;
    const toDate = searchParams.get("to") ?? undefined;

    if (!portfolioId) {
      return NextResponse.json({ error: "portfolioId es obligatorio." }, { status: 400 });
    }

    const client = getClient();

    // Verificar acceso al portfolio
    const viewer = await getViewerAccess();
    const access = ensurePortfolioAccess(viewer, portfolioId);
    if (!access.ok) {
      const fail = access as { error: string; status: number };
      return NextResponse.json({ error: fail.error }, { status: fail.status });
    }

    const snapshots = await getPortfolioSnapshots(client, portfolioId, {
      fromDate,
      toDate,
      limit: 365, // Máximo 1 año de datos diarios
    });

    if (snapshots.length === 0) {
      return NextResponse.json({
        snapshots: [],
        metrics: { twr: null, maxDrawdown: null, totalDays: 0 },
      });
    }

    // Calcular métricas derivadas
    const points = snapshots.map((s) => ({
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

    // TWR (Time-Weighted Return): producto de retornos entre períodos,
    // ajustado por flujos de capital (depósitos/retiros).
    let twr = 0;
    if (points.length >= 2) {
      let cumulativeReturn = 1;
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        // Ajustar por flujos: si el depositado cambió entre puntos, el valor
        // "pre-flujo" del portfolio es: valor_actual - (deposited_actual - deposited_previo)
        const capitalFlow = curr.deposited - prev.deposited;
        const adjustedPrevValue = prev.value + capitalFlow;
        if (adjustedPrevValue > 0) {
          const periodReturn = curr.value / adjustedPrevValue;
          cumulativeReturn *= periodReturn;
        }
      }
      twr = (cumulativeReturn - 1) * 100;
    }

    // Max Drawdown: mayor caída pico-a-valle
    let maxDrawdown = 0;
    let peak = points[0].value;
    for (const point of points) {
      if (point.value > peak) peak = point.value;
      const drawdown = peak > 0 ? ((peak - point.value) / peak) * 100 : 0;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    return NextResponse.json({
      snapshots: points,
      metrics: {
        twr: Number(twr.toFixed(2)),
        maxDrawdown: Number(maxDrawdown.toFixed(2)),
        totalDays: points.length,
        firstDate: points[0].date,
        lastDate: points[points.length - 1].date,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
