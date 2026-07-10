import { HDKey } from "@scure/bip32";
import { bech32 } from "@scure/base";
import { sha256 } from "@noble/hashes/sha256";
import { ripemd160 } from "@noble/hashes/ripemd160";
function p2wpkh(pk){ return bech32.encode("bc",[0,...bech32.toWords(ripemd160(sha256(pk)))]); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function timeHost(host, conc){
  const xpub="xpub6C2WtwjWwxMzS1uEJba6XBBg8gVuJFTEoMWKafHrpH9dPtca6bZhFDeyN7k47sS1nj79cg72kMA6snoMbiDgLdzJbrC2Z5ScJ7bxNvtWHHC";
  const hd=HDKey.fromExtendedKey(xpub);
  const addrs=[];
  for(const br of [0,1]){const b=hd.deriveChild(br);for(let i=0;i<23;i++)addrs.push(p2wpkh(b.deriveChild(i).publicKey));}
  let errors=0, t0=Date.now();
  async function fetchOne(a){for(let t=0;t<3;t++){try{const r=await fetch(`${host}/address/${a}`);if(r.status===429||r.status>=500){await sleep(500*(t+1));continue;}if(!r.ok)throw new Error(r.status);await r.json();return;}catch(e){await sleep(300*(t+1));}}errors++;}
  let n=0;const worker=async()=>{while(n<addrs.length){const c=n++;await fetchOne(addrs[c]);}};
  await Promise.all(Array.from({length:conc},()=>worker()));
  return {host, conc, ms:Date.now()-t0, errors, count:addrs.length};
}
console.log("blockstream conc=5:", await timeHost("https://blockstream.info/api",5));
console.log("mempool    conc=2:", await timeHost("https://mempool.space/api",2));
