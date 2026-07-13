import fs from 'node:fs';
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) { const i=line.indexOf('='); if(i>0&&!line.startsWith('#')) process.env[line.slice(0,i).trim()] ||= line.slice(i+1).trim(); }
const W='85JuNKXHnxKKTfRk76FmM47Mxk8kBvPLyv8tzpobDhEq';
const H = process.env.JUPITER_API_KEY ? {'x-api-key':process.env.JUPITER_API_KEY} : {};
const paths=[
  `https://lite-api.jup.ag/lend/v1/earn/positions?users=${W}`,
  `https://lite-api.jup.ag/lend/v1/borrow/positions?users=${W}`,
  `https://lite-api.jup.ag/lend/v1/positions?users=${W}`,
  `https://api.jup.ag/lend/v1/earn/positions?users=${W}`,
  `https://lite-api.jup.ag/lend/v1/borrow/vaults/positions?users=${W}`,
];
for (const u of paths) {
  try { const r=await fetch(u,{headers:H,signal:AbortSignal.timeout(15000)}); const t=await r.text();
    console.log(`[${r.status}] ${u.replace('https://','').slice(0,70)}`);
    if(r.status===200) console.log('   ', t.slice(0,500));
  } catch(e){ console.log('[ERR]', u.slice(0,60), e.message.slice(0,40)); }
}
process.exit(0);
