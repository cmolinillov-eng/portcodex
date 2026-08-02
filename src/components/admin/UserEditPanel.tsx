"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { longDate, plural } from "@/lib/format/figures";
import { DangerButton, PrimaryButton, QuietButton, SelectField, TextField } from "./controls";
import { ROLE_LABEL, ROLE_ORDER, type AdminRole } from "./roles";

/**
 * Editar usuario.
 *
 * **Columna única**, no formulario a dos columnas. Son cuatro campos: repartirlos
 * en dos columnas obliga a leer en zigzag y hace creer que las dos mitades son
 * cosas distintas. En una sola columna el orden de lectura ES el orden de los
 * campos.
 *
 * **«Guardar cambios» nace apagado y solo se enciende cuando algo cambia de
 * verdad** —se compara el formulario contra los valores iniciales, no contra
 * «has tocado una tecla». Escribir una letra y borrarla vuelve a apagarlo. Un
 * botón siempre encendido no distingue entre guardar y no hacer nada, y en una
 * pantalla de permisos eso importa.
 *
 * **La zona de riesgo va separada** y su botón lleva FILO rojo, no relleno. Un
 * rectángulo rojo macizo pesa más que el botón de guardar y termina invitando a
 * pulsarlo; el filo avisa sin llamar. Y siempre se dice qué se conserva: quien
 * borra a un cliente necesita saber que su historial de operaciones no se va con
 * él.
 *
 * **La cartera de clientes de un gestor NO va en el formulario.** Añadir o
 * quitar un cliente escribe en el momento —no espera a «Guardar cambios»—, así
 * que vive en su propio bloque, detrás de un filo. Mezclar en un mismo botón
 * cosas que se guardan y cosas que ya están guardadas es lo que hace dudar de
 * si algo se aplicó.
 *
 * Medidas tomadas de web/design/08-editar-usuario.html.
 */

/** Ancho de la columna, de la maqueta. Un campo más ancho no se lee mejor: pasado
 *  cierto punto el ojo pierde el principio de la línea al llegar al final. */
const COLUMN_WIDTH = 480;

export interface AdminUserDetail {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  /** ISO. */
  createdAt: string | null;
}

/** Cartera propia del usuario, con el gestor que la lleva. */
export interface OwnedPortfolio {
  id: string;
  name: string;
  /** `null` = sin asignar. */
  managerId: string | null;
}

/** Lo que el formulario devuelve al guardar. */
export interface UserEditValues {
  name: string;
  email: string;
  role: AdminRole;
  /**
   * Gestor de cada cartera propia: `id de cartera → id de gestor`, con cadena
   * vacía para «sin asignar».
   *
   * Es un mapa y no un campo suelto porque un cliente puede tener más de una
   * cartera y cada una lleva su gestor. Con una sola —el caso normal— se pinta
   * exactamente el desplegable único de la maqueta.
   */
  managerByPortfolio: Record<string, string>;
}

/**
 * Bloque «Clientes del gestor».
 *
 * Va aparte del formulario porque escribe en el momento. Todo lo que necesita
 * viaja junto en un solo objeto para que la pantalla no tenga que decidir si
 * seis props sueltas van o no van juntas.
 */
export interface ManagedClientsBlock {
  /** Clientes que hoy lleva este gestor. Uno por cartera gestionada. */
  clients: Array<{ portfolioId: string; ownerLabel: string; portfolioName: string }>;
  /** Carteras de cliente que hoy no tiene nadie, y que por tanto se le pueden dar. */
  assignable: Array<{ portfolioId: string; label: string }>;
  onAdd: (portfolioId: string) => void;
  onRemove: (portfolioId: string) => void;
  /** Hay una asignación en vuelo: se apagan los controles del bloque. */
  busy?: boolean;
  error?: string | null;
}

