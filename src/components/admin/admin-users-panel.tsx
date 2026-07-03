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
    return "border-[rgba(201,164,94,0.45)] bg-[rgba(201,164,94,0.12)] text-amber-300";
  }
  if (role === "admin") {
    return "border-[rgba(111,174,143,0.45)] bg-[rgba(111,174,143,0.10)] text-[#6FAE8F]";
  }
  return "border-[rgba(79,135,112,0.45)] bg-[rgba(79,135,112,0.12)] text-[#8CA0B3]";
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
      <div className="bg-orb -top-20 -left-20 h-72 w-72 bg-[rgba(111,174,143,0.18)]" aria-hidden="true" />
      <div className="bg-orb top-28 right-0 h-80 w-80 bg-[rgba(79,135,112,0.12)]" aria-hidden="true" />

      <section className="page-content">
        <header className="card-premium page-header-card animate-fade-up">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Panel de Administrador</h1>
            <a href="/api/auth/logout?redirectTo=/login" className="btn-secondary btn-secondary-compact" aria-label="Cerrar sesión">
              Cerrar sesión
            </a>
          </div>
          {feedbackMessage ? <p className="mt-2 text-xs text-[var(--muted)]">{feedbackMessage}</p> : null}
        </header>

        <section className="card-premium page-section-card animate-fade-up stagger-2">
          <div className="section-header-row mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">Usuarios</h2>
            <Link href="/admin/create-user" className="btn-primary btn-secondary-compact" aria-label="Crear nuevo usuario">
              Crear usuario
            </Link>
          </div>

          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <button type="button" onClick={() => setFilter("all")} aria-pressed={filter === "all"} className={`btn-secondary btn-secondary-compact transition-all ${filter === "all" ? "border-[rgba(111,174,143,0.4)] bg-[rgba(111,174,143,0.12)]" : ""}`}>Todos ({counts.all})</button>
            <button type="button" onClick={() => setFilter("admin")} aria-pressed={filter === "admin"} className={`btn-secondary btn-secondary-compact transition-all ${filter === "admin" ? "border-[rgba(111,174,143,0.4)] bg-[rgba(111,174,143,0.12)]" : ""}`}>Gestores ({counts.admin})</button>
            <button type="button" onClick={() => setFilter("cliente")} aria-pressed={filter === "cliente"} className={`btn-secondary btn-secondary-compact transition-all ${filter === "cliente" ? "border-[rgba(201,164,94,0.4)] bg-[rgba(201,164,94,0.10)]" : ""}`}>Clientes ({counts.cliente})</button>
            <button type="button" onClick={() => setFilter("autonomo")} aria-pressed={filter === "autonomo"} className={`btn-secondary btn-secondary-compact transition-all ${filter === "autonomo" ? "border-[rgba(79,135,112,0.4)] bg-[rgba(79,135,112,0.10)]" : ""}`}>Autónomos ({counts.autonomo})</button>
          </div>

          <div className="page-table-shell overflow-hidden rounded-[1rem] border border-[var(--glass-border)]">
            <table className="w-full min-w-[1180px] border-collapse">
              <thead className="bg-[rgba(10,11,14,0.55)] text-left backdrop-blur-md">
                <tr>
                  <th scope="col" className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">USUARIO</th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">EMAIL</th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">ROL</th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">PORTFOLIOS</th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">ALTA</th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">ACCIÓN</th>
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
                          aria-label={`Cambiar rol de ${displayName(user.fullName, user.email)}`}
                          className={`w-auto rounded-lg border px-3 py-1.5 text-xs transition-colors ${roleBadgeClasses(user.role)} disabled:opacity-60`}
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
                          <Link href={`/admin/managers/${user.id}`} className="text-[#6FAE8F] underline underline-offset-2">
                            {userPortfolios.length} portfolio(s)
                          </Link>
                        ) : userPortfolios.length === 1 ? (
                          <Link href={`/admin/users/${user.id}?portfolioId=${userPortfolios[0].id}`} className="text-[#6FAE8F] underline underline-offset-2">
                            {userPortfolios[0].name}
                          </Link>
                        ) : (
                          <details>
                            <summary className="cursor-pointer list-none text-[#6FAE8F]">
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
