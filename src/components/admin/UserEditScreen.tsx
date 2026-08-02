"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  UserEditPanel,
  type AdminUserDetail,
  type OwnedPortfolio,
  type UserEditValues,
} from "./UserEditPanel";

/**
 * Editar usuario — la parte que habla con el servidor.
 *
 * `UserEditPanel` es una pantalla: pinta y avisa de lo que el usuario decide.
 * Quién llama a qué endpoint vive aquí. La separación no es ceremonia: la ruta
 * real es un componente de SERVIDOR y **no puede pasarle funciones** a un
 * componente de cliente —React no las serializa y la página revienta entera en
 * producción—, así que los manejadores tienen que nacer ya en cliente.
 *
 * Los endpoints son los mismos que usaba el formulario anterior y con el mismo
 * contrato: `/api/admin/users` para el perfil y `/api/admin/portfolio-managers`
 * para las asignaciones. Aquí no se ha tocado nada del servidor.
 */

export interface ManagedClientRow {
  portfolioId: string;
  ownerLabel: string;
  portfolioName: string;
}

export interface AssignableClientRow {
  portfolioId: string;
  label: string;
}

export interface UserEditScreenProps {
  user: AdminUserDetail;
  managerOptions: Array<{ id: string; label: string }>;
  portfolios: OwnedPortfolio[];
  /** Clientes que YA lleva. Se pasa solo si el rol guardado es gestor. */
  managedClients?: ManagedClientRow[] | null;
  /** Carteras de cliente hoy sin gestor. */
  assignableClients?: AssignableClientRow[] | null;
  backHref: string;
}

async function callJson(url: string, method: "PATCH" | "DELETE", body: unknown): Promise<void> {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  // El cuerpo puede no ser JSON si algo se cae antes de llegar a la ruta; en ese
  // caso vale más el código de estado que un error de parseo sin sentido.
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "No se pudo completar la operación.");
  }
}

export function UserEditScreen({
  user,
  managerOptions,
  portfolios,
  managedClients,
  assignableClients,
  backHref,
}: UserEditScreenProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientsBusy, setClientsBusy] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);

  /**
   * La huella de lo que HAY GUARDADO.
   *
   * `UserEditPanel` fija sus valores iniciales al montar, así que necesita
   * remontarse cuando el servidor devuelve datos distintos: si no, después de
   * guardar seguiría comparando contra los valores viejos y «Guardar cambios»
   * se quedaría encendido para siempre.
   *
   * Va la huella entera y no solo `user.id` a propósito. Al terminar el guardado
   * llamamos a `router.refresh()`, que es asíncrono: remontar en ese momento
   * volvería a leer los datos ANTIGUOS. Con la huella, el remonte ocurre justo
   * cuando llegan los nuevos, ni antes ni después.
   */
  const savedKey = [
    user.id,
    user.name,
    user.email,
    user.role,
    portfolios.map((p) => `${p.id}:${p.managerId ?? ""}`).join(","),
  ].join("|");

  async function save(values: UserEditValues): Promise<void> {
    setError(null);
    setSaving(true);
    try {
      // Solo los campos que cambiaron. Reenviar el nombre tal cual estaba haría
      // fallar con «el nombre no puede quedar vacío» a los perfiles antiguos que
      // nunca tuvieron nombre, aunque no se estuviera tocando ese campo.
      const profilePatch: Record<string, string> = {};
      if (values.name !== user.name) profilePatch.fullName = values.name.trim();
      if (values.email !== user.email) profilePatch.email = values.email.trim();
      if (values.role !== user.role) profilePatch.role = values.role;

      if (Object.prototype.hasOwnProperty.call(profilePatch, "fullName") && !profilePatch.fullName) {
        throw new Error("El nombre no puede quedar vacío.");
      }

      if (Object.keys(profilePatch).length > 0) {
        await callJson("/api/admin/users", "PATCH", { userId: user.id, ...profilePatch });
      }

      // El rol va PRIMERO y las asignaciones después: el servidor solo acepta
      // gestor en una cartera cuyo propietario ya sea cliente. Si en el mismo
      // guardado se sube a alguien a cliente y se le da gestor, el orden es lo
      // que hace que la segunda llamada no rebote.
      if (values.role === "cliente") {
        for (const portfolio of portfolios) {
          const next = values.managerByPortfolio[portfolio.id] ?? "";
          if (next === (portfolio.managerId ?? "")) continue;
          await callJson("/api/admin/portfolio-managers", "PATCH", {
            portfolioId: portfolio.id,
            managerId: next || null,
          });
        }
      }

      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo actualizar el usuario.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(): Promise<void> {
    setError(null);
    setDeleting(true);
    try {
      await callJson("/api/admin/users", "DELETE", { userId: user.id });
      router.push(backHref);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar el usuario.");
      setDeleting(false);
    }
    // Si sale bien NO se apaga `deleting`: la navegación está en curso y volver
    // a encender el botón invitaría a pulsarlo otra vez sobre un usuario que ya
    // no existe.
  }

  async function assign(portfolioId: string, managerId: string | null): Promise<void> {
    setClientsError(null);
    setClientsBusy(true);
    try {
      await callJson("/api/admin/portfolio-managers", "PATCH", { portfolioId, managerId });
      router.refresh();
    } catch (cause) {
      setClientsError(
        cause instanceof Error ? cause.message : "No se pudo actualizar la asignación.",
      );
    } finally {
      setClientsBusy(false);
    }
  }

  return (
    <UserEditPanel
      key={savedKey}
      user={user}
      managerOptions={managerOptions}
      portfolios={portfolios}
      managedClients={
        managedClients
          ? {
              clients: managedClients,
              assignable: assignableClients ?? [],
              onAdd: (portfolioId) => void assign(portfolioId, user.id),
              onRemove: (portfolioId) => void assign(portfolioId, null),
              busy: clientsBusy,
              error: clientsError,
            }
          : null
      }
      backHref={backHref}
      onSave={(values) => void save(values)}
      onDelete={() => void remove()}
      saving={saving}
      deleting={deleting}
      error={error}
    />
  );
}
