"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Role = "autonomo" | "admin" | "cliente";

type AdminUserRow = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  createdAt: string | null;
};

type AdminPortfolioRow = {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  ownerRole: Role | null;
  managerId: string | null;
  managerName: string;
  managerEmail: string;
  pnlUsd: number;
  pnlPercent: number;
  totalValueUsd: number;
  totalDepositedUsd: number;
};

type RoleFilter = "all" | Role;

function displayName(fullName: string, email: string): string {
  return fullName.trim() || email.trim() || "Sin nombre";
}

function roleBadgeClasses(role: Role): string {
  if (role === "cliente") {
    return "border-[rgba(245,158,11,0.45)] bg-[rgba(245,158,11,0.12)] text-amber-300";
  }
  if (role === "admin") {
    return "border-[rgba(160,210,255,0.45)] bg-[rgba(160,210,255,0.10)] text-[#A0D2FF]";
  }
  return "border-[rgba(157,80,187,0.45)] bg-[rgba(157,80,187,0.12)] text-[#C090E8]";
}


export function AdminUsersPanel({
  rows,
  portfolios,
}: {
  rows: AdminUserRow[];
  portfolios: AdminPortfolioRow[];
}) {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserRow[]>(rows);
  const [filter, setFilter] = useState<RoleFilter>("all");
  const [isSavingUserId, setIsSavingUserId] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");

  const counts = useMemo(
    () => ({
      all: users.length,
      admin: users.filter((user) => user.role === "admin").length,
      cliente: users.filter((user) => user.role === "cliente").length,
      autonomo: users.filter((user) => user.role === "autonomo").length,
    }),
    [users],
  );

  const filteredUsers = useMemo(
    () => users.filter((user) => (filter === "all" ? true : user.role === filter)),
    [users, filter],
  );

  const managedByManagerId = useMemo(
    () =>
      portfolios.reduce(
        (acc, portfolio) => {
          if (!portfolio.managerId || portfolio.ownerRole !== "cliente") return acc;
          if (!acc[portfolio.managerId]) acc[portfolio.managerId] = [];
          acc[portfolio.managerId].push(portfolio);
          return acc;
        },
        {} as Record<string, AdminPortfolioRow[]>,
      ),
    [portfolios],
  );

  const ownedByOwnerId = useMemo(
    () =>
      portfolios.reduce(
        (acc, portfolio) => {
          if (!acc[portfolio.ownerId]) acc[portfolio.ownerId] = [];
          acc[portfolio.ownerId].push(portfolio);
          return acc;
        },
        {} as Record<string, AdminPortfolioRow[]>,
      ),
    [portfolios],
  );

  async function updateUserRole(userId: string, role: Role): Promise<void> {
    try {
      setFeedbackMessage("");
      setIsSavingUserId(userId);

      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo actualizar el rol.");
      }

      setUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, role } : user)));
      setFeedbackMessage("Rol actualizado correctamente.");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar el rol.";
      setFeedbackMessage(message);
    } finally {
      setIsSavingUserId("");
    }
  }

  return (
    <main className="page-shell">
      <section className="page-content">
        <header className="card-premium page-header-card">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Panel de Administrador</h1>
            <a href="/api/auth/logout?redirectTo=/login" className="btn-secondary btn-secondary-compact">
              Cerrar sesión
            </a>
          </div>
          {feedbackMessage ? <p className="mt-2 text-xs text-[var(--muted)]">{feedbackMessage}</p> : null}
        </header>

        <section className="card-premium page-section-card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">Usuarios</h2>
            <Link href="/admin/create-user" className="btn-secondary btn-secondary-compact">
              Crear usuario
            </Link>
          </div>

          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <button type="button" onClick={() => setFilter("all")} className="btn-secondary btn-secondary-compact">Todos ({counts.all})</button>
            <button type="button" onClick={() => setFilter("admin")} className="btn-secondary btn-secondary-compact">Gestores ({counts.admin})</button>
            <button type="button" onClick={() => setFilter("cliente")} className="btn-secondary btn-secondary-compact">Clientes ({counts.cliente})</button>
            <button type="button" onClick={() => setFilter("autonomo")} className="btn-secondary btn-secondary-compact">Autónomos ({counts.autonomo})</button>
          </div>

          <div className="page-table-shell">
            <table className="w-full min-w-[1180px] border-collapse">
              <thead className="text-left">
                <tr>
                  <th className="px-4 py-3 text-xs tracking-[0.16em] text-[var(--muted)]">USUARIO</th>
                  <th className="px-4 py-3 text-xs tracking-[0.16em] text-[var(--muted)]">EMAIL</th>
                  <th className="px-4 py-3 text-xs tracking-[0.16em] text-[var(--muted)]">ROL</th>
                  <th className="px-4 py-3 text-xs tracking-[0.16em] text-[var(--muted)]">PORTFOLIOS</th>
                  <th className="px-4 py-3 text-xs tracking-[0.16em] text-[var(--muted)]">ALTA</th>
                  <th className="px-4 py-3 text-xs tracking-[0.16em] text-[var(--muted)]">ACCIÓN</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const managedPortfolios = managedByManagerId[user.id] ?? [];
                  const ownedPortfolios = ownedByOwnerId[user.id] ?? [];
                  const userPortfolios = user.role === "admin" ? managedPortfolios : ownedPortfolios;

                  return (
                    <tr key={user.id} className="border-t border-[var(--line)]">
                      <td className="px-4 py-4 text-sm">
                        {displayName(user.fullName, user.email)}
                      </td>
                      <td className="px-4 py-4 text-sm">{user.email || "-"}</td>
                      <td className="px-4 py-4">
                        <select
                          value={user.role}
                          onChange={(event) => {
                            void updateUserRole(user.id, event.target.value as Role);
                          }}
                          disabled={isSavingUserId === user.id}
                          className={`rounded-lg border px-2 py-1 text-xs ${roleBadgeClasses(user.role)}`}
                        >
                          <option value="cliente">Cliente</option>
                          <option value="autonomo">Autónomo</option>
                          <option value="admin">Gestor</option>
                        </select>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        {userPortfolios.length === 0 ? (
                          <span className="text-[var(--muted)]">Sin portfolio</span>
                        ) : user.role === "admin" ? (
                          <Link href={`/admin/managers/${user.id}`} className="text-[#A0D2FF] underline underline-offset-2">
                            {userPortfolios.length} portfolio(s)
                          </Link>
                        ) : userPortfolios.length === 1 ? (
                          <Link href={`/admin/users/${user.id}?portfolioId=${userPortfolios[0].id}`} className="text-[#A0D2FF] underline underline-offset-2">
                            {userPortfolios[0].name}
                          </Link>
                        ) : (
                          <details>
                            <summary className="cursor-pointer list-none text-[#A0D2FF]">
                              {userPortfolios.length} portfolio(s)
                            </summary>
                            <div className="mt-1 space-y-1 text-xs text-[var(--muted)]">
                              {userPortfolios.map((portfolio) => (
                                <Link
                                  key={portfolio.id}
                                  href={`/admin/users/${user.id}?portfolioId=${portfolio.id}`}
                                  className="block underline underline-offset-2 hover:text-foreground"
                                >
                                  {portfolio.name}
                                </Link>
                              ))}
                            </div>
                          </details>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-[var(--muted)]">
                        {user.createdAt ? new Date(user.createdAt).toLocaleString("es-ES") : "-"}
                      </td>
                      <td className="px-4 py-4">
                        <Link href={`/admin/users/${user.id}/edit`} className="btn-secondary btn-secondary-compact">
                          Editar
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
