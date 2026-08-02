import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { TopNav } from "@/components/shell/TopNav";
import { PageShell } from "@/components/shell/PageShell";
import { UsersDirectory, type AdminUserSummary } from "@/components/admin/UsersDirectory";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { getDashboardData } from "@/lib/dashboard/get-dashboard-data";
import { ensureOwnedPortfoliosForProfiles } from "@/lib/portfolios/ensure-owned-portfolios";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";

type AdminUserRow = {
  id: string | null;
  email: string | null;
  full_name: string | null;
  role: "autonomo" | "admin" | "cliente" | null;
  created_at: string | null;
};

type PortfolioWithOwnerRow = {
  id: string | null;
  name: string | null;
  manager_id: string | null;
  owner_id: string | null;
  owner:
    | { full_name: string | null; email: string | null; role: "autonomo" | "admin" | "cliente" | null }
    | Array<{ full_name: string | null; email: string | null; role: "autonomo" | "admin" | "cliente" | null }>
    | null;
  manager:
    | { full_name: string | null; email: string | null }
    | Array<{ full_name: string | null; email: string | null }>
    | null;
};

type PortfolioMetrics = {
  pnlUsd: number;
  pnlPercent: number;
  totalValueUsd: number;
  totalDepositedUsd: number;
};

function readOwnerData(
  owner: PortfolioWithOwnerRow["owner"],
): { fullName: string; email: string; role: "autonomo" | "admin" | "cliente" | null } {
  const ownerObj = Array.isArray(owner) ? owner[0] ?? null : owner;
  return {
    fullName: ownerObj?.full_name ?? "",
    email: ownerObj?.email ?? "",
    role: ownerObj?.role ?? null,
  };
}

function readManagerData(
  manager: PortfolioWithOwnerRow["manager"],
): { fullName: string; email: string } {
  const managerObj = Array.isArray(manager) ? manager[0] ?? null : manager;
  return {
    fullName: managerObj?.full_name ?? "",
    email: managerObj?.email ?? "",
  };
}

export default async function AdminPage() {
  noStore();

  const access = await getViewerAccess();
  if (!access.isAuthenticated) {
    redirect("/login");
  }
  if (!access.canManageRoles) {
    redirect("/");
  }

  const client = getSupabaseServiceClient() ?? getSupabaseServerClient();

  const profilesQuery = await client
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .order("created_at", { ascending: false });

  if (profilesQuery.error) {
    throw new Error(`Error consultando usuarios: ${profilesQuery.error.message}`);
  }

  const profileRows = (profilesQuery.data ?? []) as AdminUserRow[];
  try {
    await ensureOwnedPortfoliosForProfiles(client, profileRows);
  } catch (provisionError) {
    console.error("No se pudo completar el backfill de portfolios en admin", provisionError);
  }

  const portfoliosQuery = await client
    .from("portfolios")
    .select("id, name, manager_id, owner_id, owner:profiles!owner_id(full_name, email, role), manager:profiles!manager_id(full_name, email)")
    .order("created_at", { ascending: false });

  if (portfoliosQuery.error) {
    throw new Error(`Error consultando portfolios gestionados: ${portfoliosQuery.error.message}`);
  }

  const sourcePortfolios = (portfoliosQuery.data ?? []) as PortfolioWithOwnerRow[];

  const managedByManagerId = sourcePortfolios.reduce(
    (acc, row) => {
      const managerId = row.manager_id ?? "";
      if (!managerId) return acc;
      const ownerData = readOwnerData(row.owner);
      if (!acc[managerId]) acc[managerId] = [];
      acc[managerId].push({
        id: row.id ?? "",
        name: row.name ?? "Portfolio sin nombre",
        ownerId: row.owner_id ?? "",
        ownerName: ownerData.fullName,
        ownerEmail: ownerData.email,
      });
      return acc;
    },
    {} as Record<
      string,
      Array<{ id: string; name: string; ownerId: string; ownerName: string; ownerEmail: string }>
    >,
  );

  const userRows = profileRows.map((row) => ({
    id: row.id ?? "",
    email: row.email ?? "",
    fullName: row.full_name ?? "",
    role: (row.role ?? "autonomo") as "autonomo" | "admin" | "cliente",
    createdAt: row.created_at ?? null,
    managedPortfolioCount: (managedByManagerId[row.id ?? ""] ?? []).length,
    managedPortfolios: managedByManagerId[row.id ?? ""] ?? [],
  }));

  const rawPortfolioRows = sourcePortfolios.map((row) => {
    const ownerData = readOwnerData(row.owner);
    const managerData = readManagerData(row.manager);
    return {
      id: row.id ?? "",
      name: row.name ?? "Portfolio sin nombre",
      ownerId: row.owner_id ?? "",
      ownerName: ownerData.fullName,
      ownerEmail: ownerData.email,
      ownerRole: ownerData.role,
      managerId: row.manager_id ?? null,
      managerName: managerData.fullName,
      managerEmail: managerData.email,
    };
  });

  const portfolioMetricsEntries = await Promise.all(
    rawPortfolioRows
      .filter((row) => row.id.length > 0)
      .map(async (row) => {
        try {
          const dashboard = await getDashboardData({ targetPortfolioId: row.id });
          return [
            row.id,
            {
              pnlUsd: dashboard.summary.pnlUsd,
              pnlPercent: dashboard.summary.pnlPercent,
              totalValueUsd: dashboard.summary.totalValueUsd,
              totalDepositedUsd: dashboard.summary.totalDepositedUsd,
            } satisfies PortfolioMetrics,
          ] as const;
        } catch {
          return [
            row.id,
            {
              pnlUsd: 0,
              pnlPercent: 0,
              totalValueUsd: 0,
              totalDepositedUsd: 0,
            } satisfies PortfolioMetrics,
          ] as const;
        }
      }),
  );

  const metricsByPortfolioId = new Map<string, PortfolioMetrics>(portfolioMetricsEntries);

  const portfolioRows = rawPortfolioRows.map((row) => {
    const metrics = metricsByPortfolioId.get(row.id) ?? {
      pnlUsd: 0,
      pnlPercent: 0,
      totalValueUsd: 0,
      totalDepositedUsd: 0,
    };
    return {
      ...row,
      pnlUsd: metrics.pnlUsd,
      pnlPercent: metrics.pnlPercent,
      totalValueUsd: metrics.totalValueUsd,
      totalDepositedUsd: metrics.totalDepositedUsd,
    };
  });

  // El listado pasa al diseño nuevo. El cambio de rol YA NO se hace desde la
  // fila —un desplegable ahí cambia permisos con un clic accidental— sino desde
  // la ficha del usuario, que es donde se puede leer lo que se está tocando.
  const directoryUsers: AdminUserSummary[] = userRows.map((u) => ({
    id: u.id,
    name: u.fullName || u.email,
    email: u.email,
    role: u.role,
    // A un gestor le cuentan las carteras que gestiona; a los demás, las suyas.
    portfolioCount:
      u.role === "admin"
        ? u.managedPortfolioCount
        : portfolioRows.filter((p) => p.ownerId === u.id).length,
    createdAt: u.createdAt,
  }));

  return (
    <div className="pcx-screen" style={{ minHeight: "100vh" }}>
      <TopNav section="Administración" />
      <PageShell>
        <UsersDirectory
          users={directoryUsers}
          userHrefPattern="/admin/users/:id/edit"
          createUserHref="/admin/create-user"
        />
      </PageShell>
    </div>
  );
}
