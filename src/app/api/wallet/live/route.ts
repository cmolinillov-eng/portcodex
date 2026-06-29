import { NextResponse, type NextRequest } from "next/server";
import { getViewerAccess, ensurePortfolioAccess } from "@/lib/auth/viewer-access";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { syncPortfolioLive } from "@/lib/onchain/sync";

/**
 * Lectura on-chain "En vivo" de un portfolio (solo lectura). Devuelve las
 * posiciones reales leídas de blockchain (balances + DeFi con rango/fees).
 * No toca la contabilidad manual: es una vista paralela.
 */
export async function GET(request: NextRequest) {
  try {
    const portfolioId = (request.nextUrl.searchParams.get("portfolioId") ?? "").trim();
    if (!portfolioId) {
      return NextResponse.json({ error: "Falta portfolioId." }, { status: 400 });
    }

    const access = await getViewerAccess();
    const accessCheck = ensurePortfolioAccess(access, portfolioId, false);
    if (!accessCheck.ok) {
      return NextResponse.json({ error: accessCheck.error }, { status: accessCheck.status });
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
    return NextResponse.json(result);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("wallet/live error:", error);
    return NextResponse.json({ error: "Error inesperado leyendo on-chain." }, { status: 500 });
  }
}
