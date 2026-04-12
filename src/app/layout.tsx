import type { Metadata } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans, Readex_Pro } from "next/font/google";
import "./globals.css";

const uiFont = Plus_Jakarta_Sans({
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

const designerFont = Readex_Pro({
  variable: "--font-designer",
  subsets: ["latin"],
  weight: ["200", "300", "400"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PortCodex | Claridad y Control",
  description: "Elite Crypto Portfolio Tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body className={`${uiFont.variable} ${monoFont.variable} ${designerFont.variable} antialiased bg-[#0A0A0B] text-white`}>
        {children}
      </body>
    </html>
  );
}
