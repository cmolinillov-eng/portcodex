import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { ensurePortfolioAccess, getViewerAccess } from "@/lib/auth/viewer-access";
import { validateCsrf } from "@/lib/security/csrf";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * POST /api/positions/tag
 *
 * Asigna o borra una etiqueta estratégica a una posición.
 *
 * Body:
 *   {
 *     portfolioId: string,
 *     protocol: string,
 *     positionId: string,
 *     strategyTag?: string | null  // null o "" para borrar
 *   }
 *
 * Si la tabla position_tags todavía no existe (phase20 no aplicada en BD),
 * devuelve 503 con un hint para aplicar la migración.
 */

type Payload = {
  portfolioId?: string;
  protocol?: string;
  positionId?: string;
  strategyTag?: string | null;
};

const MAX_TAG_LENGTH = 60;

function getClient(): SupabaseClient {
  const serviceClient = getSupabaseServiceClient();
  if (serviceClient) return serviceClient;
  return getSupabaseServerClient();
}

function isMissingTableError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /position_tags.*does not exist/i.test(message) || /relation .* does not exist/i.test(message);
}

export async function POST(request: NextRequest) {
  try {
    const csrfCheck = validateCsrf(request);
    if (!csrfCheck.ok) {
      return NextResponse.json({ error: csrfCheck.error }, { status: csrfCheck.status });
    }

    const payload = (await request.json()) as Payload;
    const portfolioId = (payload.portfolioId ?? "").trim();
    const protocol = (payload.protocol ?? "").trim();
    const positionId = (payload.positionId ?? "").trim();
    const rawTag = (payload.strategyTag ?? "").toString().trim();

    if (!portfolioId || !protocol || !positionId) {
      return NextResponse.json(
        { error: "Faltan portfolioId, protocol o positionId." },
        { status: 400 },
      );
    }

    if (rawTag.length > MAX_TAG_LENGTH) {
      return NextResponse.json(
        { error: `La etiqueta es demasiado larga (máx ${MAX_TAG_LENGTH} caracteres).` },
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
      `positions-tag:${access.userId ?? "anon"}:${portfolioId}:${clientIp}`,
      { limit: 30, windowMs: 60_000 },
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiadas operaciones en poco tiempo. Espera unos segundos." },
        { status: 429 },
      );
    }

    const client = getClient();
    const shouldDelete = rawTag.length === 0;

    if (shouldDelete) {
      const del = await client
        .from("position_tags")
        .delete()
        .match({ portfolio_id: portfolioId, protocol, position_id: positionId });
      if (del.error) {
        if (isMissingTableError(del.error.message)) {
          return NextResponse.json(
            {
              error: "Falta aplicar la migración phase20_position_tags.sql en Supabase.",
              hint: "Ejecuta el SQL desde supabase/sql/phase20_position_tags.sql",
            },
            { status: 503 },
          );
        }
        return NextResponse.json({ error: del.error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, strategyTag: null });
    }

    // Upsert by unique (portfolio_id, protocol, position_id)
    const up = await client
      .from("position_tags")
      .upsert(
        {
          portfolio_id: portfolioId,
          protocol,
          position_id: positionId,
          strategy_tag: rawTag,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "portfolio_id,protocol,position_id" },
      )
      .select("strategy_tag")
      .single();

    if (up.error) {
      if (isMissingTableError(up.error.message)) {
        return NextResponse.json(
          {
            error: "Falta aplicar la migración phase20_position_tags.sql en Supabase.",
            hint: "Ejecuta el SQL desde supabase/sql/phase20_position_tags.sql",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: up.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, strategyTag: up.data?.strategy_tag ?? rawTag });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("position tag error:", error);
    const message = error instanceof Error ? error.message : "Error inesperado actualizando la etiqueta.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
