import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Identidad PortCodex «Institutional Editorial».
//
// Geist queda DESCARTADA a propósito: su uso masivo en herramientas de IA y
// productos SaaS hacía que la marca se leyera como tecnológica genérica.
//
//  --font-ui        Inter — toda la interfaz de producto.
//  --font-designer  SÖHNE — marca y titulares. Es de pago (Klim Type Foundry)
//                   y no está en Google Fonts, así que HOY cae en Inter. Para
//                   activarla: deja los .woff2 en public/brand/fonts/ y
//                   sustituye esta constante por un localFont (ver más abajo).
//  --font-mono      IBM Plex Mono — SOLO función: wallets, hashes,
//                   identificadores. No es lenguaje de marca (§5).
const uiFont = Inter({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const monoFont = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

// PUNTO DE ENGANCHE PARA SÖHNE. Cuando exista la licencia:
//
//   import localFont from "next/font/local";
//   const designerFont = localFont({
//     variable: "--font-designer",
//     display: "swap",
//     src: [
//       { path: "../../public/brand/fonts/soehne-buch.woff2",    weight: "400" },
//       { path: "../../public/brand/fonts/soehne-kraftig.woff2", weight: "600" },
//     ],
//   });
//
// Hasta entonces, titulares en Inter: sobrio y correcto, aunque sin el carácter
// editorial que aporta Söhne.
const designerFont = Inter({
  variable: "--font-designer",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PortCodex | Claridad y Control",
  description: "Gestión profesional de patrimonio DeFi",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body className={`${uiFont.variable} ${monoFont.variable} ${designerFont.variable} antialiased bg-[#101318] text-[#edf0f3]`}>
        {children}
      </body>
    </html>
  );
}
