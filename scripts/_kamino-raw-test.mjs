import fs from "node:fs"; import path from "node:path";
import { getAddressDecoder } from "@solana/kit";
const env = Object.fromEntries(fs.readFileSync(path.join(process.cwd(),".env.local"),"utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const RPC=`https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`;
const OWNER="GWxeoXvuEZ2birWotW2xM9jeEazh4fCNJ8WmuZ3e4keP";
const FARMS="FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S5vAd4QKM";
const dec=getAddressDecoder();
const pk=(b,o)=>dec.decode(b.subarray(o,o+32));
const u128=(b,o)=>{let x=0n;for(let i=0;i<16;i++)x+=BigInt(b[o+i])<<(8n*BigInt(i));return x;};
async function rpc(method,params){const r=await fetch(RPC,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});return (await r.json()).result;}

// userStates del owner: memcmp owner @ offset 48
const accs=await rpc("getProgramAccounts",[FARMS,{encoding:"base64",filters:[{memcmp:{offset:48,bytes:OWNER}}]}]);
console.log("userStates encontrados:",accs?.length);
const KNOWN={ "1017727465717000000000000000000":"ORCA esperado", "2124873187655000000000000000000":"RAYDIUM esperado", "7875267723000000000000000000":"METEORA esperado" };
for(const a of accs||[]){
  const b=Buffer.from(a.account.data[0],"base64");
  const farmState=pk(b,16);
  const owner=pk(b,48);
  const activeStake=u128(b,408);
  console.log(`\nuserState ${a.pubkey.slice(0,8)} len=${b.length}`);
  console.log(`  owner=${owner.slice(0,8)} (ok=${owner===OWNER}) farmState=${farmState.slice(0,8)}`);
  console.log(`  activeStakeScaled@408 = ${activeStake}  ${KNOWN[activeStake.toString()]?"✅ "+KNOWN[activeStake.toString()]:"❌ no coincide"}`);
}
