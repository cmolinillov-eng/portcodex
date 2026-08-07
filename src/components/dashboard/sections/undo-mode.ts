/**
 * Qué operaciones del historial se pueden deshacer y con qué modo.
 *
 * Vivía dentro de `RecentActivity.tsx`, un componente cliente con JSX: para
 * probarla había que renderizar la tabla entera, así que en la práctica no se
 * probaba. Se extrae aquí SIN tocar la lógica —el cuerpo es el mismo, línea por
 * línea— para que `tests/math/financial-core.test.mjs` importe esta decisión y
 * no una copia suya. `RecentActivity.tsx` la reexporta, así que quien la
 * importaba de allí sigue funcionando igual.
 *
 * El tipo se importa con `import type`: se borra al compilar, de modo que este
 * módulo no arrastra `get-dashboard-data` (ni Supabase) al ejecutarse.
 */
import type { DashboardData } from "@/lib/dashboard/get-dashboard-data";

export type RecentActivityEntry = DashboardData["recentActivity"][number];

/**
 * Decide si una fila de actividad se puede deshacer y con qué modo:
 *  - "restore": un borrado de posición (snapshot position_closed con reason "deleted").
 *  - "operation": cualquier operación de usuario con grupo (añadir, rebalanceo,
 *    harvest, edición). Se excluyen los cierres automáticos (no son acciones del gestor).
 */
export function undoModeFor(item: RecentActivityEntry): "operation" | "restore" | null {
  if (item.type === "position_closed") {
    return item.reason === "deleted" ? "restore" : null;
  }
  if (item.reason === "auto_closed") return null;
  if (item.operationGroupId) return "operation";
  // Caso legacy sin grupo: permitir deshacer una alta simple por posición… no es
  // seguro sin grupo, así que solo ofrecemos undo cuando hay operationGroupId.
  return null;
}
