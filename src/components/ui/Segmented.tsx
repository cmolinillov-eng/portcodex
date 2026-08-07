"use client";

/**
 * Control segmentado: pista de un píxel sobre superficie elevada, y el segmento
 * activo con el fondo azul suave del sistema.
 *
 * Dos cosas cambiaron aquí y las dos venían del sistema anterior:
 *
 *  1. El segmento activo era una «placa verde suave» con el verde derogado,
 *     en el selector de rango del gráfico de evolución — o sea, a la vista en
 *     el Resumen. Pasa a `--accent-soft`, que es justo lo que el sistema
 *     define como «fondo de navegación activa, chips».
 *  2. Iba en MONOESPACIADA. La regla tipográfica del proyecto dice que la mono
 *     es auxiliar y solo funcional —wallets, hashes, identificadores— y «nunca
 *     titulares, claims, navegación, botones ni cifras». Esto es navegación.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-lg border border-[var(--line)] bg-[var(--void-elevated)] p-0.5"
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium tabular-nums transition-colors ${
              active
                ? "bg-[var(--accent-soft)] text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
