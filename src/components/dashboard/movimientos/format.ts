import { dateTime } from "@/lib/format/figures";

/**
 * Dos formatos de fecha que Movimientos necesita y que `lib/format/figures.ts`
 * todavía no expone.
 *
 * **Su sitio es figures.ts**, junto a `shortDate`, `dateTime` y `longDate`: son
 * formato, y el formato vive en un único lugar para que las ocho pantallas
 * escriban las fechas igual. Están aquí porque el encargo de esta pantalla
 * prohibía tocar `src/lib/`. Muévelas en cuanto se pueda; no hay nada en ellas
 * que sea propio de Movimientos.
 */

/**
 * Hora del día: «18:27».
 *
 * En un extracto agrupado por día, la fecha ya la da el separador de grupo y
 * repetirla en cada fila sería ruido: la columna solo necesita la hora.
 *
 * Se deriva de `dateTime()` en vez de volver a llamar a Intl para que la hora
 * salga SIEMPRE igual que la de las demás pantallas, incluso si mañana cambian
 * el reloj a 12 h o el separador.
 */
export function timeOfDay(iso: string): string {
  const stamp = dateTime(iso); // «12 jul · 18:27»
  const cut = stamp.lastIndexOf(" · ");
  return cut === -1 ? stamp : stamp.slice(cut + 3);
}

/**
 * Cabecera de un grupo de día: «12 julio 2026».
 *
 * Con el mes ENTERO y con año, al contrario que `shortDate`. Es el único rótulo
 * de fecha de la pantalla —las trece filas cuelgan de él— y abreviarlo a
 * «12 jul» para ahorrar cuatro caracteres en una línea que va sobrada no sale a
 * cuenta. Sin los «de» del español largo: en un rótulo de tabla estorban.
 */
export function groupDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;

  const parts = new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(new Date(t));

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${value("day")} ${value("month")} ${value("year")}`;
}

/** Clave de agrupación: el día natural de la operación. */
export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}
