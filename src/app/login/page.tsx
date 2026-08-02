import { redirect } from "next/navigation";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { AccessLogin } from "@/components/acceso/AccessLogin";

/**
 * Acceso.
 *
 * Sustituye a la portada anterior (`LandingPageContainer`), que mezclaba
 * argumentario comercial con el formulario. PortCodex no se contrata desde
 * aquí —se contrata a través de un gestor patrimonial—, así que esta pantalla
 * solo tiene que dejar entrar a quien ya es cliente.
 *
 * La portada comercial se hará aparte, con captura real del dashboard ya
 * rediseñado (ver web/public/brand/LANDING-BRIEF.md).
 */
export default async function LoginPage() {
  const access = await getViewerAccess();
  if (access.isAuthenticated) {
    if (access.canManageRoles) redirect("/admin");
    if (access.role === "admin") redirect("/manager");
    redirect("/");
  }

  return <AccessLogin />;
}
