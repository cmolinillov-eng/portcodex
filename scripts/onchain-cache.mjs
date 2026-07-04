// Worker de caché on-chain (corre en Node normal: local o GitHub Action).
// Calcula lo que NO se puede leer en las funciones serverless de Vercel
// (SDKs ESM+WASM) y lo escribe en la tabla onchain_cache de Supabase:
//   - source "kamino": posiciones Kamino con valor + RANGO + recompensas pendientes.
//   - source "orca_fees": fees/recompensas SIN RECLAMAR de las posiciones Orca
//     (el adaptador serverless de Orca las mezcla con su lectura en vivo).
//
// Variables necesarias (de .env.local en local, o de Secrets en GitHub Actions):
//   NEXT_PUBLIC_SUPABASE_URL (o SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
//   HELIUS_API_KEY, JUPITER_API_KEY
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createSolanaRpc, address } from "@solana/kit";
import Decimal from "decimal.js";
import { Kamino, MeteoraService, getMeteoraPriceLowerUpper } from "@kamino-finance/kliquidity-sdk";
import { Farms } from "@kamino-finance/farms-sdk";
import { fetchPositionsForOwner } from "@orca-so/whirlpools";
import { fetchWhirlpool, fetchTickArray, getTickArrayAddress } from "@orca-so/whirlpools-client";
import {
  collectFeesQuote, collectRewardsQuote,
  getTickArrayStartTickIndex, getTickIndexInArray,
} from "@orca-so/whirlpools-core";

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

// ── Precios (Jupiter Price API v3: usdPrice + decimals por mint) ─────────────
const priceCache = new Map();
async function jupPrices(mints) {
  const missing = mints.filter((m) => !priceCache.has(m));
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50);
    try {
      const res = await fetch(`https://api.jup.ag/price/v3?ids=${batch.join(",")}`, {
        headers: JUP ? { "x-api-key": JUP } : {},
      });
      if (res.ok) {
        const json = await res.json();
        for (const m of batch) priceCache.set(m, json[m] ?? null);
      }
    } catch { /* deja sin precio */ }
  }
  return priceCache;
}

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

// ── Rango de una estrategia Kamino ───────────────────────────────────────────
// La estrategia apunta a una posición CL en el dex subyacente (Orca/Raydium);
// leemos sus ticks del account crudo y convertimos a precio con los decimales.
async function fetchRawAccount(addr) {
  const info = await rpc.getAccountInfo(address(String(addr)), { encoding: "base64" }).send();
  const b64 = info?.value?.data?.[0];
  return b64 ? Buffer.from(b64, "base64") : null;
}

const TICK_OFFSETS = { ORCA: [88, 92], RAYDIUM: [73, 77] };

function tickToPrice(tick, decA, decB) {
  return Math.pow(1.0001, tick) * Math.pow(10, decA - decB);
}

async function kaminoRange(kamino, strategyAddr, dex) {
  const strat = await kamino.getStrategyByAddress(address(String(strategyAddr)));
  if (!strat) return null;
  const d = String(dex).toUpperCase();

  // Meteora (DLMM) usa bins, no ticks: rango desde lowerBinId/upperBinId.
  if (d === "METEORA") {
    const svc = new MeteoraService(rpc);
    const [pos, pool] = await Promise.all([svc.getPosition(strat.position), svc.getPool(strat.pool)]);
    if (!pos || !pool) return null;
    const decA = Number(strat.tokenAMintDecimals);
    const decB = Number(strat.tokenBMintDecimals);
    const { priceLower, priceUpper } = getMeteoraPriceLowerUpper(pos.lowerBinId, pos.upperBinId, decA, decB, pool.binStep);
    const poolPrice = await kamino.getMeteoraPoolPrice(strat.pool);
    return {
      lower: Number(priceLower),
      upper: Number(priceUpper),
      current: Number(poolPrice),
      inRange: pos.lowerBinId <= pool.activeId && pool.activeId <= pos.upperBinId,
    };
  }

  const offsets = TICK_OFFSETS[d];
  if (!offsets) return null;
  const posBuf = await fetchRawAccount(strat.position);
  if (!posBuf) return null;
  const tickLower = posBuf.readInt32LE(offsets[0]);
  const tickUpper = posBuf.readInt32LE(offsets[1]);
  const decA = Number(strat.tokenAMintDecimals);
  const decB = Number(strat.tokenBMintDecimals);

  let poolPrice = null;
  try {
    const p = d === "ORCA" ? await kamino.getOrcaPoolPrice(strat.pool)
      : d === "RAYDIUM" ? await kamino.getRaydiumPoolPrice(strat.pool)
      : null;
    poolPrice = p ? Number(p) : null;
  } catch { /* sin precio de pool */ }

  if (poolPrice == null) return null;
  const lower = tickToPrice(tickLower, decA, decB);
  const upper = tickToPrice(tickUpper, decA, decB);
  return { lower, upper, current: poolPrice, inRange: lower <= poolPrice && poolPrice < upper };
}

