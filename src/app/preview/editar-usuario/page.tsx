"use client";

import { notFound } from "next/navigation";
import { TopNav } from "@/components/shell/TopNav";
import { PageShell } from "@/components/shell/PageShell";
import { UserEditPanel } from "@/components/admin/UserEditPanel";

/**
 * Banco de pruebas de Editar usuario, con los datos exactos de
 * web/design/08-editar-usuario.html. Nunca se sirve en producción.
 *
 * Aquí `onSave` y `onDelete` no hacen nada: la pantalla se prueba por su
 * comportamiento —cuándo se enciende «Guardar cambios», cuándo se desbloquea el
 * borrado—, no por lo que escriba en la base de datos.
 */
export default function PreviewEditarUsuario() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="pcx-screen" style={{ minHeight: "100vh" }}>
      <TopNav section="Administración" operatorName="Álvaro Ruiz" />

      <PageShell>
        <UserEditPanel
          user={{
            id: "u-mfita",
            name: "Elena Cortés",
            email: "e.cortes@ejemplo.invalid",
            role: "cliente",
            createdAt: "2026-03-07",
          }}
          managerOptions={[{ id: "u-carlos", label: "Álvaro Ruiz" }]}
          portfolio={{
            id: "p-mfita",
            name: "Portfolio de Elena Cortés",
            managerId: "u-carlos",
          }}
          backHref="/preview/administracion"
          onSave={() => {}}
          onDelete={() => {}}
        />
      </PageShell>
    </div>
  );
}
