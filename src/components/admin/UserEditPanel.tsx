"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { longDate } from "@/lib/format/figures";
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

/** Lo que el formulario devuelve al guardar. */
export interface UserEditValues {
  name: string;
  email: string;
  role: AdminRole;
  /** Gestor asignado a la cartera del cliente. Cadena vacía = sin asignar.
   *  Solo tiene sentido cuando el rol es `cliente` y el usuario tiene cartera. */
  managerId: string;
}

export interface UserEditPanelProps {
  user: AdminUserDetail;
  /** Gestores elegibles. */
  managerOptions: Array<{ id: string; label: string }>;
  /** Cartera del usuario, para asignarle gestor. Sin cartera, el bloque no sale:
   *  un desplegable que no gobierna nada es peor que ninguno. */
  portfolio?: { id: string; name: string; managerId: string | null } | null;
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
  portfolio,
  backHref,
  onSave,
  onDelete,
  saving = false,
  deleting = false,
  error,
  deletionNote = "Se eliminará el acceso y se desvinculará su cartera. Las operaciones registradas se conservan.",
}: UserEditPanelProps) {
  const label = user.name.trim() || user.email;

  // El estado inicial se fija al montar. La ruta real debe montar este panel con
  // `key={user.id}` para que cambiar de usuario reinicie la comparación.
  const initial = useMemo<UserEditValues>(
    () => ({
      name: user.name,
      email: user.email,
      role: user.role,
      managerId: portfolio?.managerId ?? "",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [values, setValues] = useState<UserEditValues>(initial);
  const [asking, setAsking] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const set = <K extends keyof UserEditValues>(key: K, value: UserEditValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const showManager = values.role === "cliente" && Boolean(portfolio);

  // Lo que hace que el botón se encienda. El gestor solo cuenta si su bloque
  // está a la vista: si el rol ya no es cliente, ese campo no se va a guardar.
  const dirty =
    values.name !== initial.name ||
    values.email !== initial.email ||
    values.role !== initial.role ||
    (showManager && values.managerId !== initial.managerId);

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

        {showManager && portfolio ? (
          // Separado por un filo: es lo único del formulario que no habla del
          // usuario sino de su cartera, y aparece y desaparece según el rol.
          <div style={{ marginTop: 32, paddingTop: 28, borderTop: "1px solid var(--line)" }}>
            <SelectField
              id="pcx-user-manager"
              label="Gestor asignado"
              note={`Cartera: ${portfolio.name}`}
              value={values.managerId}
              onChange={(v) => set("managerId", v)}
              options={[
                { value: "", label: "Sin asignar" },
                ...managerOptions.map((m) => ({ value: m.id, label: m.label })),
              ]}
            />
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
