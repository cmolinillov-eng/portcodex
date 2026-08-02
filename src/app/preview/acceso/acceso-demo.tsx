"use client";

import Link from "next/link";
import { useState } from "react";
import { AccessScreen } from "@/components/acceso/AccessScreen";
import { GENERIC_ACCESS_ERROR } from "@/components/acceso/AccessForm";

export type EstadoAcceso = "vacio" | "enviando" | "error";

const ESTADOS: { key: EstadoAcceso; label: string }[] = [
  { key: "vacio", label: "Vacío (interactivo)" },
  { key: "enviando", label: "Enviando" },
  { key: "error", label: "Error de credenciales" },
];

/**
 * Los tres estados del formulario, forzados por `?estado=`. El estado «vacío»
 * es además INTERACTIVO: al enviar simula una espera de 1,8 s y termina en el
 * error genérico, que es justo el recorrido que hay que poder mirar entero.
 */
export function AccesoDemo({ estado }: { estado: EstadoAcceso }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const forced = estado !== "vacio";

  return (
    <div style={{ background: "var(--void-deep)" }}>
      <AccessScreen
        isSubmitting={forced ? estado === "enviando" : busy}
        errorMessage={forced ? (estado === "error" ? GENERIC_ACCESS_ERROR : null) : error}
        initialIdentifier={forced ? "m.fita@portcodex.com" : ""}
        onSubmit={async () => {
          setError(null);
          setBusy(true);
          await new Promise((resolve) => setTimeout(resolve, 1800));
          setBusy(false);
          setError(GENERIC_ACCESS_ERROR);
        }}
      />

      <div className="pcx-screen" style={{ padding: "56px 64px 72px" }}>
        <div style={{ paddingTop: 20, borderTop: "1px solid var(--line)" }}>
          <div
            style={{ fontSize: "var(--text-body)", fontWeight: 600, color: "var(--foreground)" }}
          >
            Estados del formulario
          </div>
          <div style={{ fontSize: "var(--text-label)", color: "var(--faint)", marginTop: 7 }}>
            Solo en el banco de pruebas. La ruta real no lleva este conmutador.
          </div>
        </div>

        <div className="flex flex-wrap" style={{ gap: 24, marginTop: 20 }}>
          {ESTADOS.map((option) => (
            <Link
              key={option.key}
              href={`/preview/acceso?estado=${option.key}`}
              style={{
                fontSize: "var(--text-body)",
                color: option.key === estado ? "var(--foreground)" : "var(--muted)",
                fontWeight: option.key === estado ? 500 : 400,
              }}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
