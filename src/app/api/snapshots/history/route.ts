import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { ensurePortfolioAccess, getViewerAccess } from "@/lib/auth/viewer-access";
import { getPortfolioSnapshots } from "@/lib/snapshots/capture";
import { buildSnapshotSeries } from "@/lib/snapshots/metrics";
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

    // El cálculo vive en lib/snapshots/metrics.ts: lo comparte esta ruta con
    // el Resumen, que pinta la misma serie en servidor.
    const { points, metrics } = buildSnapshotSeries(snapshots);

    // `no-store`: es la curva de patrimonio de una persona. Salía con el
    // `public, max-age=0, must-revalidate` por defecto de Next, y `public`
    // autoriza a una caché compartida a guardarla.
    return NextResponse.json(
      { snapshots: points, metrics },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
