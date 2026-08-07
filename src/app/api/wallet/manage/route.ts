import { NextResponse, type NextRequest } from "next/server";
import { getViewerAccess, ensurePortfolioAccess } from "@/lib/auth/viewer-access";
import { getSupabaseServiceClient, getSupabaseServerClient } from "@/lib/supabase/server";
import { validateCsrf } from "@/lib/security/csrf";

/**
 * Gestión de wallets on-chain del portfolio (portfolio_wallets).
 * GET: listar; POST: añadir; PATCH: activar/desactivar o cambiar label.
 * Solo direcciones PÚBLICAS (nunca claves privadas). Escritura solo para
 * perfiles que pueden operar (owner/manager).
 */

const ADDRESS_PATTERNS: Record<string, RegExp> = {
  evm: /^0x[0-9a-fA-F]{40}$/,
  solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  // Bitcoin: dirección individual — legacy (1…), P2SH (3…) o bech32 (bc1…) —
  // o clave pública extendida de un monedero HD (xpub/ypub/zpub), que la app
  // deriva y suma automáticamente. Nunca claves privadas.
  bitcoin: /^(bc1[02-9ac-hj-np-z]{11,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34}|(x|y|z)pub[1-9A-HJ-NP-Za-km-z]{100,115})$/,
};

function getClient() {
  return getSupabaseServiceClient() ?? getSupabaseServerClient();
}

export async function GET(request: NextRequest) {
  const portfolioId = (request.nextUrl.searchParams.get("portfolioId") ?? "").trim();
  const access = await getViewerAccess();
  const check = ensurePortfolioAccess(access, portfolioId, false);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const { data, error } = await getClient()
    .from("portfolio_wallets")
    .select("id, chain_kind, address, label, is_active")
    .eq("portfolio_id", portfolioId)
    .order("chain_kind");
  if (error) {
    // Detalle de Postgres al log del servidor; al navegador, mensaje genérico.
    console.error("wallet/manage GET:", error.message);
    return NextResponse.json({ error: "No se pudieron leer las wallets." }, { status: 500 });
  }
  return NextResponse.json({ wallets: data ?? [] });
}

export async function POST(request: NextRequest) {
  const csrfCheck = validateCsrf(request);
  if (!csrfCheck.ok) return NextResponse.json({ error: csrfCheck.error }, { status: csrfCheck.status });

  let body: { portfolioId?: string; chainKind?: string; address?: string; label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }
  const portfolioId = (body.portfolioId ?? "").trim();
  const chainKind = (body.chainKind ?? "").trim().toLowerCase();
  const address = (body.address ?? "").trim();
  const label = (body.label ?? "").trim() || null;

  const access = await getViewerAccess();
  const check = ensurePortfolioAccess(access, portfolioId, true);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const pattern = ADDRESS_PATTERNS[chainKind];
  if (!pattern) return NextResponse.json({ error: "Tipo de cadena no soportado (evm, solana, bitcoin)." }, { status: 400 });
  if (!pattern.test(address)) {
    return NextResponse.json({ error: `La dirección no tiene formato válido de ${chainKind}.` }, { status: 400 });
  }

  const { data, error } = await getClient()
    .from("portfolio_wallets")
    .insert({ portfolio_id: portfolioId, chain_kind: chainKind, address, label })
    .select("id, chain_kind, address, label, is_active")
    .single();
  if (error) {
    console.error("wallet/manage POST:", error.message);
    // El caso de duplicado sí se nombra: es información que el usuario necesita
    // y no revela nada del esquema. El resto sale genérico.
    const msg = error.message.includes("duplicate")
      ? "Esa dirección ya está añadida a este portfolio."
      : "No se pudo añadir la wallet.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ wallet: data });
}

export async function PATCH(request: NextRequest) {
  const csrfCheck = validateCsrf(request);
  if (!csrfCheck.ok) return NextResponse.json({ error: csrfCheck.error }, { status: csrfCheck.status });

  let body: { portfolioId?: string; walletId?: string; isActive?: boolean; label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }
  const portfolioId = (body.portfolioId ?? "").trim();
  const walletId = (body.walletId ?? "").trim();

  const access = await getViewerAccess();
  const check = ensurePortfolioAccess(access, portfolioId, true);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });
  if (!walletId) return NextResponse.json({ error: "Falta walletId." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.isActive === "boolean") patch.is_active = body.isActive;
  if (typeof body.label === "string") patch.label = body.label.trim() || null;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });
  }

  const { data, error } = await getClient()
    .from("portfolio_wallets")
    .update(patch)
    .eq("id", walletId)
    .eq("portfolio_id", portfolioId) // evita tocar wallets de otro portfolio
    .select("id, chain_kind, address, label, is_active")
    .single();
  if (error) {
    console.error("wallet/manage PATCH:", error.message);
    return NextResponse.json({ error: "No se pudo actualizar la wallet." }, { status: 400 });
  }
  return NextResponse.json({ wallet: data });
}
