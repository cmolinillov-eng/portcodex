import { NextResponse, type NextRequest } from "next/server";
import { getViewerAccess, ensurePortfolioAccess } from "@/lib/auth/viewer-access";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { syncPortfolioLive } from "@/lib/onchain/sync";
import { getSupabaseServiceClient, getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Lectura on-chain "En vivo" de un portfolio (solo lectura). Devuelve las
 * posiciones reales leídas de blockchain (balances + DeFi con rango/fees).
 * No toca la contabilidad manual: es una vista paralela.
 *
 * Fase A: cada lectura completa se guarda como snapshot en onchain_cache
 * (source "snapshot"). Sin `refresh=1` se sirve el snapshot al instante si
 * existe (el panel carga de inmediato) y solo se lee blockchain si no hay.
 */

type SnapshotPayload = {
  positions: unknown[];
  warnings: string[];
  syncedAt: string;
};

function getClient() {
  return getSupabaseServiceClient() ?? getSupabaseServerClient();
}

export async function GET(request: NextRequest) {
  try {
    const portfolioId = (request.nextUrl.searchParams.get("portfolioId") ?? "").trim();
    const wantRefresh = request.nextUrl.searchParams.get("refresh") === "1";
    if (!portfolioId) {
      return NextResponse.json({ error: "Falta portfolioId." }, { status: 400 });
    }

    const access = await getViewerAccess();
    const accessCheck = ensurePortfolioAccess(access, portfolioId, false);
    if (!accessCheck.ok) {
      return NextResponse.json({ error: accessCheck.error }, { status: accessCheck.status });
    }

    // Snapshot instantáneo (sin tocar blockchain) salvo refresh explícito.
    if (!wantRefresh) {
      try {
        const { data } = await getClient()
          .from("onchain_cache")
          .select("positions, updated_at")
          .eq("portfolio_id", portfolioId)
          .eq("source", "snapshot")
          .maybeSingle();
        const snap = data?.positions as SnapshotPayload | undefined;
        if (snap && Array.isArray(snap.positions)) {
          return NextResponse.json({ ...snap, cached: true });
        }
      } catch {
        /* sin caché: lectura en vivo */
      }
    }

    const clientIp = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "unknown";
    const rateLimit = checkRateLimit(
      `wallet-live:${access.userId ?? "anon"}:${portfolioId}:${clientIp}`,
      { limit: 20, windowMs: 60_000 },
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiadas lecturas on-chain en poco tiempo. Inténtalo en unos segundos." },
        { status: 429 },
      );
    }

    const result = await syncPortfolioLive(portfolioId);

    // Guardar snapshot (mejor esfuerzo) para que la próxima carga sea
    // instantánea. NUNCA con una lectura degradada (Zerion caído): eso
    // machacaría el último snapshot bueno con datos incompletos.
    const degraded = result.warnings.some((w) => /zerion/i.test(w));
    if (!degraded) {
      try {
        await getClient()
          .from("onchain_cache")
          .upsert(
            {
              portfolio_id: portfolioId,
              source: "snapshot",
              positions: result as unknown as Record<string, unknown>,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "portfolio_id,source" },
          );
      } catch {
        /* la caché es opcional */
      }
    }

    return NextResponse.json({ ...result, cached: false });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("wallet/live error:", error);
    return NextResponse.json({ error: "Error inesperado leyendo on-chain." }, { status: 500 });
  }
}
