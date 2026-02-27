import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { validateCsrf } from "@/lib/security/csrf";
import { checkRateLimit } from "@/lib/security/rate-limit";

type ResetPasswordBody = {
  accessToken?: string;
  refreshToken?: string;
  password?: string;
};

function cleanText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export async function POST(request: NextRequest) {
  try {
    const csrfCheck = validateCsrf(request);
    if (!csrfCheck.ok) {
      return NextResponse.json({ error: csrfCheck.error }, { status: csrfCheck.status });
    }

    const body = (await request.json()) as ResetPasswordBody;
    const accessToken = cleanText(body.accessToken);
    const refreshToken = cleanText(body.refreshToken);
    const password = cleanText(body.password);

    if (!accessToken || !refreshToken) {
      return NextResponse.json({ error: "Enlace de recuperación inválido o caducado." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "La nueva contraseña debe tener al menos 8 caracteres." }, { status: 400 });
    }

    const clientIp = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "unknown";
    const ipLimit = checkRateLimit(`auth-reset-password:ip:${clientIp}`, { limit: 20, windowMs: 60_000 });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes de cambio de contraseña. Inténtalo de nuevo en unos minutos." },
        { status: 429 },
      );
    }

    const authClient = getSupabaseServerClient();
    const setSessionResult = await authClient.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (setSessionResult.error) {
      return NextResponse.json({ error: "El enlace de recuperación no es válido. Solicita uno nuevo." }, { status: 400 });
    }

    const updateResult = await authClient.auth.updateUser({ password });
    if (updateResult.error) {
      return NextResponse.json({ error: updateResult.error.message }, { status: 400 });
    }

    await authClient.auth.signOut();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado al cambiar la contraseña.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
