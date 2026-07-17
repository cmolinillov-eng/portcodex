"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  FileText,
  Download,
  BookOpen,
  ChevronLeft,
  Wallet,
} from "lucide-react";
import type { FiscalPortfolio } from "@/lib/fiscal/get-fiscal-context";

interface Props {
  portfolios: FiscalPortfolio[];
  activePortfolioId: string | null;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Coincidencia exacta para el índice de la sección fiscal. */
  exact?: boolean;
}

const PRINCIPAL: NavItem[] = [{ href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true }];

const FISCAL: NavItem[] = [
  { href: "/fiscal", label: "Resumen fiscal", icon: FileText, exact: true },
  { href: "/fiscal/operaciones", label: "Operaciones", icon: Receipt },
  { href: "/fiscal/exportar", label: "Exportar", icon: Download },
  { href: "/fiscal/glosario", label: "Glosario", icon: BookOpen },
];

export function FiscalSidebar({ portfolios, activePortfolioId }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  // El activo efectivo viene de la URL (?portfolio=) y, si no, del fallback.
  const urlPortfolio = searchParams.get("portfolio");
  const effectiveActive =
    urlPortfolio && portfolios.some((p) => p.id === urlPortfolio)
      ? urlPortfolio
      : activePortfolioId;
  const portfolioQuery = effectiveActive ? `?portfolio=${effectiveActive}` : "";

  function isActive(item: NavItem): boolean {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  }

  function withPortfolio(href: string): string {
    if (href === "/") return effectiveActive ? `/${portfolioQuery}` : "/";
    return `${href}${portfolioQuery}`;
  }

  function onChangePortfolio(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("portfolio", id);
    router.push(`${pathname}?${params.toString()}`);
  }

  function renderItem(item: NavItem) {
    const active = isActive(item);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={withPortfolio(item.href)}
        className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
          active
            ? "bg-[rgba(111,174,143,0.10)] text-[var(--foreground)]"
            : "text-[var(--muted)] hover:bg-white/[0.04] hover:text-[var(--foreground)]"
        }`}
      >
        {active ? (
          <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[var(--accent-primary)] shadow-[0_0_10px_var(--accent-glow)]" />
        ) : null}
        <Icon className={`h-4 w-4 shrink-0 ${active ? "text-[var(--accent-primary)]" : ""}`} />
        {item.label}
      </Link>
    );
  }

  return (
    <aside className="flex h-full w-[236px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--void-surface)]">
      {/* Brand */}
      <div className="px-5 pt-6 pb-5">
        <p className="font-[var(--font-designer)] text-lg font-bold leading-none tracking-tight text-[var(--foreground)]">
          PORTCODEX
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">
          Trazabilidad fiscal
        </p>
      </div>

      {/* Wallet selector */}
      {portfolios.length > 0 ? (
        <div className="px-4 pb-4">
          <label className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            <Wallet className="h-3 w-3" /> Wallet
          </label>
          <select
            value={effectiveActive ?? ""}
            onChange={(e) => onChangePortfolio(e.target.value)}
            disabled={portfolios.length <= 1}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--void-elevated)] px-2.5 py-2 text-xs text-[var(--foreground)] focus:border-[rgba(111,174,143,0.55)] focus:outline-none disabled:opacity-70"
          >
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Nav */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        <div className="space-y-1">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)] opacity-70">
            Principal
          </p>
          {PRINCIPAL.map(renderItem)}
        </div>
        <div className="space-y-1">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)] opacity-70">
            Fiscal
          </p>
          {FISCAL.map(renderItem)}
        </div>
      </nav>

      {/* Back to dashboard */}
      <div className="border-t border-[var(--line)] p-3">
        <Link
          href={withPortfolio("/")}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-[var(--muted)] transition-colors hover:bg-white/[0.04] hover:text-[var(--foreground)]"
        >
          <ChevronLeft className="h-4 w-4" /> Volver al dashboard
        </Link>
      </div>
    </aside>
  );
}
