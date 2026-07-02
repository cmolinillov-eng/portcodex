"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Role = "autonomo" | "admin" | "cliente";

type UserData = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  createdAt: string | null;
};

type ManagerOption = {
  id: string;
  label: string;
};

type OwnedPortfolio = {
  id: string;
  name: string;
  managerId: string | null;
  managerLabel: string;
};

type ManagedClientPortfolio = {
  id: string;
  name: string;
  ownerId: string;
  ownerLabel: string;
  managerId: string | null;
};

function roleBadgeClasses(role: Role): string {
  if (role === "cliente") return "border-[rgba(245,158,11,0.45)] bg-[rgba(245,158,11,0.12)] text-amber-300";
  if (role === "admin") return "border-[rgba(230,193,115,0.45)] bg-[rgba(230,193,115,0.10)] text-[#E6C173]";
  return "border-[rgba(140,109,63,0.45)] bg-[rgba(140,109,63,0.12)] text-[#A79BE0]";
}

function uniqueByOwner(portfolios: ManagedClientPortfolio[]): ManagedClientPortfolio[] {
  const seen = new Set<string>();
  const deduped: ManagedClientPortfolio[] = [];

  for (const portfolio of portfolios) {
    const ownerId = portfolio.ownerId.trim();
    if (!ownerId) {
      deduped.push(portfolio);
      continue;
    }
    if (seen.has(ownerId)) continue;
    seen.add(ownerId);
    deduped.push(portfolio);
  }

  return deduped;
}

