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
  const redirectTo = request.nextUrl.searchParams.get("redirectTo") ?? "/login";
  const target = redirectTo.startsWith("/") ? redirectTo : "/login";
  const response = NextResponse.redirect(new URL(target, request.url));
  response.headers.set("cache-control", "no-store");
  clearSessionCookies(response);
  return response;
}
