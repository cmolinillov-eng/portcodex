import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { validateCsrf } from "@/lib/security/csrf";
import { recordAdminAudit } from "@/lib/security/admin-audit";
import { checkRateLimit } from "@/lib/security/rate-limit";

type AppRole = "autonomo" | "admin" | "cliente";

type ProfileUserRow = {
  id: string | null;
  email: string | null;
  full_name: string | null;
  role: AppRole | null;
  created_at: string | null;
};

type ProfileRoleRow = {
  id: string | null;
  role: AppRole | null;
};

type PortfolioIdRow = {
  id: string | null;
};

type UpdateRoleBody = {
  userId?: string;
  role?: unknown;
  fullName?: unknown;
  email?: unknown;
};

type CreateUserBody = {
  fullName?: string;
  email?: string;
  password?: string;
  role?: AppRole;
  managerId?: string | null;
  portfolioName?: string;
  assignPortfolioIds?: string[];
};

type DeleteUserBody = {
  userId?: string;
};

function cleanText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizeRole(value: string | undefined): AppRole | null {
  if (value === "autonomo" || value === "admin" || value === "cliente") return value;
  return null;
}

function normalizeEmail(value: string | undefined): string {
  return cleanText(value).normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function isLikelyEmail(value: string): boolean {
  if (!value || value.length > 320) return false;
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!local || !domain || domain.startsWith(".") || domain.endsWith(".")) return false;
  return domain.includes(".");
}

function getClient(): SupabaseClient {
  const service = getSupabaseServiceClient();
  if (service) return service;
  return getSupabaseServerClient();
}

function getServiceClientOrThrow(): SupabaseClient {
  const service = getSupabaseServiceClient();
  if (!service) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY es obligatoria para crear/eliminar usuarios y actualizar emails.");
  }
  return service;
}

function buildDefaultPortfolioName(fullName: string, email: string): string {
  const preferred = cleanText(fullName);
  if (preferred) return `Portfolio de ${preferred}`;
  const localPart = cleanText(email.split("@")[0] ?? "");
  return localPart ? `Portfolio de ${localPart}` : "Portfolio principal";
}

function parsePortfolioIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? cleanText(item) : ""))
        .filter((item) => item.length > 0),
    ),
  );
}

function normalizeCreateAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("already") || lower.includes("registered") || lower.includes("exists")) {
    return "Ese correo ya está registrado.";
  }
  if (lower.includes("password")) {
    return "La contraseña no cumple las reglas mínimas.";
  }
  return "No se pudo completar la operación de autenticación.";
}

