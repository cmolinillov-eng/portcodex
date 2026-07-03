"use client";

/**
 * Control segmentado del sistema «Instrumento»: pista hairline sobre superficie
 * elevada; el segmento activo es una placa verde suave con tinta clara. Mono,
 * compacto. Usado en el selector de rango temporal y el de ejercicio fiscal.
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
            className={`rounded-md px-3 py-1.5 font-mono text-xs font-medium tracking-wide transition-colors ${
              active
                ? "bg-[rgba(111,174,143,0.16)] text-[var(--foreground)]"
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
