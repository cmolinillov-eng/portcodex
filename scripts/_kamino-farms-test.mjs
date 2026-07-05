import fs from "node:fs"; import path from "node:path";
import { createSolanaRpc, address } from "@solana/kit";
import { Kamino } from "@kamino-finance/kliquidity-sdk";
import * as F from "@kamino-finance/farms-sdk";

const env = Object.fromEntries(fs.readFileSync(path.join(process.cwd(),".env.local"),"utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const rpc = createSolanaRpc(`https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`);
const WALLET = "GWxeoXvuEZ2birWotW2xM9jeEazh4fCNJ8WmuZ3e4keP";

const kamino = new Kamino("mainnet-beta", rpc);
const positions = await kamino.getUserPositions(address(WALLET));
const farms = new F.Farms(rpc);
const states = await farms.getAllUserStatesForUser(address(WALLET));
console.log("WAD =", String(F.WAD));

async function priceOf(mints){
  const r = await fetch(`https://api.jup.ag/price/v3?ids=${mints.join(",")}`,{headers:{"x-api-key":env.JUPITER_API_KEY}}).then(x=>x.json()).catch(()=>({}));
  return r;
}

let total=0;
for (const st of states) {
  const us = st.userState;
  const activeScaled = BigInt(us.activeStakeScaled.toString());
  const farmStateAddr = us.farmState;
  let fsAcc;
  try { fsAcc = await F.fetchFarmState(rpc, address(String(farmStateAddr))); } catch(e){ console.log("fetchFarmState err",e.message.slice(0,60)); continue; }
  const fd = fsAcc.data ?? fsAcc;
  const shareMint = String(fd.token?.mint ?? fd.farmTokenMint ?? "?");
  const decimals = Number(fd.token?.decimals ?? 0);
  const strat = positions.find(p=>String(p.shareMint)===shareMint);
  let sp=0; if(strat){try{sp=Number(await kamino.getStrategySharePrice(strat.strategy));}catch{}}
  // staked en unidades de share: activeStakeScaled / WAD, luego ya está en lamports del share → /10^decimals
  const sharesDecimal = Number(activeScaled)/Number(F.WAD)/10**decimals;
  const value = sharesDecimal * sp;
  total+=value;
  console.log(`\nshareMint ${shareMint.slice(0,8)} dec=${decimals} dex=${strat?.strategyDex}`);
  console.log(`  activeStakeScaled=${activeScaled}`);
  console.log(`  shares=${sharesDecimal.toFixed(4)} sharePrice=${sp} → VALOR $${value.toFixed(2)}`);
}
console.log(`\nTOTAL Kamino: $${total.toFixed(2)}  (diana $5877.87)`);
