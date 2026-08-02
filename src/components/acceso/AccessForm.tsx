"use client";

import Link from "next/link";
import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";

/**
 * Formulario de acceso.
 *
 * NO habla con Supabase ni con ninguna API: recibe `onSubmit`, `errorMessage` e
 * `isSubmitting` por props. Así la misma pieza sirve para la ruta real y para el
 * banco de pruebas, y los estados se pueden revisar sin credenciales.
 *
 * Tres decisiones que no son de estilo:
 *
 * 1. ETIQUETA ENCIMA del campo, nunca el placeholder haciendo de etiqueta. Un
 *    placeholder desaparece al escribir: quien vuelve a revisar el formulario ya
 *    no sabe qué había en cada casilla, y los gestores de contraseñas lo rellenan
 *    todo de golpe dejando dos campos idénticos y mudos.
 *
 * 2. UN SOLO MENSAJE DE ERROR, genérico. Decir «esa contraseña es incorrecta»
 *    le confirma a quien prueba correos que esa cuenta EXISTE, y convierte el
 *    formulario en un buscador de clientes. Por el mismo motivo el filo rojo se
 *    pinta en LOS DOS campos: marcar solo la contraseña delata igual, más
 *    discretamente. La maqueta lo dibuja solo en el campo de contraseña; aquí
 *    manda el principio, que es de seguridad y no de estilo.
 *
 * 3. SIN REGISTRO. PortCodex se contrata a través de un gestor patrimonial: un
 *    botón de «crear cuenta» prometería algo que el producto no hace.
 *
 * Medidas tomadas de web/design/06-acceso.html.
 */

/** El mensaje es SIEMPRE este, gane quien gane el fallo. */
export const GENERIC_ACCESS_ERROR =
  "No hemos podido verificar esos datos. Revisa el correo y la contraseña.";

export interface AccessCredentials {
  /** Correo o nombre de usuario: la ruta real acepta ambos. */
  identifier: string;
  password: string;
}

export interface AccessFormProps {
  /** Lo cablea la ruta real. Si devuelve una promesa y no se controla
   *  `isSubmitting`, el formulario se bloquea solo mientras dura. */
  onSubmit?: (credentials: AccessCredentials) => void | Promise<void>;
  /** Estado de envío CONTROLADO. Si se omite, el formulario lo gestiona él. */
  isSubmitting?: boolean;
  /** Mensaje de error ya decidido por quien llama. Debe ser genérico. */
  errorMessage?: string | null;
  /** Etiqueta del primer campo. La ruta real puede pedir «Usuario o correo». */
  identifierLabel?: string;
  identifierType?: "email" | "text";
  identifierAutoComplete?: string;
  /** Valor inicial, p. ej. tras volver de recuperar contraseña. */
  initialIdentifier?: string;
  forgotHref?: string;
  contactHref?: string;
  /** Se pinta bajo el botón: sirve para el paso de elección de perfil. */
  children?: ReactNode;
}

const FIELD_BASE: CSSProperties = {
  width: "100%",
  padding: "11px 13px",
  background: "var(--float)",
  borderRadius: "var(--radius-md)",
  color: "var(--foreground)",
  fontSize: "var(--text-body)",
  borderWidth: 1,
  borderStyle: "solid",
};

/** El foco se resuelve en el estilo EN LÍNEA, no con utilidades de Tailwind:
 *  `outline-none` deja `--tw-outline-style:none` y anula el `focus:outline-2`
 *  que debía dibujarlo, y el `border-color` en línea gana siempre a la clase.
 *  Medido en el navegador: con clases, el campo enfocado se quedaba sin filo. */
const FIELD_CLASS = "disabled:cursor-not-allowed";

const LABEL_STYLE: CSSProperties = {
  fontSize: "var(--text-label)",
  fontWeight: 400,
  color: "var(--muted)",
};

