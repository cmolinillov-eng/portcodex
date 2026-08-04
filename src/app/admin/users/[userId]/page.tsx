import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { ResumenScreen } from "@/components/dashboard/resumen/ResumenScreen";
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

  /* Barra de contexto del operador. Ocupa el ancho completo y usa el mismo
     lenguaje que TopNav (obsidiana, línea de 1px, azul institucional): la
     píldora flotante verde era del sistema anterior. Ocupa el sitio del menú
     de cinco enlaces porque el gestor no está navegando SU producto: está
     mirando la cartera de otro, y lo que necesita saber es de quién. */
  const barraDeContexto = (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "var(--void-surface)",
        borderBottom: "1px solid var(--line)",
        padding: "12px var(--shell-pad)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          fontSize: "var(--text-body)",
        }}
      >
        <Link href="/admin" style={{ color: "var(--muted)" }}>
          ← Administración
        </Link>
        <span style={{ color: "var(--faint)" }}>·</span>
        <span style={{ color: "var(--muted)" }}>Viendo la cartera de</span>
        <span style={{ fontWeight: 500 }}>{displayName}</span>
        {selectedPortfolio ? (
          <span style={{ color: "var(--muted)" }}>
            · {selectedPortfolio.name ?? "Portfolio sin nombre"}
          </span>
        ) : null}

        {targetPortfolios.length > 1 ? (
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {targetPortfolios.map((portfolio) => {
              const activo = portfolio.id === selectedPortfolioId;
              return (
                <Link
                  key={portfolio.id}
                  href={`/admin/users/${userId}?portfolioId=${portfolio.id ?? ""}`}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "var(--text-label)",
                    background: activo ? "var(--accent-soft)" : "transparent",
                    color: activo ? "var(--brand-soft)" : "var(--muted)",
                    border: `1px solid ${activo ? "var(--accent-soft)" : "var(--line)"}`,
                  }}
                >
                  {portfolio.name ?? "Portfolio"}
                </Link>
              );
            })}
          </span>
        ) : null}

        {/* El botón de editar vive aquí desde que la fila del directorio
              lleva a la cartera: sin él no había forma de llegar a la ficha. */}
        <Link
          href={`/admin/users/${userId}/edit`}
          style={{
            marginLeft: "auto",
            padding: "6px 14px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--line-strong)",
            color: "var(--foreground)",
            fontSize: "var(--text-label)",
          }}
        >
          Editar usuario
        </Link>
      </div>
    </div>
  );

  /* La MISMA pantalla de Resumen que ve el cliente, no una versión de gestor.
     Aquí se servía el dashboard anterior al rediseño —barra lateral, gráfico
     de donut, tarjetas—, así que gestor y cliente veían el mismo patrimonio
     dibujado de dos formas distintas y cualquier arreglo había que hacerlo dos
     veces. Los datos ya venían bien: getDashboardData acepta cartera destino.
     Lo único que sobraba era el componente que los pintaba. */
  return (
    <ResumenScreen
      data={data}
      nav={barraDeContexto}
      /* Sin enlace al historial: /movimientos resuelve la cartera por la
         sesión del gestor, no por esta URL, así que llevaría a los movimientos
         de SU cartera bajo el nombre del cliente. */
      movementsHref={null}
    />
  );
}
