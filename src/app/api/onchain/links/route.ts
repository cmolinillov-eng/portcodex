import { NextResponse, type NextRequest } from "next/server";
import { getViewerAccess, ensurePortfolioAccess } from "@/lib/auth/viewer-access";
import { getSupabaseServiceClient, getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Enlaces posición on-chain ↔ posición contable (position_links, Fase B del
 * plan 100% automático). GET: listar; POST: crear/actualizar; DELETE: quitar.
 * Escritura solo para perfiles que operan (owner/manager).
 */

type LinkRow = {
  id: string;
  onchain_id: string;
  protocol: string;
  position_id: string;
  position_type: string;
  auto_ingest: boolean;
  deposited_override_usd?: number | null;
};

function getClient() {
  return getSupabaseServiceClient() ?? getSupabaseServerClient();
}

export async function GET(request: NextRequest) {
  const portfolioId = (request.nextUrl.searchParams.get("portfolioId") ?? "").trim();
  const access = await getViewerAccess();
  const check = ensurePortfolioAccess(access, portfolioId, false);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const client = getClient();
  const cols = "id, onchain_id, protocol, position_id, position_type, auto_ingest, deposited_override_usd";
  let data: LinkRow[] | null = null;
  let lastError: string | null = null;
  {
    const res = await client.from("position_links").select(cols).eq("portfolio_id", portfolioId);
    if (res.error) {
      // Columna deposited_override_usd sin crear (migración phase27 pendiente):
      // reintenta sin ella para no perder los enlaces existentes.
      const fallback = await client
        .from("position_links")
        .select("id, onchain_id, protocol, position_id, position_type, auto_ingest")
        .eq("portfolio_id", portfolioId);
      data = (fallback.data ?? null) as LinkRow[] | null;
      lastError = fallback.error?.message ?? null;
    } else {
      data = (res.data ?? null) as LinkRow[] | null;
    }
  }
  if (lastError) {
    // Tabla sin crear (migración pendiente): sin enlaces, no error.
    if (/relation .*position_links.* does not exist/i.test(lastError)) {
      return NextResponse.json({ links: [] });
    }
    // Cualquier otro fallo (Supabase caído, timeout…) debe ser un ERROR: si
    // devolviéramos links vacíos, el cliente creería que no hay nada enlazado
    // y el auto-enlace heurístico podría pisar enlaces correctos del gestor.
    return NextResponse.json({ error: lastError }, { status: 500 });
  }
  return NextResponse.json({ links: (data ?? []) as LinkRow[] });
}

export async function POST(request: NextRequest) {
  let body: {
    portfolioId?: string;
    onchainId?: string;
    protocol?: string;
    positionId?: string;
    positionType?: string;
    autoIngest?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }
  const portfolioId = (body.portfolioId ?? "").trim();
  const onchainId = (body.onchainId ?? "").trim();
  const protocol = (body.protocol ?? "").trim();
  const positionId = (body.positionId ?? "").trim();
  const positionType = (body.positionType ?? "Liquidity Pool").trim();

  const access = await getViewerAccess();
  const check = ensurePortfolioAccess(access, portfolioId, true);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });
  if (!onchainId || !protocol || !positionId) {
    return NextResponse.json({ error: "Faltan onchainId/protocol/positionId." }, { status: 400 });
  }

  const { data, error } = await getClient()
    .from("position_links")
    .upsert(
      {
        portfolio_id: portfolioId,
        onchain_id: onchainId,
        protocol,
        position_id: positionId,
        position_type: positionType,
        auto_ingest: body.autoIngest === true,
      },
      { onConflict: "portfolio_id,onchain_id" },
    )
    .select("id, onchain_id, protocol, position_id, position_type, auto_ingest")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ link: data });
}

export async function DELETE(request: NextRequest) {
  const portfolioId = (request.nextUrl.searchParams.get("portfolioId") ?? "").trim();
  const linkId = (request.nextUrl.searchParams.get("linkId") ?? "").trim();

  const access = await getViewerAccess();
  const check = ensurePortfolioAccess(access, portfolioId, true);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });
  if (!linkId) return NextResponse.json({ error: "Falta linkId." }, { status: 400 });

  const { error } = await getClient()
    .from("position_links")
    .delete()
    .eq("id", linkId)
    .eq("portfolio_id", portfolioId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
