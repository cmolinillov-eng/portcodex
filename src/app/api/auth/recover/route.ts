import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { validateCsrf } from "@/lib/security/csrf";
import { checkRateLimit } from "@/lib/security/rate-limit";

type RecoverBody = {
  email?: string;
};

function cleanText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getAuthClient(): SupabaseClient {
  return getSupabaseServerClient();
}

async function isKnownUserEmail(email: string): Promise<boolean | null> {
  const serviceClient = getSupabaseServiceClient();
  if (!serviceClient) return null;

  const profileResult = await serviceClient
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .limit(1);

  if (profileResult.error) return null;
  return (profileResult.data ?? []).length > 0;
}

function resolveAppOrigin(request: NextRequest): string {
  const configured = cleanText(process.env.NEXT_PUBLIC_APP_URL);
  if (configured) {
    try {
      const url = new URL(configured);
      const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      if (!(process.env.NODE_ENV === "production" && isLocalhost)) {
        return url.origin;
      }
    } catch {
      // Si la variable no es una URL válida, caemos a origen detectado por request.
    }
  }
  return request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  try {
    const csrfCheck = validateCsrf(request);
    if (!csrfCheck.ok) {
      return NextResponse.json({ error: csrfCheck.error }, { status: csrfCheck.status });
    }

    const body = (await request.json()) as RecoverBody;
    const email = cleanText(body.email).toLowerCase();
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Debes indicar un email válido." }, { status: 400 });
    }

    const clientIp = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "unknown";
    const ipLimit = checkRateLimit(`auth-recover:ip:${clientIp}`, { limit: 15, windowMs: 60_000 });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes de recuperación. Inténtalo de nuevo en unos minutos." },
        { status: 429 },
      );
    }

    const emailLimit = checkRateLimit(`auth-recover:email:${email}:${clientIp}`, {
      limit: 4,
      windowMs: 15 * 60_000,
    });
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: "Has solicitado demasiados enlaces para este email. Espera unos minutos." },
        { status: 429 },
      );
    }

    const knownUser = await isKnownUserEmail(email);
    if (knownUser === false) {
      return NextResponse.json({
        ok: true,
        message: "Si el correo existe, recibirás un enlace de recuperación en unos minutos.",
      });
    }

    const authClient = getAuthClient();
    const appOrigin = resolveAppOrigin(request);
    const recoverResult = await authClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${appOrigin}/login`,
    });

    if (recoverResult.error) {
      if (recoverResult.error.message.toLowerCase().includes("rate limit")) {
        return NextResponse.json({
          ok: true,
          message:
            "El proveedor de correo tiene un límite temporal de envíos. Inténtalo de nuevo en unos minutos.",
        });
      }
      return NextResponse.json(
        { error: "No se pudo procesar la recuperación en este momento. Inténtalo de nuevo en unos minutos." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Si el correo existe, recibirás un enlace de recuperación en unos minutos.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado solicitando recuperación.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
