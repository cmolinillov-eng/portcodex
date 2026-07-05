import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function parseEnvFile(envPath) {
  const raw = fs.readFileSync(envPath, "utf8");
  const entries = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    entries[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return entries;
}

const env = parseEnvFile(path.join(process.cwd(), ".env.local"));
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, { auth: { persistSession: false } });

function meta(tx) {
  let m = tx.metadata;
  if (typeof m === "string") {
    try { m = JSON.parse(m); } catch { m = null; }
  }
  return m && typeof m === "object" ? m : {};
}

const num = (v) => (v == null ? 0 : Number(v));

// Find every position whose protocol matches MFITA (case-insensitive).
const { data: rows, error } = await supabase
  .from("transactions")
  .select("id, portfolio_id, protocol, position_id, position_type, type, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount, spot_price, metadata, notes, transaction_date")
  .ilike("protocol", "%MFITA%")
  .is("deleted_at", null)
  .order("transaction_date", { ascending: true });

if (error) {
  console.error("Query error:", error.message);
  process.exit(1);
}

console.log(`\nTotal filas MFITA: ${rows.length}`);
const byPos = new Map();
for (const r of rows) {
  const k = `${r.portfolio_id}::${r.position_id}`;
  if (!byPos.has(k)) byPos.set(k, []);
  byPos.get(k).push(r);
}

for (const [k, txs] of byPos) {
  console.log(`\n================ POSICIÓN ${k} ================`);
  for (const t of txs) {
    const m = meta(t);
    const flags = [];
    if (m.reason) flags.push(`reason=${m.reason}`);
    if (m.source) flags.push(`source=${m.source}`);
    if (m.depositedDelta !== undefined) flags.push(`depositedDelta=${m.depositedDelta}`);
    if (m.closure) flags.push(`closure=${JSON.stringify(m.closure)}`);
    const inS = t.token_in_symbol ? `${num(t.token_in_amount)} ${t.token_in_symbol}` : "";
    const outS = t.token_out_symbol ? `${num(t.token_out_amount)} ${t.token_out_symbol}` : "";
    console.log(
      `  [${(t.transaction_date || "").slice(0, 19)}] ${t.type.padEnd(18)} ` +
      `in:(${inS}) out:(${outS}) sp=${num(t.spot_price)} ${flags.join(" ")}  id=${t.id}`,
    );
  }
}

// Also dump the BTC/target positions that received rebalance_transfer recently,
// to see inflated depositedDelta.
const { data: btcRows } = await supabase
  .from("transactions")
  .select("id, protocol, position_id, type, token_in_symbol, token_in_amount, spot_price, metadata, transaction_date")
  .or("metadata->>source.eq.rebalance_transfer,metadata->>reason.eq.rebalance_transfer")
  .is("deleted_at", null)
  .order("transaction_date", { ascending: false })
  .limit(20);

console.log("\n\n========= ÚLTIMAS FILAS rebalance_transfer (cualquier protocolo) =========");
for (const t of btcRows ?? []) {
  const m = meta(t);
  console.log(
    `  [${(t.transaction_date || "").slice(0, 19)}] ${(t.protocol || "").padEnd(12)} ${t.type.padEnd(14)} ` +
    `in:(${num(t.token_in_amount)} ${t.token_in_symbol || ""}) sp=${num(t.spot_price)} ` +
    `depositedDelta=${m.depositedDelta} pos=${t.position_id} id=${t.id}`,
  );
}
