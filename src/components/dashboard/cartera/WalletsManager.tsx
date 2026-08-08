"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Alta y gestión de las wallets de una cartera.
 *
 * La maqueta de Cartera ya dibujaba el enlace «Wallets» arriba a la derecha,
 * pero no llevaba a ninguna parte: la única forma de dar de alta una clave
 * pública estaba enterrada en el panel de operación, dentro del dashboard
 * anterior al rediseño. Un cliente nuevo no se podía empezar a mirar sin salir
 * del producto nuevo.
 *
 * Es una ESCRITURA, así que se comprueba antes de mandar y se dice qué ha
 * fallado. Y es una lista, no una tabla: son tres datos por wallet y una
 * acción, y una tabla de cuatro columnas para eso solo añade filos.
 */

type WalletRow = {
  id: string;
  chain_kind: string;
  address: string;
  label: string | null;
  is_active: boolean;
};

/** Las tres que acepta la API. Se enseñan con su nombre, no con su clave. */
const CADENAS = [
  { key: "evm", label: "EVM (Ethereum, Base, Arbitrum…)" },
  { key: "solana", label: "Solana" },
  { key: "bitcoin", label: "Bitcoin" },
] as const;

const NOMBRE_CADENA: Record<string, string> = {
  evm: "EVM",
  solana: "Solana",
  bitcoin: "Bitcoin",
};

/**
 * Los mismos formatos que valida el servidor.
 *
 * Se repiten aquí a propósito, y no es duplicación ociosa: el servidor sigue
 * siendo quien decide —nadie se fía del navegador— pero pegar una dirección mal
 * copiada y enterarse tras el viaje de ida y vuelta es peor que enterarse al
 * momento. Si alguna vez divergen, manda el servidor y el usuario ve su error.
 */
const FORMATO: Record<string, RegExp> = {
  evm: /^0x[a-fA-F0-9]{40}$/,
  solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  bitcoin: /^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/,
};

