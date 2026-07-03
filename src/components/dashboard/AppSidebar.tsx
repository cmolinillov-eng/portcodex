"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, Wallet2, Activity, FileText, Download, LogOut } from "lucide-react";
import type { ViewerRole } from "@/lib/auth/viewer-access";

/**
 * Barra lateral de navegación del dashboard (sistema «Instrumento»).
 * PRINCIPAL: ancla a las secciones de la propia página (una sola vista).
 * FISCAL: rutas reales con el portfolio activo en el query. Tarjeta de
 * usuario al pie (iniciales + rol como texto con punto de color).
 * Desktop-only (xl+); en móvil la navegación es la barra inferior nativa.
 */

type NavAnchor = { id: string; label: string; icon: React.ComponentType<{ className?: string }> };
type NavLink = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const PRINCIPAL: NavAnchor[] = [
  { id: "dashboard-top", label: "Dashboard", icon: LayoutDashboard },
  { id: "dashboard-positions", label: "Posiciones", icon: Wallet2 },
  { id: "dashboard-activity", label: "Actividad", icon: Activity },
];

const FISCAL: NavLink[] = [
  { href: "/fiscal", label: "Resumen fiscal", icon: FileText },
  { href: "/fiscal/exportar", label: "Exportar", icon: Download },
];

const ROLE_LABEL: Record<string, string> = {
  admin: "Gestor",
  cliente: "Cliente",
  autonomo: "Autónomo",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "··";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AppSidebar({
  portfolioId,
  ownerName,
  role,
}: {
  portfolioId: string;
  ownerName: string;
  role: ViewerRole;
}) {
  const [active, setActive] = useState("dashboard-top");
  const portfolioQuery = portfolioId ? `?portfolio=${portfolioId}` : "";

  // Resalta la sección visible (scroll spy discreto).
  useEffect(() => {
    const ids = PRINCIPAL.map((n) => n.id);
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: [0, 0.25, 0.5] },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--void-surface)] xl:flex">
      {/* Marca */}
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-6">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent-primary)]">
          <span className="h-3.5 w-3.5 rounded-[3px] bg-[#0e1512]" />
        </span>
        <span className="font-designer text-base font-bold tracking-[0.14em] text-[var(--foreground)]">
          PORTCODEX
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        <div className="space-y-1">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)] opacity-70">
            Principal
          </p>
          {PRINCIPAL.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollTo(item.id)}
                className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors ${
                  isActive
                    ? "bg-[rgba(111,174,143,0.10)] text-[var(--foreground)]"
                    : "text-[var(--muted)] hover:bg-white/[0.04] hover:text-[var(--foreground)]"
                }`}
              >
                {isActive ? (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[var(--accent-primary)]" />
                ) : null}
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-[var(--accent-primary)]" : ""}`} />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="space-y-1">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)] opacity-70">
            Fiscal
          </p>
          {FISCAL.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={`${item.href}${portfolioQuery}`}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-[var(--muted)] transition-colors hover:bg-white/[0.04] hover:text-[var(--foreground)]"
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Tarjeta de usuario */}
      <div className="border-t border-[var(--line)] p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--void-elevated)] font-mono text-xs font-semibold text-[var(--ink-2)]">
            {initials(ownerName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-[var(--foreground)]">{ownerName}</p>
            <p className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-primary)]" />
              {ROLE_LABEL[role] ?? role}
            </p>
          </div>
          <a
            href="/api/auth/logout?redirectTo=/login"
            className="header-icon-btn header-icon-btn-danger"
            aria-label="Cerrar sesión"
            title="Salir"
          >
            <LogOut className="h-4 w-4" />
          </a>
        </div>
      </div>
    </aside>
  );
}
