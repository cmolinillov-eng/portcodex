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

// Pull every non-deleted row that is part of a rebalance (has a depositedDelta or
// a rebalance reason/source), grouped by operation_group_id.
const { data, error } = await supabase
  .from("transactions")
  .select("id, protocol, position_id, type, token_in_symbol, token_out_symbol, spot_price, metadata, transaction_date, operation_group_id")
  .is("deleted_at", null)
  .order("transaction_date", { ascending: true });
if (error) { console.error(error.message); process.exit(1); }

const groups = new Map();
for (const t of data) {
  const m = meta(t);
  const isReb = m.reason === "rebalance_transfer" || m.source === "rebalance_transfer" ||
                m.reason === "rebalance_harvest_out";
  if (!isReb) continue;
  const gid = t.operation_group_id || `noGID:${(t.transaction_date||"").slice(0,19)}`;
  if (!groups.has(gid)) groups.set(gid, []);
  groups.get(gid).push({ t, m });
}

console.log(`\nRebalance groups encontrados: ${groups.size}\n`);
let problems = 0;
for (const [gid, rows] of groups) {
  let sourceDelta = 0, targetDelta = 0, harvestOut = 0;
  const date = (rows[0].t.transaction_date || "").slice(0, 19);
  for (const { t, m } of rows) {
    const dd = typeof m.depositedDelta === "number" ? m.depositedDelta : 0;
    if (m.reason === "rebalance_harvest_out") { harvestOut += 1; continue; }
    if (m.source === "rebalance_transfer") targetDelta += dd;       // target (deposit side)
    else if (m.reason === "rebalance_transfer") sourceDelta += dd;  // source (withdraw side)
  }
  const conservation = sourceDelta + targetDelta; // should be ~0
  const ok = Math.abs(conservation) <= Math.max(1, Math.abs(targetDelta) * 0.02);
  if (!ok) problems += 1;
  console.log(
    `${ok ? "OK " : "!! "} [${date}] grp=${gid.slice(0, 8)} ` +
    `srcΔ=${sourceDelta.toFixed(2)} tgtΔ=${targetDelta.toFixed(2)} ` +
    `suma=${conservation.toFixed(2)} ${harvestOut ? `harvestOut=${harvestOut}` : ""} ` +
    `(${rows.length} filas, ${rows[0].t.protocol}→…)`,
  );
}
console.log(`\n${problems === 0 ? "✓ Todos los rebalanceos conservan el cost basis." : `✗ ${problems} grupo(s) con conservación rota.`}`);
