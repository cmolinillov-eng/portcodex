import fs from "node:fs"; import path from "node:path";
import { createSolanaRpc, address } from "@solana/kit";
import { Kamino } from "@kamino-finance/kliquidity-sdk";

const env = Object.fromEntries(fs.readFileSync(path.join(process.cwd(),".env.local"),"utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const RPC = `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`;
const WALLET = "GWxeoXvuEZ2birWotW2xM9jeEazh4fCNJ8WmuZ3e4keP";

const rpc = createSolanaRpc(RPC);
const kamino = new Kamino("mainnet-beta", rpc);
console.log("Kamino client OK. Métodos relevantes:", Object.getOwnPropertyNames(Object.getPrototypeOf(kamino)).filter(m=>/position|share|user|holding/i.test(m)).join(", "));

console.log("\nLeyendo getUserPositions…");
const positions = await kamino.getUserPositions(address(WALLET));
console.log("posiciones devueltas:", positions?.length ?? "(no array)");
console.log("\n=== ESTRUCTURA COMPLETA posición[0] ===");
console.log("claves:", Object.keys(positions[0] ?? {}).join(", "));
const dump = JSON.stringify(positions[0], (k,v)=> typeof v==="bigint"?v.toString():(v && v.constructor && v.constructor.name==="Decimal"?v.toString():v), 2);
console.log(dump?.slice(0, 1200));
process.exit(0);
for (const p of positions ?? []) {
  console.log("\n— strategy:", String(p.strategy));
  console.log("  shareMint:", String(p.shareMint ?? "?"), "| shares:", String(p.sharesAmount ?? p.shares ?? "?"), "| dex:", p.strategyDex ?? "?");
  try {
    const sp = await kamino.getStrategySharePrice(p.strategy);
    console.log("  sharePrice:", String(sp), "| valor≈ $", Number(p.sharesAmount ?? 0) * Number(sp));
  } catch (e) { console.log("  sharePrice err:", e.message.slice(0,80)); }
}
