"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type LoginApiResponse = {
  ok?: boolean;
  error?: string;
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

export function LoginForm() {
  const router = useRouter();
  const [authView, setAuthView] = useState<AuthView>("login");
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
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
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        identifier,
        password,
      }),
    });

    const body = (await response.json()) as LoginApiResponse;
    if (!response.ok || !body.ok) {
      throw new Error(body.error ?? "No se pudo iniciar sesión.");
    }

    router.replace("/");
    router.refresh();
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {!isRecoveryMode ? (
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-[rgba(0,229,255,0.28)] bg-[rgba(0,0,0,0.18)] p-1">
          <button
            type="button"
            onClick={() => setAuthView("login")}
            className={`rounded-lg px-2 py-1.5 text-xs transition ${
              authView === "login"
                ? "bg-[rgba(0,229,255,0.2)] text-cyan-200"
                : "text-[var(--muted)] hover:bg-[rgba(0,229,255,0.1)]"
            }`}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => setAuthView("register")}
            className={`rounded-lg px-2 py-1.5 text-xs transition ${
              authView === "register"
                ? "bg-[rgba(0,229,255,0.2)] text-cyan-200"
                : "text-[var(--muted)] hover:bg-[rgba(0,229,255,0.1)]"
            }`}
          >
            Registrarse
          </button>
          <button
            type="button"
            onClick={() => setAuthView("recover")}
            className={`rounded-lg px-2 py-1.5 text-xs transition ${
              authView === "recover"
                ? "bg-[rgba(0,229,255,0.2)] text-cyan-200"
                : "text-[var(--muted)] hover:bg-[rgba(0,229,255,0.1)]"
            }`}
          >
            Recuperar
          </button>
        </div>
      ) : (
        <p className="rounded-lg border border-[rgba(0,229,255,0.35)] bg-[rgba(0,229,255,0.1)] px-3 py-2 text-sm text-cyan-200">
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
              className="w-full rounded-xl border border-[rgba(173,190,200,0.34)] bg-black/30 px-3 py-2.5 text-sm outline-none transition-all duration-[400ms] ease-in-out focus:border-[rgba(0,229,255,0.88)] focus:ring-2 focus:ring-[rgba(0,229,255,0.28)] focus:shadow-[inset_0_0_0_1px_rgba(0,229,255,0.55),0_0_20px_rgba(0,229,255,0.2)]"
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
              className="w-full rounded-xl border border-[rgba(173,190,200,0.34)] bg-black/30 px-3 py-2.5 text-sm outline-none transition-all duration-[400ms] ease-in-out focus:border-[rgba(0,229,255,0.88)] focus:ring-2 focus:ring-[rgba(0,229,255,0.28)] focus:shadow-[inset_0_0_0_1px_rgba(0,229,255,0.55),0_0_20px_rgba(0,229,255,0.2)]"
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
            className="w-full rounded-xl border border-[rgba(173,190,200,0.34)] bg-black/30 px-3 py-2.5 text-sm outline-none transition-all duration-[400ms] ease-in-out focus:border-[rgba(0,229,255,0.88)] focus:ring-2 focus:ring-[rgba(0,229,255,0.28)] focus:shadow-[inset_0_0_0_1px_rgba(0,229,255,0.55),0_0_20px_rgba(0,229,255,0.2)]"
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
            className="w-full rounded-xl border border-[rgba(173,190,200,0.34)] bg-black/30 px-3 py-2.5 text-sm outline-none transition-all duration-[400ms] ease-in-out focus:border-[rgba(0,229,255,0.88)] focus:ring-2 focus:ring-[rgba(0,229,255,0.28)] focus:shadow-[inset_0_0_0_1px_rgba(0,229,255,0.55),0_0_20px_rgba(0,229,255,0.2)]"
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
            className="w-full rounded-xl border border-[rgba(173,190,200,0.34)] bg-black/30 px-3 py-2.5 text-sm outline-none transition-all duration-[400ms] ease-in-out focus:border-[rgba(0,229,255,0.88)] focus:ring-2 focus:ring-[rgba(0,229,255,0.28)] focus:shadow-[inset_0_0_0_1px_rgba(0,229,255,0.55),0_0_20px_rgba(0,229,255,0.2)]"
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
            className="w-full rounded-xl border border-[rgba(173,190,200,0.34)] bg-black/30 px-3 py-2.5 text-sm outline-none transition-all duration-[400ms] ease-in-out focus:border-[rgba(0,229,255,0.88)] focus:ring-2 focus:ring-[rgba(0,229,255,0.28)] focus:shadow-[inset_0_0_0_1px_rgba(0,229,255,0.55),0_0_20px_rgba(0,229,255,0.2)]"
          />
        </label>
      ) : null}

      {successMessage ? (
        <p className="rounded-lg border border-[rgba(16,185,129,0.45)] bg-[rgba(16,185,129,0.12)] px-3 py-2 text-sm text-emerald-300">
          {successMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="rounded-lg border border-[rgba(248,113,113,0.45)] bg-[rgba(248,113,113,0.12)] px-3 py-2 text-sm text-rose-300">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className={`relative inline-flex w-full items-center justify-center overflow-hidden border border-[rgba(0,229,255,0.55)] text-foreground transition duration-300 disabled:cursor-not-allowed disabled:opacity-60 ${
          isSubmitting
            ? "h-2 rounded-full bg-[rgba(0,229,255,0.12)] px-0 py-0"
            : "rounded-xl bg-[rgba(0,229,255,0.16)] px-4 py-3.5 text-[18px] font-medium transition-all duration-[400ms] ease-in-out hover:-translate-y-[2px] hover:bg-[rgba(0,229,255,0.24)] hover:shadow-[0_14px_30px_rgba(0,229,255,0.2)]"
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
                  : "Gestionar mi Porfolio"}
          </span>
        )}
      </button>

    </form>
  );
}
