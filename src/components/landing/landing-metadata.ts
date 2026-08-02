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

export const landingMetadata: Metadata = {
  // La portada define su propio `metadataBase` porque es la única página cuyo
  // Open Graph se comparte fuera: sin base, la imagen se serviría relativa y
  // ninguna red social la resolvería.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
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

