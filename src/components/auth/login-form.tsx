"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ProfileChoice = {
  id: string;
  role: "autonomo" | "admin" | "cliente";
  full_name: string | null;
};

type LoginApiResponse = {
  ok?: boolean;
  error?: string;
  requiresProfileSelection?: boolean;
  profiles?: ProfileChoice[];
};

type RegisterApiResponse = {
  ok?: boolean;
  error?: string;
  sessionStarted?: boolean;
  requiresEmailConfirmation?: boolean;
};

type RecoverApiResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
};

type ResetPasswordApiResponse = {
  ok?: boolean;
  error?: string;
};

type AuthView = "login" | "register" | "recover";

interface LoginFormProps {
  initialView?: AuthView;
}

export function LoginForm({ initialView = "login" }: LoginFormProps) {
  const router = useRouter();
  const [authView, setAuthView] = useState<AuthView>(initialView);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [registerFullName, setRegisterFullName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [recoverEmail, setRecoverEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [recoveryAccessToken, setRecoveryAccessToken] = useState("");
  const [recoveryRefreshToken, setRecoveryRefreshToken] = useState("");
  const [profileChoices, setProfileChoices] = useState<ProfileChoice[]>([]);
  const [isSelectingProfile, setIsSelectingProfile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const errorCode = (hash.get("error_code") ?? search.get("error_code") ?? "").trim().toLowerCase();
    const errorDescription = (hash.get("error_description") ?? search.get("error_description") ?? "").trim();
    if (errorCode) {
      if (errorCode === "otp_expired") {
        setErrorMessage("El enlace de recuperación ha expirado o ya fue usado. Solicita uno nuevo.");
      } else {
        const decoded = errorDescription ? decodeURIComponent(errorDescription.replace(/\+/g, " ")) : "";
        setErrorMessage(decoded || "No se pudo validar el enlace de recuperación.");
      }
      setAuthView("recover");
      window.history.replaceState({}, "", "/login");
      return;
    }

    const type = (hash.get("type") ?? search.get("type") ?? "").trim().toLowerCase();

    if (type !== "recovery") return;

    const accessToken = (hash.get("access_token") ?? search.get("access_token") ?? "").trim();
    const refreshToken = (hash.get("refresh_token") ?? search.get("refresh_token") ?? "").trim();

    if (!accessToken || !refreshToken) return;

    setIsRecoveryMode(true);
    setRecoveryAccessToken(accessToken);
    setRecoveryRefreshToken(refreshToken);
  }, []);

  useEffect(() => {
    setErrorMessage("");
    setSuccessMessage("");
  }, [authView]);

  async function submitLogin(): Promise<void> {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });

    const body = (await response.json()) as LoginApiResponse;
    if (!response.ok || !body.ok) {
      throw new Error(body.error ?? "No se pudo iniciar sesión.");
    }

    if (body.requiresProfileSelection && body.profiles && body.profiles.length > 1) {
      setProfileChoices(body.profiles);
      setIsSelectingProfile(true);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  async function selectProfile(profileId: string): Promise<void> {
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/auth/select-profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileId }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "No se pudo seleccionar el perfil.");
      }
      router.replace("/");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Error al seleccionar perfil.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitRegister(): Promise<void> {
    if (password.length < 8) {
      throw new Error("La contraseña debe tener al menos 8 caracteres.");
    }
    if (password !== confirmPassword) {
      throw new Error("Las contraseñas no coinciden.");
    }

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fullName: registerFullName,
        email: registerEmail,
        password,
      }),
    });

    const body = (await response.json()) as RegisterApiResponse;
    if (!response.ok || !body.ok) {
      throw new Error(body.error ?? "No se pudo completar el registro.");
    }

    if (body.sessionStarted) {
      router.replace("/");
      router.refresh();
      return;
    }

    setSuccessMessage(
      body.requiresEmailConfirmation
        ? "Cuenta creada. Revisa tu email para confirmar el acceso."
        : "Cuenta creada correctamente. Ya puedes iniciar sesión.",
    );
    setAuthView("login");
    setIdentifier(registerEmail);
    setPassword("");
    setConfirmPassword("");
  }

  async function submitRecoverRequest(): Promise<void> {
    const response = await fetch("/api/auth/recover", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: recoverEmail,
      }),
    });

    const body = (await response.json()) as RecoverApiResponse;
    if (!response.ok || !body.ok) {
      throw new Error(body.error ?? "No se pudo enviar el enlace de recuperación.");
    }

    setSuccessMessage(body.message ?? "Si el correo existe, recibirás un enlace de recuperación en unos minutos.");
  }

  async function submitPasswordReset(): Promise<void> {
    if (password.length < 8) {
      throw new Error("La nueva contraseña debe tener al menos 8 caracteres.");
    }
    if (password !== confirmPassword) {
      throw new Error("Las contraseñas no coinciden.");
    }
    if (!recoveryAccessToken || !recoveryRefreshToken) {
      throw new Error("Enlace de recuperación inválido o caducado.");
    }

    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        accessToken: recoveryAccessToken,
        refreshToken: recoveryRefreshToken,
        password,
      }),
    });

    const body = (await response.json()) as ResetPasswordApiResponse;
    if (!response.ok || !body.ok) {
      throw new Error(body.error ?? "No se pudo actualizar la contraseña.");
    }

    window.history.replaceState({}, "", "/login");
    setIsRecoveryMode(false);
    setRecoveryAccessToken("");
    setRecoveryRefreshToken("");
    setPassword("");
    setConfirmPassword("");
    setAuthView("login");
    setSuccessMessage("Contraseña actualizada. Ya puedes iniciar sesión.");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      if (isRecoveryMode) {
        await submitPasswordReset();
      } else if (authView === "register") {
        await submitRegister();
      } else if (authView === "recover") {
        await submitRecoverRequest();
      } else {
        await submitLogin();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo completar la operación.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const roleLabel: Record<string, string> = {
    autonomo: "Autónomo",
    admin: "Gestor",
    cliente: "Cliente",
  };

  if (isSelectingProfile) {
    return (
      <div className="space-y-5">
        <p className="text-sm text-[var(--muted)]">
          Este correo tiene varios perfiles. ¿Con cuál quieres entrar?
        </p>
        {errorMessage ? (
          <p className="rounded-lg border border-[rgba(206,139,130,0.45)] bg-[rgba(206,139,130,0.12)] px-3 py-2 text-sm text-rose-300">
            {errorMessage}
          </p>
        ) : null}
        <div className="space-y-2">
          {profileChoices.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={isSubmitting}
              onClick={() => selectProfile(p.id)}
              className="flex w-full items-center justify-between rounded-xl border border-[rgba(111,174,143,0.15)] bg-black/30 px-4 py-3 text-left transition hover:border-[rgba(111,174,143,0.45)] hover:bg-[rgba(111,174,143,0.06)] disabled:opacity-60"
            >
              <span className="font-medium">{p.full_name ?? p.id.slice(0, 8)}</span>
              <span className="whitespace-nowrap text-xs text-[#6FAE8F]">
                {roleLabel[p.role] ?? p.role}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => { setIsSelectingProfile(false); setErrorMessage(""); }}
          className="w-full text-center text-xs text-[var(--muted)] hover:text-white"
        >
          ← Volver al inicio de sesión
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {!isRecoveryMode ? (
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-[rgba(111,174,143,0.12)] bg-[rgba(0,0,0,0.25)] p-1">
          <button
            type="button"
            onClick={() => setAuthView("login")}
            className={`rounded-lg px-2 py-1.5 text-xs transition ${
              authView === "login"
                ? "bg-[rgba(111,174,143,0.12)] text-[#A9D4BF]"
                : "text-[var(--muted)] hover:bg-[rgba(111,174,143,0.06)]"
            }`}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => setAuthView("register")}
            className={`rounded-lg px-2 py-1.5 text-xs transition ${
              authView === "register"
                ? "bg-[rgba(111,174,143,0.12)] text-[#A9D4BF]"
                : "text-[var(--muted)] hover:bg-[rgba(111,174,143,0.06)]"
            }`}
          >
            Registrarse
          </button>
          <button
            type="button"
            onClick={() => setAuthView("recover")}
            className={`rounded-lg px-2 py-1.5 text-xs transition ${
              authView === "recover"
                ? "bg-[rgba(111,174,143,0.12)] text-[#A9D4BF]"
                : "text-[var(--muted)] hover:bg-[rgba(111,174,143,0.06)]"
            }`}
          >
            Recuperar
          </button>
        </div>
      ) : (
        <p className="rounded-lg border border-[rgba(111,174,143,0.2)] bg-[rgba(111,174,143,0.06)] px-3 py-2 text-sm text-[#A9D4BF]">
          Define tu nueva contraseña para completar la recuperación.
        </p>
      )}

      {authView === "register" && !isRecoveryMode ? (
        <>
          <label className="block text-sm">
            <span className="mb-1 block text-[14px] font-normal text-[var(--muted)]">Nombre de usuario</span>
            <input
              type="text"
              required
              autoComplete="nickname"
              value={registerFullName}
              onChange={(event) => setRegisterFullName(event.target.value)}
              placeholder="Tu nombre visible"
              className="w-full rounded-xl border border-[rgba(111,174,143,0.15)] bg-black/30 px-3 py-2.5 text-sm outline-none transition-all duration-[400ms] ease-in-out focus:border-[rgba(111,174,143,0.55)] focus:ring-2 focus:ring-[rgba(111,174,143,0.1)] focus:shadow-[inset_0_0_0_1px_rgba(111,174,143,0.3),0_0_20px_rgba(79,135,112,0.12)]"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-[14px] font-normal text-[var(--muted)]">Correo electrónico</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={registerEmail}
              onChange={(event) => setRegisterEmail(event.target.value)}
              placeholder="correo@dominio.com"
              className="w-full rounded-xl border border-[rgba(111,174,143,0.15)] bg-black/30 px-3 py-2.5 text-sm outline-none transition-all duration-[400ms] ease-in-out focus:border-[rgba(111,174,143,0.55)] focus:ring-2 focus:ring-[rgba(111,174,143,0.1)] focus:shadow-[inset_0_0_0_1px_rgba(111,174,143,0.3),0_0_20px_rgba(79,135,112,0.12)]"
            />
          </label>
        </>
      ) : null}

      {authView === "login" && !isRecoveryMode ? (
        <label className="block text-sm">
          <span className="mb-1 block text-[14px] font-normal text-[var(--muted)]">Usuario</span>
          <input
            type="text"
            required
            autoComplete="username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="tuusuario o correo@dominio.com"
            className="w-full rounded-xl border border-[rgba(111,174,143,0.15)] bg-black/30 px-3 py-2.5 text-sm outline-none transition-all duration-[400ms] ease-in-out focus:border-[rgba(111,174,143,0.55)] focus:ring-2 focus:ring-[rgba(111,174,143,0.1)] focus:shadow-[inset_0_0_0_1px_rgba(111,174,143,0.3),0_0_20px_rgba(79,135,112,0.12)]"
          />
        </label>
      ) : null}

      {authView === "recover" && !isRecoveryMode ? (
        <label className="block text-sm">
          <span className="mb-1 block text-[14px] font-normal text-[var(--muted)]">Correo electrónico</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={recoverEmail}
            onChange={(event) => setRecoverEmail(event.target.value)}
            placeholder="correo@dominio.com"
            className="w-full rounded-xl border border-[rgba(111,174,143,0.15)] bg-black/30 px-3 py-2.5 text-sm outline-none transition-all duration-[400ms] ease-in-out focus:border-[rgba(111,174,143,0.55)] focus:ring-2 focus:ring-[rgba(111,174,143,0.1)] focus:shadow-[inset_0_0_0_1px_rgba(111,174,143,0.3),0_0_20px_rgba(79,135,112,0.12)]"
          />
        </label>
      ) : null}

      {(authView === "login" || authView === "register" || isRecoveryMode) ? (
        <label className="block text-sm">
          <span className="mb-1 block text-[14px] font-normal text-[var(--muted)]">
            {isRecoveryMode ? "Nueva contraseña" : "Contraseña"}
          </span>
          <input
            type="password"
            required
            autoComplete={isRecoveryMode || authView === "register" ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            className="w-full rounded-xl border border-[rgba(111,174,143,0.15)] bg-black/30 px-3 py-2.5 text-sm outline-none transition-all duration-[400ms] ease-in-out focus:border-[rgba(111,174,143,0.55)] focus:ring-2 focus:ring-[rgba(111,174,143,0.1)] focus:shadow-[inset_0_0_0_1px_rgba(111,174,143,0.3),0_0_20px_rgba(79,135,112,0.12)]"
          />
        </label>
      ) : null}

      {(authView === "register" || isRecoveryMode) ? (
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--muted)]">Confirmar contraseña</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="••••••••"
            className="w-full rounded-xl border border-[rgba(111,174,143,0.15)] bg-black/30 px-3 py-2.5 text-sm outline-none transition-all duration-[400ms] ease-in-out focus:border-[rgba(111,174,143,0.55)] focus:ring-2 focus:ring-[rgba(111,174,143,0.1)] focus:shadow-[inset_0_0_0_1px_rgba(111,174,143,0.3),0_0_20px_rgba(79,135,112,0.12)]"
          />
        </label>
      ) : null}

      {successMessage ? (
        <p className="rounded-lg border border-[rgba(111,174,143,0.45)] bg-[rgba(111,174,143,0.12)] px-3 py-2 text-sm text-emerald-300">
          {successMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="rounded-lg border border-[rgba(206,139,130,0.45)] bg-[rgba(206,139,130,0.12)] px-3 py-2 text-sm text-rose-300">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className={`relative inline-flex w-full items-center justify-center overflow-hidden text-foreground transition duration-300 disabled:cursor-not-allowed disabled:opacity-60 ${
          isSubmitting
            ? "h-2 rounded-full bg-[rgba(79,135,112,0.15)] px-0 py-0"
            : "rounded-xl border border-[rgba(79,135,112,0.4)] bg-gradient-to-r from-[rgba(111,174,143,0.08)] to-[rgba(79,135,112,0.12)] px-4 py-3.5 text-[18px] font-medium transition-all duration-[400ms] ease-in-out hover:-translate-y-[2px] hover:from-[rgba(111,174,143,0.14)] hover:to-[rgba(79,135,112,0.2)] hover:shadow-[0_14px_30px_rgba(79,135,112,0.2)]"
        }`}
      >
        {isSubmitting ? (
          <span className="login-submit-loader" aria-hidden="true" />
        ) : (
          <span>
            {isRecoveryMode
              ? "Guardar nueva contraseña"
              : authView === "register"
                ? "Crear cuenta"
                : authView === "recover"
                  ? "Enviar enlace de recuperación"
                  : "Gestionar mi Portfolio"}
          </span>
        )}
      </button>

    </form>
  );
}
