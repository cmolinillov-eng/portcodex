#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
const required = [
  // Sin esto el cron diario devuelve 401 todas las noches, en silencio.
  "CRON_SECRET",
  // Se incrusta al compilar: si falta, las canónicas apuntan a localhost.
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPERADMIN_USER_ID",
  "SUPERADMIN_EMAIL",
  
];
const recommended = [
  "COINGECKO_API_KEY",
  // Sin estas dos el bypass de servicio queda INERTE, que es el estado seguro:
  // el cron no puede leer ni escribir nada. Se declaran aquí para que se sepa
  // que existen, no porque falten para arrancar.
  "CRON_WRITE_SECRET",
  "SERVICE_PORTFOLIO_IDS",
];
const productionRules = ["ENABLE_DEV_AUTH_FALLBACK=false", "DEV_VIEWER_USER_ID empty or undefined"];

function parseEnv(raw) {
  const result = new Map();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    result.set(key, value);
  }
  return result;
}

if (!fs.existsSync(envPath)) {
  console.log("FAIL: .env.local not found");
  process.exit(1);
}

const envRaw = fs.readFileSync(envPath, "utf8");
const env = parseEnv(envRaw);

let hasError = false;
console.log("Release env check (.env.local):");

for (const key of required) {
  const value = env.get(key);
  const ok = typeof value === "string" && value.length > 0 && value !== '""' && value !== "''";
  console.log(`- ${key}: ${ok ? "OK" : "MISSING_OR_EMPTY"}`);
  if (!ok) hasError = true;
}

for (const key of recommended) {
  const value = env.get(key);
  const ok = typeof value === "string" && value.length > 0 && value !== '""' && value !== "''";
  console.log(`- ${key}: ${ok ? "OK (recommended)" : "MISSING (recommended)"}`);
}

console.log("\nProduction rules reminder:");
for (const line of productionRules) {
  console.log(`- ${line}`);
}

if (hasError) {
  process.exit(1);
}
process.exit(0);
