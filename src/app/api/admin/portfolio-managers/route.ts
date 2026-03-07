import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { validateCsrf } from "@/lib/security/csrf";
import { recordAdminAudit } from "@/lib/security/admin-audit";
import { checkRateLimit } from "@/lib/security/rate-limit";

type UpdateManagerBody = {
  portfolioId?: string;
  managerId?: string | null;
};

type ManagerProfileRow = {
  id: string | null;
  role: "autonomo" | "admin" | "cliente" | null;
};

type PortfolioOwnerRef = {
  role: "autonomo" | "admin" | "cliente" | null;
};

type PortfolioManagerRow = {
  id: string | null;
  manager_id: string | null;
  owner: PortfolioOwnerRef | PortfolioOwnerRef[] | null;
};

function getClient(): SupabaseClient {
  const service = getSupabaseServiceClient();
  if (service) return service;
  return getSupabaseServerClient();
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function readOwnerRole(owner: PortfolioManagerRow["owner"]): "autonomo" | "admin" | "cliente" | null {
  const ownerRef = Array.isArray(owner) ? owner[0] ?? null : owner;
  return ownerRef?.role ?? null;
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
        { error: "Solo el administrador principal puede asignar gestores." },
        { status: 403 },
      );
    }

    const clientIp = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "unknown";
    const rateLimit = checkRateLimit(
      `admin-assign-manager:${access.userId ?? "anon"}:${clientIp}`,
      { limit: 30, windowMs: 60_000 },
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiadas asignaciones en poco tiempo. Inténtalo de nuevo en unos segundos." },
        { status: 429 },
      );
    }

    const body = (await request.json()) as UpdateManagerBody;
    const portfolioId = cleanText(body.portfolioId);
    const managerIdRaw = cleanText(body.managerId ?? "");
    const managerId = managerIdRaw.length > 0 ? managerIdRaw : null;

    if (!portfolioId) {
      return NextResponse.json({ error: "portfolioId es obligatorio." }, { status: 400 });
    }

    const client = getClient();
    const currentPortfolioQuery = await client
      .from("portfolios")
      .select("id, manager_id, owner:profiles!owner_id(role)")
      .eq("id", portfolioId)
      .maybeSingle();
    if (currentPortfolioQuery.error) {
      throw new Error(currentPortfolioQuery.error.message);
    }

    const currentPortfolio = (currentPortfolioQuery.data ?? null) as PortfolioManagerRow | null;
    if (!currentPortfolio?.id) {
      return NextResponse.json({ error: "No se encontró el portfolio." }, { status: 404 });
    }

    const ownerRole = readOwnerRole(currentPortfolio.owner);
    if (managerId && ownerRole !== "cliente") {
      return NextResponse.json(
        { error: "Solo se puede asignar gestor a portfolios cuyo propietario sea cliente." },
        { status: 400 },
      );
    }

    if (managerId) {
      const managerQuery = await client
        .from("profiles")
        .select("id, role")
        .eq("id", managerId)
        .maybeSingle();

      if (managerQuery.error) {
        throw new Error(managerQuery.error.message);
      }

      const managerRow = (managerQuery.data ?? null) as ManagerProfileRow | null;
      const isCurrentSuperAdmin = Boolean(access.userId && managerId === access.userId);
      if (!managerRow?.id || (managerRow.role !== "admin" && !isCurrentSuperAdmin)) {
        return NextResponse.json(
          { error: "Solo puedes asignar usuarios con rol gestor (o a ti como superadmin)." },
          { status: 400 },
        );
      }
    }

    const updateQuery = await client
      .from("portfolios")
      .update({ manager_id: managerId })
      .eq("id", portfolioId)
      .select("id, manager_id")
      .maybeSingle();

    if (updateQuery.error) {
      throw new Error(updateQuery.error.message);
    }

    const persistedQuery = await client
      .from("portfolios")
      .select("id, manager_id")
      .eq("id", portfolioId)
      .maybeSingle();

    if (persistedQuery.error) {
      throw new Error(persistedQuery.error.message);
    }

    const persisted = (persistedQuery.data ?? null) as { id: string | null; manager_id: string | null } | null;
    if (!persisted?.id) {
      return NextResponse.json({ error: "No se encontró el portfolio." }, { status: 404 });
    }

    const persistedManagerId = persisted.manager_id ?? null;
    if (persistedManagerId !== managerId) {
      throw new Error("La asignación no se pudo confirmar en base de datos. Inténtalo de nuevo.");
    }

    await recordAdminAudit({
      actorId: access.userId,
      action: managerId ? "assign_portfolio_manager" : "unassign_portfolio_manager",
      targetTable: "portfolios",
      targetId: portfolioId,
      beforeData: { managerId: currentPortfolio.manager_id ?? null, ownerRole },
      afterData: { managerId: persistedManagerId, ownerRole },
    });

    return NextResponse.json({
      ok: true,
      row: {
        id: persisted.id,
        managerId: persistedManagerId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado asignando gestor.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
