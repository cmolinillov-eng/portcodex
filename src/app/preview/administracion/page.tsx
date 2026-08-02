"use client";

import { notFound } from "next/navigation";
import { TopNav } from "@/components/shell/TopNav";
import { PageShell, DataProvenance } from "@/components/shell/PageShell";
import { UsersDirectory, type AdminUserSummary } from "@/components/admin/UsersDirectory";

/**
 * Banco de pruebas de Administración, con los datos exactos de
 * web/design/07-administracion.html. Nunca se sirve en producción.
 */

const USERS: AdminUserSummary[] = [
  {
    id: "u-carlos",
    name: "Álvaro Ruiz",
    email: "a.ruiz@ejemplo.invalid",
    role: "admin",
    portfolioCount: 5,
    createdAt: "2026-02-21",
  },
  {
    id: "u-manu",
    name: "Nuria Peña",
    email: "n.pena@ejemplo.invalid",
    role: "cliente",
    portfolioCount: 1,
    createdAt: "2026-07-07",
  },
  {
    id: "u-fita",
    name: "Delta Patrimonio",
    email: "delta@ejemplo.invalid",
    role: "cliente",
    portfolioCount: 1,
    createdAt: "2026-04-18",
  },
  {
    id: "u-mario",
    name: "Jorge Salas",
    email: "j.salas@ejemplo.invalid",
    role: "cliente",
    portfolioCount: 1,
    createdAt: "2026-03-14",
  },
  {
    id: "u-mfita",
    name: "Elena Cortés",
    email: "e.cortes@ejemplo.invalid",
    role: "cliente",
    portfolioCount: 1,
    createdAt: "2026-03-07",
  },
  {
    id: "u-pablo",
    name: "Iván Losada",
    email: "i.losada@ejemplo.invalid",
    role: "cliente",
    portfolioCount: 1,
    createdAt: "2026-03-03",
  },
];

export default function PreviewAdministracion() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="pcx-screen" style={{ minHeight: "100vh" }}>
      <TopNav section="Administración" operatorName="Álvaro Ruiz" />

      <PageShell>
        <UsersDirectory
          users={USERS}
          userHrefPattern="/preview/editar-usuario"
          createUserHref="/preview/administracion"
        />

        <DataProvenance>
          Los gestores se listan primero. El rol se modifica en la ficha de cada usuario.
        </DataProvenance>
      </PageShell>
    </div>
  );
}
