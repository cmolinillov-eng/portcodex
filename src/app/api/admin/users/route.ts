import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { validateCsrf } from "@/lib/security/csrf";
import { recordAdminAudit } from "@/lib/security/admin-audit";
import { checkRateLimit } from "@/lib/security/rate-limit";

type ProfileUserRow = {
  id: string | null;
  email: string | null;
  full_name: string | null;
  role: "autonomo" | "admin" | "cliente" | null;
  created_at: string | null;
};

type ProfileRoleRow = {
  id: string | null;
  role: "autonomo" | "admin" | "cliente" | null;
};

function getClient(): SupabaseClient {
  const service = getSupabaseServiceClient();
  if (service) return service;
  return getSupabaseServerClient();
}

type UpdateRoleBody = {
  userId?: string;
  role?: "autonomo" | "admin" | "cliente";
};

function normalizeRole(value: string | undefined): "autonomo" | "admin" | "cliente" | null {
  if (value === "autonomo" || value === "admin" || value === "cliente") return value;
  return null;
}

export async function GET() {
  try {
    const access = await getViewerAccess();
    if (!access.canManageRoles) {
      return NextResponse.json({ error: "Solo el administrador principal puede ver este panel." }, { status: 403 });
    }

    const client = getClient();
    const query = await client
      .from("profiles")
      .select("id, email, full_name, role, created_at")
      .order("created_at", { ascending: false });

    if (query.error) {
      throw new Error(query.error.message);
    }

    const rows = ((query.data ?? []) as ProfileUserRow[]).map((row) => ({
      id: row.id ?? "",
      email: row.email ?? "",
      fullName: row.full_name ?? "",
      role: row.role ?? "autonomo",
      createdAt: row.created_at ?? null,
    }));

    return NextResponse.json({ rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado consultando usuarios.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const csrfCheck = validateCsrf(request);
    if (!csrfCheck.ok) {
      return NextResponse.json({ error: csrfCheck.error }, { status: csrfCheck.status });
    }

    const access = await getViewerAccess();
    if (!access.canManageRoles) {
      return NextResponse.json(
        { error: "Solo el administrador principal puede cambiar roles." },
        { status: 403 },
      );
    }

    const clientIp = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "unknown";
    const rateLimit = checkRateLimit(
      `admin-update-role:${access.userId ?? "anon"}:${clientIp}`,
      { limit: 20, windowMs: 60_000 },
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiados cambios de rol en poco tiempo. Inténtalo de nuevo en unos segundos." },
        { status: 429 },
      );
    }

    const body = (await request.json()) as UpdateRoleBody;
    const userId = body.userId?.trim() ?? "";
    const role = normalizeRole(body.role);

    if (!userId) {
      return NextResponse.json({ error: "userId es obligatorio." }, { status: 400 });
    }
    if (!role) {
      return NextResponse.json({ error: "Rol inválido." }, { status: 400 });
    }

    const client = getClient();
    const currentUserQuery = await client
      .from("profiles")
      .select("id, role")
      .eq("id", userId)
      .maybeSingle();

    if (currentUserQuery.error) {
      throw new Error(currentUserQuery.error.message);
    }

    const currentUser = (currentUserQuery.data ?? null) as ProfileRoleRow | null;
    if (!currentUser?.id) {
      return NextResponse.json({ error: "No se encontró el usuario indicado." }, { status: 404 });
    }

    if (currentUser.role === "admin" && role !== "admin") {
      const managedPortfoliosQuery = await client
        .from("portfolios")
        .select("id", { count: "exact", head: true })
        .eq("manager_id", userId);
      if (managedPortfoliosQuery.error) {
        throw new Error(managedPortfoliosQuery.error.message);
      }
      const managedCount = managedPortfoliosQuery.count ?? 0;
      if (managedCount > 0) {
        return NextResponse.json(
          {
            error:
              "No puedes cambiar el rol de este gestor mientras tenga portfolios asignados. Desasigna primero esos portfolios.",
          },
          { status: 400 },
        );
      }
    }

    const updateQuery = await client
      .from("profiles")
      .update({ role })
      .eq("id", userId)
      .select("id, role")
      .maybeSingle();

    if (updateQuery.error) {
      throw new Error(updateQuery.error.message);
    }
    if (!updateQuery.data?.id) {
      return NextResponse.json({ error: "No se encontró el usuario indicado." }, { status: 404 });
    }

    await recordAdminAudit({
      actorId: access.userId,
      action: "update_user_role",
      targetTable: "profiles",
      targetId: userId,
      beforeData: { role: currentUser.role ?? "autonomo" },
      afterData: { role: updateQuery.data.role ?? role },
    });

    return NextResponse.json({
      ok: true,
      row: {
        id: updateQuery.data.id,
        role: updateQuery.data.role ?? role,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado actualizando rol.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
