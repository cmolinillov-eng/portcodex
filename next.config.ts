import type { NextConfig } from "next";

const defaultAllowedDevOrigins = [
  "localhost",
  "127.0.0.1",
];

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const appHostname = (() => {
  if (appUrl.length === 0) return "";
  try {
    return new URL(appUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
})();
const allowedDevOrigins = Array.from(
  new Set(appHostname.length > 0 ? [...defaultAllowedDevOrigins, appHostname] : defaultAllowedDevOrigins),
);

const supabaseOrigin = (() => {
  if (supabaseUrl.length === 0) return "";
  try {
    return new URL(supabaseUrl).origin.toLowerCase();
  } catch {
    return "";
  }
})();

const connectSources = (() => {
  const sources = new Set<string>([
    "'self'",
    "https://api.coingecko.com",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://prod.spline.design",
    "https://*.spline.design",
  ]);

  if (supabaseOrigin) {
    sources.add(supabaseOrigin);
    try {
      const host = new URL(supabaseOrigin).host;
      sources.add(`wss://${host}`);
    } catch {
      // noop
    }
  }

  return Array.from(sources).join(" ");
})();

const scriptSrc =
  process.env.NODE_ENV === "production"
    ? "'self' 'unsafe-inline'"
    : "'self' 'unsafe-inline' 'unsafe-eval'";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src ${connectSources}`,
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "upgrade-insecure-requests",
]
  .join("; ")
  .replace(/\s{2,}/g, " ")
  .trim();

const securityHeaders: Array<{ key: string; value: string }> = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
];

if (process.env.NODE_ENV === "production") {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  });
}

const nextConfig: NextConfig = {
  allowedDevOrigins,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },

  /**
   * La sección /fiscal era la fiscalidad anterior al rediseño. Quedó huérfana
   * —ningún enlace de la navegación nueva llegaba a ella— pero seguía sirviendo
   * su interfaz vieja a quien tuviera la URL guardada.
   *
   * Va aquí y no en páginas con `permanentRedirect` porque aquello NO redirigía:
   * al ser rutas sin datos, Next las prerenderiza estáticas y la redirección se
   * resuelve en el cliente, así que un `curl` —y cualquier buscador— recibía un
   * 200 con la página entera. Desde la configuración es un 308 de verdad, antes
   * de que se ejecute una línea de React.
   */
  async redirects() {
    return [
      { source: "/fiscal", destination: "/fiscalidad", permanent: true },
      { source: "/fiscal/exportar", destination: "/informes", permanent: true },
      { source: "/fiscal/operaciones", destination: "/movimientos", permanent: true },
      // El glosario todavía no tiene maqueta; sus términos siguen escritos en
      // lib/fiscal/glosario.ts. Hasta que la tenga, vuelve de donde venía.
      { source: "/fiscal/glosario", destination: "/fiscalidad", permanent: true },
    ];
  },
};

export default nextConfig;
