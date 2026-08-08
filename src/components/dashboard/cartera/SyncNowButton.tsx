"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * «Sincronizar ahora» en la propia Cartera.
 *
 * El botón vivía solo en la subpágina de Wallets, así que para releer la cadena
 * había que salir de la Cartera —justo la pantalla donde se mira el dinero— y
 * entrar en otra. Se coloca aquí, bajo el bloque de sincronización, que es
 * donde el gestor lee «Sincronizado hace 5 d» y piensa «pues actualízalo».
 *
 * Dispara la MISMA lectura que el alta de una wallet (`/api/wallet/live` con
 * `refresh=1`): Zerion, RPCs y los adaptadores DeFi, y escribe el snapshot del
 * que bebe esta pantalla. Al terminar, `router.refresh()` la repinta.
 */
export function SyncNowButton({ portfolioId }: { portfolioId: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<"idle" | "leyendo" | "tardando">("idle");

  async function sincronizar() {
    if (estado === "leyendo") return;
    setEstado("leyendo");
    try {
      const res = await fetch(
        `/api/wallet/live?portfolioId=${encodeURIComponent(portfolioId)}&refresh=1`,
      );
      const texto = await res.text();
      try {
        const body = JSON.parse(texto) as { positions?: unknown[] };
        if (res.ok && Array.isArray(body.positions)) router.refresh();
        else setEstado("tardando");
      } catch {
        // Respuesta no-JSON: casi siempre un corte por tiempo de Vercel con el
        // snapshot ya escrito. Se avisa y se refresca de todos modos, porque el
        // dato suele haber llegado.
        setEstado("tardando");
        router.refresh();
        return;
      }
    } catch {
      setEstado("tardando");
    } finally {
      setEstado((s) => (s === "leyendo" ? "idle" : s));
    }
  }

  return (
    <div style={{ marginTop: 7 }}>
      <button
        type="button"
        onClick={sincronizar}
        disabled={estado === "leyendo"}
        style={{
          fontSize: "var(--text-label)",
          color: estado === "leyendo" ? "var(--faint)" : "var(--brand-soft)",
          cursor: estado === "leyendo" ? "default" : "pointer",
        }}
      >
        {estado === "leyendo" ? "Leyendo la cadena…" : "Sincronizar ahora"}
      </button>
      {estado === "tardando" ? (
        <div style={{ fontSize: "var(--text-meta)", color: "var(--warn)", marginTop: 4 }}>
          Está tardando; recarga en unos segundos si aún no aparece.
        </div>
      ) : null}
    </div>
  );
}
