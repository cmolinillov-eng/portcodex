import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { ACCESS_TOKEN_COOKIE_NAME, PROFILE_ID_COOKIE_NAME } from "@/lib/auth/session";

export type ViewerRole = "autonomo" | "admin" | "cliente";

export type ViewerAccess = {
  isAuthenticated: boolean;
  userId: string | null;       // auth user id (auth.users.id)
  profileId: string | null;    // selected profile id (profiles.id)
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
  id: string | null;
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

type SessionCookies = {
  accessToken: string | null;
  profileId: string | null;
};

async function readSessionCookies(): Promise<SessionCookies> {
  const cookieStore = await cookies();
  const accessToken = sanitizeText(cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value);
  const profileId = sanitizeText(cookieStore.get(PROFILE_ID_COOKIE_NAME)?.value);
  return {
    accessToken: accessToken || null,
    profileId: profileId || null,
  };
}

async function getCurrentViewer(): Promise<CurrentViewer> {
  const authClient = getAuthClient();

  const sessionCookies = await readSessionCookies();
  if (sessionCookies.accessToken) {
    const fromCookie = await authClient.auth.getUser(sessionCookies.accessToken);
    if (!fromCookie.error && fromCookie.data.user?.id) {
      return {
        userId: fromCookie.data.user.id,
        email: sanitizeText(fromCookie.data.user.email ?? "").toLowerCase() || null,
      };
    }
  }

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

/**
 * Devuelve el perfil activo para el auth user.
 * Si hay varios perfiles (multi-rol), usa el profile_id de la cookie.
 * Si no hay cookie o el profile_id no pertenece al auth user, usa el primero por orden de creación.
 */
async function getViewerProfile(
  client: SupabaseClient,
  userId: string | null,
  selectedProfileId: string | null,
): Promise<ProfileRow | null> {
  if (!userId) return null;

  // Buscar todos los perfiles de este auth user
  const profileQuery = await client
    .from("profiles")
    .select("id, role, email")
    .eq("auth_user_id", userId)
    .order("created_at", { ascending: true });

  if (profileQuery.error) {
    // Fallback: intentar por id = userId (datos legacy sin auth_user_id migrado aún)
    const legacyQuery = await client
      .from("profiles")
      .select("id, role, email")
      .eq("id", userId)
      .maybeSingle();
    if (legacyQuery.error) return null;
    return (legacyQuery.data ?? null) as ProfileRow | null;
  }

  const profiles = (profileQuery.data ?? []) as ProfileRow[];
  if (profiles.length === 0) return null;

  // Si hay un profile_id en cookie y pertenece a este auth user → usarlo
  if (selectedProfileId) {
    const match = profiles.find((p) => p.id === selectedProfileId);
    if (match) return match;
  }

  // Por defecto: primer perfil (orden de creación)
  return profiles[0] ?? null;
}

async function getAllowedPortfolioIds(
  client: SupabaseClient,
  profileId: string | null,
  role: ViewerRole,
  isSuperAdmin: boolean,
): Promise<string[]> {
  if (!profileId) return [];

  if (isSuperAdmin) {
    const allPortfolios = await client.from("portfolios").select("id");
    if (allPortfolios.error) return [];
    return ((allPortfolios.data ?? []) as PortfolioRow[])
      .map((row) => sanitizeText(row.id))
      .filter((id) => id.length > 0);
  }

  if (role === "admin") {
    const [owned, managed] = await Promise.all([
      client.from("portfolios").select("id").eq("owner_id", profileId),
      client.from("portfolios").select("id").eq("manager_id", profileId),
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
  const own = await client.from("portfolios").select("id").eq("owner_id", profileId);
  if (own.error) return [];
  return ((own.data ?? []) as PortfolioRow[])
    .map((row) => sanitizeText(row.id))
    .filter((id) => id.length > 0);
}

export async function getViewerAccess(): Promise<ViewerAccess> {
  const client = getReadClient();
  const viewer = await getCurrentViewer();
  const userId = viewer.userId;
  const isAuthenticated = Boolean(userId);

  const sessionCookies = await readSessionCookies();
  const profile = await getViewerProfile(client, userId, sessionCookies.profileId);
  const profileId = sanitizeText(profile?.id ?? "").length > 0 ? sanitizeText(profile?.id ?? "") : null;

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
  const allowedPortfolioIds = await getAllowedPortfolioIds(client, profileId, role, isSuperAdmin);

  const canRead = isAuthenticated && (isSuperAdmin || allowedPortfolioIds.length > 0);
  const canOperate = isAuthenticated && (isSuperAdmin || role !== "cliente");

  return {
    isAuthenticated,
    userId,
    profileId,
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
  if (!access.isAuthenticated) {
    return { ok: false, error: "Debes iniciar sesión.", status: 401 };
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
