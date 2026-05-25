import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient, getSupabaseServerClient } from "@/lib/supabase/server";
import { capturePortfolioSnapshot } from "@/lib/snapshots/capture";

/**
 * GET /api/snapshots/daily
 *
 * Endpoint para cron externo (Vercel Cron, Supabase Scheduled Function, etc.).
 * Captura un snapshot de TODOS los portfolios activos. Autenticado con
 * bearer token en el header Authorization. Debe coincidir con la variable
 * de entorno SNAPSHOTS_CRON_SECRET.
 *
 * Configuración en vercel.json (Vercel Cron):
 *   {
 *     "crons": [
 *       { "path": "/api/snapshots/daily", "schedule": "0 0 * * *" }
 *     ]
 *   }
 * Vercel envía el header `Authorization: Bearer <CRON_SECRET>` automáticamente
 * si configuras CRON_SECRET en las env vars. Aquí aceptamos también
 * SNAPSHOTS_CRON_SECRET por si quieres separarlo.
 */

function getClient(): SupabaseClient {
  const serviceClient = getSupabaseServiceClient();
  if (serviceClient) return serviceClient;
  return getSupabaseServerClient();
}

function verifyAuth(request: NextRequest): boolean {
  const secret = process.env.SNAPSHOTS_CRON_SECRET ?? process.env.CRON_SECRET ?? "";
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1].trim() : "";
  return token === secret;
}

export async function GET(request: NextRequest) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = getClient();

    // Listar portfolios (la tabla no tiene deleted_at; si en el futuro se
    // añade soft-delete, filtrar aquí).
    const { data: portfolios, error: portfolioError } = await client
      .from("portfolios")
      .select("id");

    if (portfolioError) {
      return NextResponse.json({ error: `read portfolios: ${portfolioError.message}` }, { status: 500 });
    }

    const results: Array<{ portfolioId: string; ok: boolean; snapshotId?: string; reason?: string }> = [];
    for (const p of (portfolios ?? []) as Array<{ id: string }>) {
      try {
        const result = await capturePortfolioSnapshot({
          client,
          portfolioId: p.id,
          trigger: "daily_cron",
        });
        results.push({ portfolioId: p.id, ok: result.ok, snapshotId: result.snapshotId, reason: result.reason });
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown_error";
        results.push({ portfolioId: p.id, ok: false, reason: message });
      }
    }

    const successCount = results.filter((r) => r.ok).length;
    return NextResponse.json({
      ok: true,
      total: results.length,
      success: successCount,
      failed: results.length - successCount,
      results,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Daily snapshots error:", error);
    const message = error instanceof Error ? error.message : "Error inesperado en cron diario.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
