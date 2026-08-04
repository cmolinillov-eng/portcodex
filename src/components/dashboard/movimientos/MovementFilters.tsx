"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Fila de filtros de Movimientos.
 *
 * Cuatro controles y ni uno más: plataforma, tipo de operación, ejercicio y
 * búsqueda. Todo lo que el cliente pregunta de su historial —«¿qué hice en
 * Kamino?», «¿cuántos harvests van este año?»— se contesta con esos cuatro.
 *
 * Van en filo y sin relleno: son controles de una pantalla que existe para leer
 * una tabla, y un botón sólido en cada uno competiría con las cifras.
 *
 * **El estado vive en la URL, no aquí.** Un filtro que solo existe en memoria
 * no se puede compartir, no sobrevive a un refresco y —lo que importa de
 * verdad— obligaría a mandar el histórico entero al navegador para poder
 * recortarlo. Filtrando en el servidor, la cabecera («N operaciones»), el pie
 * de procedencia y el CSV hablan siempre del MISMO conjunto que la tabla.
 *
 * Sigue siendo compatible con /preview, que pinta la maqueta sin opciones: un
 * filtro sin `options` se dibuja como el rótulo estático de la maqueta.
 */

export interface MovementFilterOption {
  value: string;
  label: string;
}

export interface MovementFilter {
  /** También el nombre del parámetro en la URL. */
  key: string;
  /** Lo SELECCIONADO, no el nombre del filtro: «Todas las plataformas», «2026». */
  label: string;
  /** De QUÉ filtra: «Plataforma», «Tipo de operación», «Ejercicio». Solo lo oye
   *  un lector de pantalla, que sin esto anunciaría «botón: 2026» a secas. */
  name?: string;
  /** Qué se puede elegir. Sin esto el control es decorativo (solo /preview). */
  options?: MovementFilterOption[];
  /** Valor activo. `""` = la opción «todas», que no viaja en la URL. */
  value?: string;
}

const CONTROL: CSSProperties = {
  padding: "7px 11px",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-sm)",
};

export function MovementFilters({
  filters,
  searchPlaceholder = "Buscar…",
  search = "",
  searchKey = "q",
  /** Parámetros que hay que conservar al filtrar —`portfolio`—. `mostrar` NO
   *  está aquí a propósito: al cambiar un filtro se vuelve a la primera página,
   *  porque «160 en pantalla» de un conjunto que ya no existe no significa nada. */
  keep,
}: {
  filters: MovementFilter[];
  searchPlaceholder?: string;
  search?: string;
  searchKey?: string;
  keep?: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(search);

  /** La URL que resulta de cambiar UN filtro dejando los demás como están. */
  function hrefWith(changedKey: string, changedValue: string): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(keep ?? {})) {
      if (value) params.set(key, value);
    }
    for (const f of filters) {
      if (!f.options) continue;
      const value = f.key === changedKey ? changedValue : (f.value ?? "");
      if (value) params.set(f.key, value);
    }
    const q = changedKey === searchKey ? changedValue : query;
    if (q.trim()) params.set(searchKey, q.trim());

    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    router.push(hrefWith(searchKey, query));
  }

  return (
    <div className="flex flex-wrap items-center" style={{ gap: 10, marginTop: 36 }}>
      {filters.map((f) =>
        f.options && f.options.length > 0 ? (
          <FilterSelect
            key={f.key}
            filter={f}
            onPick={(value) => router.push(hrefWith(f.key, value))}
          />
        ) : (
          // Sin opciones no hay nada que elegir: se queda en rótulo, que es lo
          // que pinta la maqueta y lo que necesita /preview.
          <span
            key={f.key}
            className="flex items-center"
            style={{ ...CONTROL, gap: 8 }}
            aria-label={f.name ? `${f.name}: ${f.label}` : f.label}
          >
            <span style={{ fontSize: "var(--text-label)", color: "var(--muted)" }}>{f.label}</span>
            <span style={{ fontSize: 10, color: "var(--faint)" }} aria-hidden="true">
              ▾
            </span>
          </span>
        ),
      )}

      {/* Un formulario y no un `onChange` con retardo: cada búsqueda vuelve a
          recorrer el histórico y a pedir los tipos de cambio del BCE, así que
          se busca al pulsar Intro, cuando la frase está terminada. */}
      <form
        onSubmit={submitSearch}
        role="search"
        style={{ ...CONTROL, marginLeft: "auto", minWidth: 170 }}
      >
        <input
          type="search"
          name={searchKey}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Buscar en los movimientos"
          placeholder={searchPlaceholder}
          className="w-full bg-transparent outline-none placeholder:text-[color:var(--faint)]"
          style={{ fontSize: "var(--text-label)", color: "var(--foreground)" }}
        />
      </form>
    </div>
  );
}

/**
 * Desplegable real con la apariencia de la maqueta.
 *
 * Un `<select>` nativo se dimensiona por su opción MÁS LARGA: puesto tal cual,
 * el filtro de ejercicio mediría lo que mide «Todo el histórico» aunque ponga
 * «2026», y la fila de filtros dejaría de parecerse a la maqueta. El truco es
 * un texto fantasma —invisible, con lo seleccionado— que fija el ancho, y el
 * select encima ocupando exactamente ese hueco.
 *
 * El select es el que se VE y el que se lee: no se esconde con `opacity: 0`
 * porque un control transparente desaparece de los árboles de accesibilidad y
 * el foco del teclado se quedaría sin dibujar.
 */
function FilterSelect({
  filter,
  onPick,
}: {
  filter: MovementFilter;
  onPick: (value: string) => void;
}) {
  return (
    <span className="inline-flex items-center" style={{ ...CONTROL, gap: 8 }}>
      {/* El tamaño de letra va también en el envoltorio: su altura la fija el
          «strut» de la línea, que usa SU tipografía. Heredando los 16 px del
          cuerpo, el control salía 5 px más alto que en la maqueta. */}
      <span className="relative inline-block" style={{ fontSize: "var(--text-label)" }}>
        <span aria-hidden="true" className="invisible whitespace-nowrap">
          {filter.label}
        </span>
        <select
          aria-label={filter.name ?? filter.label}
          value={filter.value ?? ""}
          onChange={(event) => onPick(event.target.value)}
          className="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent"
          style={{ fontSize: "var(--text-label)", color: "var(--muted)" }}
        >
          {filter.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
      <span aria-hidden="true" style={{ fontSize: 10, color: "var(--faint)" }}>
        ▾
      </span>
    </span>
  );
}
