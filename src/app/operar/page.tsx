import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { getDashboardData } from "@/lib/dashboard/get-dashboard-data";

/**
 * Panel de OPERACIÓN del gestor.
 *
 * Es el dashboard anterior al rediseño, íntegro. Sigue vivo porque contiene
 * toda la operativa —registrar depósitos y retiradas, harvests, correcciones,
 * deshacer, exportar CSV, precios manuales— y **ninguna de esas pantallas se
 * rediseñó**: las ocho maquetas aprobadas cubren la lectura de la cartera, no
 * la operativa.
 *
 * Borrarlo al montar el rediseño habría dejado al gestor sin herramientas. Se
 * queda aquí hasta que sus diálogos tengan diseño propio.
 */
export default async function OperarPage() {
  const access = await getViewerAccess();
  if (!access.isAuthenticated) redirect("/login");

  const data = await getDashboardData();
  return <DashboardClient data={data} />;
}
