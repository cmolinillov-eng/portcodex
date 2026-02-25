import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { getDashboardData } from "@/lib/dashboard/get-dashboard-data";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ portfolioId: string }>;
};

type PortfolioRow = {
  id: string | null;
  name: string | null;
  owner_id: string | null;
};

export default async function ManagerPortfolioPage({ params }: PageProps) {
  noStore();

  const access = await getViewerAccess();
  if (access.canManageRoles) {
    redirect("/admin");
  }
  if (access.role !== "admin" || !access.userId) {
    redirect("/");
  }

  const { portfolioId } = await params;
  const selectedPortfolioId = (portfolioId ?? "").trim();
  if (!selectedPortfolioId) {
    redirect("/manager");
  }

  const client = getSupabaseServiceClient() ?? getSupabaseServerClient();
  const managedQuery = await client
    .from("portfolios")
    .select("id, name, owner_id")
    .eq("manager_id", access.userId)
    .order("created_at", { ascending: false });

  if (managedQuery.error) {
    throw new Error(`Error consultando portfolios del gestor: ${managedQuery.error.message}`);
  }

  const managedPortfolios = (managedQuery.data ?? []) as PortfolioRow[];
  const canAccessPortfolio = managedPortfolios.some((row) => (row.id ?? "").trim() === selectedPortfolioId);
  if (!canAccessPortfolio) {
    redirect("/manager");
  }

  const selectedPortfolio =
    managedPortfolios.find((row) => (row.id ?? "").trim() === selectedPortfolioId) ?? null;

  const data = await getDashboardData({ targetPortfolioId: selectedPortfolioId });

  return (
    <>
      <div className="fixed top-3 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-[rgba(56,189,248,0.55)] bg-[rgba(2,6,17,0.88)] px-4 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3 text-xs md:text-sm">
          <Link
            href="/manager"
            className="inline-flex rounded-lg border border-[rgba(34,211,238,0.45)] bg-[rgba(34,211,238,0.14)] px-2.5 py-1 transition hover:bg-[rgba(34,211,238,0.26)]"
          >
            Volver a Gestor
          </Link>
          <span className="text-[var(--muted)]">Portfolio:</span>
          <span className="font-medium text-foreground">{selectedPortfolio?.name ?? "Portfolio"}</span>
          {managedPortfolios.length > 1 ? (
            <div className="flex flex-wrap gap-1">
              {managedPortfolios.map((portfolio) => {
                const id = (portfolio.id ?? "").trim();
                if (!id) return null;
                const isActive = id === selectedPortfolioId;
                return (
                  <Link
                    key={id}
                    href={`/manager/portfolios/${id}`}
                    className={`inline-flex rounded-md border px-2 py-1 ${
                      isActive
                        ? "border-[rgba(56,189,248,0.55)] bg-[rgba(56,189,248,0.16)] text-sky-300"
                        : "border-[var(--line)] bg-black/20 text-[var(--muted)] hover:text-foreground"
                    }`}
                  >
                    {portfolio.name ?? "Portfolio"}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      <DashboardClient data={data} />
    </>
  );
}