export function WalletsManager({
  portfolioId,
  portfolioName,
}: {
  portfolioId: string;
  portfolioName?: string;
}) {
  const router = useRouter();
  const [wallets, setWallets] = useState<WalletRow[] | null>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({ chainKind: "evm", address: "", label: "" });
  const [sincronizando, setSincronizando] = useState(false);
  const [avisoSync, setAvisoSync] = useState("");

  /*
   * Leer la cadena AHORA.
   *
   * Registrar una wallet solo la guarda: el dinero no aparece hasta que algo
   * lee blockchain y escribe el snapshot. Antes eso solo pasaba de noche (el
   * cron) o al abrir el panel de operación viejo, así que un gestor añadía la
   * clave de un cliente nuevo y la Cartera seguía vacía sin explicación.
   *
   * `refresh=1` fuerza la lectura completa —Zerion, RPCs, los adaptadores DeFi—
   * y guarda el snapshot del que bebe la Cartera. La respuesta puede NO ser
   * JSON si Vercel corta la función por tiempo (la lectura pasa de 60 s en
   * carteras grandes); se trata como éxito parcial y se refresca igual, porque
   * la escritura del snapshot va por su cuenta y suele haberse completado.
   */
  async function sincronizar() {
    if (sincronizando) return;
    setSincronizando(true);
    setError("");
    setAvisoSync("");
    try {
      const res = await fetch(
        `/api/wallet/live?portfolioId=${encodeURIComponent(portfolioId)}&refresh=1`,
      );
      const texto = await res.text();
      let ok = res.ok;
      try {
        const body = JSON.parse(texto) as { positions?: unknown[]; error?: string };
        if (body.error) throw new Error(body.error);
        ok = ok && Array.isArray(body.positions);
      } catch {
        // Respuesta no-JSON: casi siempre un corte por tiempo con el snapshot ya
        // escrito. No es un fallo del que haya que alarmar; se refresca y el
        // dato aparece si llegó a guardarse.
        setAvisoSync(
          "La lectura está tardando más de lo normal. Recarga en unos segundos si aún no aparece.",
        );
      }
      if (ok) {
        // La Cartera lee del snapshot que esta llamada acaba de escribir.
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo sincronizar.");
    } finally {
      setSincronizando(false);
    }
  }

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/wallet/manage?portfolioId=${encodeURIComponent(portfolioId)}`,
        );
        const body = (await res.json()) as { wallets?: WalletRow[]; error?: string };
        if (!res.ok) throw new Error(body.error ?? "No se pudieron leer las wallets.");
        if (!cancelado) setWallets(body.wallets ?? []);
      } catch (e) {
        if (!cancelado) {
          setWallets([]);
          setError(e instanceof Error ? e.message : "No se pudieron leer las wallets.");
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [portfolioId]);

  const direccion = form.address.trim();
  const formatoOk = FORMATO[form.chainKind]?.test(direccion) ?? false;
  // El aviso NO salta mientras se escribe: un campo a medio pegar no es un
  // error todavía. Solo cuando hay algo escrito y no encaja.
  const formatoMal = direccion.length > 0 && !formatoOk;

  async function anadir() {
    if (!formatoOk || guardando) return;
    setGuardando(true);
    setError("");
    try {
      const res = await fetch("/api/wallet/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioId,
          chainKind: form.chainKind,
          address: direccion,
          label: form.label.trim() || undefined,
        }),
      });
      const body = (await res.json()) as { wallet?: WalletRow; error?: string };
      if (!res.ok) throw new Error(body.error ?? "No se pudo añadir la wallet.");

      setWallets((prev) => [...(prev ?? []), body.wallet!].filter(Boolean));
      setForm({ chainKind: form.chainKind, address: "", label: "" });
      // Añadir la wallet solo la registra. Se lanza la lectura a continuación
      // para que el dinero aparezca sin obligar a pulsar «Sincronizar»: dar de
      // alta una wallet y no ver nada es justo la confusión que hay que evitar.
      void sincronizar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo añadir la wallet.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <section style={{ paddingTop: 44 }}>
        <h2 style={{ margin: 0, fontSize: "var(--text-lead)", fontWeight: 600 }}>
          Añadir una wallet
        </h2>
        <p
          style={{
            fontSize: "var(--text-body)",
            color: "var(--muted)",
            marginTop: 8,
            maxWidth: "var(--measure-lead)",
          }}
        >
          Solo la clave <strong>pública</strong>. PortCodex lee saldos y posiciones; no puede
          firmar ni mover nada{portfolioName ? ` de la cartera de ${portfolioName}` : ""}.
        </p>

        <div className="flex flex-wrap items-end" style={{ gap: 12, marginTop: 24 }}>
          <label style={{ display: "block" }}>
            <span style={etiqueta}>Red</span>
            <select
              value={form.chainKind}
              onChange={(e) => setForm({ ...form, chainKind: e.target.value })}
              style={{ ...campo, width: 260 }}
            >
              {CADENAS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "block", flex: "1 1 380px", minWidth: 0 }}>
            <span style={etiqueta}>Clave pública</span>
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder={form.chainKind === "evm" ? "0x…" : "Dirección de la wallet"}
              spellCheck={false}
              autoComplete="off"
              style={{
                ...campo,
                width: "100%",
                // Una dirección es un identificador: monoespaciada es
                // exactamente el uso que el sistema tipográfico le reserva.
                fontFamily: "var(--font-mono, ui-monospace, monospace)",
                borderColor: formatoMal ? "var(--loss)" : "var(--line)",
              }}
            />
          </label>

          <label style={{ display: "block", flex: "0 1 220px" }}>
            <span style={etiqueta}>Nombre (opcional)</span>
            <input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Wallet principal"
              style={{ ...campo, width: "100%" }}
            />
          </label>

          <button
            type="button"
            onClick={anadir}
            disabled={!formatoOk || guardando}
            style={{
              padding: "9px 18px",
              borderRadius: "var(--radius-md)",
              border: "none",
              fontSize: "var(--text-body)",
              fontWeight: 500,
              background: !formatoOk || guardando ? "var(--accent-busy)" : "var(--accent-primary)",
              color:
                !formatoOk || guardando ? "var(--text-on-accent-busy)" : "var(--text-on-accent)",
              cursor: !formatoOk || guardando ? "not-allowed" : "pointer",
            }}
          >
            {guardando ? "Añadiendo…" : "Añadir wallet"}
          </button>
        </div>

        {formatoMal ? (
          <p style={{ fontSize: "var(--text-label)", color: "var(--loss)", marginTop: 10 }}>
            Esa dirección no tiene formato de {NOMBRE_CADENA[form.chainKind]}. Comprueba que has
            copiado la clave pública entera y que la red es la correcta.
          </p>
        ) : null}

        {error ? (
          <p style={{ fontSize: "var(--text-label)", color: "var(--loss)", marginTop: 10 }}>
            {error}
          </p>
        ) : null}
      </section>

      <section style={{ paddingTop: 48 }}>
        <div className="flex items-baseline" style={{ gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: "var(--text-lead)", fontWeight: 600 }}>
            Wallets de esta cartera
          </h2>
          {/* Sin wallets todavía no hay nada que leer; el botón aparece cuando
              ya hay al menos una. */}
          {wallets && wallets.length > 0 ? (
            <button
              type="button"
              onClick={sincronizar}
              disabled={sincronizando}
              style={{
                marginLeft: "auto",
                fontSize: "var(--text-body)",
                color: sincronizando ? "var(--faint)" : "var(--brand-soft)",
                cursor: sincronizando ? "default" : "pointer",
              }}
            >
              {sincronizando ? "Leyendo la cadena…" : "Sincronizar ahora"}
            </button>
          ) : null}
        </div>

        {avisoSync ? (
          <p style={{ fontSize: "var(--text-label)", color: "var(--warn)", marginTop: 8 }}>
            {avisoSync}
          </p>
        ) : null}

        {wallets === null ? (
          <p style={{ fontSize: "var(--text-body)", color: "var(--faint)", marginTop: 16 }}>
            Leyendo…
          </p>
        ) : wallets.length === 0 ? (
          <p
            style={{
              fontSize: "var(--text-body)",
              color: "var(--faint)",
              marginTop: 16,
              maxWidth: "var(--measure-lead)",
            }}
          >
            Todavía no hay ninguna wallet. Añade la primera arriba y la Cartera empezará a leer
            sus saldos y posiciones en la próxima sincronización.
          </p>
        ) : (
          <div style={{ marginTop: 8 }}>
            {wallets.map((w) => (
              <div
                key={w.id}
                className="flex items-center"
                style={{
                  gap: 16,
                  padding: "16px 0",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <span
                  style={{
                    fontSize: "var(--text-label)",
                    color: "var(--muted)",
                    width: 76,
                    flex: "none",
                  }}
                >
                  {NOMBRE_CADENA[w.chain_kind] ?? w.chain_kind}
                </span>
                <span
                  style={{
                    fontSize: "var(--text-body)",
                    fontFamily: "var(--font-mono, ui-monospace, monospace)",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                  title={w.address}
                >
                  {w.address}
                </span>
                {w.label ? (
                  <span style={{ fontSize: "var(--text-label)", color: "var(--faint)" }}>
                    {w.label}
                  </span>
                ) : null}
                <span
                  style={{
                    fontSize: "var(--text-label)",
                    color: w.is_active ? "var(--muted)" : "var(--disabled)",
                    flex: "none",
                  }}
                >
                  {w.is_active ? "Activa" : "Inactiva"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

const etiqueta = {
  display: "block",
  fontSize: "var(--text-label)",
  color: "var(--muted)",
  marginBottom: 6,
} as const;

const campo = {
  padding: "9px 11px",
  background: "var(--float)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-sm)",
  fontSize: "var(--text-body)",
  color: "var(--foreground)",
} as const;