export function AccessForm({
  onSubmit,
  isSubmitting,
  errorMessage = null,
  identifierLabel = "Correo electrónico",
  identifierType = "email",
  identifierAutoComplete = "username",
  initialIdentifier = "",
  forgotHref = "#",
  contactHref = "#",
  children,
}: AccessFormProps) {
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState<"identifier" | "password" | null>(null);

  const submitting = isSubmitting ?? busy;
  const hasError = Boolean(errorMessage);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !onSubmit) return;

    // Solo se toma el control del estado si quien llama no lo controla ya.
    const owned = isSubmitting === undefined;
    if (owned) setBusy(true);
    try {
      await onSubmit({ identifier, password });
    } finally {
      if (owned) setBusy(false);
    }
  }

  // El foco manda sobre el error: mientras se corrige un campo, el filo azul
  // dice «estás aquí» y el mensaje rojo sigue abajo diciendo qué pasó.
  const fieldStyle = (field: "identifier" | "password"): CSSProperties => {
    const isFocused = focused === field;
    return {
      ...FIELD_BASE,
      borderColor: isFocused
        ? "var(--accent-hover)"
        : hasError
          ? "var(--loss)"
          : "var(--line-strong)",
      outline: isFocused ? "2px solid var(--accent-hover)" : "none",
      outlineOffset: 0,
    };
  };

  return (
    <form onSubmit={handleSubmit} noValidate style={{ width: "100%", maxWidth: 380 }}>
      {/* El titular de la página es el editorial de la izquierda; este es el
          título del bloque, así que h2. */}
      <h2
        style={{
          fontSize: 21,
          fontWeight: 600,
          letterSpacing: "-0.015em",
          lineHeight: 1.2,
          color: "var(--foreground)",
          margin: 0,
        }}
      >
        Acceder
      </h2>

      {/* Los campos se apagan durante el envío: la acción ya está en marcha y
          tocarlos no cambia nada. */}
      <div style={{ opacity: submitting ? 0.45 : 1 }}>
        <div style={{ marginTop: 30 }}>
          <label htmlFor="pcx-identificador" style={{ ...LABEL_STYLE, display: "block", marginBottom: 8 }}>
            {identifierLabel}
          </label>
          <input
            id="pcx-identificador"
            name="identifier"
            type={identifierType}
            autoComplete={identifierAutoComplete}
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            onFocus={() => setFocused("identifier")}
            onBlur={() => setFocused(null)}
            disabled={submitting}
            aria-invalid={hasError}
            aria-describedby={hasError ? "pcx-error" : undefined}
            className={FIELD_CLASS}
            style={fieldStyle("identifier")}
          />
        </div>

        <div style={{ marginTop: 18 }}>
          <div
            className="flex items-baseline justify-between"
            style={{ gap: 12, marginBottom: 8 }}
          >
            <label htmlFor="pcx-clave" style={LABEL_STYLE}>
              Contraseña
            </label>
            <button
              type="button"
              onClick={() => setReveal((value) => !value)}
              disabled={submitting}
              style={{
                fontSize: "var(--text-label)",
                fontWeight: 400,
                color: "var(--faint)",
                background: "none",
                border: "none",
                padding: 0,
              }}
            >
              {reveal ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          <input
            id="pcx-clave"
            name="password"
            type={reveal ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onFocus={() => setFocused("password")}
            onBlur={() => setFocused(null)}
            disabled={submitting}
            aria-invalid={hasError}
            aria-describedby={hasError ? "pcx-error" : undefined}
            className={FIELD_CLASS}
            style={fieldStyle("password")}
          />
        </div>
      </div>

      {hasError ? (
        <p
          id="pcx-error"
          role="alert"
          style={{
            fontSize: "var(--text-label)",
            color: "var(--loss)",
            marginTop: 9,
            marginBottom: 0,
            textWrap: "pretty",
          }}
        >
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className={submitting ? undefined : "hover:bg-[var(--accent-hover)]"}
        style={{
          width: "100%",
          marginTop: hasError ? 22 : 26,
          padding: "12px 18px",
          border: "none",
          borderRadius: "var(--radius-md)",
          fontSize: 14,
          fontWeight: 500,
          cursor: submitting ? "not-allowed" : "pointer",
          transition: "background var(--dur-fast) var(--ease)",
          background: submitting ? "var(--accent-busy)" : "var(--accent-primary)",
          color: submitting ? "var(--text-on-accent-busy)" : "var(--text-on-accent)",
        }}
      >
        {submitting ? "Accediendo…" : "Acceder"}
      </button>

      {children}

      <div style={{ textAlign: "center", marginTop: 18 }}>
        <a href={forgotHref} style={{ fontSize: "var(--text-body)", color: "var(--brand-soft)" }}>
          ¿Has olvidado la contraseña?
        </a>
      </div>

      {/* Sin registro: el alta la hace el gestor patrimonial. */}
      <div
        style={{
          marginTop: 34,
          paddingTop: 24,
          borderTop: "1px solid var(--line)",
        }}
      >
        <div style={{ fontSize: "var(--text-body)", fontWeight: 500, color: "var(--foreground)" }}>
          ¿No tienes acceso todavía?
        </div>
        <div
          style={{
            fontSize: "var(--text-body)",
            color: "var(--muted)",
            marginTop: 8,
            textWrap: "pretty",
          }}
        >
          PortCodex se contrata a través de un gestor patrimonial.
        </div>
        <a
          href={contactHref}
          style={{
            display: "inline-block",
            fontSize: "var(--text-body)",
            fontWeight: 500,
            color: "var(--brand-soft)",
            marginTop: 12,
          }}
        >
          Solicitar información →
        </a>
      </div>

      <div
        style={{
          textAlign: "center",
          marginTop: 38,
          fontSize: "var(--text-meta)",
          color: "var(--faint)",
        }}
      >
        {/* Los tres enlaces apuntaban a `#`. Ahora van a las páginas que existen
            de verdad. «Soporte» se ha retirado en vez de dejarlo muerto: no hay
            dirección de contacto real todavía, y un enlace que no lleva a
            ninguna parte en la pantalla de acceso es peor que su ausencia.
            Vuelve aquí en cuanto exista el buzón. */}
        <Link href="/legal/condiciones" style={{ color: "var(--faint)" }}>
          Condiciones
        </Link>{" "}
        ·{" "}
        <Link href="/legal/privacidad" style={{ color: "var(--faint)" }}>
          Privacidad
        </Link>{" "}
        ·{" "}
        <Link href="/legal/condiciones" style={{ color: "var(--faint)" }}>
          Condiciones
        </Link>
      </div>
    </form>
  );
}
