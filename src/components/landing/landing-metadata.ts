import type { Metadata } from "next";

/**
 * Metadatos de la portada.
 *
 * Viven aparte porque los usan DOS rutas: la raíz del dominio, que es donde de
 * verdad se sirve la portada, y `/portada`, que solo redirige. Duplicarlos
 * garantizaría que un día dijeran cosas distintas.
 */
const TITULO = "Tu patrimonio digital, bien explicado. | PortCodex";
const DESCRIPCION =
  "PortCodex reúne tus posiciones en wallets, pools de liquidez, staking y préstamos, mantiene la contabilidad al día y prepara la información fiscal del ejercicio. Solo lectura.";

/**
 * Dominio canónico, escrito a mano y a propósito.
 *
 * Antes salía de `NEXT_PUBLIC_APP_URL`, y eso publicó durante meses una canónica
 * que apuntaba a `portcodex.vercel.app`: la variable se fijó antes de comprar el
 * dominio y nadie la volvió a mirar. Una canónica equivocada le dice a Google
 * que el sitio bueno es otro, así que no puede depender de un ajuste de panel
 * que se desincroniza en silencio. Aquí, un dominio nuevo es un cambio de código
 * revisable.
 *
 * En local se sigue usando `NEXT_PUBLIC_APP_URL` (o localhost), porque ahí lo
 * que importa es que las rutas relativas resuelvan, no el SEO.
 */
const DOMINIO_CANONICO =
  process.env.NODE_ENV === "production"
    ? "https://portcodex.com"
    : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");

export const landingMetadata: Metadata = {
  // La portada define su propio `metadataBase` porque es la única página cuyo
  // Open Graph se comparte fuera: sin base, la imagen se serviría relativa y
  // ninguna red social la resolvería.
  metadataBase: new URL(DOMINIO_CANONICO),
  title: TITULO,
  description: DESCRIPCION,
  // La canónica es la RAÍZ: `/portada` redirige aquí, y sin esto las dos
  // URLs competirían por el mismo contenido.
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: "PortCodex",
    title: TITULO,
    description: DESCRIPCION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: TITULO,
    description: DESCRIPCION,
  },
  robots: { index: true, follow: true },
};

