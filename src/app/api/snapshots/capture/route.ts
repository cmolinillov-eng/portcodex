import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { ensurePortfolioAccess, getViewerAccess } from "@/lib/auth/viewer-access";
import { validateCsrf } from "@/lib/security/csrf";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { capturePortfolioSnapshot } from "@/lib/snapshots/capture";

/**
 * POST /api/snapshots/capture
 *
 * Captura un snapshot del estado actual del portfolio. Body:
 *   { portfolioId: string, trigger?: "manual" | "post_operation", notes?: string }
 *
 * Para cron diario externo, usar /api/snapshots/daily con bearer secret.
 */

type CapturePayload = {
  portfolioId?: string;
  trigger?: "manual" | "post_operation";
  notes?: string;
};

function getClient(): SupabaseClient {
  const serviceClient = getSupabaseServiceClient();
  if (serviceClient) return serviceClient;
  return getSupabaseServerClient();
}

export async function POST(request: NextRequest) {
  try {
    const csrfCheck = validateCsrf(request);
    if (!csrfCheck.ok) {
      return NextResponse.json({ error: csrfCheck.error }, { status: csrfCheck.status });
    }

    const payload = (await request.json()) as CapturePayload;
    const portfolioId = (payload.portfolioId ?? "").trim();
    if (!portfolioId) {
      return NextResponse.json({ error: "Falta portfolioId." }, { status: 400 });
    }

    const access = await getViewerAccess();
    const accessCheck = ensurePortfolioAccess(access, portfolioId, true);
    if (!accessCheck.ok) {
      return NextResponse.json({ error: accessCheck.error }, { status: accessCheck.status });
    }

    const clientIp = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "unknown";
    const rateLimit = checkRateLimit(
      `snapshots-capture:${access.userId ?? "anon"}:${portfolioId}:${clientIp}`,
      { limit: 10, windowMs: 60_000 },
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiados snapshots en poco tiempo. Inténtalo de nuevo en unos segundos." },
        { status: 429 },
      );
    }

    const client = getClient();
    const result = await capturePortfolioSnapshot({
      client,
      portfolioId,
      trigger: payload.trigger ?? "manual",
      notes: payload.notes ?? null,
    });

    if (!result.ok) {
      if (result.reason === "table_missing") {
        return NextResponse.json(
          {
            error: "Falta aplicar la migración phase19_portfolio_snapshots.sql en Supabase.",
            hint: "Ejecuta el SQL desde supabase/sql/phase19_portfolio_snapshots.sql",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: result.reason ?? "No se pudo capturar el snapshot." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      snapshotId: result.snapshotId,
      totals: {
        totalValueUsd: result.totalValueUsd,
        totalDepositedUsd: result.totalDepositedUsd,
        pendingHarvestUsd: result.pendingHarvestUsd,
        realizedPnlUsd: result.realizedPnlUsd,
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Snapshot capture error:", error);
    const message = error instanceof Error ? error.message : "Error inesperado capturando snapshot.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
