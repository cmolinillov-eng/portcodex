import fs from "node:fs"; import path from "node:path";
import { createSolanaRpc, getProgramDerivedAddress, getAddressEncoder, address } from "@solana/kit";

const env = Object.fromEntries(fs.readFileSync(path.join(process.cwd(),".env.local"),"utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const rpc = createSolanaRpc(`https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`);
const WHIRLPOOL_PROGRAM = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";
const POSITION_MINT = "C996TfxuwkVsokVWmPnFggqpTXVi1Qc2aEDc5wE1iLbY";
const enc = getAddressEncoder();

async function acc(addr){
  const r = await rpc.getAccountInfo(address(addr), { encoding: "base64" }).send();
  if(!r.value) return null;
  return Buffer.from(r.value.data[0], "base64");
}
const i32 = (b,o)=>b.readInt32LE(o);
const u128 = (b,o)=>{let x=0n;for(let i=0;i<16;i++)x+=BigInt(b[o+i])<<(8n*BigInt(i));return x;};

// PDA de la posición: ["position", mint]
const [posPda] = await getProgramDerivedAddress({ programAddress: address(WHIRLPOOL_PROGRAM), seeds: [Buffer.from("position"), enc.encode(address(POSITION_MINT))] });
console.log("Position PDA:", posPda);
const pos = await acc(posPda);
if(!pos){console.log("posición no encontrada");process.exit(0);}
// layout Position: disc(8) whirlpool(32)@8 positionMint(32)@40 liquidity(u128)@72 tickLower(i32)@88 tickUpper(i32)@92
const whirlpoolBytes = pos.subarray(8,40);
const liquidity = u128(pos,72);
const tickLower = i32(pos,88), tickUpper = i32(pos,92);
// address desde bytes:
const { getAddressDecoder } = await import("@solana/kit");
const dec = getAddressDecoder();
const whirlpool = dec.decode(whirlpoolBytes);
console.log(`Whirlpool: ${whirlpool} | liquidity: ${liquidity} | ticks: [${tickLower}, ${tickUpper}]`);

const wp = await acc(whirlpool);
// layout Whirlpool: disc(8) config(32)@8 bump(1)@40 tickSpacing(u16)@41 tssSeed(2)@43 feeRate(u16)@45 protoFee(u16)@47 liquidity(u128)@49 sqrtPrice(u128)@65 tickCurrent(i32)@81 protoFeeA(u64)@85 protoFeeB(u64)@93 tokenMintA(32)@101 tokenVaultA(32)@133 fgA(u128)@165 tokenMintB(32)@181
const tickCurrent = i32(wp,81);
const tokenMintA = dec.decode(wp.subarray(101,133));
const tokenMintB = dec.decode(wp.subarray(181,213));
const inRange = tickLower <= tickCurrent && tickCurrent < tickUpper;
console.log(`tokenA: ${tokenMintA}`);
console.log(`tokenB: ${tokenMintB}`);
console.log(`tickCurrent: ${tickCurrent} → ${inRange ? "✅ DENTRO de rango" : "⚠️ FUERA de rango"}`);
console.log(`rango ticks: [${tickLower}, ${tickUpper}] · actual ${tickCurrent}`);
