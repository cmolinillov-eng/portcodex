/**
 * Formateo de cifras del rediseño 2026-07.
 *
 * Está aquí, y no repartido por los componentes, porque los decimales tienen
 * reglas y deben ser IGUALES en las ocho pantallas. Si Cartera enseña
 * «0,0260 BTC» y Movimientos «0,025986 BTC», el cliente cree que son dos
 * cantidades distintas.
 *
 * Todo en es-ES: punto de millar, coma decimal. La moneda va DETRÁS y separada
 * («11.191,30 US$»), como se escribe en español y como quedó en las maquetas.
 */

/** Menos tipográfico (U+2212), no el guion del teclado. Es lo que usan las
 *  maquetas y lo que alinea con las cifras en tabular. */
const MINUS = "−";

export type Currency = "USD" | "EUR";

const CURRENCY_SUFFIX: Record<Currency, string> = { USD: "US$", EUR: "€" };

function group(n: number, min: number, max: number): string {
  return n.toLocaleString("es-ES", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
    // El español NO agrupa los millares de cuatro cifras: «4233,84», no
    // «4.233,84». Aquí se fuerza, porque estas cifras viven en columna: si unas
    // llevan separador y otras no, dos importes del mismo orden parecen de
    // órdenes distintos. Es también lo que hacen las maquetas aprobadas.
    useGrouping: "always",
  });
}

/** Sustituye el guion que mete Intl por el menos tipográfico. */
function withMinus(s: string): string {
  return s.replace(/^-/, MINUS);
}

/**
 * Importe en la moneda activa. Dos decimales: es dinero, y en dinero los
 * céntimos no se recortan.
 */
export function money(value: number, currency: Currency = "USD"): string {
  const safe = Number.isFinite(value) ? value : 0;
  // Mismo motivo que en signedMoney: nada de «−0,00 US$».
  const rounded = Math.abs(safe) < 0.005 ? 0 : safe;
  return `${withMinus(group(rounded, 2, 2))} ${CURRENCY_SUFFIX[currency]}`;
}

/**
 * Importe SIN céntimos, para cifras de contexto donde el céntimo no aporta
 * («Depositado 11.946 US$»). Nunca para la cifra protagonista.
 */
export function moneyRound(value: number, currency: Currency = "USD"): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${withMinus(group(safe, 0, 0))} ${CURRENCY_SUFFIX[currency]}`;
}

/**
 * Importe con signo explícito. Para variaciones y para la columna de importe de
 * los movimientos, donde el signo ES el dato: dice si entró o salió dinero.
 */
export function signedMoney(value: number, currency: Currency = "USD"): string {
  const safe = Number.isFinite(value) ? value : 0;
  // Por debajo de medio céntimo la cifra se imprime como cero, y un cero con
  // signo («−0,00 US$») se lee como una pérdida que no existe.
  const sign = safe >= 0.005 ? "+" : safe <= -0.005 ? MINUS : "";
  return `${sign}${group(Math.abs(safe), 2, 2)} ${CURRENCY_SUFFIX[currency]}`;
}

/** Porcentaje con dos decimales. El espacio antes del % es obligatorio en español. */
export function percent(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${withMinus(group(safe, 2, 2))} %`;
}

/** Porcentaje con signo explícito: para rentabilidad, donde el signo es el dato. */
export function signedPercent(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const sign = safe > 0 ? "+" : safe < 0 ? MINUS : "";
  return `${sign}${group(Math.abs(safe), 2, 2)} %`;
}

