import { NextResponse, type NextRequest } from "next/server";
import { ensurePortfolioAccess, getViewerAccess } from "@/lib/auth/viewer-access";
import { computeTraceability } from "@/lib/tax/compute-traceability";

/**
 * GET /api/transactions/traceability?portfolioId=xxx
 *
 * Devuelve TODAS las transacciones del portfolio enriquecidas con
 * categorización fiscal calculada en tiempo real.
 *
 * No persiste en BD. Las anotaciones son recomputables siempre.
 * La lógica de cálculo vive en lib/tax/compute-traceability.ts (compartida
 * con las páginas servidor del módulo fiscal).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get("portfolioId") ?? "";
    if (!portfolioId) {
      return NextResponse.json({ error: "portfolioId es obligatorio." }, { status: 400 });
    }

    const viewer = await getViewerAccess();
    const access = ensurePortfolioAccess(viewer, portfolioId);
    if (!access.ok) {
      const fail = access as { error: string; status: number };
      return NextResponse.json({ error: fail.error }, { status: fail.status });
    }

    const { entries, walletSummary, eurRate, total } = await computeTraceability(portfolioId);

    return NextResponse.json({
      entries,
      walletSummary,
      eurRate: total === 0 ? null : eurRate,
      meta: { total },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
