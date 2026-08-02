"use client";

import { notFound } from "next/navigation";
import { useState } from "react";
import { TopNav } from "@/components/shell/TopNav";
import { PageShell } from "@/components/shell/PageShell";
import { UserEditPanel } from "@/components/admin/UserEditPanel";

/**
 * Banco de pruebas de Editar usuario en su variante GESTOR, la única que enseña
 * el bloque «Clientes del gestor».
 *
 * Va en su propia ruta y no dentro de `/preview/editar-usuario` para que aquella
 * siga siendo comparable pixel a pixel con web/design/08-editar-usuario.html,
 * que dibuja a una clienta y no tiene este bloque.
 *
 * Aquí añadir y quitar sí mueven la lista —en memoria, sin tocar nada— porque lo
 * que hay que poder comprobar es justamente eso: que el desplegable se llena,
 * que la fila desaparece al quitarla y que la cartera liberada vuelve a estar
 * disponible.
 */

const CLIENTS = [
  { portfolioId: "p-elena", ownerLabel: "Elena Cortés", portfolioName: "Portfolio de Elena Cortés" },
  { portfolioId: "p-nuria", ownerLabel: "Nuria Bastida", portfolioName: "Cartera conservadora" },
  { portfolioId: "p-ismael", ownerLabel: "Ismael Quintanilla", portfolioName: "Portfolio principal" },
];

const POOL = [
  { portfolioId: "p-teo", label: "Teo Aramburu · Portfolio de Teo Aramburu" },
  { portfolioId: "p-lucia", label: "Lucía Ferrán · Cartera de largo plazo" },
];

export default function PreviewEditarGestor() {
  const [clients, setClients] = useState(CLIENTS);
  const [pool, setPool] = useState(POOL);

  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="pcx-screen" style={{ minHeight: "100vh" }}>
      <TopNav section="Administración" operatorName="Álvaro Ruiz" />

      <PageShell>
        <UserEditPanel
          user={{
            id: "u-carlos",
            name: "Álvaro Ruiz",
            email: "a.ruiz@ejemplo.invalid",
            role: "admin",
            createdAt: "2026-01-19",
          }}
          managerOptions={[{ id: "u-carlos", label: "Álvaro Ruiz" }]}
          portfolios={[]}
          managedClients={{
            clients,
            assignable: pool,
            onAdd: (portfolioId) => {
              const option = pool.find((item) => item.portfolioId === portfolioId);
              if (!option) return;
              const [ownerLabel, portfolioName] = option.label.split(" · ");
              setClients((prev) => [
                ...prev,
                { portfolioId, ownerLabel: ownerLabel ?? "", portfolioName: portfolioName ?? "" },
              ]);
              setPool((prev) => prev.filter((item) => item.portfolioId !== portfolioId));
            },
            onRemove: (portfolioId) => {
              const gone = clients.find((item) => item.portfolioId === portfolioId);
              if (!gone) return;
              setClients((prev) => prev.filter((item) => item.portfolioId !== portfolioId));
              setPool((prev) => [
                ...prev,
                { portfolioId, label: `${gone.ownerLabel} · ${gone.portfolioName}` },
              ]);
            },
          }}
          backHref="/preview/administracion"
          onSave={() => {}}
          onDelete={() => {}}
        />
      </PageShell>
    </div>
  );
}
