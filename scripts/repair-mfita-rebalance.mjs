import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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

const DRY_RUN = !process.argv.includes("--apply");

// ---- IDs of the 4 broken rows to soft-delete ----
const BROKEN_IDS = [
  "a9d06936-c040-4177-bef3-f9d2bb1fb0df", // src lp_withdraw 667 USDC (dDelta -914.96)
  "f99640e8-c143-415d-a56a-16bb209d820b", // src lp_withdraw 26.43 HYPE (dDelta -914.96)
  "d7ed5f3d-9b2a-4272-8978-5b7252ae25b3", // src harvest_out 131 USDC
  "9d6aff4d-7d26-4f9d-a546-8d3bd455bd27", // target BTC deposit (dDelta +1829.92)
];

// ---- Position / portfolio constants ----
const PORTFOLIO_ID = "e6d39b43-89fa-446b-bda6-eabafb9424e3";
const SOURCE_POSITION_ID = "9a1f1379-2efd-4189-8211-4d2f5d5e9862"; // ProjectX HYPE/USDC LP
const TARGET_POSITION_ID = "2fdd5cd9-7075-4842-8014-66f4900e5452"; // Wallet BTC
const TX_DATE = "2026-06-02T16:03:00+00:00";

const LP_META = {
  tokenA: "USDC",
  tokenB: "HYPE",
  rangeLower: 39.77,
  rangeUpper: 49.66,
  isCorrelated: false,
  entryPriceRatio: 0.022727272727272728,
};

// ---- Prices & full balances (current spot at the time of the rebalance) ----
const HYPE_PRICE = 43.13;
const USDC_PRICE = 0.999859;
const BTC_PRICE = 68675;
const HYPE_FULL = 26.43;
const USDC_FULL = 667;

// Cost basis of the LP (from lp_deposit rows): 26.43 HYPE @44 + 667 USDC @1
const HYPE_BASIS = 26.43 * 44; // 1162.92
const USDC_BASIS = 667;        // 667
const TOTAL_DEPOSITED = HYPE_BASIS + USDC_BASIS; // 1829.92

// ---- The move: keep the 0.004347 BTC the user actually received ----
const BTC_AMOUNT = 0.004347;
const valueMoved = BTC_AMOUNT * BTC_PRICE; // ~298.53

const lpValue = HYPE_FULL * HYPE_PRICE + USDC_FULL * USDC_PRICE;
const fraction = valueMoved / lpValue; // ~0.16522

const round = (n, d) => Number(n.toFixed(d));

const HYPE_OUT = round(HYPE_FULL * fraction, 6);
const USDC_OUT = round(USDC_FULL * fraction, 6);

const depositedTransferred = TOTAL_DEPOSITED * fraction; // ~302.36
const hypeShare = HYPE_BASIS / TOTAL_DEPOSITED;
const usdcShare = USDC_BASIS / TOTAL_DEPOSITED;
const HYPE_DDELTA = round(depositedTransferred * hypeShare, 2); // ~192.15
const USDC_DDELTA = round(depositedTransferred * usdcShare, 2); // ~110.21
const TOTAL_DDELTA = round(HYPE_DDELTA + USDC_DDELTA, 2);       // ~302.36

const groupId = crypto.randomUUID();

