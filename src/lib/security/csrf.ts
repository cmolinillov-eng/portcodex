import type { NextRequest } from "next/server";

type CsrfValidationResult = { ok: true } | { ok: false; error: string; status: number };

function cleanText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return "";
  }
}

function getAllowedOrigins(request: NextRequest): Set<string> {
  const allowed = new Set<string>();
  const requestOrigin = normalizeOrigin(request.nextUrl.origin);
  if (requestOrigin) allowed.add(requestOrigin);

  const appUrl = normalizeOrigin(cleanText(process.env.NEXT_PUBLIC_APP_URL));
  if (appUrl) allowed.add(appUrl);

  const vercelUrl = cleanText(process.env.VERCEL_URL);
  if (vercelUrl) {
    const normalized = normalizeOrigin(`https://${vercelUrl}`);
    if (normalized) allowed.add(normalized);
  }

  return allowed;
}

export function validateCsrf(request: NextRequest): CsrfValidationResult {
  const originHeader = cleanText(request.headers.get("origin"));
  if (!originHeader) {
    if (process.env.NODE_ENV !== "production") {
      return { ok: true };
    }
    return {
      ok: false,
      error: "Petición bloqueada por CSRF: cabecera Origin ausente.",
      status: 403,
    };
  }

  const origin = normalizeOrigin(originHeader);
  const allowedOrigins = getAllowedOrigins(request);
  if (!origin || !allowedOrigins.has(origin)) {
    return {
      ok: false,
      error: "Petición bloqueada por CSRF: origen no permitido.",
      status: 403,
    };
  }

  return { ok: true };
}

