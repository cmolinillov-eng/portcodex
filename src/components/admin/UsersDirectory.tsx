"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable, DataRow, type Column } from "@/components/dashboard/DataTable";
import { longDate, plural } from "@/lib/format/figures";
import { PrimaryButton } from "./controls";
import { ROLE_LABEL, ROLE_NOUN, ROLE_ORDER, ROLE_TAB_LABEL, type AdminRole } from "./roles";

/**
 * Administración — listado de usuarios.
 *
 * Tres decisiones que se tomaron mirando la pantalla y que NO son negociables:
 *
 * 1. **El rol va como TEXTO, nunca como desplegable en la fila.** Un `<select>`
 *    por fila convierte «cambiar los permisos de alguien» en un clic accidental
 *    a un pixel de distancia de «abrir su ficha». Los permisos se cambian en la
 *    ficha, donde hay contexto y un botón de guardar que confirma la intención.
 * 2. **No hay columna de acciones: la fila entera es pulsable.** Un botón
 *    «Editar» repetido en las seis filas no informa de nada —dice lo mismo en
 *    todas— y se come una columna que sí podía llevar dato. La flecha aparece
 *    solo al apuntar, que es cuando hace falta saber que aquello se abre.
 *    La fila abre la CARTERA, que es a lo que se entra el 90 % de las veces;
 *    la ficha de edición cuelga de la barra de contexto de esa cartera.
 * 3. **Los gestores van primero.** Son los que administran al resto; enterrarlos
 *    por fecha de alta obliga a buscarlos.
 *
 * Medidas tomadas de web/design/07-administracion.html.
 */

export interface AdminUserSummary {
  id: string;
  /** Nombre completo. Si está vacío se cae al correo, que siempre existe. */
  name: string;
  email: string;
  role: AdminRole;
  /** Carteras que le cuentan: las que gestiona si es gestor, las suyas si no. */
  portfolioCount: number;
  /** ISO. `null` en perfiles antiguos sin fecha de alta. */
  createdAt: string | null;
}

/** Rejilla de la maqueta. Rol, Carteras, Alta y la flecha son de ancho FIJO:
 *  su contenido no crece («Gestor», «5 carteras», «21 feb 2026»), así que
 *  dejarlas elásticas solo les daría aire que hace falta en Nombre y Correo. */
const COLUMNS: Column[] = [
  { key: "name", label: "Usuario", width: 1.15, min: 120 },
  { key: "email", label: "Correo", width: 1.6, min: 160 },
  { key: "role", label: "Rol", fixed: 92, width: 0 },
  { key: "portfolios", label: "Carteras", fixed: 110, width: 0 },
  { key: "created", label: "Alta", fixed: 108, width: 0, align: "right" },
  { key: "open", label: "", fixed: 22, width: 0, align: "right" },
];

/** El de la maqueta. Con seis columnas y dos de ellas de texto largo, por debajo
 *  de 24 el correo llega a rozar el rol. */
const COLUMN_GAP = 24;

/** Lo que sobresale la fila por cada lado al iluminarse. Sin este sangrado el
 *  fondo del hover empieza justo en la primera letra y se lee como un subrayado
 *  de texto, no como una fila seleccionable. */
const ROW_BLEED = 12;

type TabId = "todos" | AdminRole;

export interface UsersDirectoryProps {
  users: AdminUserSummary[];
  /** Destino de cada fila: la ficha del usuario. */
  /**
   * Plantilla del enlace a la ficha, con `:id` donde va el identificador.
   *
   * Es una CADENA y no una función a propósito: este es un componente de
   * cliente, y una función no puede cruzar la frontera desde el servidor —
   * React no sabe serializarla y la página revienta entera en producción.
   */
  userHrefPattern: string;
  /** Alta de usuario. Es una navegación, así que se pinta como enlace. */
  createUserHref?: string;
  onCreateUser?: () => void;
}

