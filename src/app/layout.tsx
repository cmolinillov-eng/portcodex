import type { Metadata } from "next";
import { Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Identidad PortCodex «Institutional Editorial» — UNA sola familia.
//
// Public Sans es la tipografía oficial de marca Y de producto: institucional,
// neutra, muy legible y —esto es lo que la hace idónea aquí— ajena a la
// estética habitual de IA y SaaS. Es libre y de licencia abierta.
// Descartadas por el camino: Geist (se lee como marca de IA) y Söhne (de pago).
//
//  --font-ui / --font-designer  Public Sans — todo: titulares, interfaz, cifras.
//  --font-mono                  IBM Plex Mono — SOLO función: wallets, hashes,
//                               identificadores. Nunca titulares, claims,
//                               navegación, botones ni cifras grandes.
const uiFont = Public_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const monoFont = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

// Misma familia: --font-designer se conserva porque lo usan los componentes,
// pero la identidad ya no distingue voz de marca y voz de producto.
const designerFont = uiFont;

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