const correctedRows = [
  {
    id: crypto.randomUUID(),
    portfolio_id: PORTFOLIO_ID,
    type: "lp_withdraw",
    token_in_symbol: null,
    token_in_amount: null,
    token_out_symbol: "HYPE",
    token_out_amount: HYPE_OUT,
    spot_price: HYPE_PRICE,
    fee_amount: 0,
    notes: null,
    transaction_date: TX_DATE,
    protocol: "ProjectX",
    position_id: SOURCE_POSITION_ID,
    position_type: "Liquidity Pool",
    metadata: { lp: LP_META, reason: "rebalance_transfer", depositedDelta: -HYPE_DDELTA },
    operation_group_id: groupId,
  },
  {
    id: crypto.randomUUID(),
    portfolio_id: PORTFOLIO_ID,
    type: "lp_withdraw",
    token_in_symbol: null,
    token_in_amount: null,
    token_out_symbol: "USDC",
    token_out_amount: USDC_OUT,
    spot_price: USDC_PRICE,
    fee_amount: 0,
    notes: null,
    transaction_date: TX_DATE,
    protocol: "ProjectX",
    position_id: SOURCE_POSITION_ID,
    position_type: "Liquidity Pool",
    metadata: { lp: LP_META, reason: "rebalance_transfer", depositedDelta: -USDC_DDELTA },
    operation_group_id: groupId,
  },
  {
    id: crypto.randomUUID(),
    portfolio_id: PORTFOLIO_ID,
    type: "deposit",
    token_in_symbol: "BTC",
    token_in_amount: BTC_AMOUNT,
    token_out_symbol: null,
    token_out_amount: null,
    spot_price: BTC_PRICE,
    fee_amount: 0,
    notes: null,
    transaction_date: TX_DATE,
    protocol: "Wallet",
    position_id: TARGET_POSITION_ID,
    position_type: "Hold",
    metadata: {
      source: "rebalance_transfer",
      usdValue: round(valueMoved, 2),
      sourceToken: "USDC",
      sourceAmount: USDC_OUT,
      depositedDelta: TOTAL_DDELTA,
      sourceProtocol: "ProjectX",
      sourcePositionId: SOURCE_POSITION_ID,
    },
    operation_group_id: groupId,
  },
];

console.log("==================== REPAIR PLAN ====================");
console.log(`Mode: ${DRY_RUN ? "DRY-RUN (no writes). Re-run with --apply to commit." : "APPLY (writing to DB)"}`);
console.log(`\nLP value=$${lpValue.toFixed(2)}  valueMoved=$${valueMoved.toFixed(2)}  fraction=${(fraction * 100).toFixed(3)}%`);
console.log(`Withdraw from LP: ${HYPE_OUT} HYPE + ${USDC_OUT} USDC`);
console.log(`Remaining in LP: ${round(HYPE_FULL - HYPE_OUT, 6)} HYPE + ${round(USDC_FULL - USDC_OUT, 6)} USDC (+131.02 USDC harvest pending)`);
console.log(`BTC received: ${BTC_AMOUNT} BTC`);
console.log(`Deposited transferred: $${TOTAL_DDELTA} (HYPE -${HYPE_DDELTA} / USDC -${USDC_DDELTA})`);
console.log(`LP basis: $${TOTAL_DEPOSITED} -> $${round(TOTAL_DEPOSITED - TOTAL_DDELTA, 2)}`);
console.log(`New operation_group_id: ${groupId}`);
console.log("\nSoft-delete broken rows:", BROKEN_IDS.join(", "));
console.log("\nCorrected rows to insert:");
console.log(JSON.stringify(correctedRows, null, 2));

if (DRY_RUN) {
  console.log("\nDRY-RUN complete. Nothing written.");
  process.exit(0);
}

// 1) Soft-delete the 4 broken rows
const nowIso = new Date().toISOString();
const { error: delErr } = await supabase
  .from("transactions")
  .update({ deleted_at: nowIso })
  .in("id", BROKEN_IDS);
if (delErr) { console.error("Soft-delete failed:", delErr.message); process.exit(1); }
console.log(`\n[ok] Soft-deleted ${BROKEN_IDS.length} broken rows.`);

// 2) Insert the 3 corrected rows
const { error: insErr } = await supabase.from("transactions").insert(correctedRows);
if (insErr) { console.error("Insert failed:", insErr.message); process.exit(1); }
console.log(`[ok] Inserted ${correctedRows.length} corrected rows (group ${groupId}).`);

console.log("\nDONE. Run scripts/inspect-positions.mjs to verify.");
