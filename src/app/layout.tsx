import type { Metadata } from "next";
import { Archivo, Public_Sans, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

// Sistema «Instrumento» — tres voces tipográficas:
// Public Sans (UI) · Spline Sans Mono (datos) · Archivo (display).
const uiFont = Public_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const monoFont = Spline_Sans_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const designerFont = Archivo({
  variable: "--font-designer",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
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
