import fs from 'node:fs';
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) { const i=line.indexOf('='); if(i>0&&!line.startsWith('#')) process.env[line.slice(0,i).trim()] ||= line.slice(i+1).trim(); }
const W='85JuNKXHnxKKTfRk76FmM47Mxk8kBvPLyv8tzpobDhEq';
const b=await (await fetch(`https://lite-api.jup.ag/lend/v1/borrow/positions?users=${W}`)).json();
console.log('=== BORROW position (completa) ===');
console.log(JSON.stringify(b[0], null, 1).slice(0, 2600));
const e=await (await fetch(`https://lite-api.jup.ag/lend/v1/earn/positions?users=${W}`)).json();
console.log('\n=== EARN: entradas con saldo > 0 ===');
for (const p of e) {
  const keys = Object.keys(p).filter(k=>k!=='token');
  const bal = p.shares ?? p.balance ?? p.amount ?? '?';
  if (Number(p.shares||p.balance||p.amount||0) > 0) console.log(' ', p.token?.uiSymbol, 'fields:', keys.join(','), JSON.stringify(p).slice(0,300));
}
console.log('earn total entries:', e.length, '| con saldo:', e.filter(p=>Number(p.shares||p.balance||p.amount||0)>0).length);
console.log('earn[0] fields:', Object.keys(e[0]).join(','));
process.exit(0);
