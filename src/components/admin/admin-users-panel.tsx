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
    <main className="admin-shell">
      <div className="admin-frame">
        <header className="admin-topbar">
          <div>
            <p className="admin-eyebrow">Portcodex · control de acceso</p>
            <h1 className="admin-title">Panel de administración</h1>
            <p className="admin-subtitle">Usuarios, roles y portfolios bajo gestión.</p>
          </div>
          <a href="/api/auth/logout?redirectTo=/login" className="btn-secondary btn-secondary-compact" aria-label="Cerrar sesión">Cerrar sesión</a>
        </header>

        {feedbackMessage ? <p className="mt-3 text-xs text-[var(--accent-hover)]" role="status">{feedbackMessage}</p> : null}

        <section className="admin-ledger" aria-labelledby="users-title">
          <div className="admin-ledger-head">
            <div>
              <p className="admin-eyebrow">Directorio</p>
              <h2 id="users-title" className="admin-section-title">Usuarios</h2>
            </div>
            <div className="admin-stats" aria-label="Resumen de usuarios">
              <div className="admin-stat"><span className="admin-column-label">Total</span><strong>{counts.all}</strong></div>
              <div className="admin-stat"><span className="admin-column-label">Gestores</span><strong>{counts.admin}</strong></div>
              <div className="admin-stat"><span className="admin-column-label">Clientes</span><strong>{counts.cliente}</strong></div>
            </div>
          </div>

          <div className="admin-toolbar">
            <div className="admin-filter-group" role="group" aria-label="Filtrar usuarios por rol">
              <button type="button" onClick={() => setFilter("all")} aria-pressed={filter === "all"} className="admin-filter">Todos · {counts.all}</button>
              <button type="button" onClick={() => setFilter("admin")} aria-pressed={filter === "admin"} className="admin-filter">Gestores · {counts.admin}</button>
              <button type="button" onClick={() => setFilter("cliente")} aria-pressed={filter === "cliente"} className="admin-filter">Clientes · {counts.cliente}</button>
              <button type="button" onClick={() => setFilter("autonomo")} aria-pressed={filter === "autonomo"} className="admin-filter">Autónomos · {counts.autonomo}</button>
            </div>
            <Link href="/admin/create-user" className="btn-primary btn-secondary-compact" aria-label="Crear nuevo usuario">Crear usuario</Link>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Usuario</th><th scope="col">Email</th><th scope="col">Rol</th><th scope="col">Portfolios</th><th scope="col">Alta</th><th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const managedPortfolios = managedByManagerId[user.id] ?? [];
                  const ownedPortfolios = ownedByOwnerId[user.id] ?? [];
                  const userPortfolios = user.role === "admin" ? managedPortfolios : ownedPortfolios;

                  return (
                    <tr key={user.id}>
                      <td className="admin-person">
                        {displayName(user.fullName, user.email)}
                      </td>
                      <td className="admin-email">{user.email || "-"}</td>
                      <td>
                        <select
                          value={user.role}
                          onChange={(event) => {
                            void updateUserRole(user.id, event.target.value as Role);
                          }}
                          disabled={isSavingUserId === user.id}
                          aria-label={`Cambiar rol de ${displayName(user.fullName, user.email)}`}
                          className={`admin-role w-auto border px-3 py-1.5 transition-colors ${roleBadgeClasses(user.role)} disabled:opacity-60`}
                        >
                          <option value="cliente">Cliente</option>
                          <option value="autonomo">Autónomo</option>
                          <option value="admin">Gestor</option>
                        </select>
                      </td>
                      <td>
                        {userPortfolios.length === 0 ? (
                          <span className="text-[var(--muted)]">Sin portfolio</span>
                        ) : user.role === "admin" ? (
                          <Link href={`/admin/managers/${user.id}`} className="admin-link">
                            {userPortfolios.length} portfolio(s)
                          </Link>
                        ) : userPortfolios.length === 1 ? (
                          <Link href={`/admin/users/${user.id}?portfolioId=${userPortfolios[0].id}`} className="admin-link">
                            {userPortfolios[0].name}
                          </Link>
                        ) : (
                          <details>
                            <summary className="admin-link cursor-pointer list-none">
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
                      <td className="admin-date">
                        {user.createdAt ? new Date(user.createdAt).toLocaleString("es-ES") : "-"}
                      </td>
                      <td>
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
      </div>
    </main>
  );
}
