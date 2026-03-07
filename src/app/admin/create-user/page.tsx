import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { AdminCreateUserForm } from "@/components/admin/admin-create-user-form";
import { getViewerAccess } from "@/lib/auth/viewer-access";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";

type PortfolioOptionRow = {
  id: string | null;
  name: string | null;
  owner: { full_name: string | null; email: string | null } | Array<{ full_name: string | null; email: string | null }> | null;
};

type ManagerRow = {
  id: string | null;
  full_name: string | null;
  email: string | null;
  role: "autonomo" | "admin" | "cliente" | null;
};

function readOwner(
  owner: PortfolioOptionRow["owner"],
): { fullName: string; email: string } {
  const ownerRef = Array.isArray(owner) ? owner[0] ?? null : owner;
  return {
    fullName: (ownerRef?.full_name ?? "").trim(),
    email: (ownerRef?.email ?? "").trim(),
  };
}

export default async function AdminCreateUserPage() {
  noStore();

  const access = await getViewerAccess();
  if (!access.isAuthenticated) {
    redirect("/login");
  }
  if (!access.canManageRoles) {
    redirect("/");
  }

  const client = getSupabaseServiceClient() ?? getSupabaseServerClient();
  const [portfoliosQuery, managersQuery] = await Promise.all([
    client
      .from("portfolios")
      .select("id, name, owner:profiles!owner_id(full_name, email)")
      .order("created_at", { ascending: false }),
    client
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("role", "admin")
      .order("created_at", { ascending: false }),
  ]);

  if (portfoliosQuery.error) {
    throw new Error(`Error consultando portfolios: ${portfoliosQuery.error.message}`);
  }

  if (managersQuery.error) {
    throw new Error(`Error consultando gestores: ${managersQuery.error.message}`);
  }

  const portfolioOptions = ((portfoliosQuery.data ?? []) as PortfolioOptionRow[])
    .map((row) => {
      const owner = readOwner(row.owner);
      return {
        id: (row.id ?? "").trim(),
        name: (row.name ?? "").trim() || "Portfolio sin nombre",
        ownerName: owner.fullName,
        ownerEmail: owner.email,
      };
    })
    .filter((row) => row.id.length > 0);

  const managerOptions = ((managersQuery.data ?? []) as ManagerRow[])
    .map((row) => ({
      id: (row.id ?? "").trim(),
      fullName: (row.full_name ?? "").trim(),
      email: (row.email ?? "").trim(),
    }))
    .filter((row) => row.id.length > 0);

  return <AdminCreateUserForm portfolios={portfolioOptions} managers={managerOptions} />;
}
