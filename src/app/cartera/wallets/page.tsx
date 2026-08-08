import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { getFiscalContext } from "@/lib/fiscal/get-fiscal-context";
import { TopNav } from "@/components/shell/TopNav";
import { PageShell } from "@/components/shell/PageShell";
import { WalletsManager } from "@/components/dashboard/cartera/WalletsManager";

/**
 * Alta y gestión de las wallets de una cartera.
 *
 * Cuelga de Cartera, que es donde la maqueta pone el enlace «Wallets» y donde el
 * gestor está cuando piensa «voy a empezar a mirar a este cliente». La cartera
 * se resuelve por `?portfolio=` igual que en el resto de la sección; sin el
 * parámetro, cae a la cartera del propio usuario.
 */
export default async function CarteraWalletsPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolio?: string }>;
}) {
  const access = await getViewerAccess();
  if (!access.isAuthenticated) redirect("/login");

  const { portfolio } = await searchParams;
  const ctx = await getFiscalContext((portfolio ?? "").trim() || undefined);
  const portfolioId = ctx.activePortfolioId;
  const portfolioName = ctx.portfolios.find((p) => p.id === portfolioId)?.name;

  const volverHref = portfolioId ? `/cartera?portfolio=${portfolioId}` : "/cartera";

  return (
    <div className="pcx-screen" style={{ minHeight: "100vh" }}>
      <TopNav
        portfolioName={portfolioName}
        portfolios={ctx.portfolios
          .filter((p) => p.id && p.name)
          .map((p) => ({ id: p.id, name: p.name as string }))}
        portfolioQuery={portfolioId ? `?portfolio=${portfolioId}` : undefined}
      />

      <PageShell>
        <header style={{ paddingTop: 44 }}>
          <Link
            href={volverHref}
            style={{ fontSize: "var(--text-label)", color: "var(--muted)" }}
          >
            ← Cartera
          </Link>
          <h1
            style={{
              margin: "12px 0 0",
              fontSize: "var(--text-page)",
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            Wallets
          </h1>
          {portfolioName ? (
            <p style={{ fontSize: "var(--text-body)", color: "var(--faint)", marginTop: 8 }}>
              {portfolioName}
            </p>
          ) : null}
        </header>

        {portfolioId ? (
          <WalletsManager portfolioId={portfolioId} portfolioName={portfolioName} />
        ) : (
          <p style={{ marginTop: 40, fontSize: "var(--text-body)", color: "var(--faint)" }}>
            No hay ninguna cartera seleccionada.
          </p>
        )}
      </PageShell>
    </div>
  );
}

export const dynamic = "force-dynamic";
