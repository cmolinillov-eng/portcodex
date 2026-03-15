import { redirect } from "next/navigation";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { LandingPageContainer } from "@/components/landing/landing-page-container";

export default async function LoginPage() {
  const access = await getViewerAccess();
  if (access.isAuthenticated) {
    if (access.canManageRoles) redirect("/admin");
    if (access.role === "admin") redirect("/manager");
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-[#0A0A0B] selection:bg-[rgba(160,210,255,0.3)]">
      <LandingPageContainer />
    </main>
  );
}
