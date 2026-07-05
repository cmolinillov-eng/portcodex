import fs from "node:fs"; import path from "node:path";
import { createSolanaRpc, address, getAddressEncoder } from "@solana/kit";
import { Farms, WAD, fetchFarmState } from "@kamino-finance/farms-sdk";
const env = Object.fromEntries(fs.readFileSync(path.join(process.cwd(),".env.local"),"utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const RPC=`https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`;
const OWNER="GWxeoXvuEZ2birWotW2xM9jeEazh4fCNJ8WmuZ3e4keP";
const rpc=createSolanaRpc(RPC);
const enc=getAddressEncoder();
const ownerBytes=Buffer.from(enc.encode(address(OWNER)));

const farms=new Farms(rpc);
const states=await farms.getAllUserStatesForUser(address(OWNER));
async function raw(a){const r=await fetch(RPC,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"getAccountInfo",params:[a,{encoding:"base64"}]})});return Buffer.from((await r.json()).result.value.data[0],"base64");}
function u128le(v){const b=Buffer.alloc(16);let x=BigInt(v);for(let i=0;i<16;i++){b[i]=Number(x&255n);x>>=8n;}return b;}

const st=states[0];
const key=String(st.key);
const us=st.userState;
const activeScaled=BigInt(String(us.activeStakeScaled));
const farmState=String(us.farmState);
console.log("userState key:",key,"len?");
const b=await raw(key);
console.log("len:",b.length);
console.log("owner offset:", b.indexOf(ownerBytes));
console.log("farmState offset:", b.indexOf(Buffer.from(enc.encode(address(farmState)))));
console.log("activeStakeScaled offset:", b.indexOf(u128le(activeScaled)), "(valor",activeScaled.toString()+")");
// farmState account: dónde está el shareMint
const farmAcc=await fetchFarmState(rpc,address(farmState));
const fdata=farmAcc.data??farmAcc;
const shareMint=String(fdata.token.mint);
const fb=await raw(farmState);
console.log("\nfarmState len:",fb.length,"shareMint:",shareMint.slice(0,8));
console.log("shareMint offset en farmState:", fb.indexOf(Buffer.from(enc.encode(address(shareMint)))));
console.log("token.decimals:", Number(fdata.token.decimals));
