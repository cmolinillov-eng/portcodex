import type { ReactNode } from "react";

/**
 * Cabecera patrimonial del Resumen.
 *
 * Es la única cifra protagonista de toda la aplicación: 60 px frente a los 13
 * del cuerpo. Nada compite con ella —ni gráfico, ni tarjetas, ni botón de
 * color— porque su tamaño y su soledad son lo que la hacen mandar.
 *
 * Depositado, Rendimiento y P&L van DEBAJO y en texto corrido, no en tarjetas:
 * son contexto de la cifra grande, no cifras hermanas.
 *
 * Medidas tomadas de web/design/01-resumen.html.
 */

interface WealthHeaderProps {
  /** Ya formateado en la moneda activa: "11.191,30". */
  totalValue: string;
  currency: string;
  /** Con signo: "−754,89 US$" y "−6,32 %". */
  changeAmount: string;
  changePercent: string;
  isPositive: boolean;
  pricesUpdatedLabel: string;
  onRefresh?: ReactNode;
  deposited: string;
  yieldTotal: string;
  pnl: string;
  pnlPercent: string;
  /** Bloque de estado de lectura, a la derecha. */
  syncStatus?: ReactNode;
}

export function WealthHeader({
  totalValue,
  currency,
  changeAmount,
  changePercent,
  isPositive,
  pricesUpdatedLabel,
  onRefresh,
  deposited,
  yieldTotal,
  pnl,
  pnlPercent,
  syncStatus,
}: WealthHeaderProps) {
  const changeColor = isPositive ? "var(--profit)" : "var(--loss)";

  return (
    <header style={{ paddingTop: 56 }}>
      <div className="pcx-stack-narrow flex items-start gap-16">
        <div>
      {/* `h1` de la pantalla: es lo que un lector de pantalla anuncia al
          llegar. Sin él, la página no se presenta. Va con el mismo aspecto que
          tenía como texto suelto — el peso semántico no cambia el dibujo. */}
      <h1
            style={{
              margin: 0,
              fontSize: "var(--text-body)",
              fontWeight: 400,
              color: "var(--faint)",
              marginBottom: 14,
            }}
          >
            Patrimonio total
          </h1>

          <div className="flex items-end gap-7 whitespace-nowrap">
            <div
              className="tabular-nums pcx-hero-figure"
              style={{
                fontSize: "var(--text-hero)",
                fontWeight: 600,
                lineHeight: 0.92,
                letterSpacing: "-0.028em",
              }}
            >
              {totalValue} {/* La moneda pesa menos que la cifra: el número es el dato. */}
              <span
                style={{
                  fontSize: 26,
                  fontWeight: 400,
                  letterSpacing: "-0.01em",
                  color: "var(--muted)",
                }}
              >
                {currency}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-[14px]" style={{ marginTop: 18 }}>
            <span
              className="tabular-nums"
              style={{ fontSize: 18, fontWeight: 500, color: changeColor }}
            >
              {changeAmount}
            </span>
            <span
              className="h-[14px] w-px"
              style={{ background: "var(--line)" }}
              aria-hidden="true"
            />
            <span
              className="tabular-nums"
              style={{ fontSize: 18, fontWeight: 500, color: changeColor }}
            >
              {changePercent}
            </span>
            <span
              style={{
                fontSize: "var(--text-label)",
                color: "var(--faint)",
                marginLeft: 6,
              }}
            >
              frente al total depositado
            </span>
          </div>

          <div className="flex items-baseline gap-[10px]" style={{ marginTop: 14 }}>
            <span style={{ fontSize: "var(--text-label)", color: "var(--faint)" }}>
              {pricesUpdatedLabel}
            </span>
            {onRefresh}
          </div>
        </div>

        {syncStatus ? <div className="ml-auto text-right">{syncStatus}</div> : null}
      </div>

      {/* Contexto de la cifra: texto corrido sobre un filo, nunca tarjetas. */}
      <div
        className="flex flex-wrap items-baseline gap-x-11 gap-y-3 border-t"
        style={{ marginTop: 40, paddingTop: 16, borderColor: "var(--line)" }}
      >
        <SummaryStat label="Depositado" value={deposited} />
        <SummaryStat label="Rendimiento" value={yieldTotal} />
        <SummaryStat label="P&L" value={pnl} note={`(${pnlPercent})`} />
      </div>
    </header>
  );
}

function SummaryStat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline gap-[9px]">
      <span style={{ fontSize: "var(--text-label)", color: "var(--faint)" }}>{label}</span>
      <span
        className="tabular-nums"
        style={{ fontSize: 14, fontWeight: 500, color: "var(--muted)" }}
      >
        {value}
      </span>
      {note ? (
        <span
          className="tabular-nums"
          style={{ fontSize: "var(--text-label)", color: "var(--faint)" }}
        >
          {note}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Estado de la lectura automática. El punto cian latiendo es el ÚNICO elemento
 * animado del producto, y el único uso legítimo del cian: la identidad lo
 * reserva a sincronización y datos en vivo.
 */
export function SyncStatus({
  walletsLabel,
  syncedLabel,
}: {
  walletsLabel: string;
  syncedLabel: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-end gap-2">
        <span
          className="h-[6px] w-[6px] rounded-full pcx-pulse"
          style={{ background: "var(--accent-secondary)" }}
          aria-hidden="true"
        />
        <span style={{ fontSize: "var(--text-body)", color: "var(--muted)" }}>
          Lectura automática
        </span>
      </div>
      <div
        style={{
          fontSize: "var(--text-meta)",
          color: "var(--faint)",
          marginTop: 7,
        }}
      >
        {walletsLabel}
      </div>
      <div
        style={{
          fontSize: "var(--text-meta)",
          color: "var(--faint)",
          marginTop: 4,
        }}
      >
        {syncedLabel}
      </div>
    </div>
  );
}
