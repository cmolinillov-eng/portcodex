/**
 * Roles reales del producto, con su nombre en pantalla.
 *
 * La base de datos guarda `admin | cliente | autonomo`; el cliente los llama
 * Gestor, Cliente y Autónomo. La traducción vive AQUÍ y no en cada componente
 * para que Administración y Editar usuario no puedan discrepar.
 */

export type AdminRole = "admin" | "cliente" | "autonomo";

/** Orden de presentación: los gestores van primero. */
export const ROLE_ORDER: readonly AdminRole[] = ["admin", "cliente", "autonomo"];

export const ROLE_LABEL: Record<AdminRole, string> = {
  admin: "Gestor",
  cliente: "Cliente",
  autonomo: "Autónomo",
};

/** Singular y plural para las notas de contexto («1 gestor · 5 clientes»). */
export const ROLE_NOUN: Record<AdminRole, { one: string; many: string }> = {
  admin: { one: "gestor", many: "gestores" },
  cliente: { one: "cliente", many: "clientes" },
  autonomo: { one: "autónomo", many: "autónomos" },
};

/** Etiqueta de la pestaña de filtro. */
export const ROLE_TAB_LABEL: Record<AdminRole, string> = {
  admin: "Gestores",
  cliente: "Clientes",
  autonomo: "Autónomos",
};
