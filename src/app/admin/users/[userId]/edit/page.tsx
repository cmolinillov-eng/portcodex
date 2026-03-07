import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { AdminUserEditForm } from "@/components/admin/admin-user-edit-form";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ userId: string }>;
};

type ProfileRow = {
  id: string | null;
  full_name: string | null;
  email: string | null;
  role: "autonomo" | "admin" | "cliente" | null;
  created_at: string | null;
};

type PortfolioRow = {
  id: string | null;
  name: string | null;
  owner_id: string | null;
  manager_id: string | null;
  created_at: string | null;
  owner:
    | { full_name: string | null; email: string | null; role: "autonomo" | "admin" | "cliente" | null }
    | Array<{ full_name: string | null; email: string | null; role: "autonomo" | "admin" | "cliente" | null }>
    | null;
  manager:
    | { full_name: string | null; email: string | null }
    | Array<{ full_name: string | null; email: string | null }>
    | null;
};

function readOwner(profile: PortfolioRow["owner"]) {
  return Array.isArray(profile) ? profile[0] ?? null : profile;
}

function readManager(profile: PortfolioRow["manager"]) {
  return Array.isArray(profile) ? profile[0] ?? null : profile;
}

function label(fullName: string | null, email: string | null): string {
  const byName = (fullName ?? "").trim();
  if (byName) return byName;
  const byEmail = (email ?? "").trim();
  if (byEmail) return byEmail;
  return "Sin nombre";
}

export default async function AdminUserEditPage({ params }: PageProps) {
  noStore();

  const access = await getViewerAccess();
  if (!access.isAuthenticated) {
    redirect("/login");
  }
  if (!access.canManageRoles) {
    redirect("/");
  }

  const { userId } = await params;
  const targetUserId = (userId ?? "").trim();
  if (!targetUserId) {
    redirect("/admin");
  }

  const client = getSupabaseServiceClient() ?? getSupabaseServerClient();
  const [profileQuery, portfoliosQuery, managersQuery, currentAdminProfileQuery] = await Promise.all([
    client
      .from("profiles")
      .select("id, full_name, email, role, created_at")
      .eq("id", targetUserId)
      .maybeSingle(),
    client
      .from("portfolios")
      .select("id, name, owner_id, manager_id, created_at, owner:profiles!owner_id(full_name, email, role), manager:profiles!manager_id(full_name, email)")
      .order("created_at", { ascending: false }),
    client
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("role", "admin")
      .order("created_at", { ascending: false }),
    access.userId
      ? client.from("profiles").select("id, full_name, email, role").eq("id", access.userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (profileQuery.error) {
    throw new Error(`Error consultando usuario: ${profileQuery.error.message}`);
  }
  if (portfoliosQuery.error) {
    throw new Error(`Error consultando portfolios: ${portfoliosQuery.error.message}`);
  }
  if (managersQuery.error) {
    throw new Error(`Error consultando gestores: ${managersQuery.error.message}`);
  }
  if (currentAdminProfileQuery.error) {
    throw new Error(`Error consultando perfil administrador: ${currentAdminProfileQuery.error.message}`);
  }

  const profile = (profileQuery.data ?? null) as ProfileRow | null;
  if (!profile?.id) {
    redirect("/admin");
  }

  const allPortfolios = (portfoliosQuery.data ?? []) as PortfolioRow[];

  const ownedPortfolios = allPortfolios
    .filter((portfolio) => (portfolio.owner_id ?? "").trim() === targetUserId)
    .map((portfolio) => {
      const manager = readManager(portfolio.manager);
      return {
        id: (portfolio.id ?? "").trim(),
        name: (portfolio.name ?? "").trim() || "Portfolio sin nombre",
        managerId: (portfolio.manager_id ?? "").trim() || null,
        managerLabel: label(manager?.full_name ?? null, manager?.email ?? null),
      };
    })
    .filter((portfolio) => portfolio.id.length > 0);

  const managedClientPortfolios = allPortfolios
    .filter((portfolio) => {
      const owner = readOwner(portfolio.owner);
      return (portfolio.manager_id ?? "").trim() === targetUserId && owner?.role === "cliente";
    })
    .map((portfolio) => {
      const owner = readOwner(portfolio.owner);
      return {
        id: (portfolio.id ?? "").trim(),
        name: (portfolio.name ?? "").trim() || "Portfolio sin nombre",
        ownerId: (portfolio.owner_id ?? "").trim(),
        ownerLabel: label(owner?.full_name ?? null, owner?.email ?? null),
        managerId: (portfolio.manager_id ?? "").trim() || null,
      };
    })
    .filter((portfolio) => portfolio.id.length > 0);

  const clientPortfolioPool = allPortfolios
    .filter((portfolio) => {
      const owner = readOwner(portfolio.owner);
      return owner?.role === "cliente";
    })
    .map((portfolio) => {
      const owner = readOwner(portfolio.owner);
      return {
        id: (portfolio.id ?? "").trim(),
        name: (portfolio.name ?? "").trim() || "Portfolio sin nombre",
        ownerId: (portfolio.owner_id ?? "").trim(),
        ownerLabel: label(owner?.full_name ?? null, owner?.email ?? null),
        managerId: (portfolio.manager_id ?? "").trim() || null,
      };
    })
    .filter((portfolio) => portfolio.id.length > 0);

  const managerOptions = ((managersQuery.data ?? []) as ProfileRow[])
    .map((manager) => ({
      id: (manager.id ?? "").trim(),
      label: label(manager.full_name, manager.email),
    }))
    .filter((manager) => manager.id.length > 0);

  const currentAdminProfile = (currentAdminProfileQuery.data ?? null) as ProfileRow | null;
  const currentAdminId = (access.userId ?? "").trim();
  if (currentAdminId && !managerOptions.some((manager) => manager.id === currentAdminId) && currentAdminProfile?.id) {
    managerOptions.unshift({
      id: currentAdminId,
      label: `${label(currentAdminProfile.full_name, currentAdminProfile.email)} (Yo)`,
    });
  }

  return (
    <AdminUserEditForm
      user={{
        id: targetUserId,
        fullName: (profile.full_name ?? "").trim(),
        email: (profile.email ?? "").trim(),
        role: (profile.role ?? "autonomo") as "autonomo" | "admin" | "cliente",
        createdAt: profile.created_at ?? null,
      }}
      managerOptions={managerOptions}
      ownedPortfolios={ownedPortfolios}
      managedClientPortfolios={managedClientPortfolios}
      clientPortfolioPool={clientPortfolioPool}
    />
  );
}
