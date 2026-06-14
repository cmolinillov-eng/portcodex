import { getViewerAccess } from "@/lib/auth/viewer-access";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";

export interface FiscalPortfolio {
  id: string;
  name: string;
}

export interface FiscalContext {
  isAuthenticated: boolean;
  canRead: boolean;
  portfolios: FiscalPortfolio[];
  activePortfolioId: string | null;
}

/**
 * Resuelve el contexto mínimo para las páginas fiscales: la lista de portfolios
 * a los que el viewer tiene acceso y cuál está activo.
 *
 * `requestedId` viene de `?portfolio=` en la URL; si no es válido se cae al
 * primero disponible.
 */
export async function getFiscalContext(requestedId?: string): Promise<FiscalContext> {
  const access = await getViewerAccess();

  if (!access.isAuthenticated || !access.canRead) {
    return {
      isAuthenticated: access.isAuthenticated,
      canRead: access.canRead,
      portfolios: [],
      activePortfolioId: null,
    };
  }

  const client = getSupabaseServiceClient() ?? getSupabaseServerClient();
  let query = client.from("portfolios").select("id, name").order("name", { ascending: true });
  if (!access.isSuperAdmin) {
    query = query.in("id", access.allowedPortfolioIds);
  }

  const { data } = await query;
  const portfolios: FiscalPortfolio[] = ((data ?? []) as Array<{ id: string | null; name: string | null }>)
    .map((row) => ({ id: (row.id ?? "").trim(), name: (row.name ?? "").trim() || "Portfolio" }))
    .filter((p) => p.id.length > 0);

  const requested = (requestedId ?? "").trim();
  const activePortfolioId =
    requested && portfolios.some((p) => p.id === requested)
      ? requested
      : portfolios[0]?.id ?? null;

  return {
    isAuthenticated: true,
    canRead: true,
    portfolios,
    activePortfolioId,
  };
}
