import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
  PROFILE_ID_COOKIE_NAME,
  isProductionEnvironment,
} from "@/lib/auth/session";
import { validateCsrf } from "@/lib/security/csrf";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { ensureOwnedPortfoliosForProfiles } from "@/lib/portfolios/ensure-owned-portfolios";

type LoginBody = {
  identifier?: string;
  password?: string;
};

type ProfileEmailRow = {
  email: string | null;
};

type ProfileForProvision = {
  id: string | null;
  full_name: string | null;
  email: string | null;
  role: "autonomo" | "admin" | "cliente" | null;
};

type ProfileListRow = {
  id: string;
  role: "autonomo" | "admin" | "cliente";
  full_name: string | null;
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

    const session = loginResult.data.session;
    const userId = cleanText(loginResult.data.user?.id ?? session.user?.id ?? "");

    // Obtener todos los perfiles de este auth user
    let profiles: ProfileForProvision[] = [];
    const provisionClient = getSupabaseServiceClient() ?? getSupabaseServerClient();

    if (userId) {
      const profilesQuery = await provisionClient
        .from("profiles")
        .select("id, full_name, email, role")
        .eq("auth_user_id", userId)
        .order("created_at", { ascending: true });

      if (!profilesQuery.error && profilesQuery.data) {
        profiles = profilesQuery.data as ProfileForProvision[];
      }

      // Fallback legacy: buscar por id = userId
      if (profiles.length === 0) {
        const legacyQuery = await provisionClient
          .from("profiles")
          .select("id, full_name, email, role")
          .eq("id", userId)
          .maybeSingle();

        if (!legacyQuery.error && legacyQuery.data) {
          profiles = [legacyQuery.data as ProfileForProvision];
        }
      }

      // Si aún no hay perfil, provisionar uno como autónomo
      if (profiles.length === 0) {
        const upsertResult = await provisionClient
          .from("profiles")
          .upsert(
            {
              id: userId,
              auth_user_id: userId,
              email,
              role: "autonomo",
            },
            { onConflict: "id" },
          );

        if (!upsertResult.error) {
          profiles = [{ id: userId, full_name: null, email, role: "autonomo" }];
        }
      }

      // Garantizar portfolio propio para cada perfil cliente/autónomo
      try {
        const operableProfiles = profiles.filter(
          (p): p is ProfileForProvision & { id: string } =>
            Boolean(p.id) && (p.role === "autonomo" || p.role === "cliente"),
        );
        if (operableProfiles.length > 0) {
          await ensureOwnedPortfoliosForProfiles(provisionClient, operableProfiles);
        }
      } catch (_provisionError) {
        // No bloquear el login por esto
      }
    }

    const secure = isProductionEnvironment();
    const response = NextResponse.json({ ok: true });
    response.headers.set("cache-control", "no-store");

    // Siempre poner cookies de sesión auth
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

    // Si solo hay un perfil → seleccionarlo automáticamente con cookie
    if (profiles.length <= 1) {
      const singleProfileId = profiles[0]?.id;
      if (singleProfileId) {
        response.cookies.set(PROFILE_ID_COOKIE_NAME, singleProfileId, {
          httpOnly: true,
          secure,
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 30,
        });
      }
      return response;
    }

    // Si hay múltiples perfiles → devolver lista para que el usuario elija
    const profileList: ProfileListRow[] = profiles
      .filter((p): p is ProfileForProvision & { id: string; role: "autonomo" | "admin" | "cliente" } =>
        Boolean(p.id) && Boolean(p.role),
      )
      .map((p) => ({
        id: p.id,
        role: p.role,
        full_name: p.full_name ?? null,
      }));

    return NextResponse.json(
      { ok: true, requiresProfileSelection: true, profiles: profileList },
      {
        headers: {
          "cache-control": "no-store",
          "set-cookie": response.headers.get("set-cookie") ?? "",
        },
      },
    );
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Login error:", error);
    return NextResponse.json({ error: "Error inesperado iniciando sesión." }, { status: 500 });
  }
}
