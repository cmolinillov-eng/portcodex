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
    .select("id, name, owner_id, owner:profiles!owner_id(full_name, email, created_at)")
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
  const rows = rawRows.map((row) => {
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
      ...metrics,
    };
  });

  const managerLabel = displayName(manager.full_name, manager.email);

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="bg-orb -top-20 -left-20 h-72 w-72 bg-[rgba(56,189,248,0.22)]" />
      <div className="bg-orb top-28 right-0 h-80 w-80 bg-[rgba(34,211,238,0.16)]" />

      <section className="mx-auto flex w-full max-w-none flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
        <header className="card-premium rounded-3xl p-6 md:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin"
              className="inline-flex rounded-lg border border-[rgba(34,211,238,0.45)] bg-[rgba(34,211,238,0.14)] px-3 py-1.5 text-xs transition hover:bg-[rgba(34,211,238,0.26)]"
            >
              Volver a Admin
            </Link>
            <span className="text-sm text-[var(--muted)]">Vista del gestor:</span>
            <span className="text-sm font-medium">{managerLabel}</span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Panel de Gestor</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Vista de supervisión del administrador sobre los clientes y portfolios gestionados por este gestor.
          </p>
        </header>

        <section className="card-premium rounded-3xl p-6 md:p-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">Clientes Asignados</h2>
            <span className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              Total portfolios gestionados: {rows.length}
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[var(--line)]">
            <table className="w-full min-w-[1180px] border-collapse">
              <thead className="bg-[rgba(34,211,238,0.08)] text-left">
                <tr>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">CLIENTE</th>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">EMAIL</th>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">PORTFOLIO</th>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">ALTA CLIENTE</th>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">RENTABILIDAD</th>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">PORTFOLIOS</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr className="border-t border-[var(--line)]">
                    <td className="px-4 py-4 text-sm text-[var(--muted)]" colSpan={6}>
                      Este gestor no tiene portfolios asignados.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="border-t border-[var(--line)]">
                      <td className="px-4 py-4 text-sm">{row.ownerName}</td>
                      <td className="px-4 py-4 text-sm">{row.ownerEmail}</td>
                      <td className="px-4 py-4 text-sm">
                        <div className="font-medium">{row.name}</div>
                        <div className="text-xs text-[var(--muted)]">{row.id}</div>
                      </td>
                      <td className="px-4 py-4 text-sm text-[var(--muted)]">
                        {row.ownerCreatedAt ? new Date(row.ownerCreatedAt).toLocaleString("es-ES") : "-"}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div className={`font-medium ${pnlTone(row.pnlUsd)}`}>
                          {percent(row.pnlPercent)} · {signedCurrency(row.pnlUsd)}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Link
                          href={`/admin/managers/${selectedManagerId}/portfolios/${row.id}`}
                          className="inline-flex rounded-lg border border-[rgba(34,211,238,0.45)] bg-[rgba(34,211,238,0.14)] px-3 py-1.5 text-xs transition hover:bg-[rgba(34,211,238,0.26)]"
                        >
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
