// Ingesta automática desde el WORKER (GitHub Actions), no desde el navegador.
//
// Antes, la auto-ingesta de eventos on-chain (harvests, depósitos, retiradas,
// llegadas a holds) solo corría cuando un OPERADOR abría el dashboard de ese
// cliente: si el gestor no entraba, la contabilidad de ese portfolio quedaba
// congelada aunque el worker sí emitiera los eventos. Este paso recorre TODOS
// los portfolios con eventos pendientes y dispara la misma ruta de ingesta
// auditada (/api/onchain/events GET) con un secreto de servicio → la app cobra
// vida sola.
//
// Variables: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// CRON_SECRET (compartido con el endpoint) y APP_URL (base del sitio, p. ej.
// https://portcodex.com). Sin CRON_SECRET o APP_URL, el paso no hace nada.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const APP_URL = (process.env.APP_URL || "").replace(/\/$/, "");

if (!CRON_SECRET || !APP_URL) {
  console.log("onchain-ingest: sin CRON_SECRET o APP_URL — paso omitido.");
  process.exit(0);
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Solo portfolios con eventos pendientes (no gastar llamadas en los que no lo
// necesitan). distinct por portfolio_id.
const { data: pend, error } = await sb
  .from("onchain_events")
  .select("portfolio_id")
  .eq("status", "pending");
if (error) {
  console.error("Error leyendo onchain_events:", error.message);
  process.exit(1);
}
const portfolioIds = [...new Set((pend ?? []).map((r) => r.portfolio_id))];
if (portfolioIds.length === 0) {
  console.log("onchain-ingest: sin eventos pendientes.");
  process.exit(0);
}

let total = 0;
for (const pid of portfolioIds) {
  try {
    const res = await fetch(`${APP_URL}/api/onchain/events?portfolioId=${pid}`, {
      headers: { "x-cron-secret": CRON_SECRET },
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      console.error(`  ${pid.slice(0, 8)}: HTTP ${res.status}`);
      continue;
    }
    const json = await res.json();
    const n = Number(json.autoIngested ?? 0);
    total += n;
    if (n > 0) console.log(`  ✅ ${pid.slice(0, 8)}: ${n} eventos ingeridos`);
  } catch (e) {
    console.error(`  ${pid.slice(0, 8)}: ${String(e.message).slice(0, 80)}`);
  }
}
console.log(`onchain-ingest: ${total} eventos ingeridos en ${portfolioIds.length} portfolios.`);
process.exit(0);
