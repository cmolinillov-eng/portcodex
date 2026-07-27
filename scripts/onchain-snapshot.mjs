// Refresco del SNAPSHOT on-chain desde el WORKER (GitHub Actions).
//
// El snapshot (onchain_cache source="snapshot") es de donde el dashboard saca
// el PATRIMONIO TOTAL. Solo lo escribía /api/wallet/live, es decir: únicamente
// cuando un operador abría el panel de ese cliente. Resultado: los portfolios
// que nadie visitaba mostraban un patrimonio congelado — se midieron snapshots
// de más de 20 días, ajenos a cualquier movimiento de precio.
//
// Este paso recorre TODOS los portfolios con wallets activas y fuerza la misma
// ruta auditada (/api/wallet/live?refresh=1) con el secreto de servicio, para
// que el valor de cada cliente esté al día sin que nadie entre.
//
// Variables: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// CRON_SECRET (compartido con el endpoint) y APP_URL. Sin CRON_SECRET o
// APP_URL, el paso no hace nada.
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
  console.log("onchain-snapshot: sin CRON_SECRET o APP_URL — paso omitido.");
  process.exit(0);
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Solo portfolios con wallets activas: sin wallets no hay nada que leer.
const { data: wallets, error } = await sb
  .from("portfolio_wallets")
  .select("portfolio_id")
  .eq("is_active", true);
if (error) {
  console.error("Error leyendo portfolio_wallets:", error.message);
  process.exit(1);
}

const portfolioIds = [...new Set((wallets ?? []).map((w) => w.portfolio_id))];
if (portfolioIds.length === 0) {
  console.log("onchain-snapshot: sin portfolios con wallets activas.");
  process.exit(0);
}

let ok = 0;
for (const pid of portfolioIds) {
  try {
    const res = await fetch(`${APP_URL}/api/wallet/live?portfolioId=${pid}&refresh=1`, {
      headers: { "x-cron-secret": CRON_SECRET },
    });
    if (!res.ok) {
      console.error(`  ${pid.slice(0, 8)}: HTTP ${res.status}`);
      continue;
    }
    const body = await res.json().catch(() => null);
    const n = Array.isArray(body?.positions) ? body.positions.length : 0;
    const total = (body?.positions ?? []).reduce(
      (s, p) => s + Number(p.valueUsd ?? 0) + Number(p.unclaimedUsd ?? 0),
      0,
    );
    console.log(`  ${pid.slice(0, 8)}: ${n} posiciones · $${total.toFixed(2)}`);
    ok++;
  } catch (e) {
    console.error(`  ${pid.slice(0, 8)}: ${String(e.message).slice(0, 120)}`);
  }
}
console.log(`onchain-snapshot: ${ok}/${portfolioIds.length} portfolios refrescados.`);
