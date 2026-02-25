import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { getDashboardData } from "@/lib/dashboard/get-dashboard-data";

export default async function HomePage() {
  const access = await getViewerAccess();
  if (access.canManageRoles) {
    redirect("/admin");
  }
  if (access.role === "admin") {
    redirect("/manager");
  }

  const data = await getDashboardData();
  return <DashboardClient data={data} />;
}
