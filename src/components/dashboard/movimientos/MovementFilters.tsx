/**
 * Fila de filtros de Movimientos.
 *
 * Cuatro controles y ni uno más: wallet, tipo de operación, año y búsqueda.
 * Todo lo que el cliente pregunta de su historial —«¿qué hice con la wallet de
 * Ledger?», «¿cuántos harvests van este año?»— se contesta con esos cuatro.
 *
 * Van en filo y sin relleno: son controles de una pantalla que existe para leer
 * una tabla, y un botón sólido en cada uno competiría con las cifras.
 */

export interface MovementFilter {
  key: string;
  /** Lo SELECCIONADO, no el nombre del filtro: «Todas las wallets», «2026». */
  label: string;
  /** De QUÉ filtra: «Wallet», «Tipo de operación», «Ejercicio». Solo lo oye un
   *  lector de pantalla, que sin esto anunciaría «botón: 2026» a secas. */
  name?: string;
}

const CONTROL: React.CSSProperties = {
  padding: "7px 11px",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-sm)",
};

export function MovementFilters({
  filters,
  searchPlaceholder = "Buscar…",
}: {
  filters: MovementFilter[];
  searchPlaceholder?: string;
}) {
  return (
    <div className="flex flex-wrap items-center" style={{ gap: 10, marginTop: 36 }}>
      {filters.map((f) => (
        <button
          key={f.key}
          type="button"
          aria-label={f.name ? `${f.name}: ${f.label}` : f.label}
          aria-haspopup="listbox"
          className="flex items-center"
          style={{ ...CONTROL, gap: 8, cursor: "pointer" }}
        >
          <span style={{ fontSize: "var(--text-label)", color: "var(--muted)" }}>{f.label}</span>
          <span style={{ fontSize: 10, color: "var(--faint)" }} aria-hidden="true">
            ▾
          </span>
        </button>
      ))}

      <div style={{ ...CONTROL, marginLeft: "auto", minWidth: 170 }}>
        <input
          type="search"
          aria-label="Buscar en los movimientos"
          placeholder={searchPlaceholder}
          className="w-full bg-transparent outline-none placeholder:text-[color:var(--faint)]"
          style={{ fontSize: "var(--text-label)", color: "var(--foreground)" }}
        />
      </div>
    </div>
  );
}
