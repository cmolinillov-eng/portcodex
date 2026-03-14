import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { validateCsrf } from "@/lib/security/csrf";

export async function POST(request: NextRequest) {
  try {
    const csrfCheck = validateCsrf(request);
    if (!csrfCheck.ok) {
      return NextResponse.json({ error: csrfCheck.error }, { status: csrfCheck.status });
    }

    const access = await getViewerAccess();
    if (!access.userId) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const allowedPortfolioIds = access.allowedPortfolioIds ?? [];
    if (!access.isSuperAdmin && allowedPortfolioIds.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const client = getSupabaseServiceClient() ?? getSupabaseServerClient();

    // Query all position_closed rows, plus fallback for withdrawal-type snapshots
    let query = client
      .from("transactions")
      .select("portfolio_id, protocol, position_id, position_type, token_in_symbol, transaction_date, metadata, notes")
      .or("type.eq.position_closed,and(type.eq.withdrawal,metadata->>closure.not.is.null)")
      .is("deleted_at", null)
      .order("transaction_date", { ascending: false });

    if (!access.isSuperAdmin) {
      query = query.in("portfolio_id", allowedPortfolioIds);
    }

    const { data, error } = await query;

    if (error) {
      // If position_closed type causes issues, fall back to metadata filter
      const fallbackQuery = client
        .from("transactions")
        .select("portfolio_id, protocol, position_id, position_type, token_in_symbol, transaction_date, metadata, notes")
        .is("deleted_at", null)
        .order("transaction_date", { ascending: false });

      const fallbackResult = access.isSuperAdmin
        ? await fallbackQuery
        : await fallbackQuery.in("portfolio_id", allowedPortfolioIds);

      const allRows = fallbackResult.data ?? [];
      const closureRows = allRows.filter((row) => {
        const meta = row.metadata as Record<string, unknown> | null;
        return meta && typeof meta === "object" && "closure" in meta;
      });

      return NextResponse.json({ data: closureRows });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("History error:", error);
    return NextResponse.json({ error: "Error al obtener historial." }, { status: 500 });
  }
}
