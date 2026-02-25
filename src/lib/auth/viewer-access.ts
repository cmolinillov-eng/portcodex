import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";

export type ViewerRole = "autonomo" | "admin" | "cliente";

export type ViewerAccess = {
  userId: string | null;
  role: ViewerRole;
  isSuperAdmin: boolean;
  allowedPortfolioIds: string[];
  canRead: boolean;
  canOperate: boolean;
  canDeletePosition: boolean;
  canRefreshPrices: boolean;
  canManageRoles: boolean;
};

type ProfileRow = {
  role: ViewerRole | null;
  email?: string | null;
};

type PortfolioRow = {
  id: string | null;
};

function sanitizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizeRole(value: string | null | undefined): ViewerRole {
  if (value === "admin" || value === "cliente" || value === "autonomo") return value;
  return "autonomo";
}

function getAuthClient(): SupabaseClient {
  return getSupabaseServerClient();
}

function getReadClient(): SupabaseClient {
  const service = getSupabaseServiceClient();
  if (service) return service;
  return getSupabaseServerClient();
}

type CurrentViewer = {
  userId: string | null;
  email: string | null;
};

async function getCurrentViewer(): Promise<CurrentViewer> {
  const authClient = getAuthClient();
  const { data, error } = await authClient.auth.getUser();
  if (!error && data.user?.id) {
    return {
      userId: data.user.id,
      email: sanitizeText(data.user.email ?? "").toLowerCase() || null,
    };
  }

  // Fallback solo para desarrollo local, nunca para producción.
  const allowDevFallback =
    process.env.NODE_ENV !== "production" &&
    sanitizeText(process.env.ENABLE_DEV_AUTH_FALLBACK).toLowerCase() === "true";
  const fallback = allowDevFallback ? sanitizeText(process.env.DEV_VIEWER_USER_ID) : "";
  return {
    userId: fallback || null,
    email: null,
  };
}

async function getViewerProfile(client: SupabaseClient, userId: string | null): Promise<ProfileRow | null> {
  if (!userId) return null;

  const profileQuery = await client
    .from("profiles")
    .select("role, email")
    .eq("id", userId)
    .maybeSingle();

  if (profileQuery.error) return null;
  return (profileQuery.data ?? null) as ProfileRow | null;
}

async function getAllowedPortfolioIds(
  client: SupabaseClient,
  userId: string | null,
  role: ViewerRole,
  isSuperAdmin: boolean,
): Promise<string[]> {
  if (!userId) return [];

  if (isSuperAdmin) {
    const allPortfolios = await client.from("portfolios").select("id");
    if (allPortfolios.error) return [];
    return ((allPortfolios.data ?? []) as PortfolioRow[])
      .map((row) => sanitizeText(row.id))
      .filter((id) => id.length > 0);
  }

  if (role === "admin") {
    const [owned, managed] = await Promise.all([
      client.from("portfolios").select("id").eq("owner_id", userId),
      client.from("portfolios").select("id").eq("manager_id", userId),
    ]);

    const ids = new Set<string>();
    for (const row of (owned.data ?? []) as PortfolioRow[]) {
      const id = sanitizeText(row.id);
      if (id) ids.add(id);
    }
    for (const row of (managed.data ?? []) as PortfolioRow[]) {
      const id = sanitizeText(row.id);
      if (id) ids.add(id);
    }
    return Array.from(ids);
  }

  // cliente y autonomo: solo portfolios propios.
  const own = await client.from("portfolios").select("id").eq("owner_id", userId);
  if (own.error) return [];
  return ((own.data ?? []) as PortfolioRow[])
    .map((row) => sanitizeText(row.id))
    .filter((id) => id.length > 0);
}

export async function getViewerAccess(): Promise<ViewerAccess> {
  const client = getReadClient();
  const viewer = await getCurrentViewer();
  const userId = viewer.userId;
  const profile = await getViewerProfile(client, userId);
  const role = normalizeRole(profile?.role ?? "autonomo");
  const superAdminUserId = sanitizeText(process.env.SUPERADMIN_USER_ID);
  const superAdminEmail = sanitizeText(process.env.SUPERADMIN_EMAIL).toLowerCase();
  const profileEmail = sanitizeText(profile?.email ?? "").toLowerCase();
  const authEmail = sanitizeText(viewer.email ?? "").toLowerCase();
  const isSuperAdminById = Boolean(userId && superAdminUserId && userId === superAdminUserId);
  const isSuperAdminByEmail = Boolean(
    superAdminEmail &&
      (profileEmail === superAdminEmail || authEmail === superAdminEmail),
  );
  const isSuperAdmin = isSuperAdminById || isSuperAdminByEmail;
  const allowedPortfolioIds = await getAllowedPortfolioIds(client, userId, role, isSuperAdmin);

  const canRead = isSuperAdmin || allowedPortfolioIds.length > 0;
  const canOperate = isSuperAdmin || role !== "cliente";

  return {
    userId,
    role,
    isSuperAdmin,
    allowedPortfolioIds,
    canRead,
    canOperate,
    canDeletePosition: canOperate,
    canRefreshPrices: canOperate,
    canManageRoles: isSuperAdmin,
  };
}

export function ensurePortfolioAccess(
  access: ViewerAccess,
  portfolioId: string,
  requireOperate = false,
): { ok: true } | { ok: false; error: string; status: number } {
  const cleanPortfolioId = sanitizeText(portfolioId);
  if (!cleanPortfolioId) {
    return { ok: false, error: "portfolioId es obligatorio.", status: 400 };
  }
  if (!access.canRead) {
    return { ok: false, error: "No autorizado para consultar portfolios.", status: 403 };
  }
  if (!access.isSuperAdmin && !access.allowedPortfolioIds.includes(cleanPortfolioId)) {
    return { ok: false, error: "No tienes acceso a este portfolio.", status: 403 };
  }
  if (requireOperate && !access.canOperate) {
    return { ok: false, error: "Este perfil es de solo lectura.", status: 403 };
  }
  return { ok: true };
}
