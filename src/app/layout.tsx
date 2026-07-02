import type { Metadata } from "next";
import { Geist, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const uiFont = Geist({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const monoFont = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const designerFont = Space_Grotesk({
  variable: "--font-designer",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
      <body className={`${uiFont.variable} ${monoFont.variable} ${designerFont.variable} antialiased bg-[#08090b] text-[#eaebee]`}>
        {children}
      </body>
    </html>
  );
}
