"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Role = "autonomo" | "admin" | "cliente";
type ClientAssignMode = "later" | "now";

type PortfolioOption = {
  id: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
};

type ManagerOption = {
  id: string;
  fullName: string;
  email: string;
};

function displayName(fullName: string, email: string): string {
  return fullName.trim() || email.trim() || "Sin nombre";
}

export function AdminCreateUserForm({
  portfolios,
  managers,
}: {
  portfolios: PortfolioOption[];
  managers: ManagerOption[];
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("cliente");
  const [clientAssignMode, setClientAssignMode] = useState<ClientAssignMode>("later");
  const [clientManagerId, setClientManagerId] = useState("");
  const [managerPortfolioId, setManagerPortfolioId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const availablePortfolios = useMemo(() => {
    return portfolios.map((portfolio) => ({
      ...portfolio,
      label: `${portfolio.name} · ${portfolio.ownerName || portfolio.ownerEmail || "Sin cliente"}`,
    }));
  }, [portfolios]);

  const managerOptions = useMemo(() => {
    return managers.map((manager) => ({
      ...manager,
      label: displayName(manager.fullName, manager.email),
    }));
  }, [managers]);

  async function handleCreateUser(): Promise<void> {
    try {
      setErrorMessage("");
      setSuccessMessage("");
      setIsSubmitting(true);

      const payload: {
        fullName: string;
        email: string;
        password: string;
        role: Role;
        managerId?: string;
        assignPortfolioIds?: string[];
      } = {
        fullName,
        email,
        password,
        role,
      };

      if (role === "admin" && managerPortfolioId) {
        payload.assignPortfolioIds = [managerPortfolioId];
      }

      if (role === "cliente" && clientAssignMode === "now" && clientManagerId) {
        payload.managerId = clientManagerId;
      }

      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo crear el usuario.");
      }

      setSuccessMessage("Usuario creado correctamente. Volviendo al panel...");
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("cliente");
      setClientAssignMode("later");
      setClientManagerId("");
      setManagerPortfolioId("");

      setTimeout(() => {
        router.push("/admin");
        router.refresh();
      }, 500);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo crear el usuario.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page-shell">
      <div className="bg-orb -top-20 -left-20 h-72 w-72 bg-[rgba(46,168,255,0.07)]" />
      <div className="bg-orb top-28 right-0 h-80 w-80 bg-[rgba(25,215,255,0.05)]" />

      <section className="page-content">
        <header className="card-premium page-header-card">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Crear usuario</h1>
            <Link href="/admin" className="btn-secondary btn-secondary-compact">
              Volver al panel
            </Link>
          </div>
        </header>

        <section className="card-premium page-section-card">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-[var(--muted)]">Nombre de usuario</span>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Nombre y apellidos"
                className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 text-sm"
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-[var(--muted)]">Correo electrónico</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="correo@dominio.com"
                className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 text-sm"
              />
            </label>

            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-[var(--muted)]">Contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-sm text-[var(--muted)]">Tipo de usuario</p>
            <div className="grid gap-2 md:grid-cols-3">
              <button
                type="button"
                onClick={() => setRole("cliente")}
                className={`rounded-xl border px-3 py-2 text-left transition ${
                  role === "cliente"
                    ? "border-[rgba(245,158,11,0.55)] bg-[rgba(245,158,11,0.16)]"
                    : "border-[var(--line)] bg-black/20"
                }`}
              >
                <span className="inline-flex rounded-full border border-[rgba(245,158,11,0.45)] bg-[rgba(245,158,11,0.12)] px-2 py-0.5 text-xs text-amber-300">
                  Cliente
                </span>
                <p className="mt-1 text-xs text-[var(--muted)]">Solo lectura. Puedes asignar gestor ahora o luego.</p>
              </button>

              <button
                type="button"
                onClick={() => setRole("autonomo")}
                className={`rounded-xl border px-3 py-2 text-left transition ${
                  role === "autonomo"
                    ? "border-[rgba(157,80,187,0.55)] bg-[rgba(157,80,187,0.14)]"
                    : "border-[var(--line)] bg-black/20"
                }`}
              >
                <span className="inline-flex rounded-full border border-[rgba(157,80,187,0.45)] bg-[rgba(157,80,187,0.12)] px-2 py-0.5 text-xs text-[#C090E8]">
                  Autónomo
                </span>
                <p className="mt-1 text-xs text-[var(--muted)]">Gestiona su propio portfolio.</p>
              </button>

              <button
                type="button"
                onClick={() => setRole("admin")}
                className={`rounded-xl border px-3 py-2 text-left transition ${
                  role === "admin"
                    ? "border-[rgba(160,210,255,0.45)] bg-[rgba(160,210,255,0.10)]"
                    : "border-[var(--line)] bg-black/20"
                }`}
              >
                <span className="inline-flex rounded-full border border-[rgba(160,210,255,0.45)] bg-[rgba(160,210,255,0.10)] px-2 py-0.5 text-xs text-[#A0D2FF]">
                  Gestor
                </span>
                <p className="mt-1 text-xs text-[var(--muted)]">Gestiona portfolios de clientes.</p>
              </button>
            </div>
          </div>

          {role === "cliente" ? (
            <div className="mt-5 rounded-xl border border-[var(--line)] bg-black/20 p-3">
              <p className="text-sm font-medium">Asignación de gestor</p>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setClientAssignMode("later");
                    setClientManagerId("");
                  }}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${
                    clientAssignMode === "later"
                      ? "border-[rgba(157,80,187,0.45)] bg-[rgba(157,80,187,0.12)] text-[#C090E8]"
                      : "border-[var(--line)] bg-black/20 text-[var(--muted)]"
                  }`}
                >
                  Crear cliente ahora y asignar gestor después
                </button>
                <button
                  type="button"
                  onClick={() => setClientAssignMode("now")}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${
                    clientAssignMode === "now"
                      ? "border-[rgba(160,210,255,0.45)] bg-[rgba(160,210,255,0.10)] text-[#A0D2FF]"
                      : "border-[var(--line)] bg-black/20 text-[var(--muted)]"
                  }`}
                >
                  Crear cliente y asignar gestor ahora
                </button>
              </div>

              {clientAssignMode === "now" ? (
                <label className="mt-3 block text-sm">
                  <span className="mb-1 block text-[var(--muted)]">Selecciona gestor</span>
                  <select
                    value={clientManagerId}
                    onChange={(event) => setClientManagerId(event.target.value)}
                    className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 text-sm"
                  >
                    <option value="">Seleccionar gestor</option>
                    {managerOptions.map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}

          {role === "admin" ? (
            <div className="mt-5 rounded-xl border border-[var(--line)] bg-black/20 p-3">
              <label className="text-sm">
                <span className="mb-1 block text-[var(--muted)]">Portfolio a gestionar (opcional)</span>
                <select
                  value={managerPortfolioId}
                  onChange={(event) => setManagerPortfolioId(event.target.value)}
                  className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2 text-sm"
                >
                  <option value="">Sin portfolio asignado</option>
                  {availablePortfolios.map((portfolio) => (
                    <option key={portfolio.id} value={portfolio.id}>
                      {portfolio.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {successMessage ? (
            <p className="mt-4 rounded-lg border border-[rgba(16,185,129,0.45)] bg-[rgba(16,185,129,0.12)] px-3 py-2 text-sm text-emerald-300">
              {successMessage}
            </p>
          ) : null}

          {errorMessage ? (
            <p className="mt-4 rounded-lg border border-[rgba(248,113,113,0.5)] bg-[rgba(248,113,113,0.14)] px-3 py-2 text-sm text-rose-300">
              {errorMessage}
            </p>
          ) : null}

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => {
                void handleCreateUser();
              }}
              disabled={isSubmitting}
              className="btn-secondary disabled:opacity-60"
            >
              {isSubmitting ? "Creando..." : "Crear usuario"}
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}
