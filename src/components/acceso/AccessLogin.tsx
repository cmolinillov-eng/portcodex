"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AccessScreen } from "./AccessScreen";
import { GENERIC_ACCESS_ERROR } from "./AccessForm";

/**
 * Conecta la pantalla de Acceso con la autenticación real.
 *
 * Toda la lógica de red vive AQUÍ y no en los componentes de presentación:
 * `AccessScreen` recibe `onSubmit`, `isSubmitting` y `errorMessage` por props y
 * no sabe que existe Supabase. Así la pantalla se puede seguir revisando en
 * `/preview/acceso` sin tocar credenciales.
 */

interface ProfileChoice {
  id: string;
  label: string;
}

interface LoginResponse {
  ok?: boolean;
  error?: string;
  requiresProfileSelection?: boolean;
  profiles?: ProfileChoice[];
}

export function AccessLogin() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ProfileChoice[]>([]);

  function goToDashboard() {
    router.replace("/");
    router.refresh();
  }

  async function handleSubmit({
    identifier,
    password,
  }: {
    identifier: string;
    password: string;
  }): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const body = (await response.json()) as LoginResponse;

      if (!response.ok || !body.ok) {
        // Mensaje GENÉRICO a propósito, se llame como se llame el fallo del
        // servidor: distinguir «ese correo no existe» de «esa contraseña no es»
        // le confirma a un atacante qué cuentas hay.
        setError(GENERIC_ACCESS_ERROR);
        return;
      }

      if (body.requiresProfileSelection && body.profiles && body.profiles.length > 1) {
        setProfiles(body.profiles);
        return;
      }

      goToDashboard();
    } catch {
      setError(GENERIC_ACCESS_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  async function chooseProfile(profileId: string): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/select-profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileId }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) {
        setError("No se ha podido abrir ese perfil. Inténtalo de nuevo.");
        return;
      }
      goToDashboard();
    } catch {
      setError("No se ha podido abrir ese perfil. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AccessScreen
      onSubmit={handleSubmit}
      isSubmitting={submitting}
      errorMessage={error}
      identifierLabel="Usuario o correo"
      identifierType="text"
      forgotHref="/login?recuperar=1"
      brand={{
        headline: "Una visión clara de tu patrimonio digital",
        lead: "PortCodex lee tus posiciones directamente de la cadena y las traduce a un informe que se entiende y se declara.",
        readout: { protocolCount: 8, frequencyLabel: "cada hora", initialSeconds: 42 },
      }}
    >
      {profiles.length > 0 ? (
        <ProfilePicker profiles={profiles} disabled={submitting} onChoose={chooseProfile} />
      ) : null}
    </AccessScreen>
  );
}

/**
 * Elección de perfil, cuando unas mismas credenciales dan acceso a varios.
 *
 * Aparece DEBAJO del formulario en vez de sustituirlo: sustituirlo haría creer
 * que el acceso ha fallado y hay que empezar otra vez.
 */
function ProfilePicker({
  profiles,
  disabled,
  onChoose,
}: {
  profiles: ProfileChoice[];
  disabled: boolean;
  onChoose: (id: string) => void;
}) {
  return (
    <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
      <p style={{ fontSize: "var(--text-label)", color: "var(--faint)", marginBottom: 12 }}>
        Esta cuenta tiene acceso a varios perfiles. Elige con cuál entrar.
      </p>
      <div className="flex flex-col" style={{ gap: 8 }}>
        {profiles.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(p.id)}
            className="text-left"
            style={{
              padding: "11px 13px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--line-strong)",
              background: "var(--float)",
              fontSize: "var(--text-body)",
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
