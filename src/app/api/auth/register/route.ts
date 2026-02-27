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

type RegisterBody = {
  fullName?: string;
  email?: string;
  password?: string;
};

function cleanText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function getAuthClient(): SupabaseClient {
  return getSupabaseServerClient();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function resolveAppOrigin(request: NextRequest): string {
  const configured = cleanText(process.env.NEXT_PUBLIC_APP_URL);
  if (configured) return configured;
  return request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  try {
    const csrfCheck = validateCsrf(request);
    if (!csrfCheck.ok) {
      return NextResponse.json({ error: csrfCheck.error }, { status: csrfCheck.status });
    }

    const body = (await request.json()) as RegisterBody;
    const fullName = cleanText(body.fullName);
    const email = cleanText(body.email).toLowerCase();
    const password = cleanText(body.password);

    if (!fullName) {
      return NextResponse.json({ error: "El nombre de usuario es obligatorio." }, { status: 400 });
    }
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Debes indicar un email válido." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres." },
        { status: 400 },
      );
    }

    const clientIp = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "unknown";
    const ipLimit = checkRateLimit(`auth-register:ip:${clientIp}`, { limit: 10, windowMs: 60_000 });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiados registros en poco tiempo. Inténtalo de nuevo en unos minutos." },
        { status: 429 },
      );
    }

    const emailLimit = checkRateLimit(`auth-register:email:${email}:${clientIp}`, {
      limit: 4,
      windowMs: 10 * 60_000,
    });
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos para este email. Inténtalo de nuevo más tarde." },
        { status: 429 },
      );
    }

    const authClient = getAuthClient();
    const appOrigin = resolveAppOrigin(request);
    const signUpResult = await authClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${appOrigin}/login`,
      },
    });

    if (signUpResult.error || !signUpResult.data.user?.id) {
      return NextResponse.json(
        { error: signUpResult.error?.message ?? "No se pudo completar el registro." },
        { status: 400 },
      );
    }

    const userId = signUpResult.data.user.id;
    const service = getSupabaseServiceClient();
    if (service) {
      const profileUpdate = await service
        .from("profiles")
        .upsert(
          {
            id: userId,
            full_name: fullName,
            email,
            role: "autonomo",
          },
          { onConflict: "id" },
        );
      if (profileUpdate.error) {
        return NextResponse.json(
          { error: `Usuario creado pero no se pudo completar el perfil: ${profileUpdate.error.message}` },
          { status: 500 },
        );
      }
    }

    const response = NextResponse.json({
      ok: true,
      requiresEmailConfirmation: !signUpResult.data.session,
      sessionStarted: Boolean(signUpResult.data.session),
    });
    response.headers.set("cache-control", "no-store");

    if (signUpResult.data.session) {
      const session = signUpResult.data.session;
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
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado durante el registro.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
