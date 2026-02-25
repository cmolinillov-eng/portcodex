import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { ensurePortfolioAccess, getViewerAccess } from "@/lib/auth/viewer-access";
import { validateCsrf } from "@/lib/security/csrf";

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

    const client = getDeleteClient();
    const hardDeleteAttempt = await client
      .from("transactions")
      .delete()
      .eq("portfolio_id", portfolioId)
      .eq("protocol", protocol)
      .eq("position_id", positionId)
      .select("id");

    if (hardDeleteAttempt.error) {
      throw new Error(hardDeleteAttempt.error.message);
    }

    return NextResponse.json({
      ok: true,
      mode: "hard_delete",
      canUndo: false,
      deletedRows: (hardDeleteAttempt.data ?? []).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado al eliminar la posición.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
