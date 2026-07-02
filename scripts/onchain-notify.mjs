// Aviso por email de operaciones on-chain detectadas, POR PORTFOLIO:
// cada cliente recibe lo suyo en el email de su perfil (portfolios.owner_id →
// profiles.email). Si existe NOTIFY_EMAIL, el gestor va en copia de todos.
// Corre tras el escáner (GitHub Action).
//
// OPCIONAL Y GRATIS: solo actúa si existe RESEND_API_KEY (resend.com, plan
// gratuito). Sin ella, sale sin hacer nada.
//   ⚠️ Con el remitente por defecto (onboarding@resend.dev) Resend solo
//   permite enviar AL correo del dueño de la cuenta Resend. Para que lleguen
//   a los clientes: verificar un dominio en Resend (gratis) y definir
//   NOTIFY_FROM="Portcodex <avisos@tudominio.com>".
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
const MANAGER_EMAIL = process.env.NOTIFY_EMAIL || null; // gestor en copia (opcional)
const FROM = process.env.NOTIFY_FROM || "Portcodex <onboarding@resend.dev>";
if (!RESEND_KEY) {
  console.log("Notificaciones desactivadas (falta RESEND_API_KEY).");
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

  // Nombre + email del DUEÑO de cada portfolio (cada cliente recibe lo suyo).
  const ids = [...byPortfolio.keys()];
  const { data: portfolios } = await sb.from("portfolios").select("id, name, owner_id").in("id", ids);
  const ownerIds = [...new Set((portfolios ?? []).map((p) => p.owner_id).filter(Boolean))];
  const { data: owners } = ownerIds.length
    ? await sb.from("profiles").select("id, email").in("id", ownerIds)
    : { data: [] };
  const emailByProfile = new Map((owners ?? []).map((o) => [o.id, o.email]));
  const infoById = new Map(
    (portfolios ?? []).map((p) => [p.id, { name: p.name, ownerEmail: emailByProfile.get(p.owner_id) ?? null }]),
  );

  const now = Math.floor(Date.now() / 1000);
  for (const [portfolioId, evs] of byPortfolio) {
    const info = infoById.get(portfolioId) ?? { name: portfolioId.slice(0, 8), ownerEmail: null };
    const name = info.name;
    // Destinatarios: el dueño del portfolio; el gestor (NOTIFY_EMAIL) en copia.
    const to = [info.ownerEmail, MANAGER_EMAIL].filter(Boolean);
    if (!to.length) {
      console.log(`Sin destinatario para ${name} (dueño sin email y sin NOTIFY_EMAIL) — omitido.`);
      continue;
    }
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
        from: FROM,
        to,
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
