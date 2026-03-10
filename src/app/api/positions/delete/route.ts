import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { ensurePortfolioAccess, getViewerAccess } from "@/lib/auth/viewer-access";
import { validateCsrf } from "@/lib/security/csrf";
import { checkRateLimit } from "@/lib/security/rate-limit";

type DeletePositionPayload = {
  portfolioId?: string;
  protocol?: string;
  positionId?: string;
};

function sanitizeText(value: string | undefined): string {
  return (value ?? "").trim();
}

function getDeleteClient(): SupabaseClient {
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

    const payload = (await request.json()) as DeletePositionPayload;
    const portfolioId = sanitizeText(payload.portfolioId);
    const protocol = sanitizeText(payload.protocol);
    const positionId = sanitizeText(payload.positionId);

    if (!portfolioId || !protocol || !positionId) {
      return NextResponse.json(
        { error: "Faltan datos para eliminar la posición (portfolioId, protocol, positionId)." },
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
      `positions-delete:${access.userId ?? "anon"}:${portfolioId}:${clientIp}`,
      { limit: 20, windowMs: 60_000 },
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiadas eliminaciones en poco tiempo. Inténtalo de nuevo en unos segundos." },
        { status: 429 },
      );
    }

    const client = getDeleteClient();
    const now = new Date().toISOString();
    const softDeleteAttempt = await client
      .from("transactions")
      .update({ deleted_at: now })
      .eq("portfolio_id", portfolioId)
      .eq("protocol", protocol)
      .eq("position_id", positionId)
      .is("deleted_at", null)
      .select("id");

    if (softDeleteAttempt.error) {
      throw new Error(softDeleteAttempt.error.message);
    }

    return NextResponse.json({
      ok: true,
      mode: "soft_delete",
      canUndo: true,
      deletedRows: (softDeleteAttempt.data ?? []).length,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Delete position error:", error);
    return NextResponse.json({ error: "Error inesperado al eliminar la posición." }, { status: 400 });
  }
}