// ── Posiciones Kamino: valor + rango + recompensas pendientes ────────────────
async function kaminoPositions(portfolioId, owner) {
  const kamino = new Kamino("mainnet-beta", rpc);
  const userStrats = await kamino.getUserPositions(address(owner));
  if (!userStrats.length) return [];

  const farms = new Farms(rpc);
  const now = new Decimal(Math.floor(Date.now() / 1000));
  let userFarms = new Map();
  try {
    userFarms = await farms.getAllFarmsForUser(address(owner), now);
  } catch (e) {
    console.error(`  farms de ${owner.slice(0, 8)}: ${String(e.message).slice(0, 100)}`);
  }

  // Índices por estrategia: shares staked y recompensas pendientes.
  const stakedByStrategy = new Map();
  const pendingByStrategy = new Map();
  for (const uf of userFarms.values()) {
    const stratId = String(uf.strategyId);
    let staked = new Decimal(0);
    for (const v of uf.activeStakeByDelegatee.values()) staked = staked.plus(v);
    stakedByStrategy.set(stratId, staked);
    if (uf.pendingRewards?.length) pendingByStrategy.set(stratId, uf.pendingRewards);
  }

  // Precios de recompensas (mints) vía Jupiter.
  const rewardMints = [...pendingByStrategy.values()].flat().map((r) => String(r.rewardTokenMint));
  const prices = await jupPrices([...new Set(rewardMints)]);

  const labels = await strategyLabels();
  const out = [];
  for (const p of userStrats) {
    const strategyAddr = String(p.strategy);
    const staked = stakedByStrategy.get(strategyAddr);
    const shares = staked ? Number(staked) : Number(p.sharesAmount ?? 0);
    if (!shares || shares <= 0) continue;

    let sharePrice = 0;
    try { sharePrice = Number(await kamino.getStrategySharePrice(p.strategy)); } catch { /* */ }

    // Rango (mejor esfuerzo: si falla, la posición sale sin rango).
    let range = null;
    try { range = await kaminoRange(kamino, strategyAddr, p.strategyDex); } catch { /* */ }

    // Recompensas pendientes → USD (mejor esfuerzo).
    let unclaimedUsd = null;
    const pend = pendingByStrategy.get(strategyAddr);
    if (pend?.length) {
      let sum = 0;
      for (const r of pend) {
        const info = prices.get(String(r.rewardTokenMint));
        if (!info?.usdPrice) continue;
        // cumulatedPendingRewards viene en unidades crudas (lamports del mint).
        sum += (Number(r.cumulatedPendingRewards) / 10 ** Number(info.decimals ?? 0)) * info.usdPrice;
      }
      if (sum > 0) unclaimedUsd = sum;
    }

    const lab = labels[strategyAddr];

    // SALDO por token: participación del usuario sobre las tenencias totales
    // de la estrategia (invested + available) → cantidades de tokenA/tokenB.
    let tokens = [];
    try {
      const state = await kamino.getStrategyByAddress(p.strategy);
      const bal = await kamino.getStrategyBalances(state);
      const issued = Number(state.sharesIssued) / 10 ** Number(state.sharesMintDecimals);
      const frac = issued > 0 ? shares / issued : 0;
      const totA = Number(bal.computedHoldings.invested.a) + Number(bal.computedHoldings.available.a);
      const totB = Number(bal.computedHoldings.invested.b) + Number(bal.computedHoldings.available.b);
      const aPrice = Number(bal.prices?.aPrice ?? 0);
      const bPrice = Number(bal.prices?.bPrice ?? 0);
      if (frac > 0 && lab) {
        tokens = [
          { symbol: lab.tokenA, amount: totA * frac, valueUsd: aPrice > 0 ? totA * frac * aPrice : null },
          { symbol: lab.tokenB, amount: totB * frac, valueUsd: bPrice > 0 ? totB * frac * bPrice : null },
        ];
      }
    } catch { /* mejor esfuerzo: sin saldo detallado */ }

    out.push({
      id: `solana:kamino:${strategyAddr}`,
      portfolioId,
      walletAddress: owner,
      chainKind: "solana",
      chain: "solana",
      protocol: `Kamino (${p.strategyDex ?? "—"})`,
      kind: "liquidity",
      label: lab ? `${lab.tokenA}/${lab.tokenB}` : "Kamino LP",
      tokens,
      valueUsd: shares * sharePrice || null,
      range,
      unclaimedUsd,
      meta: { strategy: strategyAddr, shareMint: String(p.shareMint), shares, sharePrice },
      source: "kamino",
    });
  }
  return out;
}

