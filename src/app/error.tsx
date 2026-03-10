"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error("[GlobalError]", error);
    }
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="flex flex-col items-center gap-4 max-w-md text-center">
        <span className="text-4xl font-mono" style={{ color: "var(--brand)" }}>!</span>
        <h1 className="text-xl font-semibold">Algo ha fallado</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Ha ocurrido un error inesperado. Puedes intentar recargar la página o volver al inicio.
        </p>
        {error.digest && (
          <p className="text-xs font-mono" style={{ color: "var(--muted)" }}>
            Ref: {error.digest}
          </p>
        )}
        <div className="flex gap-3 mt-2">
          <button
            onClick={reset}
            className="px-4 py-2 text-sm font-medium rounded-md transition-colors"
            style={{ background: "var(--brand)", color: "var(--background)" }}
          >
            Reintentar
          </button>
          <a
            href="/"
            className="px-4 py-2 text-sm font-medium rounded-md transition-colors"
            style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--line)" }}
          >
            Ir al inicio
          </a>
        </div>
      </div>
    </div>
  );
}
