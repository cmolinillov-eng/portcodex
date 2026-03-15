import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { getDashboardData } from "@/lib/dashboard/get-dashboard-data";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ portfolioId?: string }>;
};

type ProfileRow = {
  email: string | null;
  full_name: string | null;
  role: "autonomo" | "admin" | "cliente" | null;
};

type PortfolioRow = {
  id: string | null;
  name: string | null;
  owner_id: string | null;
  manager_id: string | null;
};

export default async function AdminUserPortfolioPage({ params, searchParams }: PageProps) {
  noStore();

  const access = await getViewerAccess();
  if (!access.isAuthenticated) {
    redirect("/login");
  }
  if (!access.canManageRoles) {
    redirect("/");
  }

  const { userId } = await params;
  const { portfolioId: portfolioIdQuery } = await searchParams;

  const client = getSupabaseServiceClient() ?? getSupabaseServerClient();
  const profileQuery = await client
    .from("profiles")
    .select("email, full_name, role")
    .eq("id", userId)
    .maybeSingle();

  const profile = (profileQuery.data ?? null) as ProfileRow | null;
  const displayName = profile?.full_name?.trim() || profile?.email?.trim() || userId;
  const targetRole = profile?.role ?? "autonomo";

  const [ownedQuery, managedQuery] = await Promise.all([
    client.from("portfolios").select("id, name, owner_id, manager_id").eq("owner_id", userId),
    targetRole === "admin"
      ? client.from("portfolios").select("id, name, owner_id, manager_id").eq("manager_id", userId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (ownedQuery.error) {
    throw new Error(`Error consultando portfolios del usuario: ${ownedQuery.error.message}`);
  }
  if (managedQuery.error) {
    throw new Error(`Error consultando portfolios gestionados: ${managedQuery.error.message}`);
  }

  const portfolioMap = new Map<string, PortfolioRow>();
  for (const row of (ownedQuery.data ?? []) as PortfolioRow[]) {
    if (row.id) portfolioMap.set(row.id, row);
  }
  for (const row of (managedQuery.data ?? []) as PortfolioRow[]) {
    if (row.id) portfolioMap.set(row.id, row);
  }
  const targetPortfolios = Array.from(portfolioMap.values());

  const requestedPortfolioId = (portfolioIdQuery ?? "").trim();
  const selectedPortfolioId =
    requestedPortfolioId && portfolioMap.has(requestedPortfolioId)
      ? requestedPortfolioId
      : (targetPortfolios[0]?.id ?? "");

  const data = await getDashboardData({
    targetUserId: userId,
    targetPortfolioId: selectedPortfolioId || undefined,
  });
  const selectedPortfolio = targetPortfolios.find((row) => row.id === selectedPortfolioId) ?? null;

  return (
    <>
      <div className="fixed top-3 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-[rgba(160,210,255,0.45)] bg-[rgba(2,6,17,0.88)] px-4 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3 text-xs md:text-sm">
          <Link href="/admin" className="btn-secondary btn-secondary-compact">
            Volver a Admin
          </Link>
          <span className="text-[var(--muted)]">Viendo portfolio de:</span>
          <span className="font-medium text-foreground">{displayName}</span>
          {selectedPortfolio ? (
            <span className="text-[var(--muted)]">
              · {selectedPortfolio.name ?? "Portfolio sin nombre"}
            </span>
          ) : null}
          {targetPortfolios.length > 1 ? (
            <div className="flex flex-wrap gap-1">
              {targetPortfolios.map((portfolio) => (
                <Link
                  key={portfolio.id}
                  href={`/admin/users/${userId}?portfolioId=${portfolio.id ?? ""}`}
                  className={`inline-flex rounded-md border px-2 py-1 ${
                    portfolio.id === selectedPortfolioId
                      ? "border-[rgba(160,210,255,0.45)] bg-[rgba(160,210,255,0.14)] text-[#A0D2FF]"
                      : "border-[var(--line)] bg-black/20 text-[var(--muted)] hover:text-foreground"
                  }`}
                >
                  {portfolio.name ?? "Portfolio"}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <DashboardClient data={data} />
    </>
  );
}