// ── Fees/recompensas sin reclamar de las posiciones Orca ─────────────────────
// El adaptador serverless de Orca calcula valor+rango en vivo; aquí añadimos lo
// que no puede: collectFeesQuote/collectRewardsQuote (WASM). Se cachea por
// positionMint y el adaptador lo mezcla por id.
async function orcaUnclaimed(portfolioId, owner) {
  const positions = await fetchPositionsForOwner(rpc, address(owner));
  const out = [];
  const nowTs = BigInt(Math.floor(Date.now() / 1000));

  for (const hp of positions) {
    const data = hp.data;
    if (!data?.whirlpool || data.liquidity == null) continue; // bundles u otros tipos: fuera
    try {
      const pool = await fetchWhirlpool(rpc, data.whirlpool);
      const spacing = pool.data.tickSpacing;
      const lowerStart = getTickArrayStartTickIndex(data.tickLowerIndex, spacing);
      const upperStart = getTickArrayStartTickIndex(data.tickUpperIndex, spacing);
      const [lowerTaAddr] = await getTickArrayAddress(data.whirlpool, lowerStart);
      const [upperTaAddr] = await getTickArrayAddress(data.whirlpool, upperStart);
      const [lowerTa, upperTa] = await Promise.all([
        fetchTickArray(rpc, lowerTaAddr),
        fetchTickArray(rpc, upperTaAddr),
      ]);
      const tickLower = lowerTa.data.ticks[getTickIndexInArray(data.tickLowerIndex, lowerStart, spacing)];
      const tickUpper = upperTa.data.ticks[getTickIndexInArray(data.tickUpperIndex, upperStart, spacing)];

      const fees = collectFeesQuote(pool.data, data, tickLower, tickUpper);
      const rewards = collectRewardsQuote(pool.data, data, tickLower, tickUpper, nowTs);

      // Mints implicados → precios/decimales vía Jupiter.
      const mints = [String(pool.data.tokenMintA), String(pool.data.tokenMintB)];
      for (const ri of pool.data.rewardInfos ?? []) {
        const mint = String(ri?.mint ?? "");
        if (mint && mint !== "11111111111111111111111111111111") mints.push(mint);
      }
      const prices = await jupPrices([...new Set(mints)]);
      const toUsd = (mint, raw) => {
        const info = prices.get(String(mint));
        if (!info?.usdPrice || raw == null) return 0;
        return (Number(raw) / 10 ** Number(info.decimals ?? 0)) * info.usdPrice;
      };

      let unclaimed = toUsd(pool.data.tokenMintA, fees.feeOwedA) + toUsd(pool.data.tokenMintB, fees.feeOwedB);
      (rewards.rewards ?? []).forEach((r, i) => {
        const mint = pool.data.rewardInfos?.[i]?.mint;
        unclaimed += toUsd(mint, r?.rewardsOwed);
      });

      out.push({
        id: `solana:orca:${String(data.positionMint)}`,
        portfolioId,
        walletAddress: owner,
        unclaimedUsd: unclaimed > 0 ? unclaimed : 0,
      });
    } catch (e) {
      console.error(`  orca fees ${String(data?.positionMint ?? "?").slice(0, 8)}: ${String(e.message).slice(0, 100)}`);
    }
  }
  return out;
}

