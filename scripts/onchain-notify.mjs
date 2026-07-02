// Aviso por email de operaciones on-chain pendientes de confirmar.
// Corre tras el escáner (GitHub Action). Envía un resumen por portfolio con
// los eventos en estado "pending" que aún no se hayan avisado.
//
// OPCIONAL Y GRATIS: solo actúa si existen RESEND_API_KEY (resend.com, plan
// gratuito) y NOTIFY_EMAIL (destinatario). Sin esas variables, sale sin hacer
// nada — el resto del pipeline no depende de este paso.
//
// Idempotencia sin migraciones: los eventos avisados se marcan reutilizando
// onchain_scan_state con protocol "_notify" (last_block = epoch del último
// aviso); solo se avisan eventos creados después.
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

const RESEND_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
if (!RESEND_KEY || !NOTIFY_EMAIL) {
  console.log("Notificaciones desactivadas (faltan RESEND_API_KEY / NOTIFY_EMAIL).");
  process.exit(0);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan variables de Supabase.");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const KIND_LABEL = {
  harvest: "Harvest",
  deposit: "Depósito LP",
  withdraw: "Retirada LP",
  lending_supply: "+Colateral",
  lending_withdraw: "−Colateral",
  lending_borrow: "+Préstamo",
  lending_repay: "−Préstamo",
  transfer_in: "Entrada",
  transfer_out: "Salida",
};

const usd = (n) => (n == null ? "—" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);

async function main() {
  // Marca de último aviso por portfolio (epoch segundos).
  const { data: marks } = await sb
    .from("onchain_scan_state")
    .select("portfolio_id, last_block")
    .eq("protocol", "_notify");
  const lastByPortfolio = new Map((marks ?? []).map((m) => [m.portfolio_id, Number(m.last_block)]));

  const { data: events, error } = await sb
    .from("onchain_events")
    .select("portfolio_id, kind, chain, protocol, label, value_usd, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) { console.error(error.message); process.exit(1); }

  // Agrupar por portfolio los eventos posteriores al último aviso.
  const byPortfolio = new Map();
  for (const ev of events ?? []) {
    const created = Math.floor(new Date(ev.created_at).getTime() / 1000);
    if (created <= (lastByPortfolio.get(ev.portfolio_id) ?? 0)) continue;
    if (!byPortfolio.has(ev.portfolio_id)) byPortfolio.set(ev.portfolio_id, []);
    byPortfolio.get(ev.portfolio_id).push(ev);
  }
  if (!byPortfolio.size) { console.log("Sin eventos nuevos que avisar."); return; }

  // Nombre del portfolio para el asunto.
  const ids = [...byPortfolio.keys()];
  const { data: portfolios } = await sb.from("portfolios").select("id, name").in("id", ids);
  const nameById = new Map((portfolios ?? []).map((p) => [p.id, p.name]));

  const now = Math.floor(Date.now() / 1000);
  for (const [portfolioId, evs] of byPortfolio) {
    const name = nameById.get(portfolioId) ?? portfolioId.slice(0, 8);
    const lines = evs.map((ev) =>
      `<tr><td style="padding:4px 12px 4px 0">${KIND_LABEL[ev.kind] ?? ev.kind}</td><td style="padding:4px 12px 4px 0">${ev.label ?? ""} · ${ev.protocol} · ${ev.chain}</td><td style="padding:4px 0;text-align:right;font-family:monospace">${usd(ev.value_usd)}</td></tr>`,
    );
    const html = `
      <p>Se han detectado <strong>${evs.length}</strong> operaciones on-chain nuevas en <strong>${name}</strong>, pendientes de confirmar en el panel «En vivo»:</p>
      <table style="border-collapse:collapse;font-size:14px">${lines.join("")}</table>
      <p style="color:#888;font-size:12px">Confírmalas o descártalas desde el dashboard (sección En vivo → Operaciones detectadas).</p>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Portfolio <onboarding@resend.dev>",
        to: [NOTIFY_EMAIL],
        subject: `Portfolio ${name}: ${evs.length} operaciones on-chain detectadas`,
        html,
      }),
    });
    if (!res.ok) {
      console.error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
      continue; // sin marcar: se reintenta en el próximo run
    }
    await sb.from("onchain_scan_state").upsert(
      { portfolio_id: portfolioId, chain: "_notify", protocol: "_notify", last_block: now, updated_at: new Date().toISOString() },
      { onConflict: "portfolio_id,chain,protocol" },
    );
    console.log(`Aviso enviado: ${name} (${evs.length} eventos).`);
  }
}

main();
