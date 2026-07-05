import fs from "node:fs"; import path from "node:path";
import { getAddressDecoder } from "@solana/kit";
const env = Object.fromEntries(fs.readFileSync(path.join(process.cwd(),".env.local"),"utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const RPC=`https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`;
const OWNER="GWxeoXvuEZ2birWotW2xM9jeEazh4fCNJ8WmuZ3e4keP";
const FARMS="FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S5vAd4QKM";
const WAD=1e18;
const dec=getAddressDecoder();
const pk=(b,o)=>dec.decode(b.subarray(o,o+32));
const u128=(b,o)=>{let x=0n;for(let i=0;i<16;i++)x+=BigInt(b[o+i])<<(8n*BigInt(i));return x;};
const u64=(b,o)=>{let x=0n;for(let i=0;i<8;i++)x+=BigInt(b[o+i])<<(8n*BigInt(i));return Number(x);};
async function rpc(method,params){const r=await fetch(RPC,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});return (await r.json());}

// 1. Mapas de Kamino: shareMint -> {sharePrice, tokenA, tokenB}
const strats=await (await fetch("https://api.kamino.finance/strategies?env=mainnet-beta")).json();
const metrics=await (await fetch("https://api.kamino.finance/strategies/metrics?env=mainnet-beta&status=LIVE")).json();
const priceByStrat={}; for(const m of metrics) priceByStrat[m.strategy]={sharePrice:Number(m.sharePrice),tokenA:m.tokenA,tokenB:m.tokenB};
const byShareMint={}; for(const s of strats){const p=priceByStrat[s.address]; if(p) byShareMint[s.shareMint]={...p, strategy:s.address};}
console.log("strategies con precio:",Object.keys(byShareMint).length);

// 2. userStates del owner (dataSize 920 + memcmp owner@48)
const res=await rpc("getProgramAccounts",[FARMS,{encoding:"base64",filters:[{dataSize:920},{memcmp:{offset:48,bytes:OWNER}}]}]);
const accs=res.result||[];
console.log("userStates:",accs.length, res.error?("err:"+JSON.stringify(res.error).slice(0,80)):"");

let total=0;
for(const a of accs){
  const b=Buffer.from(a.account.data[0],"base64");
  const farmState=pk(b,16);
  const activeScaled=u128(b,408);
  // leer farmState → shareMint@72, decimals@104
  const fr=await rpc("getAccountInfo",[farmState,{encoding:"base64"}]);
  const fb=Buffer.from(fr.result.value.data[0],"base64");
  const shareMint=pk(fb,72);
  const decimals=u64(fb,104);
  const info=byShareMint[shareMint];
  const shares=Number(activeScaled)/WAD/10**decimals;
  const value=info?shares*info.sharePrice:0;
  total+=value;
  console.log(`  ${info?info.tokenA+"/"+info.tokenB:"?"} dec=${decimals} shares=${shares.toFixed(2)} price=${info?.sharePrice} → $${value.toFixed(2)}`);
}
console.log(`\nTOTAL Kamino (sin SDK): $${total.toFixed(2)}  (diana $5877.87)`);