async function main() {
  const { data: wallets, error } = await sb
    .from("portfolio_wallets")
    .select("portfolio_id, address")
    .eq("chain_kind", "solana")
    .eq("is_active", true);
  if (error) { console.error("Error leyendo portfolio_wallets:", error.message); process.exit(1); }

  // Agrupar por portfolio (una caché por portfolio y fuente).
  const kaminoByPortfolio = new Map();
  const orcaByPortfolio = new Map();
  for (const w of wallets ?? []) {
    try {
      const positions = await kaminoPositions(w.portfolio_id, w.address);
      const cur = kaminoByPortfolio.get(w.portfolio_id) ?? [];
      kaminoByPortfolio.set(w.portfolio_id, cur.concat(positions));
      console.log(`  ${w.portfolio_id.slice(0, 8)} ${w.address.slice(0, 8)} → ${positions.length} posiciones Kamino`);
    } catch (e) {
      console.error(`  Kamino fallo en ${w.address}: ${String(e.message).slice(0, 120)}`);
    }
    try {
      const fees = await orcaUnclaimed(w.portfolio_id, w.address);
      const cur = orcaByPortfolio.get(w.portfolio_id) ?? [];
      orcaByPortfolio.set(w.portfolio_id, cur.concat(fees));
      console.log(`  ${w.portfolio_id.slice(0, 8)} ${w.address.slice(0, 8)} → ${fees.length} posiciones Orca (fees)`);
    } catch (e) {
      console.error(`  Orca fallo en ${w.address}: ${String(e.message).slice(0, 120)}`);
    }
  }

  for (const [portfolioId, positions] of kaminoByPortfolio) {
    const { error: upErr } = await sb
      .from("onchain_cache")
      .upsert({ portfolio_id: portfolioId, source: "kamino", positions, updated_at: new Date().toISOString() }, { onConflict: "portfolio_id,source" });
    if (upErr) console.error(`  upsert kamino ${portfolioId.slice(0, 8)}: ${upErr.message}`);
    else console.log(`  ✅ kamino ${portfolioId.slice(0, 8)} (${positions.length} pos, $${positions.reduce((s, p) => s + (p.valueUsd ?? 0), 0).toFixed(2)})`);
  }
  for (const [portfolioId, positions] of orcaByPortfolio) {
    const { error: upErr } = await sb
      .from("onchain_cache")
      .upsert({ portfolio_id: portfolioId, source: "orca_fees", positions, updated_at: new Date().toISOString() }, { onConflict: "portfolio_id,source" });
    if (upErr) console.error(`  upsert orca_fees ${portfolioId.slice(0, 8)}: ${upErr.message}`);
    else console.log(`  ✅ orca_fees ${portfolioId.slice(0, 8)} (${positions.length} pos, $${positions.reduce((s, p) => s + (p.unclaimedUsd ?? 0), 0).toFixed(2)} sin reclamar)`);
  }
  console.log("Done.");
}

main();
