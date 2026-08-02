import type { ReactNode } from "react";

/**
 * Rendimiento ocioso: dinero ya ganado que sigue sin reclamar.
 *
 * Va en una franja de una sola línea entre dos filos, no en una tarjeta de
 * aviso: es una oportunidad, no un problema. El punto ámbar basta para que se
 * note al bajar la vista; un panel de color entero lo convertiría en alarma y
 * el cliente aprendería a ignorarlo.
 *
 * DESAPARECE cuando no hay nada sin reclamar. Una franja que dice «0,00 US$
 * pendientes» ocupa lo mismo que una que dice algo.
 */
export function IdleYieldStrip({
  amount,
  detail,
  action,
}: {
  amount: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="flex items-center"
      style={{
        gap: 14,
        marginTop: 48,
        padding: "14px 0",
        borderTop: "1px solid var(--line)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: "var(--warn)",
        }}
        aria-hidden="true"
      />
      <span style={{ fontSize: "var(--text-body)", color: "var(--muted)" }}>
        Rendimiento ocioso
      </span>
      <span className="tabular-nums" style={{ fontSize: "var(--text-body)", fontWeight: 500 }}>
        {amount}
      </span>
      <span style={{ fontSize: "var(--text-body)", color: "var(--faint)" }}>{detail}</span>
      {action ? <div className="ml-auto">{action}</div> : null}
    </div>
  );
}
