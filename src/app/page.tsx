import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LandingContent } from "@/components/landing/LandingContent";
import { landingMetadata } from "@/components/landing/landing-metadata";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { getDashboardData } from "@/lib/dashboard/get-dashboard-data";
import { TopNav } from "@/components/shell/TopNav";
import { ResumenScreen } from "@/components/dashboard/resumen/ResumenScreen";

/**
 * Los metadatos son los de la PORTADA, no los del dashboard: la raíz es la
 * dirección que se comparte, se indexa y se enlaza desde fuera. Lo que ve un
 * cliente ya identificado no lo lee ningún buscador.
 */
export const metadata: Metadata = landingMetadata;

/**
 * La raíz sirve DOS cosas según quién llame:
 *
 *  · Sin sesión → la portada comercial. Es la dirección del negocio, y mandar a
 *    un visitante a `/login` era pedirle la contraseña antes de contarle qué
 *    es esto.
 *  · Con sesión → el Resumen. Manda una sola cifra: el patrimonio.
 *
 * Se resuelve en la misma ruta y no con una redirección para que la dirección
 * que el cliente tiene guardada siga siendo la suya.
 */
export default async function HomePage() {
  const access = await getViewerAccess();
  if (!access.isAuthenticated) return <LandingContent />;
  if (access.canManageRoles) redirect("/admin");
  if (access.role === "admin") redirect("/manager");

  const data = await getDashboardData();

  return (
    <ResumenScreen
      data={data}
      nav={<TopNav portfolioName={data.portfolioContext?.portfolioName} />}
      provenanceExtra={
        data.viewer.canOperate ? (
          <>
            {" · "}
            <Link href="/operar" style={{ color: "var(--muted)" }}>
              Panel de operación
            </Link>
          </>
        ) : null
      }
    />
  );
}