export function UsersDirectory({
  users,
  userHrefPattern,
  createUserHref,
  onCreateUser,
}: UsersDirectoryProps) {
  const [tab, setTab] = useState<TabId>("todos");

  const { ordered, counts, presentRoles } = useMemo(() => {
    const rank = (role: AdminRole) => {
      const i = ROLE_ORDER.indexOf(role);
      return i === -1 ? ROLE_ORDER.length : i;
    };
    // `sort` es estable, así que dentro de cada rol se conserva el orden con el
    // que llegan —el de la consulta, por fecha de alta descendente.
    const ordered = [...users].sort((a, b) => rank(a.role) - rank(b.role));

    const counts = ORDERED_COUNTS(users);
    const presentRoles = ROLE_ORDER.filter((role) => counts[role] > 0);
    return { ordered, counts, presentRoles };
  }, [users]);

  // Sin filtros vacíos: si todos los usuarios comparten rol, las pestañas no
  // filtrarían nada y solo serían tres etiquetas que ocupan una línea.
  const showTabs = presentRoles.length > 1;
  const activeTab: TabId = showTabs ? tab : "todos";
  const rows = activeTab === "todos" ? ordered : ordered.filter((u) => u.role === activeTab);

  // «1 gestor · 5 clientes». Los roles sin nadie no se nombran: decir
  // «0 autónomos» es gastar una línea en informar de que no hay nada.
  const breakdown = presentRoles
    .map((role) => plural(counts[role], ROLE_NOUN[role].one, ROLE_NOUN[role].many))
    .join(" · ");

  return (
    <>
      <header className="flex items-end" style={{ gap: 32, paddingTop: 44 }}>
        <div>
          {/* `h1` de la pantalla: es lo que anuncia un lector al llegar. */}
          <h1
            style={{ margin: 0, fontSize: "var(--text-body)", fontWeight: 400, color: "var(--faint)" }}
          >
            Usuarios
          </h1>
          {/* La cifra de cabecera de una pantalla interna pesa MENOS que la de
              una de cliente: aquí no hay patrimonio que proteger, hay una lista
              que recorrer. */}
          <div
            className="tabular-nums"
            style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", marginTop: 12 }}
          >
            {plural(users.length, "usuario", "usuarios")}
          </div>
          <div style={{ fontSize: "var(--text-label)", color: "var(--faint)", marginTop: 8 }}>
            {breakdown}
          </div>
        </div>

        {createUserHref || onCreateUser ? (
          <div style={{ marginLeft: "auto" }}>
            <PrimaryButton href={createUserHref} onClick={onCreateUser}>
              Crear usuario
            </PrimaryButton>
          </div>
        ) : null}
      </header>

      {showTabs ? (
        <div className="flex items-center" style={{ gap: 24, marginTop: 32 }}>
          <Tab
            label={`Todos (${users.length})`}
            active={activeTab === "todos"}
            onClick={() => setTab("todos")}
          />
          {presentRoles.map((role) => (
            <Tab
              key={role}
              label={`${ROLE_TAB_LABEL[role]} (${counts[role]})`}
              active={activeTab === role}
              onClick={() => setTab(role)}
            />
          ))}
        </div>
      ) : null}

      <div style={{ marginTop: showTabs ? 2 : 26 }}>
        <DataTable columns={COLUMNS} gap={COLUMN_GAP}>
          {rows.map((user) => (
            <UserRow key={user.id} user={user} href={userHrefPattern.replace(":id", user.id)} />
          ))}
        </DataTable>
      </div>
    </>
  );
}

function ORDERED_COUNTS(users: AdminUserSummary[]): Record<AdminRole, number> {
  const counts = { admin: 0, cliente: 0, autonomo: 0 } as Record<AdminRole, number>;
  for (const user of users) {
    if (user.role in counts) counts[user.role] += 1;
  }
  return counts;
}

function Tab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        paddingBottom: 10,
        fontSize: "var(--text-body)",
        fontWeight: active ? 500 : 400,
        color: active ? "var(--foreground)" : "var(--muted)",
        // Por box-shadow y no por border, para que la pestaña activa no mida un
        // pixel más que las demás y el grupo no se desalinee al cambiar.
        boxShadow: active ? "inset 0 -2px 0 var(--accent-primary)" : "none",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function UserRow({ user, href }: { user: AdminUserSummary; href: string }) {
  // Se ilumina con el ratón Y con el teclado: si la fila entera es el control,
  // quien navega con tabulador necesita ver cuál tiene el foco.
  const [active, setActive] = useState(false);
  const label = user.name.trim() || user.email;

  return (
    <Link
      href={href}
      aria-label={`Abrir la cartera de ${label}`}
      style={{ display: "block", color: "inherit" }}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <DataRow
        columns={COLUMNS}
        align="center"
        style={{
          columnGap: COLUMN_GAP,
          paddingTop: 15,
          paddingBottom: 15,
          // El sangrado va a los DOS lados. La maqueta solo lo daba a la
          // izquierda, lo que encogía la rejilla de la fila 12 px respecto a la
          // de la cabecera y descuadraba «Alta» con su título.
          marginLeft: -ROW_BLEED,
          marginRight: -ROW_BLEED,
          paddingLeft: ROW_BLEED,
          paddingRight: ROW_BLEED,
          background: active ? "var(--void-surface)" : "transparent",
        }}
      >
        <Truncated tone="strong" weight={500}>
          {label}
        </Truncated>
        <Truncated>{user.email}</Truncated>
        {/* TEXTO, no chip ni desplegable. Un chip de color por fila convierte la
            tabla en un semáforo y el color deja de significar nada. */}
        <span style={{ fontSize: "var(--text-label)", color: "var(--muted)" }}>
          {ROLE_LABEL[user.role]}
        </span>
        <span
          className="tabular-nums"
          style={{ fontSize: "var(--text-label)", color: "var(--muted)", whiteSpace: "nowrap" }}
        >
          {plural(user.portfolioCount, "cartera", "carteras")}
        </span>
        <span
          className="tabular-nums"
          style={{
            fontSize: "var(--text-label)",
            color: "var(--faint)",
            textAlign: "right",
            whiteSpace: "nowrap",
          }}
        >
          {user.createdAt ? longDate(user.createdAt) : "—"}
        </span>
        <span
          aria-hidden="true"
          style={{
            fontSize: "var(--text-label)",
            color: "var(--faint)",
            textAlign: "right",
            opacity: active ? 1 : 0,
          }}
        >
          →
        </span>
      </DataRow>
    </Link>
  );
}

/** Nombre y correo se recortan con puntos suspensivos en vez de partirse: la
 *  fila mide una línea y un correo largo no puede convertirla en dos. */
function Truncated({
  children,
  tone = "muted",
  weight = 400,
}: {
  children: string;
  tone?: "strong" | "muted";
  weight?: 400 | 500;
}) {
  return (
    <span
      title={children}
      style={{
        display: "block",
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontSize: "var(--text-body)",
        fontWeight: weight,
        color: tone === "strong" ? "var(--foreground)" : "var(--muted)",
      }}
    >
      {children}
    </span>
  );
}
