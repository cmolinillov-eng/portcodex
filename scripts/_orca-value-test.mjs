import fs from "node:fs"; import path from "node:path";
import { createSolanaRpc, address, getProgramDerivedAddress, getAddressEncoder, getAddressDecoder } from "@solana/kit";

const env = Object.fromEntries(fs.readFileSync(path.join(process.cwd(),".env.local"),"utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const rpc = createSolanaRpc(`https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`);
const WP_PROG = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";
const POSITION_MINT = "C996TfxuwkVsokVWmPnFggqpTXVi1Qc2aEDc5wE1iLbY";
const enc = getAddressEncoder(), dec = getAddressDecoder();
const i32=(b,o)=>b.readInt32LE(o);
const u128=(b,o)=>{let x=0n;for(let i=0;i<16;i++)x+=BigInt(b[o+i])<<(8n*BigInt(i));return x;};
async function buf(a){const r=await rpc.getAccountInfo(address(a),{encoding:"base64"}).send();return r.value?Buffer.from(r.value.data[0],"base64"):null;}

const [posPda]=await getProgramDerivedAddress({programAddress:address(WP_PROG),seeds:[Buffer.from("position"),enc.encode(address(POSITION_MINT))]});
const pos=await buf(posPda);
const whirlpool=dec.decode(pos.subarray(8,40));
const liquidity=u128(pos,72);
const tickLower=i32(pos,88), tickUpper=i32(pos,92);
const wp=await buf(whirlpool);
const sqrtPriceX64=u128(wp,65); // Q64.64
const tickCurrent=i32(wp,81);
const tokenA=dec.decode(wp.subarray(101,133)); // SOL (dec 9)
const tokenB=dec.decode(wp.subarray(181,213)); // USDC (dec 6)

// sqrt prices en float
const Q64 = 2**64;
const sqrtP = Number(sqrtPriceX64)/Q64;
const sqrtPa = Math.pow(1.0001, tickLower/2);
const sqrtPb = Math.pow(1.0001, tickUpper/2);
const L = Number(liquidity);
let amt0, amt1; // raw (token A, token B)
if (sqrtP <= sqrtPa) { amt0 = L*(sqrtPb-sqrtPa)/(sqrtPa*sqrtPb); amt1 = 0; }
else if (sqrtP >= sqrtPb) { amt0 = 0; amt1 = L*(sqrtPb-sqrtPa); }
else { amt0 = L*(sqrtPb-sqrtP)/(sqrtP*sqrtPb); amt1 = L*(sqrtP-sqrtPa); }
const decA=9, decB=6;
const solAmt = amt0/10**decA, usdcAmt = amt1/10**decB;

// precio vía Jupiter price/v3 (con key)
const pr = await fetch(`https://api.jup.ag/price/v3?ids=${tokenA},${tokenB}`, { headers: { "x-api-key": env.JUPITER_API_KEY } }).then(r=>r.json()).catch(()=>null);
const priceA = Number(pr?.[tokenA]?.usdPrice ?? 0);
const priceB = Number(pr?.[tokenB]?.usdPrice ?? 1);

console.log(`Orca wSOL/USDC · whirlpool ${whirlpool.slice(0,8)}`);
console.log(`ticks [${tickLower},${tickUpper}] actual ${tickCurrent} → ${tickLower<=tickCurrent&&tickCurrent<tickUpper?"DENTRO":"FUERA"}`);
console.log(`cantidades: ${solAmt.toFixed(4)} SOL (precio $${priceA.toFixed(2)}) + ${usdcAmt.toFixed(4)} USDC`);
console.log(`VALOR ≈ $${(solAmt*priceA + usdcAmt*priceB).toFixed(2)}   (diana: $2102.97 · 28.65 wSOL)`);
