import type { NextConfig } from "next";

const defaultAllowedDevOrigins = [
  "localhost",
  "127.0.0.1",
];

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
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

const nextConfig: NextConfig = {
  allowedDevOrigins,
};

export default nextConfig;