export interface UserEditPanelProps {
  user: AdminUserDetail;
  /** Gestores elegibles. */
  managerOptions: Array<{ id: string; label: string }>;
  /** Carteras del usuario, para asignarles gestor. Sin carteras el bloque no
   *  sale: un desplegable que no gobierna nada es peor que ninguno. */
  portfolios?: OwnedPortfolio[];
  /**
   * Clientes de este gestor. Se pasa SOLO cuando el rol ya guardado es gestor:
   * asignarle clientes a quien todavía no lo es lo rechaza el servidor, y un
   * control que siempre falla es peor que uno que no está.
   */
  managedClients?: ManagedClientsBlock | null;
  /** Vuelta al listado. */
  backHref: string;
  onSave?: (values: UserEditValues) => void;
  onDelete?: () => void;
  saving?: boolean;
  deleting?: boolean;
  /** Error de la última operación, para pintarlo junto a los botones. */
  error?: string | null;
  /** Qué pasa —y qué NO pasa— al borrar. Se dice SIEMPRE. */
  deletionNote?: string;
}

export function UserEditPanel({
  user,
  managerOptions,
  portfolios = [],
  managedClients,
  backHref,
  onSave,
  onDelete,
  saving = false,
  deleting = false,
  error,
  deletionNote = "Se eliminará el acceso y se desvinculará su cartera. Las operaciones registradas se conservan.",
}: UserEditPanelProps) {
  const label = user.name.trim() || user.email;

  // El estado inicial se fija al montar, así que quien monte este panel tiene
  // que remontarlo cuando cambien los datos guardados: con `key={user.id}` basta
  // para no comparar contra el usuario anterior al cambiar de ficha, pero
  // después de GUARDAR haría falta remontar también, o el botón se quedaría
  // encendido comparando contra valores viejos. `UserEditScreen` lo resuelve con
  // una huella de los datos del servidor.
  const initial = useMemo<UserEditValues>(
    () => ({
      name: user.name,
      email: user.email,
      role: user.role,
      managerByPortfolio: Object.fromEntries(
        portfolios.map((p) => [p.id, p.managerId ?? ""]),
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [values, setValues] = useState<UserEditValues>(initial);
  const [asking, setAsking] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const set = <K extends keyof UserEditValues>(key: K, value: UserEditValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const setManager = (portfolioId: string, managerId: string) =>
    setValues((prev) => ({
      ...prev,
      managerByPortfolio: { ...prev.managerByPortfolio, [portfolioId]: managerId },
    }));

  const showManager = values.role === "cliente" && portfolios.length > 0;

  // Lo que hace que el botón se encienda. El gestor solo cuenta si su bloque
  // está a la vista: si el rol ya no es cliente, ese campo no se va a guardar.
  const dirty =
    values.name !== initial.name ||
    values.email !== initial.email ||
    values.role !== initial.role ||
    (showManager &&
      portfolios.some(
        (p) => (values.managerByPortfolio[p.id] ?? "") !== (initial.managerByPortfolio[p.id] ?? ""),
      ));

  const confirmReady = confirmText.trim() === label;

  return (
    <>
      <div className="flex items-baseline" style={{ gap: 20, paddingTop: 40 }}>
        <nav
          className="flex items-baseline"
          style={{ gap: 8, fontSize: "var(--text-label)", color: "var(--faint)" }}
          aria-label="Ruta de navegación"
        >
          <span>Administración</span>
          <span aria-hidden="true">›</span>
          <Link href={backHref} style={{ color: "var(--faint)" }}>
            Usuarios
          </Link>
          <span aria-hidden="true">›</span>
          <span style={{ color: "var(--muted)" }}>{label}</span>
        </nav>
        <Link
          href={backHref}
          style={{ marginLeft: "auto", fontSize: "var(--text-body)", color: "var(--muted)" }}
        >
          Volver
        </Link>
      </div>

      <header style={{ marginTop: 26 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>
          {label}
        </h1>
        <div style={{ fontSize: "var(--text-label)", color: "var(--faint)", marginTop: 9 }}>
          {ROLE_LABEL[user.role]}
          {user.createdAt ? ` · alta el ${longDate(user.createdAt)}` : null}
        </div>
      </header>

      <form
        style={{ maxWidth: COLUMN_WIDTH, marginTop: 44 }}
        onSubmit={(event) => {
          event.preventDefault();
          if (dirty && !saving) onSave?.(values);
        }}
      >
        <TextField
          id="pcx-user-name"
          label="Nombre"
          value={values.name}
          onChange={(v) => set("name", v)}
          autoComplete="name"
        />

        <div style={{ marginTop: 20 }}>
          <TextField
            id="pcx-user-mail"
            label="Correo electrónico"
            type="email"
            value={values.email}
            onChange={(v) => set("email", v)}
            autoComplete="email"
          />
        </div>

        <div style={{ marginTop: 20 }}>
          <SelectField
            id="pcx-user-role"
            label="Rol"
            value={values.role}
            onChange={(v) => set("role", v as AdminRole)}
            options={ROLE_ORDER.map((role) => ({ value: role, label: ROLE_LABEL[role] }))}
          />
        </div>

        {showManager ? (
          // Separado por un filo: es lo único del formulario que no habla del
          // usuario sino de sus carteras, y aparece y desaparece según el rol.
          <div style={{ marginTop: 32, paddingTop: 28, borderTop: "1px solid var(--line)" }}>
            {portfolios.map((p, index) => (
              <div key={p.id} style={index === 0 ? undefined : { marginTop: 20 }}>
                <SelectField
                  id={`pcx-user-manager-${p.id}`}
                  label="Gestor asignado"
                  note={`Cartera: ${p.name}`}
                  value={values.managerByPortfolio[p.id] ?? ""}
                  onChange={(v) => setManager(p.id, v)}
                  options={[
                    { value: "", label: "Sin asignar" },
                    ...managerOptions.map((m) => ({ value: m.id, label: m.label })),
                  ]}
                />
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-center" style={{ gap: 22, marginTop: 34 }}>
          <PrimaryButton type="submit" disabled={!dirty || saving} padding="10px 18px">
            {saving ? "Guardando…" : "Guardar cambios"}
          </PrimaryButton>
          {dirty ? <QuietButton onClick={() => setValues(initial)}>Descartar</QuietButton> : null}
        </div>

        {error ? (
          /* `role="alert"`: un error de guardado tiene que anunciarse solo. Es
             lo que ya hacen PeriodPicker y AccessForm con el suyo. */
          <div
            role="alert"
            style={{ fontSize: "var(--text-label)", color: "var(--loss)", marginTop: 14 }}
          >
            {error}
          </div>
        ) : null}
      </form>

      {managedClients ? (
        <ManagedClients
          block={managedClients}
          width={COLUMN_WIDTH}
          /* El aviso solo aparece cuando de verdad estorba: se ha bajado el rol
             de un gestor que todavía lleva clientes. El servidor lo rechaza, y
             es mejor decirlo antes de pulsar que después de fallar. */
          roleWarning={
            values.role !== "admin" && initial.role === "admin" && managedClients.clients.length > 0
          }
        />
      ) : null}

      {onDelete ? (
        <section
          style={{
            maxWidth: COLUMN_WIDTH,
            marginTop: 72,
            paddingTop: 24,
            borderTop: "1px solid var(--line)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 500, color: "var(--foreground)" }}>
            Eliminar usuario
          </h2>
          {/* Qué se conserva va ANTES del botón, no en el diálogo de confirmación:
              se necesita para decidir si pulsarlo, no después de haberlo pulsado. */}
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-label)",
              color: "var(--muted)",
              marginTop: 9,
              lineHeight: 1.6,
              textWrap: "pretty",
            }}
          >
            {deletionNote}
          </p>

          {asking ? (
            <div
              style={{ marginTop: 22, paddingTop: 20, borderTop: "1px solid var(--line)" }}
            >
              {/* Teclear el nombre no es burocracia: es lo que impide borrar al
                  usuario equivocado por tener abierta la ficha de al lado. */}
              <TextField
                id="pcx-user-confirm"
                label={`Escribe «${label}» para confirmar`}
                value={confirmText}
                onChange={setConfirmText}
              />
              <div className="flex items-center" style={{ gap: 20, marginTop: 18 }}>
                <DangerButton disabled={!confirmReady || deleting} onClick={() => onDelete()}>
                  {deleting ? "Eliminando…" : "Eliminar usuario"}
                </DangerButton>
                <QuietButton
                  onClick={() => {
                    setAsking(false);
                    setConfirmText("");
                  }}
                >
                  Cancelar
                </QuietButton>
              </div>
            </div>
          ) : (
            <div className="flex" style={{ marginTop: 24 }}>
              <div style={{ marginLeft: "auto" }}>
                <DangerButton
                  onClick={() => {
                    setAsking(true);
                    setConfirmText("");
                  }}
                >
                  Eliminar usuario
                </DangerButton>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}

/**
 * Clientes que lleva un gestor.
 *
 * **Filas con filo, sin tarjetas.** Es el mismo lenguaje que las tablas del
 * producto: nombre y cartera a la izquierda, la acción a la derecha. Meter cada
 * cliente en una caja con fondo propio los convertiría en seis objetos sueltos
 * en vez de en una lista.
 *
 * **Añadir escribe en el momento**, sin pasar por «Guardar cambios»: es la
 * relación entre dos usuarios, no un campo del perfil de este.
 */
function ManagedClients({
  block,
  width,
  roleWarning,
}: {
  block: ManagedClientsBlock;
  width: number;
  roleWarning: boolean;
}) {
  const { clients, assignable, onAdd, onRemove, busy = false, error } = block;
  const [pick, setPick] = useState("");

  // Si la cartera elegida ya no está libre —porque acaba de asignarse— el
  // desplegable se vacía solo. Así no queda señalando una opción que ya no
  // existe después de añadirla.
  const picked = assignable.some((option) => option.portfolioId === pick) ? pick : "";

  return (
    <section
      style={{ maxWidth: width, marginTop: 56, paddingTop: 24, borderTop: "1px solid var(--line)" }}
    >
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 500, color: "var(--foreground)" }}>
        Clientes del gestor
      </h2>
      <p
        style={{
          margin: 0,
          fontSize: "var(--text-label)",
          color: "var(--faint)",
          marginTop: 9,
          textWrap: "pretty",
        }}
      >
        {clients.length === 0
          ? "No lleva ningún cliente todavía."
          : `Lleva ${plural(clients.length, "cliente", "clientes")}.`}
      </p>

      {roleWarning ? (
        <p
          style={{
            margin: 0,
            fontSize: "var(--text-label)",
            color: "var(--warn)",
            marginTop: 10,
            textWrap: "pretty",
          }}
        >
          Un gestor con clientes no puede cambiar de rol. Quítale antes los que lleva.
        </p>
      ) : null}

      {clients.length > 0 ? (
        <div style={{ marginTop: 18, borderBottom: "1px solid var(--line)" }}>
          {clients.map((client) => (
            <div
              key={client.portfolioId}
              className="flex items-center"
              style={{
                gap: 16,
                paddingTop: 13,
                paddingBottom: 13,
                borderTop: "1px solid var(--line)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  title={client.ownerLabel}
                  style={{
                    fontSize: "var(--text-body)",
                    color: "var(--foreground)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {client.ownerLabel}
                </div>
                {/* La cartera va en segunda línea y en menor: identifica la fila
                    cuando un cliente tiene más de una, y estorba cuando no. */}
                <div
                  title={client.portfolioName}
                  style={{
                    fontSize: "var(--text-meta)",
                    color: "var(--faint)",
                    marginTop: 3,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {client.portfolioName}
                </div>
              </div>
              <div style={{ marginLeft: "auto" }}>
                <QuietButton
                  tone="danger"
                  disabled={busy}
                  ariaLabel={`Quitar a ${client.ownerLabel} de este gestor`}
                  onClick={() => onRemove(client.portfolioId)}
                >
                  Quitar cliente
                </QuietButton>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {assignable.length === 0 ? (
        /* Una línea, no un desplegable vacío: un control sin opciones obliga a
           abrirlo para descubrir que no hay nada dentro. */
        <p
          style={{
            margin: 0,
            fontSize: "var(--text-label)",
            color: "var(--faint)",
            marginTop: 20,
          }}
        >
          No hay clientes sin gestor a los que asignarle.
        </p>
      ) : (
        <div style={{ marginTop: 24 }}>
          <SelectField
            id="pcx-add-client"
            label="Añadir cliente"
            value={picked}
            onChange={setPick}
            options={[
              { value: "", label: "Selecciona un cliente" },
              ...assignable.map((option) => ({
                value: option.portfolioId,
                label: option.label,
              })),
            ]}
          />
          <div className="flex" style={{ marginTop: 16 }}>
            <PrimaryButton disabled={!picked || busy} onClick={() => onAdd(picked)}>
              {busy ? "Guardando…" : "Añadir cliente"}
            </PrimaryButton>
          </div>
        </div>
      )}

      {error ? (
        <div
          role="alert"
          style={{ fontSize: "var(--text-label)", color: "var(--loss)", marginTop: 14 }}
        >
          {error}
        </div>
      ) : null}
    </section>
  );
}
