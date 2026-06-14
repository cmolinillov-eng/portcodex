import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FiscalSidebar } from "@/components/fiscal/FiscalSidebar";
import { getFiscalContext } from "@/lib/fiscal/get-fiscal-context";

export default async function FiscalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getFiscalContext();
  if (!ctx.isAuthenticated) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--void-deep)] text-[var(--foreground)]">
      <Suspense fallback={<div className="w-[236px] shrink-0 border-r border-[var(--line)] bg-[var(--void-surface)]" />}>
        <FiscalSidebar portfolios={ctx.portfolios} activePortfolioId={ctx.activePortfolioId} />
      </Suspense>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
