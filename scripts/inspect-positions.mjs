import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function parseEnvFile(envPath) {
  const raw = fs.readFileSync(envPath, "utf8");
  const entries = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    entries[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return entries;
}
const env = parseEnvFile(path.join(process.cwd(), ".env.local"));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const num = (v) => (v == null ? 0 : Number(v));
function meta(tx) {
  let m = tx.metadata;
  if (typeof m === "string") { try { m = JSON.parse(m); } catch { m = null; } }
  return m && typeof m === "object" ? m : {};
}

const POSITIONS = [
  "9a1f1379-2efd-4189-8211-4d2f5d5e9862", // source LP (ProjectX / MFITA)
  "2fdd5cd9-7075-4842-8014-66f4900e5452", // target BTC
];

for (const pid of POSITIONS) {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, protocol, position_id, position_type, type, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount, spot_price, metadata, notes, transaction_date, deleted_at")
    .eq("position_id", pid)
    .order("transaction_date", { ascending: true });
  if (error) { console.error(error.message); continue; }
  console.log(`\n===== POSITION ${pid} (${data[0]?.protocol}) — ${data.length} filas =====`);
  for (const t of data) {
    const m = meta(t);
    const f = [];
    if (m.reason) f.push(`reason=${m.reason}`);
    if (m.source) f.push(`source=${m.source}`);
    if (m.depositedDelta !== undefined) f.push(`dDelta=${m.depositedDelta}`);
    if (m.closure) f.push(`CLOSURE=${JSON.stringify(m.closure)}`);
    if (t.deleted_at) f.push(`DELETED`);
    console.log(
      `  [${(t.transaction_date || "").slice(0, 19)}] ${String(t.type).padEnd(16)} ` +
      `in:(${num(t.token_in_amount)} ${t.token_in_symbol || "-"}) out:(${num(t.token_out_amount)} ${t.token_out_symbol || "-"}) ` +
      `sp=${num(t.spot_price)} ${f.join(" ")}  id=${t.id}`,
    );
  }

  // Net balances + deposited like the dashboard
  const IN = new Set(["deposit","staking_deposit","lp_deposit","lending_supply"]);
  const OUT = new Set(["withdrawal","staking_withdrawal","lp_withdraw","lending_withdraw"]);
  const bal = {}; let dep = 0;
  for (const t of data) {
    if (t.deleted_at) continue;
    const ty = String(t.type).trim();
    if (ty === "position_closed") continue;
    const m = meta(t);
    const isRb = m.reason === "rebalance_transfer" || m.source === "rebalance_transfer";
    const isInt = isRb || m.reason === "harvest_reinvest" || m.source === "harvest_reinvest";
    const dd = typeof m.depositedDelta === "number" ? m.depositedDelta : null;
    if (IN.has(ty)) {
      const s = (t.token_in_symbol||"").toUpperCase();
      if (s) bal[s] = (bal[s]||0)+num(t.token_in_amount);
      if (!isInt) dep += num(t.token_in_amount)*num(t.spot_price);
      if (isRb && dd!==null) dep += dd;
    } else if (OUT.has(ty)) {
      const s = (t.token_out_symbol||"").toUpperCase();
      if (s) bal[s] = (bal[s]||0)-num(t.token_out_amount);
      if (!isInt) dep -= num(t.token_out_amount)*num(t.spot_price);
      if (isRb && dd!==null) dep += dd;
    }
  }
  console.log(`  -> balances: ${JSON.stringify(bal)}  deposited(dashboard-style)=${dep.toFixed(2)}`);
}
