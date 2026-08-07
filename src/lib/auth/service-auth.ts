import { timingSafeEqual } from "node:crypto";

/**
 * Autenticación de SERVICIO: la que usan el cron y los workers para refrescar
 * carteras sin sesión de operador.
 *
 * Existe porque el snapshot on-chain solo se escribía al abrir el panel, y el
 * patrimonio de las carteras que nadie visitaba se quedaba congelado semanas
 * (se llegaron a ver lecturas de más de 20 días). El cron necesita poder
 * refrescarlas todas.
 *
 * Es el ÚNICO camino a datos sin sesión que existe en producción, así que se
 * trata con el cuidado que eso merece:
 *
 * 1. **Comparación en tiempo constante.** Con `===`, el tiempo de respuesta
 *    depende de cuántos caracteres coinciden, y eso permite adivinar el secreto
 *    byte a byte. `timingSafeEqual` tarda lo mismo acierte o falle.
 *
 * 2. **Acotado a una cartera concreta.** Antes bastaba la cabecera para leer
 *    CUALQUIER cartera, sin decir cuál: quien tuviera el secreto tenía una llave
 *    maestra. Ahora el llamante declara sobre qué cartera opera y solo puede
 *    hacerlo si está en `SERVICE_PORTFOLIO_IDS`. Si esa lista no se configura,
 *    el bypass no concede nada.
 *
 * 3. **Lectura y escritura, separadas.** `CRON_SECRET` deja leer;
 *    `CRON_WRITE_SECRET` deja además escribir. Un worker que solo refresca
 *    precios no tiene por qué poder ingerir operaciones.
 */

/** Compara dos secretos sin filtrar información por el tiempo que tarda. */
function secretsMatch(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // `timingSafeEqual` exige la misma longitud; compararla antes reintroduce una
  // filtración mínima (la longitud), que es un dato mucho menos útil que el
  // contenido y no hay forma de evitarlo con esta primitiva.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Carteras sobre las que el servicio puede operar. Vacío = ninguna. */
function allowedPortfolios(): string[] {
  return (process.env.SERVICE_PORTFOLIO_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * Las carteras que el servicio puede tocar, para los procesos que iteran (el
 * cron de snapshots). Sin esta lista, un cron que recorriera `portfolios` a
 * pelo trabajaría sobre TODAS las carteras de TODOS los clientes: el bypass de
 * servicio dejaría de estar acotado, que es justo lo que este módulo evita.
 */
export function getServicePortfolioIds(): string[] {
  return allowedPortfolios();
}

/**
 * Extrae el secreto de servicio de la petición. Se admiten dos formas porque
 * hay dos llamantes: los workers propios mandan `x-cron-secret`, y el
 * planificador de Vercel manda `Authorization: Bearer <secreto>` sin dejar
 * elegir la cabecera.
 */
export function readServiceSecret(headers: Headers): string | null {
  const direct = (headers.get("x-cron-secret") ?? "").trim();
  if (direct) return direct;
  const bearer = (headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  const token = bearer ? bearer[1].trim() : "";
  return token || null;
}

export interface ServiceAuth {
  /** El llamante ha presentado un secreto válido para esta cartera. */
  isService: boolean;
  /** Además puede ESCRIBIR (ingerir operaciones, no solo leer). */
  canWrite: boolean;
}

/**
 * ¿Es esta una llamada de servicio legítima sobre `portfolioId`?
 *
 * Devuelve `isService: false` ante la menor duda: sin secreto configurado, sin
 * lista de carteras, o con una cartera que no está en ella. El llamante debe
 * caer entonces a la comprobación normal de sesión.
 */
export function checkServiceAuth(
  headerValue: string | null,
  portfolioId: string,
): ServiceAuth {
  const permitidas = allowedPortfolios();
  // Sin lista configurada no se concede NADA: es más seguro que el cron falle
  // ruidosamente a que una cabecera abra todas las carteras.
  if (permitidas.length === 0 || !permitidas.includes(portfolioId)) {
    return { isService: false, canWrite: false };
  }

  const canWrite = secretsMatch(headerValue, process.env.CRON_WRITE_SECRET);
  const canRead = canWrite || secretsMatch(headerValue, process.env.CRON_SECRET);

  return { isService: canRead, canWrite };
}
