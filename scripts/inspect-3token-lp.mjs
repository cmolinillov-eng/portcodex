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
const isLp = (pt) => /liquid|lp|pool/i.test(pt ?? "");

// Replica la lógica del dashboard: capital-in/out por token-posición desde txns activas.
const capitalInSet = new Set(["deposit", "staking_deposit", "lp_deposit", "lending_supply"]);
const capitalOutSet = new Set(["withdrawal", "staking_withdrawal", "lp_withdraw", "lending_withdraw"]);

const { data: txs } = await supabase
  .from("transactions")
  .select("portfolio_id, protocol, position_id, type, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount")
  .is("deleted_at", null);

// Replica filteredRows (línea 817): posiciones con >=1 transacción activa (cualquier tipo).
const activePositionKeys = new Set((txs ?? []).filter(t => t.portfolio_id && t.position_id)
  .map(t => `${t.portfolio_id}|${t.protocol ?? "Wallet"}|${t.position_id}`));

const txBalance = new Map(); // posKey::TOKEN -> balance
for (const tx of txs ?? []) {
  const isIn = capitalInSet.has(tx.type);
  const isOut = capitalOutSet.has(tx.type);
  if (!isIn && !isOut) continue;
  const sym = (isIn ? tx.token_in_symbol : tx.token_out_symbol ?? "").toUpperCase();
  if (!sym) continue;
  const posKey = `${tx.portfolio_id}|${tx.protocol}|${tx.position_id}`;
  const k = `${posKey}::${sym}`;
  const amt = isIn ? num(tx.token_in_amount) : -num(tx.token_out_amount);
  txBalance.set(k, (txBalance.get(k) ?? 0) + amt);
}
const positionsWithTxCoverage = new Set([...txBalance.keys()].map((k) => k.split("::")[0]));

// Vista del dashboard
const { data: rows } = await supabase
  .from("defi_positions_analytics")
  .select("portfolio_id, token_symbol, protocol, position_id, position_type, current_balance, is_active")
  .eq("is_active", true);

const byPos = new Map();
let ghostsFiltered = 0;
for (const r of rows ?? []) {
  if (!isLp(r.position_type)) continue;
  const key = `${r.portfolio_id}|${r.protocol}|${r.position_id}`;
  // filteredRows: excluir posiciones sin transacción activa (fantasmas)
  if (!activePositionKeys.has(key)) { ghostsFiltered++; continue; }
  if (!byPos.has(key)) byPos.set(key, []);
  byPos.get(key).push(r);
}

let before3 = 0, after3 = 0;
for (const [key, group] of byPos) {
  // ANTES: balance = txData ?? viewBalance
  const antesTokens = group.filter((r) => {
    const sym = (r.token_symbol ?? "").toUpperCase();
    const tx = txBalance.get(`${key}::${sym}`);
    const bal = tx != null ? Math.max(0, tx) : num(r.current_balance);
    return bal > 1e-9;
  }).map((r) => (r.token_symbol ?? "").toUpperCase());

  // DESPUÉS: token sin txData en posición con cobertura -> 0
  const despuesTokens = group.filter((r) => {
    const sym = (r.token_symbol ?? "").toUpperCase();
    const tx = txBalance.get(`${key}::${sym}`);
    const bal = tx != null
      ? Math.max(0, tx)
      : positionsWithTxCoverage.has(key) ? 0 : num(r.current_balance);
    return bal > 1e-9;
  }).map((r) => (r.token_symbol ?? "").toUpperCase());

  const a = new Set(antesTokens), d = new Set(despuesTokens);
  if (a.size >= 3) before3++;
  if (d.size >= 3) after3++;
  if (a.size >= 3 || a.size !== d.size) {
    console.log(`\n${group[0].protocol} ${key.split("|")[2].slice(0,8)}`);
    console.log(`  ANTES   (${a.size}): ${[...a].join("/")}`);
    console.log(`  DESPUÉS (${d.size}): ${[...d].join("/")}`);
  }
}
console.log(`\nResumen (tras filteredRows): LPs con 3+ tokens — ANTES=${before3}  DESPUÉS=${after3}`);
console.log(`Posiciones fantasma excluidas por filteredRows: ${ghostsFiltered}`);
console.log("Done.");
