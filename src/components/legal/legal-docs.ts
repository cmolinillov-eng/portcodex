/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  DOCUMENTOS LEGALES — REGISTRO ÚNICO
 *
 *  ⚠️  ESTOS TEXTOS NO ESTÁN REVISADOS POR UN ABOGADO.
 *
 *  Son un borrador redactado a partir de una auditoría del código: describen lo
 *  que la aplicación hace de verdad —qué cookies pone, a qué terceros llama, qué
 *  datos guarda— y nada más. No inventan ni un dato del responsable.
 *
 *  Antes de publicarlos hacen falta DOS cosas:
 *    Estas páginas son INFORMATIVAS, no contractuales. PortCodex todavía no se
 *    comercializa: no hay sociedad, ni contrato de servicio, ni cobro. Por eso
 *    no se identifica a ningún titular ni se fija fuero — inventarlos sería una
 *    declaración falsa, y dejar huecos a rellenar, un documento a medias.
 *
 *    CUANDO SE COMERCIALICE harán falta unas de verdad: aviso legal con el
 *    titular identificado, política de privacidad formal y condiciones con ley
 *    aplicable y fuero, todo revisado por un abogado. El punto que más lo
 *    necesitará es el reparto responsable/encargado con el gestor patrimonial.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Fecha en que se redactó este borrador. NO es la fecha de entrada en vigor:
 *  esa se fija el día que se publique tras la revisión jurídica. */
export const LEGAL_UPDATED = "30 de julio de 2026";
export const LEGAL_UPDATED_ISO = "2026-07-30";

export interface LegalDocMeta {
  href: string;
  /** Título del documento. Es el `h1` de su página. */
  title: string;
  /** Cómo se nombra en índices y en el pie: más corto. */
  short: string;
  /** Una línea que dice de qué va. Se usa en el índice y como `description`. */
  summary: string;
}

export const LEGAL_DOCS: LegalDocMeta[] = [
  {
    href: "/legal/privacidad",
    title: "Política de privacidad",
    short: "Privacidad",
    summary:
      "Qué datos trata PortCodex, con qué base jurídica, a quién se los comunica y cómo ejercer tus derechos.",
  },
  {
    href: "/legal/cookies",
    title: "Política de cookies",
    short: "Cookies",
    summary:
      "Las tres cookies que usa PortCodex, todas técnicas, y por qué no hay banner de consentimiento.",
  },
  {
    href: "/legal/condiciones",
    title: "Condiciones del servicio",
    short: "Condiciones",
    summary:
      "Qué es PortCodex y, sobre todo, qué no es: no custodia fondos, no ejecuta órdenes y no asesora.",
  },
];

/**
 * MARCADORES PENDIENTES.
 *
 * Cada entrada es un dato que solo conoce el responsable y que este equipo NO
 * puede inventar: una razón social falsa o un correo que no existe convierten la
 * política en una declaración falsa ante la AEPD y ante el cliente.
 *
 * Para rellenarlos: buscar el literal en `src/app/legal/**` y sustituir
 * `<Mark>…</Mark>` por el texto definitivo.
 */
export const PLACEHOLDERS = [
  ["RAZÓN SOCIAL", "Denominación completa del titular (persona física o jurídica)."],
  ["NIF", "NIF o CIF del titular."],
  ["DOMICILIO SOCIAL", "Dirección postal completa a efectos de notificaciones."],
  ["DATOS REGISTRALES", "Registro Mercantil, tomo, folio y hoja. Solo si el titular es sociedad."],
  ["CORREO DE CONTACTO", "Buzón real y atendido. Sirve de contacto general y de canal de derechos."],
  ["DOMINIO", "Dominio desde el que se sirve PortCodex, con protocolo."],
  ["CIUDAD DEL FUERO", "Ciudad cuyos juzgados conocerán de los litigios."],
  ["REGIÓN DE LA BASE DE DATOS", "Región del proyecto de Supabase. Decide si hay transferencia fuera del EEE."],
  ["REGIÓN DE DESPLIEGUE", "Región de despliegue en Vercel."],
  ["DELEGADO DE PROTECCIÓN DE DATOS", "Solo si se designa. Si no, la mención se elimina entera."],
] as const;
