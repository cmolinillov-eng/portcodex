import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME, PROFILE_ID_COOKIE_NAME } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/security/csrf";

function clearSessionCookies(response: NextResponse): void {
  response.cookies.set(ACCESS_TOKEN_COOKIE_NAME, "", {
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE_NAME, "", {
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(PROFILE_ID_COOKIE_NAME, "", {
    path: "/",
    maxAge: 0,
  });
}

function isSafeLogoutNavigation(request: NextRequest): boolean {
  const fetchSite = (request.headers.get("sec-fetch-site") ?? "").trim().toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site" && fetchSite !== "none") {
    return false;
  }

  const referer = (request.headers.get("referer") ?? "").trim();
  if (!referer) return true;

  try {
    const refererOrigin = new URL(referer).origin;
    return refererOrigin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const csrfCheck = validateCsrf(request);
  if (!csrfCheck.ok) {
    return NextResponse.json({ error: csrfCheck.error }, { status: csrfCheck.status });
  }

  const response = NextResponse.json({ ok: true });
  response.headers.set("cache-control", "no-store");
  clearSessionCookies(response);
  return response;
}

export async function GET(request: NextRequest) {
  if (!isSafeLogoutNavigation(request)) {
    return NextResponse.json({ error: "Petición bloqueada por seguridad de origen." }, { status: 403 });
  }

  /*
   * Redirección abierta. Comprobado explotable en producción antes de este
   * arreglo:
   *
   *   /api/auth/logout?redirectTo=//example.com/x  →  307 a https://example.com/x
   *
   * El filtro era `startsWith("/")`, y «//example.com» empieza por «/». Pero el
   * navegador NO lo lee como una ruta: `//host` es una URL protocolo-relativa, y
   * `new URL()` la resuelve al dominio ajeno conservando el esquema. La forma
   * absoluta («https://…») sí se rechazaba; esta se colaba.
   *
   * Importa porque es la ruta de CERRAR SESIÓN: un enlace con portcodex.com a
   * la vista le borra la sesión al cliente y lo deposita en un login falso,
   * justo cuando espera ver un login. Y llega sin `referer` desde un correo, así
   * que la comprobación de origen de arriba no lo frena.
   *
   * Se exige una barra NO seguida de otra barra ni de contra-barra —Chrome
   * normaliza «/\» a «//»—, es decir, una ruta interna de verdad.
   */
  const redirectTo = request.nextUrl.searchParams.get("redirectTo") ?? "/login";
  const esRutaInterna = /^\/(?![/\\])/.test(redirectTo);
  const target = esRutaInterna ? redirectTo : "/login";
  const response = NextResponse.redirect(new URL(target, request.url));
  response.headers.set("cache-control", "no-store");
  clearSessionCookies(response);
  return response;
}
