import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { ensurePortfolioAccess, getViewerAccess } from "@/lib/auth/viewer-access";
import { validateCsrf } from "@/lib/security/csrf";
import { checkRateLimit } from "@/lib/security/rate-limit";

type RestorePositionPayload = {
  portfolioId?: string;
  protocol?: string;
  positionId?: string;
};

function sanitizeText(value: string | undefined): string {
  return (value ?? "").trim();
}

function getRestoreClient(): SupabaseClient {
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

    const payload = (await request.json()) as RestorePositionPayload;
    const portfolioId = sanitizeText(payload.portfolioId);
    const protocol = sanitizeText(payload.protocol);
    const positionId = sanitizeText(payload.positionId);

    if (!portfolioId || !protocol || !positionId) {
      return NextResponse.json(
        { error: "Faltan datos para restaurar la posición (portfolioId, protocol, positionId)." },
        { status: 400 },
      );
    }

    const access = await getViewerAccess();
    const accessCheck = ensurePortfolioAccess(access, portfolioId, true);
    if (!accessCheck.ok) {
      return NextResponse.json({ error: accessCheck.error }, { status: accessCheck.status });
    }

    const clientIp = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "unknown";
    const rateLimit = checkRateLimit(
      `positions-restore:${access.userId ?? "anon"}:${portfolioId}:${clientIp}`,
      { limit: 20, windowMs: 60_000 },
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiadas restauraciones en poco tiempo. Inténtalo de nuevo en unos segundos." },
        { status: 429 },
      );
    }

    const client = getRestoreClient();
    const now = new Date().toISOString();

    // 1. Re-activar las transacciones de capital (todo menos el snapshot de cierre).
    const { data, error } = await client
      .from("transactions")
      .update({ deleted_at: null })
      .eq("portfolio_id", portfolioId)
      .eq("protocol", protocol)
      .eq("position_id", positionId)
      .neq("type", "position_closed")
      .select("id");

    if (error) {
      throw new Error(error.message);
    }

    // 2. Soft-borrar el snapshot position_closed creado por el borrado. Si no, al
    //    restaurar la posición su realizedPnl seguiría sumando en el dashboard
    //    (doble conteo: posición activa de nuevo + su cierre).
    const closed = await client
      .from("transactions")
      .update({ deleted_at: now })
      .eq("portfolio_id", portfolioId)
      .eq("protocol", protocol)
      .eq("position_id", positionId)
      .eq("type", "position_closed")
      .is("deleted_at", null)
      .select("id");

    if (closed.error) {
      throw new Error(closed.error.message);
    }

    return NextResponse.json({
      ok: true,
      restoredRows: (data ?? []).length,
      removedSnapshots: (closed.data ?? []).length,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Restore position error:", error);
    return NextResponse.json({ error: "Error inesperado al restaurar la posición." }, { status: 400 });
  }
}
