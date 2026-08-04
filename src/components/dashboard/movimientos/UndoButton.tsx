"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * «Deshacer» de una fila del extracto.
 *
 * Es una isla de cliente DENTRO de una tabla que se pinta en el servidor: la
 * alternativa —pasarle un `onUndo` a `MovementsTable`— obligaría a convertir la
 * tabla entera en componente de cliente y a mandar al navegador las trece
 * columnas de cada operación solo para que un botón pueda llamar a una API.
 *
 * Solo se monta cuando la acción PUEDE ejecutarse: perfil con permiso de operar
 * y operación con `operation_group_id`. Un enlace que no hace nada es peor que
 * ninguno, y ese era exactamente el estado anterior de esta columna.
 *
 * Deshacer borra en blando TODAS las filas del grupo (una permuta son dos), así
 * que la confirmación lo dice antes de tocar nada.
 */
export function UndoButton({
  portfolioId,
  operationGroupId,
  description,
}: {
  portfolioId: string;
  /** Lo que agrupa las filas de una misma operación. Sin él no hay qué deshacer. */
  operationGroupId: string;
  /** «Retirada de 0,03 SOL». Solo para el texto de la confirmación. */
  description: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sending, setSending] = useState(false);

  async function undo() {
    const confirmed = window.confirm(
      `Vas a deshacer esta operación (${description}).\n\n` +
        "Se deshacen todas las filas registradas en la misma operación.\n\n¿Quieres continuar?",
    );
    if (!confirmed) return;

    setSending(true);
    try {
      const response = await fetch("/api/transactions/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolioId, mode: "operation", operationGroupId }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "No se pudo deshacer la operación.");
      // `router.refresh()` y no un borrado optimista: el histórico lo recalcula
      // el servidor (FIFO, bases, clasificación fiscal) y media tabla cambia de
      // significado al quitar una operación del medio.
      startTransition(() => router.refresh());
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Error desconocido al deshacer.");
    } finally {
      setSending(false);
    }
  }

  const busy = sending || pending;

  return (
    <button
      type="button"
      onClick={undo}
      disabled={busy}
      // Solo al pasar por encima: en reposo, trece enlaces repetidos serían la
      // columna más llamativa de la tabla. Sigue siendo alcanzable con el
      // tabulador, y al recibir el foco se muestra.
      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-100"
      style={{
        fontSize: "var(--text-meta)",
        color: "var(--faint)",
        cursor: busy ? "progress" : "pointer",
      }}
    >
      {busy ? "Deshaciendo…" : "Deshacer"}
    </button>
  );
}