async function assertManagerCanBeAssigned(
  client: SupabaseClient,
  managerId: string,
  actorUserId: string,
): Promise<void> {
  if (!managerId) {
    throw new Error("Debes indicar un gestor para este cliente.");
  }

  if (managerId === actorUserId) {
    return;
  }

  const managerQuery = await client
    .from("profiles")
    .select("id, role")
    .eq("id", managerId)
    .maybeSingle();

  if (managerQuery.error) {
    throw new Error(managerQuery.error.message);
  }

  const manager = (managerQuery.data ?? null) as ProfileRoleRow | null;
  if (!manager?.id || manager.role !== "admin") {
    throw new Error("Solo puedes asignar usuarios con rol gestor como manager del cliente.");
  }
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
    if (process.env.NODE_ENV !== "production") console.error("List users error:", error);
    return NextResponse.json({ error: "Error inesperado consultando usuarios." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const csrfCheck = validateCsrf(request);
    if (!csrfCheck.ok) {
      return NextResponse.json({ error: csrfCheck.error }, { status: csrfCheck.status });
    }

    const access = await getViewerAccess();
    if (!access.canManageRoles || !access.userId) {
      return NextResponse.json({ error: "Solo el administrador principal puede crear usuarios." }, { status: 403 });
    }

    const clientIp = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "unknown";
    const rateLimit = checkRateLimit(
      `admin-create-user:${access.userId}:${clientIp}`,
      { limit: 10, windowMs: 60_000 },
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiadas altas de usuario en poco tiempo. Inténtalo de nuevo en unos segundos." },
        { status: 429 },
      );
    }

    const body = (await request.json()) as CreateUserBody;
    const fullName = cleanText(body.fullName);
    const email = normalizeEmail(body.email);
    const password = cleanText(body.password);
    const role = normalizeRole(body.role);
    const managerIdInput = cleanText(body.managerId ?? "");
    const managerId = managerIdInput.length > 0 ? managerIdInput : null;
    const portfolioName = cleanText(body.portfolioName);
    const assignPortfolioIds = parsePortfolioIds(body.assignPortfolioIds);

    if (!fullName) {
      return NextResponse.json({ error: "El nombre completo es obligatorio." }, { status: 400 });
    }
    if (!email || !isLikelyEmail(email)) {
      return NextResponse.json({ error: "Debes indicar un email válido." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres." }, { status: 400 });
    }
    if (!role) {
      return NextResponse.json({ error: "Rol inválido." }, { status: 400 });
    }

    const client = getClient();
    if (role === "cliente" && managerId) {
      await assertManagerCanBeAssigned(client, managerId, access.userId);
    }

    const serviceClient = getServiceClientOrThrow();

    // Intentar crear usuario auth. Si el email ya existe, reutilizar el auth user existente.
    let authUserId: string;
    let isNewAuthUser = false;

    const authCreate = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (authCreate.error || !authCreate.data.user?.id) {
      const errorMsg = authCreate.error?.message ?? "";
      const isEmailExists = errorMsg.toLowerCase().includes("already") ||
        errorMsg.toLowerCase().includes("registered") ||
        errorMsg.toLowerCase().includes("exists");

      if (!isEmailExists) {
        return NextResponse.json(
          { error: normalizeCreateAuthError(errorMsg || "No se pudo crear el usuario en autenticación.") },
          { status: 400 },
        );
      }

      // El email ya existe en auth → buscar el auth user existente por email
      const listResult = await serviceClient.auth.admin.listUsers({ perPage: 1000 });
      if (listResult.error) {
        return NextResponse.json({ error: "No se pudo verificar el usuario existente." }, { status: 500 });
      }
      const existingAuthUser = listResult.data.users.find((u) => u.email?.toLowerCase() === email);
      if (!existingAuthUser) {
        return NextResponse.json({ error: "El correo ya existe pero no se pudo localizar el usuario." }, { status: 500 });
      }
      authUserId = existingAuthUser.id;

      // Verificar que ese auth user no tenga ya ese rol
      const existingRoleQuery = await client
        .from("profiles")
        .select("id")
        .eq("auth_user_id", authUserId)
        .eq("role", role)
        .maybeSingle();

      if (existingRoleQuery.data?.id) {
        return NextResponse.json(
          { error: `Este correo ya tiene un perfil con rol "${role}".` },
          { status: 400 },
        );
      }
    } else {
      authUserId = authCreate.data.user.id;
      isNewAuthUser = true;
    }

    // Crear nuevo perfil (nuevo UUID independiente del auth user id)
    const { data: newProfileData, error: profileInsertError } = await client
      .from("profiles")
      .insert({
        auth_user_id: authUserId,
        full_name: fullName,
        email,
        role,
      })
      .select("id")
      .maybeSingle();

    if (profileInsertError || !newProfileData?.id) {
      if (isNewAuthUser) {
        await serviceClient.auth.admin.deleteUser(authUserId);
      }
      throw new Error(`No se pudo crear perfil: ${profileInsertError?.message ?? "respuesta vacía"}`);
    }

    const profileId: string = newProfileData.id;

    const createdPortfolioIds: string[] = [];

    if (role === "cliente" || role === "autonomo") {
      const createPortfolio = await client
        .from("portfolios")
        .insert({
          name: portfolioName || buildDefaultPortfolioName(fullName, email),
          owner_id: profileId,
          manager_id: role === "cliente" ? managerId : null,
        })
        .select("id")
        .maybeSingle();

      if (createPortfolio.error) {
        if (process.env.NODE_ENV !== "production") console.error("Create portfolio error:", createPortfolio.error.message);
        await client.from("profiles").delete().eq("id", profileId);
        if (isNewAuthUser) {
          await serviceClient.auth.admin.deleteUser(authUserId);
        }
        return NextResponse.json(
          { error: "No se pudo crear el portfolio del usuario." },
          { status: 400 },
        );
      }

      if (createPortfolio.data?.id) {
        createdPortfolioIds.push(createPortfolio.data.id);
      }
    }

    if (role === "admin" && assignPortfolioIds.length > 0) {
      const assignQuery = await client
        .from("portfolios")
        .update({ manager_id: profileId })
        .in("id", assignPortfolioIds);
      if (assignQuery.error) {
        throw new Error(`Usuario creado, pero no se pudieron asignar portfolios: ${assignQuery.error.message}`);
      }
    }

    await recordAdminAudit({
      actorId: access.userId,
      action: "create_user",
      targetTable: "profiles",
      targetId: profileId,
      beforeData: null,
      afterData: {
        email,
        fullName,
        role,
        isNewAuthUser,
        managerId: role === "cliente" ? managerId : null,
        createdPortfolioIds,
        assignedPortfolioIds: role === "admin" ? assignPortfolioIds : [],
      },
    });

    return NextResponse.json({
      ok: true,
      row: {
        id: profileId,
        email,
        fullName,
        role,
      },
      createdPortfolioIds,
      assignedPortfolioIds: role === "admin" ? assignPortfolioIds : [],
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Create user error:", error);
    return NextResponse.json({ error: "Error inesperado creando usuario." }, { status: 500 });
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
        { error: "Solo el administrador principal puede actualizar usuarios." },
        { status: 403 },
      );
    }

    const clientIp = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "unknown";
    const rateLimit = checkRateLimit(
      `admin-update-user:${access.userId ?? "anon"}:${clientIp}`,
      { limit: 20, windowMs: 60_000 },
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiados cambios de usuario en poco tiempo. Inténtalo de nuevo en unos segundos." },
        { status: 429 },
      );
    }

    const body = (await request.json()) as UpdateRoleBody;
    const userId = cleanText(body.userId);
    const hasRoleField = Object.prototype.hasOwnProperty.call(body, "role");
    const hasFullNameField = Object.prototype.hasOwnProperty.call(body, "fullName");
    const hasEmailField = Object.prototype.hasOwnProperty.call(body, "email");

    const nextRole = hasRoleField
      ? normalizeRole(typeof body.role === "string" ? body.role : undefined)
      : null;
    const nextFullName = hasFullNameField
      ? cleanText(typeof body.fullName === "string" ? body.fullName : "")
      : null;
    const nextEmail = hasEmailField
      ? normalizeEmail(typeof body.email === "string" ? body.email : undefined)
      : null;

    if (!userId) {
      return NextResponse.json({ error: "userId es obligatorio." }, { status: 400 });
    }
    if (!hasRoleField && !hasFullNameField && !hasEmailField) {
      return NextResponse.json(
        { error: "Debes indicar al menos un campo a actualizar (nombre, email o rol)." },
        { status: 400 },
      );
    }
    if (hasRoleField && !nextRole) {
      return NextResponse.json({ error: "Rol inválido." }, { status: 400 });
    }
    if (hasFullNameField && !nextFullName) {
      return NextResponse.json({ error: "El nombre no puede quedar vacío." }, { status: 400 });
    }
    if (hasEmailField && (!nextEmail || !isLikelyEmail(nextEmail))) {
      return NextResponse.json({ error: "Debes indicar un email válido." }, { status: 400 });
    }

    const client = getClient();
    const currentUserQuery = await client
      .from("profiles")
      .select("id, role, full_name, email")
      .eq("id", userId)
      .maybeSingle();

    if (currentUserQuery.error) {
      throw new Error(currentUserQuery.error.message);
    }

    const currentUser = (currentUserQuery.data ?? null) as ProfileUserRow | null;
    if (!currentUser?.id) {
      return NextResponse.json({ error: "No se encontró el usuario indicado." }, { status: 404 });
    }

    const resolvedRole = (nextRole ?? currentUser.role ?? "autonomo") as AppRole;
    if ((currentUser.role ?? "autonomo") === "admin" && resolvedRole !== "admin") {
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

    const patch: Record<string, unknown> = {};
    if (nextRole) patch.role = nextRole;
    if (nextFullName) patch.full_name = nextFullName;
    if (nextEmail) patch.email = nextEmail;

    const updateQuery = await client
      .from("profiles")
      .update(patch)
      .eq("id", userId)
      .select("id, role, full_name, email")
      .maybeSingle();

    if (updateQuery.error) {
      throw new Error(updateQuery.error.message);
    }
    if (!updateQuery.data?.id) {
      return NextResponse.json({ error: "No se encontró el usuario indicado." }, { status: 404 });
    }

    const updatedUser = updateQuery.data as ProfileUserRow;
    if (nextEmail && nextEmail !== (currentUser.email ?? "")) {
      const serviceClient = getServiceClientOrThrow();
      const authUpdate = await serviceClient.auth.admin.updateUserById(userId, {
        email: nextEmail,
        email_confirm: true,
      });

      if (authUpdate.error) {
        await client
          .from("profiles")
          .update({
            role: currentUser.role,
            full_name: currentUser.full_name,
            email: currentUser.email,
          })
          .eq("id", userId);

        return NextResponse.json(
          { error: normalizeCreateAuthError(authUpdate.error.message) },
          { status: 400 },
        );
      }
    }

    await recordAdminAudit({
      actorId: access.userId,
      action: "update_user",
      targetTable: "profiles",
      targetId: userId,
      beforeData: {
        role: currentUser.role ?? "autonomo",
        fullName: currentUser.full_name ?? "",
        email: currentUser.email ?? "",
      },
      afterData: {
        role: updatedUser.role ?? resolvedRole,
        fullName: updatedUser.full_name ?? nextFullName ?? currentUser.full_name ?? "",
        email: updatedUser.email ?? nextEmail ?? currentUser.email ?? "",
      },
    });

    return NextResponse.json({
      ok: true,
      row: {
        id: updatedUser.id,
        role: updatedUser.role ?? resolvedRole,
        fullName: updatedUser.full_name ?? nextFullName ?? currentUser.full_name ?? "",
        email: updatedUser.email ?? nextEmail ?? currentUser.email ?? "",
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Update user error:", error);
    return NextResponse.json({ error: "Error inesperado actualizando usuario." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const csrfCheck = validateCsrf(request);
    if (!csrfCheck.ok) {
      return NextResponse.json({ error: csrfCheck.error }, { status: csrfCheck.status });
    }

    const access = await getViewerAccess();
    if (!access.canManageRoles || !access.userId) {
      return NextResponse.json({ error: "Solo el administrador principal puede eliminar usuarios." }, { status: 403 });
    }

    const clientIp = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "unknown";
    const rateLimit = checkRateLimit(
      `admin-delete-user:${access.userId}:${clientIp}`,
      { limit: 8, windowMs: 60_000 },
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiadas eliminaciones de usuario en poco tiempo. Inténtalo de nuevo en unos segundos." },
        { status: 429 },
      );
    }

    const body = (await request.json()) as DeleteUserBody;
    const userId = cleanText(body.userId);

    if (!userId) {
      return NextResponse.json({ error: "userId es obligatorio." }, { status: 400 });
    }

    if (userId === access.userId) {
      return NextResponse.json({ error: "No puedes eliminar tu propio usuario administrador." }, { status: 400 });
    }

    const client = getClient();
    const profileQuery = await client
      .from("profiles")
      .select("id, role")
      .eq("id", userId)
      .maybeSingle();

    if (profileQuery.error) {
      throw new Error(profileQuery.error.message);
    }

    const target = (profileQuery.data ?? null) as ProfileRoleRow | null;
    if (!target?.id) {
      return NextResponse.json({ error: "No se encontró el usuario indicado." }, { status: 404 });
    }

    const managedElsewhereUpdate = await client
      .from("portfolios")
      .update({ manager_id: null })
      .eq("manager_id", userId)
      .neq("owner_id", userId)
      .select("id");
    if (managedElsewhereUpdate.error) {
      throw new Error(managedElsewhereUpdate.error.message);
    }

    const ownedPortfoliosQuery = await client
      .from("portfolios")
      .select("id")
      .eq("owner_id", userId);
    if (ownedPortfoliosQuery.error) {
      throw new Error(ownedPortfoliosQuery.error.message);
    }

    const ownedPortfolioIds = ((ownedPortfoliosQuery.data ?? []) as PortfolioIdRow[])
      .map((row) => cleanText(row.id))
      .filter((id) => id.length > 0);

    let deletedTransactions = 0;
    let deletedPortfolios = 0;

    if (ownedPortfolioIds.length > 0) {
      const txDelete = await client
        .from("transactions")
        .delete()
        .in("portfolio_id", ownedPortfolioIds)
        .select("id");
      if (txDelete.error) {
        throw new Error(txDelete.error.message);
      }
      deletedTransactions = (txDelete.data ?? []).length;

      const portfolioDelete = await client
        .from("portfolios")
        .delete()
        .in("id", ownedPortfolioIds)
        .select("id");
      if (portfolioDelete.error) {
        throw new Error(portfolioDelete.error.message);
      }
      deletedPortfolios = (portfolioDelete.data ?? []).length;
    }

    const profileDelete = await client
      .from("profiles")
      .delete()
      .eq("id", userId)
      .select("id")
      .maybeSingle();

    if (profileDelete.error) {
      throw new Error(profileDelete.error.message);
    }

    const serviceClient = getServiceClientOrThrow();
    const authDelete = await serviceClient.auth.admin.deleteUser(userId);
    if (authDelete.error) {
      throw new Error(`Perfil eliminado, pero falló eliminar auth user: ${authDelete.error.message}`);
    }

    await recordAdminAudit({
      actorId: access.userId,
      action: "delete_user",
      targetTable: "profiles",
      targetId: userId,
      beforeData: {
        role: target.role ?? "autonomo",
        deletedPortfolios,
        deletedTransactions,
        unassignedManagedPortfolios: (managedElsewhereUpdate.data ?? []).length,
      },
      afterData: null,
    });

    return NextResponse.json({
      ok: true,
      deletedUserId: userId,
      deletedPortfolios,
      deletedTransactions,
      unassignedManagedPortfolios: (managedElsewhereUpdate.data ?? []).length,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Delete user error:", error);
    return NextResponse.json({ error: "Error inesperado eliminando usuario." }, { status: 500 });
  }
}
