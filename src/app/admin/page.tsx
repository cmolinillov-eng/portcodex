import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { AdminUsersPanel } from "@/components/admin/admin-users-panel";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { getDashboardData } from "@/lib/dashboard/get-dashboard-data";
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
  owner: { full_name: string | null; email: string | null } | Array<{ full_name: string | null; email: string | null }> | null;
  manager: { full_name: string | null; email: string | null } | Array<{ full_name: string | null; email: string | null }> | null;
};

type PortfolioMetrics = {
  pnlUsd: number;
  pnlPercent: number;
  totalValueUsd: number;
  totalDepositedUsd: number;
};

function readOwnerData(
  owner: PortfolioWithOwnerRow["owner"],
): { fullName: string; email: string } {
  const ownerObj = Array.isArray(owner) ? owner[0] ?? null : owner;
  return {
    fullName: ownerObj?.full_name ?? "",
    email: ownerObj?.email ?? "",
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
  if (!access.canManageRoles) {
    redirect("/");
  }

  const client = getSupabaseServiceClient() ?? getSupabaseServerClient();
  const [profilesQuery, portfoliosQuery] = await Promise.all([
    client
      .from("profiles")
      .select("id, email, full_name, role, created_at")
      .order("created_at", { ascending: false }),
    client
      .from("portfolios")
      .select("id, name, manager_id, owner_id, owner:profiles!owner_id(full_name, email), manager:profiles!manager_id(full_name, email)")
      .order("created_at", { ascending: false }),
  ]);

  if (profilesQuery.error) {
    throw new Error(`Error consultando usuarios: ${profilesQuery.error.message}`);
  }
  if (portfoliosQuery.error) {
    throw new Error(`Error consultando portfolios gestionados: ${portfoliosQuery.error.message}`);
  }

  const managedByManagerId = ((portfoliosQuery.data ?? []) as PortfolioWithOwnerRow[]).reduce(
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

  const userRows = ((profilesQuery.data ?? []) as AdminUserRow[]).map((row) => ({
    id: row.id ?? "",
    email: row.email ?? "",
    fullName: row.full_name ?? "",
    role: (row.role ?? "autonomo") as "autonomo" | "admin" | "cliente",
    createdAt: row.created_at ?? null,
    managedPortfolioCount: (managedByManagerId[row.id ?? ""] ?? []).length,
    managedPortfolios: managedByManagerId[row.id ?? ""] ?? [],
  }));

  const rawPortfolioRows = ((portfoliosQuery.data ?? []) as PortfolioWithOwnerRow[]).map((row) => {
    const ownerData = readOwnerData(row.owner);
    const managerData = readManagerData(row.manager);
    return {
      id: row.id ?? "",
      name: row.name ?? "Portfolio sin nombre",
      ownerId: row.owner_id ?? "",
      ownerName: ownerData.fullName,
      ownerEmail: ownerData.email,
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

  return <AdminUsersPanel rows={userRows} portfolios={portfolioRows} />;
}
