import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

// Control de capital: una voz geométrica para decisiones y una mono para datos.
const uiFont = Space_Grotesk({
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
      <body className={`${uiFont.variable} ${monoFont.variable} antialiased bg-[#080B14] text-[#F4F7FF]`}>
        {children}
      </body>
    </html>
  );
}
