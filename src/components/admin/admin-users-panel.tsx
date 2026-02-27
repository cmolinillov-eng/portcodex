"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type AdminUserRow = {
  id: string;
  email: string;
  fullName: string;
  role: "autonomo" | "admin" | "cliente";
  createdAt: string | null;
};

type AdminPortfolioRow = {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  managerId: string | null;
  managerName: string;
  managerEmail: string;
  pnlUsd: number;
  pnlPercent: number;
  totalValueUsd: number;
  totalDepositedUsd: number;
};

type RoleFilter = "all" | "cliente" | "autonomo" | "admin";
type PortfolioSortField = "portfolio" | "client" | "manager" | "status";
type SortDirection = "asc" | "desc";

function roleLabel(role: "autonomo" | "admin" | "cliente"): string {
  if (role === "cliente") return "Cliente";
  if (role === "admin") return "Gestor";
  return "Autónomo";
}

function displayPersonName(fullName: string, email: string): string {
  if (fullName.trim().length > 0) return fullName;
  if (email.trim().length > 0) return email;
  return "Sin nombre";
}

function currency(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function signedCurrency(value: number): string {
  const abs = currency(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return abs;
}

function percent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function pnlTone(value: number): string {
  if (value > 0) return "text-emerald-300";
  if (value < 0) return "text-rose-300";
  return "text-[var(--muted)]";
}

export function AdminUsersPanel({
  rows,
  portfolios,
}: {
  rows: AdminUserRow[];
  portfolios: AdminPortfolioRow[];
}) {
  type PortfolioStatusFilter = "all" | "assigned" | "unassigned";

  const router = useRouter();
  const [users, setUsers] = useState<AdminUserRow[]>(rows);
  const [portfolioRows, setPortfolioRows] = useState<AdminPortfolioRow[]>(portfolios);
  const [filter, setFilter] = useState<RoleFilter>("all");
  const [portfolioStatusFilter, setPortfolioStatusFilter] = useState<PortfolioStatusFilter>("all");
  const [portfolioManagerFilter, setPortfolioManagerFilter] = useState("");
  const [portfolioSearch, setPortfolioSearch] = useState("");
  const [portfolioSortField, setPortfolioSortField] = useState<PortfolioSortField>("portfolio");
  const [portfolioSortDirection, setPortfolioSortDirection] = useState<SortDirection>("asc");
  const [isSavingUserId, setIsSavingUserId] = useState("");
  const [isSavingPortfolioId, setIsSavingPortfolioId] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [quickManagerUserId, setQuickManagerUserId] = useState("");
  const [quickClientUserId, setQuickClientUserId] = useState("");

  const counts = useMemo(
    () => ({
      all: users.length,
      cliente: users.filter((user) => user.role === "cliente").length,
      autonomo: users.filter((user) => user.role === "autonomo").length,
      admin: users.filter((user) => user.role === "admin").length,
    }),
    [users],
  );

  const filteredRows = useMemo(
    () => users.filter((user) => (filter === "all" ? true : user.role === filter)),
    [filter, users],
  );

  const managerUsers = useMemo(
    () =>
      users
        .filter((user) => user.role === "admin")
        .map((user) => ({
          id: user.id,
          label: displayPersonName(user.fullName, user.email),
          email: user.email,
        })),
    [users],
  );

  const clientUsers = useMemo(
    () =>
      users
        .filter((user) => user.role === "cliente")
        .map((user) => ({
          id: user.id,
          label: displayPersonName(user.fullName, user.email),
          email: user.email,
        })),
    [users],
  );

  const ownedByOwnerId = useMemo(
    () =>
      portfolioRows.reduce(
        (acc, portfolio) => {
          if (!acc[portfolio.ownerId]) acc[portfolio.ownerId] = [];
          acc[portfolio.ownerId].push(portfolio);
          return acc;
        },
        {} as Record<string, AdminPortfolioRow[]>,
      ),
    [portfolioRows],
  );

  const managerIds = useMemo(() => new Set(managerUsers.map((manager) => manager.id)), [managerUsers]);

  const portfolioCounts = useMemo(
    () => ({
      all: portfolioRows.length,
      assigned: portfolioRows.filter((portfolio) => Boolean(portfolio.managerId)).length,
      unassigned: portfolioRows.filter((portfolio) => !portfolio.managerId).length,
    }),
    [portfolioRows],
  );

  const filteredPortfolioRows = useMemo(() => {
    const search = portfolioSearch.trim().toLowerCase();
    return portfolioRows.filter((portfolio) => {
      if (portfolioStatusFilter === "assigned" && !portfolio.managerId) return false;
      if (portfolioStatusFilter === "unassigned" && portfolio.managerId) return false;
      if (portfolioManagerFilter && portfolio.managerId !== portfolioManagerFilter) return false;

      if (!search) return true;
      const haystack = [
        portfolio.name,
        portfolio.id,
        portfolio.ownerName,
        portfolio.ownerEmail,
        portfolio.managerName,
        portfolio.managerEmail,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [portfolioRows, portfolioStatusFilter, portfolioManagerFilter, portfolioSearch]);

  const sortedPortfolioRows = useMemo(() => {
    const rowsToSort = [...filteredPortfolioRows];
    rowsToSort.sort((left, right) => {
      let comparison = 0;
      if (portfolioSortField === "portfolio") {
        comparison = left.name.localeCompare(right.name, "es", { sensitivity: "base" });
      } else if (portfolioSortField === "client") {
        const leftValue = `${left.ownerName} ${left.ownerEmail}`.trim();
        const rightValue = `${right.ownerName} ${right.ownerEmail}`.trim();
        comparison = leftValue.localeCompare(rightValue, "es", { sensitivity: "base" });
      } else if (portfolioSortField === "manager") {
        const leftValue = left.managerId
          ? `${left.managerName} ${left.managerEmail}`.trim()
          : "zzzzzz_sin_gestor";
        const rightValue = right.managerId
          ? `${right.managerName} ${right.managerEmail}`.trim()
          : "zzzzzz_sin_gestor";
        comparison = leftValue.localeCompare(rightValue, "es", { sensitivity: "base" });
      } else {
        const leftValue = left.managerId ? "gestionado" : "sin_asignar";
        const rightValue = right.managerId ? "gestionado" : "sin_asignar";
        comparison = leftValue.localeCompare(rightValue, "es", { sensitivity: "base" });
      }
      return portfolioSortDirection === "asc" ? comparison : -comparison;
    });
    return rowsToSort;
  }, [filteredPortfolioRows, portfolioSortDirection, portfolioSortField]);

  function togglePortfolioSort(field: PortfolioSortField) {
    if (portfolioSortField === field) {
      setPortfolioSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setPortfolioSortField(field);
    setPortfolioSortDirection("asc");
  }

  function sortIndicator(field: PortfolioSortField): string {
    if (portfolioSortField !== field) return "↕";
    return portfolioSortDirection === "asc" ? "↑" : "↓";
  }

  const usersById = useMemo(
    () =>
      users.reduce(
        (acc, user) => {
          acc[user.id] = user;
          return acc;
        },
        {} as Record<string, AdminUserRow>,
      ),
    [users],
  );

  const managedByManagerId = useMemo(
    () =>
      portfolioRows.reduce(
        (acc, portfolio) => {
          if (!portfolio.managerId) return acc;
          if (!acc[portfolio.managerId]) acc[portfolio.managerId] = [];
          acc[portfolio.managerId].push(portfolio);
          return acc;
        },
        {} as Record<string, AdminPortfolioRow[]>,
      ),
    [portfolioRows],
  );

  function goToUserPortfolio(userId: string) {
    const selectedUser = usersById[userId];
    if (!selectedUser) return;

    const portfoliosForUser =
      selectedUser.role === "admin"
        ? managedByManagerId[userId] ?? []
        : ownedByOwnerId[userId] ?? [];

    const firstPortfolioId = portfoliosForUser[0]?.id ?? "";
    if (firstPortfolioId) {
      router.push(`/admin/users/${userId}?portfolioId=${firstPortfolioId}`);
      return;
    }
    router.push(`/admin/users/${userId}`);
  }

  const showManagementColumn = filter !== "autonomo";

  function managerLabelForClient(userId: string): string {
    const owned = ownedByOwnerId[userId] ?? [];
    if (owned.length === 0) return "Sin portfolio";
    const labels = Array.from(
      new Set(
        owned.map((portfolio) => {
          if (!portfolio.managerId) return "Sin gestor";
          return displayPersonName(portfolio.managerName, portfolio.managerEmail);
        }),
      ),
    );
    return labels.join(" · ");
  }

  async function updateUserRole(userId: string, nextRole: "autonomo" | "admin" | "cliente") {
    try {
      setFeedbackMessage("");
      setIsSavingUserId(userId);

      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: nextRole }),
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo actualizar el rol.");
      }

      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId
            ? {
                ...user,
                role: nextRole,
              }
            : user,
        ),
      );

      setFeedbackMessage("Rol actualizado correctamente.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar el rol.";
      setFeedbackMessage(message);
    } finally {
      setIsSavingUserId("");
    }
  }

  async function updatePortfolioManager(portfolioId: string, nextManagerId: string) {
    try {
      setFeedbackMessage("");
      setIsSavingPortfolioId(portfolioId);

      const managerId = nextManagerId.trim().length > 0 ? nextManagerId : null;
      const response = await fetch("/api/admin/portfolio-managers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolioId, managerId }),
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo actualizar el gestor del portfolio.");
      }

      setPortfolioRows((prev) =>
        prev.map((portfolio) => {
          if (portfolio.id !== portfolioId) return portfolio;
          const manager = managerId ? usersById[managerId] : null;
          return {
            ...portfolio,
            managerId,
            managerName: manager ? manager.fullName : "",
            managerEmail: manager ? manager.email : "",
          };
        }),
      );

      setFeedbackMessage(managerId ? "Gestor asignado correctamente." : "Gestor desasignado correctamente.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo actualizar el gestor del portfolio.";
      setFeedbackMessage(message);
    } finally {
      setIsSavingPortfolioId("");
    }
  }

  return (
    <main className="page-shell">
      <div className="bg-orb -top-20 -left-20 h-72 w-72 bg-[rgba(46,168,255,0.07)]" />
      <div className="bg-orb top-28 right-0 h-80 w-80 bg-[rgba(25,215,255,0.05)]" />

      <section className="page-content">
        <header className="card-premium page-header-card">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Panel de Administrador</h1>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                <span>Ir a gestor</span>
                <select
                  value={quickManagerUserId}
                  onChange={(event) => {
                    const userId = event.target.value;
                    setQuickManagerUserId(userId);
                    if (!userId) return;
                    goToUserPortfolio(userId);
                  }}
                  className="w-[190px] rounded-lg border border-[var(--line)] bg-black/30 px-2 py-1.5 text-xs"
                >
                  <option value="">Seleccionar gestor</option>
                  {managerUsers.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                <span>Ir a cliente</span>
                <select
                  value={quickClientUserId}
                  onChange={(event) => {
                    const userId = event.target.value;
                    setQuickClientUserId(userId);
                    if (!userId) return;
                    goToUserPortfolio(userId);
                  }}
                  className="w-[190px] rounded-lg border border-[var(--line)] bg-black/30 px-2 py-1.5 text-xs"
                >
                  <option value="">Seleccionar cliente</option>
                  {clientUsers.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.label}
                    </option>
                  ))}
                </select>
              </label>
              <a href="/api/auth/logout?redirectTo=/login" className="btn-secondary btn-secondary-compact">
                Cerrar sesión
              </a>
            </div>
          </div>
          {feedbackMessage ? <p className="mt-2 text-xs text-[var(--muted)]">{feedbackMessage}</p> : null}
        </header>

        <section className="card-premium page-section-card">
          <div className="section-header-row flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight">Usuarios</h2>
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { key: "all", label: `Todos (${counts.all})` },
                    { key: "cliente", label: `Clientes (${counts.cliente})` },
                    { key: "autonomo", label: `Autónomos (${counts.autonomo})` },
                    { key: "admin", label: `Gestores (${counts.admin})` },
                  ] as Array<{ key: RoleFilter; label: string }>
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setFilter(item.key)}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                      filter === item.key
                        ? "border-[rgba(0,229,255,0.55)] bg-[rgba(0,229,255,0.18)]"
                        : "border-[var(--line)] bg-black/20 hover:bg-[rgba(0,229,255,0.1)]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <span className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              Total usuarios: {counts.all}
            </span>
          </div>

          <div className="page-table-shell">
            <table className="w-full min-w-[1320px] border-collapse">
              <thead className="bg-[rgba(0,229,255,0.12)] text-left">
                <tr>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">USUARIO</th>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">EMAIL</th>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">ROL</th>
                  {showManagementColumn ? (
                    <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">
                      {filter === "cliente" ? "GESTOR ASIGNADO" : "PORTFOLIOS GESTIONADOS"}
                    </th>
                  ) : null}
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">ALTA</th>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">PORTFOLIOS</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr className="border-t border-[var(--line)]">
                    <td className="px-4 py-4 text-sm text-[var(--muted)]" colSpan={showManagementColumn ? 6 : 5}>
                      No hay usuarios para el filtro seleccionado.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((user) => {
                    const managedPortfolios = managedByManagerId[user.id] ?? [];
                    const ownedPortfolios = ownedByOwnerId[user.id] ?? [];
                    const portfoliosForAction =
                      user.role === "admin" ? managedPortfolios : ownedPortfolios;
                    return (
                      <tr key={user.id} className="border-t border-[var(--line)]">
                        <td className="px-4 py-4 text-sm">
                          {user.role === "admin" ? (
                            <Link
                              href={`/admin/managers/${user.id}`}
                              className="text-cyan-300 underline decoration-[rgba(0,229,255,0.45)] underline-offset-2 hover:text-cyan-200"
                            >
                              {displayPersonName(user.fullName, user.email)}
                            </Link>
                          ) : (
                            user.fullName || "-"
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm">{user.email || "-"}</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${
                                user.role === "cliente"
                                  ? "border-[rgba(245,158,11,0.45)] bg-[rgba(245,158,11,0.12)] text-amber-300"
                                  : user.role === "admin"
                                    ? "border-[rgba(0,229,255,0.55)] bg-[rgba(0,229,255,0.16)] text-cyan-300"
                                    : "border-[rgba(74,222,128,0.5)] bg-[rgba(74,222,128,0.12)] text-emerald-300"
                              }`}
                            >
                              {roleLabel(user.role)}
                            </span>
                            <select
                              value={user.role}
                              onChange={(event) =>
                                updateUserRole(
                                  user.id,
                                  event.target.value as "autonomo" | "admin" | "cliente",
                                )
                              }
                              disabled={isSavingUserId === user.id}
                              className="rounded-lg border border-[var(--line)] bg-black/30 px-2 py-1 text-xs disabled:opacity-60"
                            >
                              <option value="cliente">Cliente</option>
                              <option value="autonomo">Autónomo</option>
                              <option value="admin">Gestor</option>
                            </select>
                          </div>
                        </td>
                        {showManagementColumn ? (
                          <td className="px-4 py-4 text-sm">
                            {user.role === "cliente" ? (
                              <span className="text-sm text-[var(--muted)]">{managerLabelForClient(user.id)}</span>
                            ) : user.role !== "admin" ? (
                              <span className="text-[var(--muted)]">-</span>
                            ) : managedPortfolios.length === 0 ? (
                              <span className="text-[var(--muted)]">0</span>
                            ) : (
                              <details className="group">
                                <summary className="cursor-pointer list-none text-sm text-cyan-300">
                                  {managedPortfolios.length} portfolio(s)
                                </summary>
                                <div className="mt-2 space-y-2 rounded-xl border border-[var(--line)] bg-black/20 p-2">
                                  {managedPortfolios.map((portfolio) => (
                                    <div key={portfolio.id} className="text-xs text-[var(--muted)]">
                                      <div className="font-medium text-foreground">{portfolio.name}</div>
                                      <div>
                                        Cliente: {portfolio.ownerName || "-"}{" "}
                                        {portfolio.ownerEmail ? `(${portfolio.ownerEmail})` : ""}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                          </td>
                        ) : null}
                        <td className="px-4 py-4 text-sm text-[var(--muted)]">
                          {user.createdAt ? new Date(user.createdAt).toLocaleString("es-ES") : "-"}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-col gap-2">
                            {portfoliosForAction.length === 0 ? (
                              <span className="text-xs text-[var(--muted)]">Sin portfolio</span>
                            ) : portfoliosForAction.length === 1 ? (
                              <div className="flex flex-col gap-1">
                                <Link href={`/admin/users/${user.id}?portfolioId=${portfoliosForAction[0].id}`} className="btn-secondary">
                                  {portfoliosForAction[0].name}
                                </Link>
                                <div className={`text-[11px] ${pnlTone(portfoliosForAction[0].pnlUsd)}`}>
                                  {percent(portfoliosForAction[0].pnlPercent)} ·{" "}
                                  {signedCurrency(portfoliosForAction[0].pnlUsd)}
                                </div>
                              </div>
                            ) : (
                              <details>
                                <summary className="btn-secondary w-fit cursor-pointer list-none">
                                  Ver portfolios ({portfoliosForAction.length})
                                </summary>
                                <div className="mt-2 flex flex-col gap-1">
                                  {portfoliosForAction.map((portfolio) => (
                                    <div key={portfolio.id} className="rounded-lg border border-[var(--line)] bg-black/20 p-2">
                                      <Link
                                        href={`/admin/users/${user.id}?portfolioId=${portfolio.id}`}
                                        className="text-xs text-[var(--muted)] underline decoration-[rgba(0,229,255,0.4)] underline-offset-2 hover:text-foreground"
                                      >
                                        {portfolio.name}
                                      </Link>
                                      <div className={`mt-1 text-[11px] ${pnlTone(portfolio.pnlUsd)}`}>
                                        {percent(portfolio.pnlPercent)} · {signedCurrency(portfolio.pnlUsd)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card-premium page-section-card">
          <div className="section-header-row flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">Asignación de Gestores</h2>
            <span className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              Mostrando {sortedPortfolioRows.length} de {portfolioRows.length}
            </span>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-[var(--muted)]">Estado</span>
              <select
                value={portfolioStatusFilter}
                onChange={(event) => setPortfolioStatusFilter(event.target.value as PortfolioStatusFilter)}
                className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-2 py-2 text-xs"
              >
                <option value="all">Todos ({portfolioCounts.all})</option>
                <option value="assigned">Con gestor ({portfolioCounts.assigned})</option>
                <option value="unassigned">Sin gestor ({portfolioCounts.unassigned})</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-[var(--muted)]">Filtrar por gestor</span>
              <select
                value={portfolioManagerFilter}
                onChange={(event) => setPortfolioManagerFilter(event.target.value)}
                className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-2 py-2 text-xs"
              >
                <option value="">Todos los gestores</option>
                {managerUsers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.label} {manager.email ? `(${manager.email})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-[var(--muted)]">Buscar portfolio/cliente</span>
              <input
                value={portfolioSearch}
                onChange={(event) => setPortfolioSearch(event.target.value)}
                placeholder="Nombre, email o ID"
                className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 text-xs"
              />
            </label>
          </div>

          <div className="page-table-shell">
            <table className="w-full min-w-[1240px] border-collapse">
              <thead className="bg-[rgba(0,229,255,0.12)] text-left">
                <tr>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">
                    <button
                      type="button"
                      onClick={() => togglePortfolioSort("portfolio")}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      PORTFOLIO <span className="text-[10px]">{sortIndicator("portfolio")}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">
                    <button
                      type="button"
                      onClick={() => togglePortfolioSort("client")}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      CLIENTE <span className="text-[10px]">{sortIndicator("client")}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">
                    ID CLIENTE
                  </th>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">
                    <button
                      type="button"
                      onClick={() => togglePortfolioSort("manager")}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      GESTOR <span className="text-[10px]">{sortIndicator("manager")}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">
                    <button
                      type="button"
                      onClick={() => togglePortfolioSort("status")}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      ESTADO <span className="text-[10px]">{sortIndicator("status")}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">
                    RENTABILIDAD
                  </th>
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.18em] text-[var(--muted)]">ACCIÓN</th>
                </tr>
              </thead>
              <tbody>
                {sortedPortfolioRows.length === 0 ? (
                  <tr className="border-t border-[var(--line)]">
                    <td className="px-4 py-4 text-sm text-[var(--muted)]" colSpan={7}>
                      No hay portfolios para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  sortedPortfolioRows.map((portfolio) => {
                    const hasOrphanManager =
                      Boolean(portfolio.managerId) && !managerIds.has(portfolio.managerId ?? "");
                    return (
                      <tr key={portfolio.id} className="border-t border-[var(--line)]">
                        <td className="px-4 py-4 text-sm">
                          <div className="font-medium">{portfolio.name}</div>
                        </td>
                        <td className="px-4 py-4 text-sm">
                          <div>{portfolio.ownerName || "-"}</div>
                        </td>
                        <td className="px-4 py-4 text-sm">
                          <details>
                            <summary className="btn-secondary btn-secondary-compact w-fit cursor-pointer list-none">
                              ID cliente
                            </summary>
                            <div className="mt-2 space-y-1 text-[11px] text-[var(--muted)]">
                              <p>
                                <span className="text-foreground">Portfolio ID:</span> {portfolio.id}
                              </p>
                              <p>
                                <span className="text-foreground">Email:</span> {portfolio.ownerEmail || "-"}
                              </p>
                            </div>
                          </details>
                        </td>
                        <td className="px-4 py-4 text-sm">
                          <select
                            value={portfolio.managerId ?? ""}
                            onChange={(event) => updatePortfolioManager(portfolio.id, event.target.value)}
                            disabled={isSavingPortfolioId === portfolio.id}
                            className="w-full max-w-[220px] rounded-lg border border-[var(--line)] bg-black/30 px-2 py-1 text-xs disabled:opacity-60"
                          >
                            <option value="">Sin gestor</option>
                            {managerUsers.map((manager) => (
                              <option key={manager.id} value={manager.id}>
                                {manager.label}
                              </option>
                            ))}
                            {hasOrphanManager ? (
                              <option value={portfolio.managerId ?? ""}>
                                {portfolio.managerName || "Gestor no disponible"}
                              </option>
                            ) : null}
                          </select>
                        </td>
                        <td className="px-4 py-4 text-sm">
                          {portfolio.managerId ? (
                            <span className="inline-flex rounded-full border border-[rgba(0,229,255,0.55)] bg-[rgba(0,229,255,0.16)] px-2.5 py-1 text-xs text-cyan-300">
                              Gestionado
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-[var(--line)] bg-black/20 px-2.5 py-1 text-xs text-[var(--muted)]">
                              Sin asignar
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm">
                          <div className={`font-medium ${pnlTone(portfolio.pnlUsd)}`}>
                            {percent(portfolio.pnlPercent)} · {signedCurrency(portfolio.pnlUsd)}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <Link href={`/admin/users/${portfolio.ownerId}`} className="btn-secondary">
                            Ver portfolio cliente
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
