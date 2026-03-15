import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  PROFILE_ID_COOKIE_NAME,
  isProductionEnvironment,
} from "@/lib/auth/session";
import { validateCsrf } from "@/lib/security/csrf";

type SelectProfileBody = {
  profileId?: string;
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

    // Verificar sesión auth activa
    const accessToken = cleanText(request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value);
    if (!accessToken) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const authClient = getSupabaseServerClient();
    const userResult = await authClient.auth.getUser(accessToken);
    if (userResult.error || !userResult.data.user?.id) {
      return NextResponse.json({ error: "Sesión inválida." }, { status: 401 });
    }

    const authUserId = userResult.data.user.id;

    const body = (await request.json()) as SelectProfileBody;
    const profileId = cleanText(body.profileId);
    if (!profileId) {
      return NextResponse.json({ error: "profileId es obligatorio." }, { status: 400 });
    }

    // Verificar que el profileId pertenece al auth user autenticado
    const client = getSupabaseServiceClient() ?? authClient;
    const profileQuery = await client
      .from("profiles")
      .select("id, role")
      .eq("id", profileId)
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (profileQuery.error || !profileQuery.data) {
      return NextResponse.json({ error: "Perfil no válido para este usuario." }, { status: 403 });
    }

    const secure = isProductionEnvironment();
    const response = NextResponse.json({ ok: true, role: profileQuery.data.role });
    response.headers.set("cache-control", "no-store");

    response.cookies.set(PROFILE_ID_COOKIE_NAME, profileId, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Select profile error:", error);
    return NextResponse.json({ error: "Error inesperado al seleccionar perfil." }, { status: 500 });
  }
}
