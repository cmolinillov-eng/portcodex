import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME } from "@/lib/auth/session";
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

  const redirectTo = request.nextUrl.searchParams.get("redirectTo") ?? "/login";
  const target = redirectTo.startsWith("/") ? redirectTo : "/login";
  const response = NextResponse.redirect(new URL(target, request.url));
  response.headers.set("cache-control", "no-store");
  clearSessionCookies(response);
  return response;
}
