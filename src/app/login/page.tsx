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
    <main className="min-h-screen bg-[#101318] selection:bg-[rgba(111,174,143,0.3)]">
      <LandingPageContainer />
    </main>
  );
}
