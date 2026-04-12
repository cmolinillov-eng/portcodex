import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { getDashboardData } from "@/lib/dashboard/get-dashboard-data";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ managerId: string }>;
};

type ProfileRow = {
  full_name: string | null;
  email: string | null;
  role: "autonomo" | "admin" | "cliente" | null;
};

type ProfileReference = {
  full_name: string | null;
  email: string | null;
  created_at: string | null;
  role: "autonomo" | "admin" | "cliente" | null;
};

type ManagedPortfolioRow = {
  id: string | null;
  name: string | null;
  owner_id: string | null;
  owner: ProfileReference | ProfileReference[] | null;
};

type PortfolioMetrics = {
  pnlUsd: number;
  pnlPercent: number;
  totalValueUsd: number;
  totalDepositedUsd: number;
};

function readProfile(value: ProfileReference | ProfileReference[] | null): ProfileReference | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function displayName(fullName: string | null, email: string | null): string {
  const cleanName = (fullName ?? "").trim();
  if (cleanName.length > 0) return cleanName;
  const cleanEmail = (email ?? "").trim();
  if (cleanEmail.length > 0) return cleanEmail;
  return "Sin nombre";
}

function currency(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function signedCurrency(value: number): string {
  const abs = currency(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return abs;
}

function percent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function pnlTone(value: number): string {
  if (value > 0) return "text-emerald-300";
  if (value < 0) return "text-rose-300";
  return "text-[var(--muted)]";
}

export default async function AdminManagerPanelPage({ params }: PageProps) {
  noStore();

  const access = await getViewerAccess();
  if (!access.isAuthenticated) {
    redirect("/login");
  }
  if (!access.canManageRoles) {
    redirect("/");
  }

  const { managerId } = await params;
  const selectedManagerId = (managerId ?? "").trim();
  if (!selectedManagerId) {
    redirect("/admin");
  }

  const client = getSupabaseServiceClient() ?? getSupabaseServerClient();
  const managerQuery = await client
    .from("profiles")
    .select("full_name, email, role")
    .eq("id", selectedManagerId)
    .maybeSingle();

  if (managerQuery.error) {
    throw new Error(`Error consultando gestor: ${managerQuery.error.message}`);
  }

  const manager = (managerQuery.data ?? null) as ProfileRow | null;
  if (!manager || manager.role !== "admin") {
    redirect("/admin");
  }

  const managedQuery = await client
    .from("portfolios")
    .select("id, name, owner_id, owner:profiles!owner_id(full_name, email, created_at, role)")
    .eq("manager_id", selectedManagerId)
    .order("created_at", { ascending: false });

  if (managedQuery.error) {
    throw new Error(`Error consultando portfolios gestionados: ${managedQuery.error.message}`);
  }

  const rawRows = (managedQuery.data ?? []) as ManagedPortfolioRow[];
  const metricsEntries = await Promise.all(
    rawRows
      .filter((row) => (row.id ?? "").trim().length > 0)
      .map(async (row) => {
        const portfolioId = (row.id ?? "").trim();
        try {
          const dashboard = await getDashboardData({ targetPortfolioId: portfolioId });
          return [
            portfolioId,
            {
              pnlUsd: dashboard.summary.pnlUsd,
              pnlPercent: dashboard.summary.pnlPercent,
              totalValueUsd: dashboard.summary.totalValueUsd,
              totalDepositedUsd: dashboard.summary.totalDepositedUsd,
            } satisfies PortfolioMetrics,
          ] as const;
        } catch {
          return [
            portfolioId,
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

  const metricsByPortfolioId = new Map<string, PortfolioMetrics>(metricsEntries);
  const rows = rawRows
    .map((row) => {
    const owner = readProfile(row.owner);
    const id = (row.id ?? "").trim();
    const metrics = metricsByPortfolioId.get(id) ?? {
      pnlUsd: 0,
      pnlPercent: 0,
      totalValueUsd: 0,
      totalDepositedUsd: 0,
    };
    return {
      id,
      name: (row.name ?? "").trim() || "Portfolio sin nombre",
      ownerName: displayName(owner?.full_name ?? null, owner?.email ?? null),
      ownerEmail: (owner?.email ?? "").trim() || "-",
      ownerCreatedAt: owner?.created_at ?? null,
      ownerRole: owner?.role ?? null,
      ...metrics,
    };
  })
    .filter((row) => row.ownerRole === "cliente");

  const managerLabel = displayName(manager.full_name, manager.email);
  const averagePnlPercent = rows.length > 0
    ? rows.reduce((acc, row) => acc + row.pnlPercent, 0) / rows.length
    : 0;

  return (
    <main className="page-shell">
      <div className="bg-orb -top-20 -left-20 h-72 w-72 bg-[rgba(160,210,255,0.22)]" aria-hidden="true" />
      <div className="bg-orb top-28 right-0 h-80 w-80 bg-[rgba(160,210,255,0.16)]" aria-hidden="true" />

      <section className="page-content">
        <header className="card-premium page-header-card self-start animate-fade-up">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/admin" className="btn-secondary btn-secondary-compact" aria-label="Volver al panel de administrador">
                ← Admin
              </Link>
              <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Panel de Gestor</h1>
              <span className="rounded-full border border-[rgba(160,210,255,0.3)] bg-[rgba(160,210,255,0.08)] px-3 py-0.5 text-sm text-[#A0D2FF]">{managerLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <a href="/api/auth/logout?redirectTo=/login" className="btn-secondary btn-secondary-compact" aria-label="Cerrar sesión">
                Cerrar sesión
              </a>
            </div>
          </div>
        </header>

        <section className="card-premium page-section-card animate-fade-up stagger-2">
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--glass-border)] bg-[rgba(160,210,255,0.05)] px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Rentabilidad media</p>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${pnlTone(averagePnlPercent)}`}>{percent(averagePnlPercent)}</p>
            </div>
            <div className="rounded-xl border border-[var(--glass-border)] bg-[rgba(160,210,255,0.05)] px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Portfolios gestionados</p>
              <p className="mt-1 text-xl font-semibold text-[#A0D2FF]">{rows.length}</p>
            </div>
          </div>

          <div className="section-header-row mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">Clientes Asignados</h2>
          </div>

          <div className="page-table-shell overflow-hidden rounded-[1rem] border border-[var(--glass-border)]">
            <table className="w-full min-w-[1180px] border-collapse">
              <thead className="bg-[rgba(10,18,40,0.55)] text-left backdrop-blur-md">
                <tr>
                  <th scope="col" className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">CLIENTE</th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">EMAIL</th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">PORTFOLIO</th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">ALTA CLIENTE</th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">RENTABILIDAD</th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">ACCIÓN</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr className="border-t border-[var(--line)]">
                    <td className="px-4 py-8 text-center text-sm text-[var(--muted)]" colSpan={6}>
                      Este gestor no tiene portfolios asignados.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="border-t border-[var(--line)]">
                      <td className="px-4 py-4 text-sm font-medium">{row.ownerName}</td>
                      <td className="px-4 py-4 text-sm text-[var(--muted)]">{row.ownerEmail}</td>
                      <td className="px-4 py-4 text-sm">
                        <div className="font-medium">{row.name}</div>
                        <div className="font-mono text-xs text-[var(--muted)] opacity-50">{row.id.slice(0, 8)}…</div>
                      </td>
                      <td className="px-4 py-4 text-sm text-[var(--muted)]">
                        {row.ownerCreatedAt ? new Date(row.ownerCreatedAt).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "-"}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div className={`font-medium tabular-nums ${pnlTone(row.pnlUsd)}`}>
                          {percent(row.pnlPercent)}
                        </div>
                        <div className={`text-xs tabular-nums ${pnlTone(row.pnlUsd)} opacity-75`}>
                          {signedCurrency(row.pnlUsd)}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Link href={`/admin/managers/${selectedManagerId}/portfolios/${row.id}`} className="btn-secondary btn-secondary-compact" aria-label={`Ver portfolio de ${row.ownerName}`}>
                          Ver portfolio
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
