import type { Metadata } from "next";
import { Geist, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Identidad PortCodex (§26–27): Geist para TODO —interfaz, titulares, cifras—
// e IBM Plex Mono reservada a información técnica (hashes, direcciones,
// identificadores, etiquetas de sistema). La variable --font-designer se
// conserva porque la usan los componentes, pero ya apunta a Geist: la
// identidad trabaja con una única voz tipográfica.
const uiFont = Geist({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const monoFont = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const designerFont = Geist({
  variable: "--font-designer",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
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