/** Porcentaje de reparto: un decimal basta y dos ensucian la comparación. */
export function sharePercent(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${group(safe, 1, 1)} %`;
}

/**
 * Cantidad de un token, con los decimales que la UNIDAD exige y ni uno más.
 *
 * No es cosmética. Un bitcoin vale decenas de miles, así que 0,025986 BTC son
 * cientos de euros y recortarlo a 0,03 pierde dinero visible; un USDC vale uno,
 * así que 4.840,124 USDC con seis decimales sería ruido. La regla es el ORDEN DE
 * MAGNITUD de la cantidad, que es un buen sustituto del valor unitario sin tener
 * que consultar el precio:
 *
 *   ≥ 1.000   →  hasta 3 decimales   (4.840,124 USDC)
 *   ≥ 1       →  hasta 4 decimales   (18,9292 JTO)
 *   ≥ 0,01    →  hasta 6 decimales   (0,025986 BTC)
 *   < 0,01    →  hasta 8 decimales   (polvo: 0,00004213 ETH)
 *
 * Los ceros de relleno se quitan SIEMPRE: «19,9578», nunca «19,957800».
 */
export function tokenAmount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  if (abs === 0) return "0";

  const decimals = abs >= 1000 ? 3 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : 8;
  return withMinus(group(value, 0, decimals));
}

/**
 * PRECIO UNITARIO de un token. No es un importe de cartera, y por eso no vale
 * `money()`: un bitcoin cotiza a 80.811 US$ y un token de polvo a 0,0042 US$, y
 * las dos cifras tienen que poder leerse en la misma columna. Los decimales
 * dependen de la MAGNITUD del precio, igual que en `tokenAmount`:
 *
 *   ≥ 1.000   →  sin decimales   (80.811 US$)
 *   ≥ 1       →  2 decimales     (1,02 US$)
 *   ≥ 0,01    →  4 decimales     (0,0421 US$)
 *   < 0,01    →  6 decimales     (0,000042 US$)
 *
 * Un precio que no existe —cero, negativo o no finito— NO se imprime como
 * «0,00 US$»: eso afirma que el token no vale nada. Se devuelve «—», que es lo
 * que el documento debe enseñar cuando el dato no está. Pasa en cuanto una
 * posición es agregada (un LP no tiene «precio de entrada»: tiene dos).
 */
export function unitPrice(value: number, currency: Currency = "USD"): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  const decimals = value >= 1000 ? 0 : value >= 1 ? 2 : value >= 0.01 ? 4 : 6;
  return `${group(value, decimals, decimals)} ${CURRENCY_SUFFIX[currency]}`;
}

/**
 * Número suelto: el que no es dinero, ni porcentaje, ni cantidad de token. Hoy
 * solo el factor de salud de un lending («Factor de salud 2,14»).
 *
 * Existe para que NINGUNA cifra del producto se formatee a mano en un
 * componente: un `toLocaleString` suelto es por donde se cuela un punto decimal
 * inglés en una pantalla en español.
 *
 * Aquí los decimales SÍ se rellenan, al revés que en `tokenAmount`: estas
 * cifras se comparan entre ellas —«2,10» y «2,14» son la misma lectura a dos
 * decimales— y no son cantidades, donde el cero de relleno sobra.
 */
export function plainNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "0";
  return withMinus(group(value, decimals, decimals));
}

/** Fecha corta de fila: «27 jul». Sin año, que lo da el contexto de la pantalla. */
export function shortDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" })
    .format(new Date(t))
    .replace(".", "");
}

/** Solo la hora, en 24 h: «13:43». */
function hourOf(t: number): string {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(t));
}

/** Fecha y hora: «27 jul · 09:41». El punto medio separa mejor que la coma. */
export function dateTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return `${shortDate(iso)} · ${hourOf(t)}`;
}

/**
 * Fecha y hora del PIE de procedencia: «28 jul, 13:43».
 *
 * Va con coma y no con el punto medio de `dateTime()` porque el pie ya usa
 * « · » para separar sus tres datos («4 wallets conectadas · 17 posiciones
 * leídas · última lectura …»): con punto medio, la hora se leería como un
 * cuarto dato suelto. Es lo que hacen las maquetas de Resumen y Cartera.
 */
export function shortDateTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return `${shortDate(iso)}, ${hourOf(t)}`;
}

/** Fecha con año, para cabeceras de grupo y documentos: «27 jul 2026». */
export function longDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
    .format(new Date(t))
    .replace(".", "");
}

/**
 * Fecha, año y hora, para la cabecera y el pie de un DOCUMENTO: «7 ago 2026,
 * 10:08». Un informe patrimonial se guarda, se imprime y se compara con otro de
 * otro mes: sin año no se sabe cuál es cuál, y sin hora dos informes del mismo
 * día parecen el mismo documento.
 */
export function longDateTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return `${longDate(iso)}, ${hourOf(t)}`;
}

/**
 * Antigüedad en palabras: «hace 8 minutos», «hace 3 horas», «hace 2 días».
 *
 * Un producto que lee solo tiene que decir SIEMPRE cuándo leyó por última vez.
 * Una cifra sin fecha de lectura no es un dato, es una suposición.
 */
export function timeAgo(iso: string | null): string {
  if (!iso) return "sin lecturas";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "sin lecturas";

  const minutes = Math.floor((Date.now() - t) / 60000);
  if (minutes < 1) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} ${hours === 1 ? "hora" : "horas"}`;

  const days = Math.floor(hours / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}

/** Versión abreviada para el bloque de sincronización: «hace 8 min». */
export function timeAgoShort(iso: string | null): string {
  if (!iso) return "sin lecturas";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "sin lecturas";

  const minutes = Math.floor((Date.now() - t) / 60000);
  if (minutes < 1) return "ahora mismo";
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;

  return `hace ${Math.floor(hours / 24)} d`;
}

/** Plural sin el «(s)», que queda de formulario administrativo. */
export function plural(count: number, singular: string, plural_: string): string {
  return `${count} ${count === 1 ? singular : plural_}`;
}
