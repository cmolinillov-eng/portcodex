// Worker de caché on-chain (corre en Node normal: local o GitHub Action).
// Calcula las posiciones de Kamino (Liquidez) —que NO se pueden leer en las
// funciones serverless de Vercel por el SDK ESM+WASM— y las escribe en la tabla
// onchain_cache de Supabase. El panel "En vivo" lee de ahí.
//
// Variables necesarias (de .env.local en local, o de Secrets en GitHub Actions):
//   NEXT_PUBLIC_SUPABASE_URL (o SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
//   HELIUS_API_KEY, JUPITER_API_KEY
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createSolanaRpc, address } from "@solana/kit";
import { Kamino } from "@kamino-finance/kliquidity-sdk";
import { Farms, WAD, fetchFarmState } from "@kamino-finance/farms-sdk";

// Cargar .env.local si existe (entorno local). En CI las vars vienen del entorno.
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
const HELIUS = process.env.HELIUS_API_KEY;
const JUP = process.env.JUPITER_API_KEY;
if (!SUPABASE_URL || !SERVICE_KEY || !HELIUS) {
  console.error("Faltan variables (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / HELIUS_API_KEY).");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const rpc = createSolanaRpc(`https://mainnet.helius-rpc.com/?api-key=${HELIUS}`);

async function strategyLabels() {
  try {
    const arr = await (await fetch("https://api.kamino.finance/strategies/metrics?env=mainnet-beta&status=LIVE")).json();
    const map = {};
    for (const s of arr) map[s.strategy] = { tokenA: s.tokenA, tokenB: s.tokenB };
    return map;
  } catch {
    return {};
  }
}

async function kaminoPositions(portfolioId, owner) {
  const kamino = new Kamino("mainnet-beta", rpc);
  const userStrats = await kamino.getUserPositions(address(owner));
  if (!userStrats.length) return [];

  const farms = new Farms(rpc);
  const states = await farms.getAllUserStatesForUser(address(owner));
  const stakedByMint = new Map();
  for (const st of states) {
    const us = st.userState;
    try {
      const fs2 = await fetchFarmState(rpc, address(String(us.farmState)));
      const fd = fs2.data ?? fs2;
      const mint = String(fd.token.mint);
      const decimals = Number(fd.token.decimals);
      const shares = Number(BigInt(String(us.activeStakeScaled))) / Number(WAD) / 10 ** decimals;
      if (mint) stakedByMint.set(mint, shares);
    } catch { /* omite */ }
  }

  const labels = await strategyLabels();
  const out = [];
  for (const p of userStrats) {
    const shareMint = String(p.shareMint);
    const strategyAddr = String(p.strategy);
    const shares = stakedByMint.get(shareMint) ?? 0;
    if (shares <= 0) continue;
    let sharePrice = 0;
    try { sharePrice = Number(await kamino.getStrategySharePrice(p.strategy)); } catch { /* */ }
    const lab = labels[strategyAddr];
    out.push({
      id: `solana:kamino:${strategyAddr}`,
      portfolioId,
      walletAddress: owner,
      chainKind: "solana",
      chain: "solana",
      protocol: `Kamino (${p.strategyDex ?? "—"})`,
      kind: "liquidity",
      label: lab ? `${lab.tokenA}/${lab.tokenB}` : "Kamino LP",
      tokens: [],
      valueUsd: shares * sharePrice || null,
      range: null,
      unclaimedUsd: null,
      meta: { strategy: strategyAddr, shareMint, shares, sharePrice },
      source: "kamino",
    });
  }
  return out;
}

async function main() {
  void JUP; // reservado para futuros precios
  const { data: wallets, error } = await sb
    .from("portfolio_wallets")
    .select("portfolio_id, address")
    .eq("chain_kind", "solana")
    .eq("is_active", true);
  if (error) { console.error("Error leyendo portfolio_wallets:", error.message); process.exit(1); }

  // Agrupar posiciones por portfolio.
  const byPortfolio = new Map();
  for (const w of wallets ?? []) {
    try {
      const positions = await kaminoPositions(w.portfolio_id, w.address);
      const cur = byPortfolio.get(w.portfolio_id) ?? [];
      byPortfolio.set(w.portfolio_id, cur.concat(positions));
      console.log(`  ${w.portfolio_id.slice(0, 8)} ${w.address.slice(0, 8)} → ${positions.length} posiciones Kamino`);
    } catch (e) {
      console.error(`  fallo en ${w.address}: ${String(e.message).slice(0, 120)}`);
    }
  }

  for (const [portfolioId, positions] of byPortfolio) {
    const { error: upErr } = await sb
      .from("onchain_cache")
      .upsert({ portfolio_id: portfolioId, source: "kamino", positions, updated_at: new Date().toISOString() }, { onConflict: "portfolio_id,source" });
    if (upErr) console.error(`  upsert ${portfolioId.slice(0, 8)}: ${upErr.message}`);
    else console.log(`  ✅ caché actualizada para ${portfolioId.slice(0, 8)} (${positions.length} pos, $${positions.reduce((s, p) => s + (p.valueUsd ?? 0), 0).toFixed(2)})`);
  }
  console.log("Done.");
}

main();
