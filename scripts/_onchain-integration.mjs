// Prueba de integración del flujo genérico: portfolio_wallets → Zerion → on-chain.
// Mismo flujo que los módulos src/lib/onchain (aquí inline para poder correrlo en .mjs).
import fs from "node:fs"; import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http } from "viem";
import { base, mainnet, arbitrum, polygon, bsc } from "viem/chains";

const env = Object.fromEntries(fs.readFileSync(path.join(process.cwd(),".env.local"),"utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const CHAINS = { ethereum:{c:mainnet,u:"https://eth.llamarpc.com"}, arbitrum:{c:arbitrum,u:"https://arb1.arbitrum.io/rpc"}, base:{c:base,u:"https://mainnet.base.org"}, polygon:{c:polygon,u:"https://polygon-rpc.com"}, "binance-smart-chain":{c:bsc,u:"https://bsc-dataseed.binance.org"} };
const clients = {}; const cl=(ch)=>clients[ch] ??= createPublicClient({chain:CHAINS[ch].c, transport:http(CHAINS[ch].u,{batch:true})});

const NPM="0x46A15B0b27311cedF172AB29E4f4766fbE7F4364", FACTORY="0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const npmAbi=[{name:"positions",type:"function",stateMutability:"view",inputs:[{type:"uint256"}],outputs:[{type:"uint96"},{type:"address"},{name:"t0",type:"address"},{name:"t1",type:"address"},{name:"fee",type:"uint24"},{name:"tl",type:"int24"},{name:"tu",type:"int24"},{type:"uint128"},{type:"uint256"},{type:"uint256"},{type:"uint128"},{type:"uint128"}]}];
const factoryAbi=[{name:"getPool",type:"function",stateMutability:"view",inputs:[{type:"address"},{type:"address"},{type:"uint24"}],outputs:[{type:"address"}]}];
const poolAbi=[{name:"slot0",type:"function",stateMutability:"view",inputs:[],outputs:[{type:"uint160"},{type:"int24"}]}];
const erc=[{name:"decimals",type:"function",stateMutability:"view",inputs:[],outputs:[{type:"uint8"}]},{name:"symbol",type:"function",stateMutability:"view",inputs:[],outputs:[{type:"string"}]}];
const p2 = (t,d0,d1)=>Math.pow(1.0001,t)*Math.pow(10,d0-d1);

async function zerion(addr){
  const auth=Buffer.from(`${env.ZERION_API_KEY}:`).toString("base64");
  const r=await fetch(`https://api.zerion.io/v1/wallets/${addr}/positions/?currency=usd&filter%5Bpositions%5D=only_complex&sync=true`,{headers:{Authorization:`Basic ${auth}`,accept:"application/json"}});
  const j=await r.json();
  return (j.data||[]).map(p=>{const a=p.attributes||{};return {protocol:a.protocol,chain:p.relationships?.chain?.data?.id,type:a.position_type,name:a.name,symbol:a.fungible_info?.symbol,amount:a.quantity?.float||0,value:a.value??null,nftId:(a.name||"").match(/\((\d{3,})\)\s*$/)?.[1]||null};});
}

// 1. Wallets EVM desde la tabla (GENÉRICO: cualquier portfolio/address)
const { data: wallets } = await sb.from("portfolio_wallets").select("portfolio_id, address, label").eq("chain_kind","evm").eq("is_active",true);
console.log(`Wallets EVM en la tabla: ${wallets.length}`);
for (const w of wallets) {
  console.log(`\n■ Portfolio ${w.portfolio_id.slice(0,8)} · ${w.label} · ${w.address}`);
  const zs = await zerion(w.address);
  const pcs = zs.filter(z=>(z.protocol||"").toLowerCase().includes("pancakeswap v3") && z.nftId);
  const byNft = {}; for(const z of pcs){(byNft[`${z.chain}:${z.nftId}`] ??= []).push(z);}
  if(!Object.keys(byNft).length){console.log("  (sin posiciones Pancake V3 descubiertas)");continue;}
  for (const [k,grp] of Object.entries(byNft)) {
    const [chain,nftId]=k.split(":");
    if(!CHAINS[chain]){console.log(`  Pancake en cadena no soportada: ${chain}`);continue;}
    const c=cl(chain); const pos=await c.readContract({address:NPM,abi:npmAbi,functionName:"positions",args:[BigInt(nftId)]});
    const t0=pos[2],t1=pos[3],fee=Number(pos[4]),tl=Number(pos[5]),tu=Number(pos[6]);
    const [pool,d0,s0,d1,s1]=await c.multicall({allowFailure:false,contracts:[
      {address:FACTORY,abi:factoryAbi,functionName:"getPool",args:[t0,t1,fee]},
      {address:t0,abi:erc,functionName:"decimals"},{address:t0,abi:erc,functionName:"symbol"},
      {address:t1,abi:erc,functionName:"decimals"},{address:t1,abi:erc,functionName:"symbol"}]});
    const slot0=await c.readContract({address:pool,abi:poolAbi,functionName:"slot0"});
    const ct=Number(slot0[1]); const inR=tl<=ct&&ct<tu;
    const stk=grp.filter(g=>g.type==="staked").reduce((s,g)=>s+(g.value||0),0);
    const rew=grp.filter(g=>g.type==="reward").reduce((s,g)=>s+(g.value||0),0);
    console.log(`  ✓ PancakeSwap V3 ${s0}/${s1} ${fee/10000}% · ${chain} · NFT #${nftId}`);
    console.log(`     valor=$${stk.toFixed(2)} | fees/rewards sin reclamar=$${rew.toFixed(2)}`);
    console.log(`     RANGO [${p2(tl,Number(d0),Number(d1)).toPrecision(5)} – ${p2(tu,Number(d0),Number(d1)).toPrecision(5)}] actual=${p2(ct,Number(d0),Number(d1)).toPrecision(5)} → ${inR?"✅ DENTRO":"⚠️ FUERA"}`);
  }
}
console.log("\nDone.");
