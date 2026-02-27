import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
  isProductionEnvironment,
} from "@/lib/auth/session";
import { validateCsrf } from "@/lib/security/csrf";
import { checkRateLimit } from "@/lib/security/rate-limit";

type LoginBody = {
  identifier?: string;
  password?: string;
};

type ProfileEmailRow = {
  email: string | null;
};

function cleanText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function getAuthClient(): SupabaseClient {
  return getSupabaseServerClient();
}

async function resolveEmailFromIdentifier(identifier: string): Promise<string | null> {
  const cleanIdentifier = cleanText(identifier);
  if (!cleanIdentifier) return null;

  if (cleanIdentifier.includes("@")) {
    return cleanIdentifier.toLowerCase();
  }

  const serviceClient = getSupabaseServiceClient();
  if (!serviceClient) return null;

  const profileQuery = await serviceClient
    .from("profiles")
    .select("email")
    .ilike("full_name", cleanIdentifier)
    .not("email", "is", null)
    .limit(2);

  if (profileQuery.error) return null;

  const rows = (profileQuery.data ?? []) as ProfileEmailRow[];
  if (rows.length !== 1) return null;

  const email = cleanText(rows[0]?.email);
  return email.length > 0 ? email.toLowerCase() : null;
}

export async function POST(request: NextRequest) {
  try {
    const csrfCheck = validateCsrf(request);
    if (!csrfCheck.ok) {
      return NextResponse.json({ error: csrfCheck.error }, { status: csrfCheck.status });
    }

    const body = (await request.json()) as LoginBody;
    const identifier = cleanText(body.identifier);
    const password = cleanText(body.password);

    if (!identifier || !password) {
      return NextResponse.json({ error: "Usuario y contraseña son obligatorios." }, { status: 400 });
    }

    const clientIp = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "unknown";
    const ipLimit = checkRateLimit(`auth-login:ip:${clientIp}`, { limit: 20, windowMs: 60_000 });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos de inicio de sesión. Inténtalo de nuevo en unos minutos." },
        { status: 429 },
      );
    }

    const identifierLimit = checkRateLimit(
      `auth-login:identifier:${identifier.toLowerCase()}:${clientIp}`,
      { limit: 6, windowMs: 5 * 60_000 },
    );
    if (!identifierLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos de inicio de sesión. Inténtalo de nuevo en unos minutos." },
        { status: 429 },
      );
    }

    const email = await resolveEmailFromIdentifier(identifier);
    if (!email) {
      return NextResponse.json({ error: "Credenciales inválidas." }, { status: 401 });
    }

    const authClient = getAuthClient();
    const loginResult = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (loginResult.error || !loginResult.data.session) {
      return NextResponse.json({ error: "Credenciales inválidas." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.headers.set("cache-control", "no-store");
    const session = loginResult.data.session;
    const secure = isProductionEnvironment();

    response.cookies.set(ACCESS_TOKEN_COOKIE_NAME, session.access_token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(60, session.expires_in ?? 3600),
    });

    if (session.refresh_token) {
      response.cookies.set(REFRESH_TOKEN_COOKIE_NAME, session.refresh_token, {
        httpOnly: true,
        secure,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado iniciando sesión.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