export function AdminUserEditForm({
  user,
  managerOptions,
  ownedPortfolios,
  managedClientPortfolios,
  clientPortfolioPool,
}: {
  user: UserData;
  managerOptions: ManagerOption[];
  ownedPortfolios: OwnedPortfolio[];
  managedClientPortfolios: ManagedClientPortfolio[];
  clientPortfolioPool: ManagedClientPortfolio[];
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<Role>(user.role);
  const [selectedClientPortfolioId, setSelectedClientPortfolioId] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingManager, setIsSavingManager] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const visibleManagedClientPortfolios = useMemo(
    () => uniqueByOwner(managedClientPortfolios),
    [managedClientPortfolios],
  );

  const addableClientPortfolios = useMemo(
    () => uniqueByOwner(clientPortfolioPool.filter((portfolio) => portfolio.managerId === null)),
    [clientPortfolioPool],
  );

  async function saveProfile(): Promise<void> {
    try {
      setMessage("");
      setErrorMessage("");
      setIsSavingProfile(true);

      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          fullName,
          email,
          role,
        }),
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo actualizar el usuario.");
      }

      setMessage("Usuario actualizado correctamente.");
      router.refresh();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "No se pudo actualizar el usuario.";
      setErrorMessage(messageText);
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function assignPortfolioManager(portfolioId: string, managerId: string | null): Promise<void> {
    try {
      setMessage("");
      setErrorMessage("");
      setIsSavingManager(true);

      const response = await fetch("/api/admin/portfolio-managers", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ portfolioId, managerId }),
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo actualizar la asignación de gestor.");
      }

      setSelectedClientPortfolioId("");
      setMessage("Asignación de gestor actualizada.");
      router.refresh();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "No se pudo actualizar la asignación.";
      setErrorMessage(messageText);
    } finally {
      setIsSavingManager(false);
    }
  }

  async function deleteUser(): Promise<void> {
    const confirmed = window.confirm("Se eliminará este usuario y sus datos asociados. ¿Continuar?");
    if (!confirmed) return;

    try {
      setMessage("");
      setErrorMessage("");
      setIsDeleting(true);

      const response = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo eliminar el usuario.");
      }

      router.push("/admin");
      router.refresh();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "No se pudo eliminar el usuario.";
      setErrorMessage(messageText);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <main className="page-shell">
      <div className="bg-orb -top-20 -left-20 h-72 w-72 bg-[rgba(230,193,115,0.15)]" aria-hidden="true" />
      <div className="bg-orb top-28 right-0 h-80 w-80 bg-[rgba(140,109,63,0.10)]" aria-hidden="true" />

      <section className="page-content">
        <header className="card-premium page-header-card animate-fade-up">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Editar usuario</h1>
            <Link href="/admin" className="btn-secondary btn-secondary-compact" aria-label="Volver al panel de administrador">Volver</Link>
          </div>
        </header>

        <section className="card-premium page-section-card animate-fade-up stagger-2">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-[var(--muted)]">Nombre</span>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 text-sm transition-colors focus:border-[var(--accent-primary)] focus:outline-none focus:ring-1 focus:ring-[rgba(230,193,115,0.15)]"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[var(--muted)]">Email</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 text-sm transition-colors focus:border-[var(--accent-primary)] focus:outline-none focus:ring-1 focus:ring-[rgba(230,193,115,0.15)]"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
              aria-label="Cambiar rol del usuario"
              className={`rounded-lg border px-3 py-2 text-sm transition-colors ${roleBadgeClasses(role)}`}
            >
              <option value="cliente">Cliente</option>
              <option value="autonomo">Autónomo</option>
              <option value="admin">Gestor</option>
            </select>
            <button
              type="button"
              onClick={() => {
                void saveProfile();
              }}
              disabled={isSavingProfile}
              aria-label="Guardar cambios del perfil"
              className="btn-primary btn-secondary-compact disabled:opacity-60"
            >
              {isSavingProfile ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>

          {user.createdAt ? (
            <p className="mt-2 text-xs text-[var(--muted)]">Alta: {new Date(user.createdAt).toLocaleString("es-ES")}</p>
          ) : null}

          {role === "cliente" ? (
            <div className="mt-6 rounded-xl border border-[var(--glass-border)] bg-[rgba(230,193,115,0.04)] p-4">
              <h3 className="text-sm font-semibold">Asociar gestor (cliente)</h3>
              {ownedPortfolios.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--muted)]">Este cliente no tiene portfolio todavía.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {ownedPortfolios.map((portfolio) => (
                    <div key={portfolio.id} className="grid gap-2 md:grid-cols-[1fr_280px] md:items-center">
                      <div className="text-sm">
                        <p className="font-medium">{portfolio.name}</p>
                        <p className="text-xs text-[var(--muted)]">Gestor actual: {portfolio.managerLabel || "Sin gestor"}</p>
                      </div>
                      <select
                        value={portfolio.managerId ?? ""}
                        onChange={(event) => {
                          void assignPortfolioManager(portfolio.id, event.target.value || null);
                        }}
                        disabled={isSavingManager}
                        aria-label={`Asignar gestor al portfolio ${portfolio.name}`}
                        className="rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 text-sm transition-colors focus:border-[var(--accent-primary)] focus:outline-none disabled:opacity-60"
                      >
                        <option value="">Sin gestor</option>
                        {managerOptions.map((manager) => (
                          <option key={manager.id} value={manager.id}>{manager.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {role === "admin" ? (
            <div className="mt-6 rounded-xl border border-[var(--glass-border)] bg-[rgba(230,193,115,0.04)] p-4">
              <h3 className="text-sm font-semibold">Clientes del gestor</h3>

              <div className="mt-3">
                <p className="mb-1 text-xs text-[var(--muted)]">Añadir cliente</p>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedClientPortfolioId}
                    onChange={(event) => setSelectedClientPortfolioId(event.target.value)}
                    aria-label="Seleccionar cliente para añadir"
                    className="min-w-[280px] rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 text-sm transition-colors focus:border-[var(--accent-primary)] focus:outline-none focus:ring-1 focus:ring-[rgba(230,193,115,0.15)]"
                  >
                    <option value="">Seleccionar cliente/portfolio</option>
                    {addableClientPortfolios.map((portfolio) => (
                      <option key={portfolio.id} value={portfolio.id}>
                        {portfolio.ownerLabel} · {portfolio.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!selectedClientPortfolioId || isSavingManager}
                    onClick={() => {
                      void assignPortfolioManager(selectedClientPortfolioId, user.id);
                    }}
                    aria-label="Añadir cliente seleccionado"
                    className="btn-primary btn-secondary-compact disabled:opacity-60"
                  >
                    Añadir cliente
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {visibleManagedClientPortfolios.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">No tiene clientes asignados.</p>
                ) : (
                  visibleManagedClientPortfolios.map((portfolio) => (
                    <div key={portfolio.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-black/20 px-3 py-2 transition-colors hover:border-[var(--glass-border)]">
                      <div>
                        <p className="text-sm font-medium">{portfolio.ownerLabel}</p>
                        <p className="text-xs text-[var(--muted)]">{portfolio.name}</p>
                      </div>
                      <button
                        type="button"
                        disabled={isSavingManager}
                        onClick={() => {
                          void assignPortfolioManager(portfolio.id, null);
                        }}
                        aria-label={`Quitar cliente ${portfolio.ownerLabel}`}
                        className="rounded-lg border border-[rgba(248,113,113,0.45)] bg-[rgba(248,113,113,0.12)] px-2 py-1 text-xs text-rose-300 transition-colors hover:bg-[rgba(248,113,113,0.20)] disabled:opacity-60"
                      >
                        Quitar cliente
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {message ? (
            <p className="mt-4 rounded-lg border border-[rgba(16,185,129,0.45)] bg-[rgba(16,185,129,0.12)] px-3 py-2 text-sm text-emerald-300">
              {message}
            </p>
          ) : null}

          {errorMessage ? (
            <p className="mt-4 rounded-lg border border-[rgba(248,113,113,0.45)] bg-[rgba(248,113,113,0.12)] px-3 py-2 text-sm text-rose-300">
              {errorMessage}
            </p>
          ) : null}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => {
                void deleteUser();
              }}
              disabled={isDeleting}
              aria-label="Eliminar usuario permanentemente"
              className="rounded-lg border border-[rgba(248,113,113,0.45)] bg-[rgba(248,113,113,0.12)] px-3 py-2 text-sm text-rose-300 transition-colors hover:bg-[rgba(248,113,113,0.20)] disabled:opacity-60"
            >
              {isDeleting ? "Eliminando..." : "Eliminar usuario"}
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}
