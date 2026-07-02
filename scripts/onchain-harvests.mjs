// Worker de ingesta de harvests (corre en Node normal: local o GitHub Action).
// Escanea los eventos Collect de los NonfungiblePositionManager V3
// (PancakeSwap / Uniswap / ProjectX) para las wallets EVM de cada portfolio y
// guarda cada harvest detectado en la tabla onchain_events como PENDIENTE.
// El manager lo confirma en el panel "En vivo" (un clic) y se convierte en
// transacción `harvest` con cantidad/precio/fecha reales.
//
// Precios históricos: DeFiLlama coins API (gratis, sin key).
// Variables: NEXT_PUBLIC_SUPABASE_URL (o SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, parseAbiItem, defineChain } from "viem";
import { mainnet, arbitrum, base, polygon, bsc } from "viem/chains";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan variables (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ── Cadenas (mismas que src/lib/onchain/evm/clients.ts) ──────────────────────
const hyperevm = defineChain({
  id: 999,
  name: "HyperEVM",
  nativeCurrency: { name: "Hype", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.hyperliquid.xyz/evm"] } },
});
// Fallbacks de drpc.org: es de los pocos RPC gratuitos que aceptan eth_getLogs
// con filtros (bsc-dataseed, mainnet.base.org y publicnode lo limitan/bloquean).
const CHAINS = {
  ethereum: { chain: mainnet, rpc: process.env.RPC_ETHEREUM || "https://eth.drpc.org", llama: "ethereum" },
  arbitrum: { chain: arbitrum, rpc: process.env.RPC_ARBITRUM || "https://arbitrum.drpc.org", llama: "arbitrum" },
  base: { chain: base, rpc: process.env.RPC_BASE || "https://base.drpc.org", llama: "base" },
  polygon: { chain: polygon, rpc: process.env.RPC_POLYGON || "https://polygon.drpc.org", llama: "polygon" },
  bsc: { chain: bsc, rpc: process.env.RPC_BSC || "https://bsc.drpc.org", llama: "bsc" },
  hyperevm: { chain: hyperevm, rpc: process.env.RPC_HYPEREVM || "https://rpc.hyperliquid.xyz/evm", llama: "hyperliquid" },
};

// ── Protocolos V3 a escanear (NPM por cadena) ────────────────────────────────
// `zerionMatch` enlaza con attributes.protocol de Zerion para descubrir los
// tokenIds que NO están en la wallet (posiciones en FARMING: el NFT vive
// staked en el MasterChef, así que balanceOf(wallet) = 0).
const PROTOCOLS = [
  {
    name: "PancakeSwap V3",
    zerionMatch: "pancakeswap v3",
    npm: {
      bsc: "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
      ethereum: "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
      base: "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
      arbitrum: "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
    },
  },
  {
    name: "Uniswap V3",
    zerionMatch: "uniswap v3",
    npm: {
      ethereum: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
      arbitrum: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
      polygon: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
      base: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
    },
  },
  {
    name: "ProjectX",
    zerionMatch: null, // Zerion no indexa HyperEVM; enumeración directa basta
    npm: { hyperevm: "0xeaD19AE861c29bBb2101E834922B2FEee69B9091" },
  },
];

// nftIds por wallet desde Zerion: Map<`${protocolName}:${chain}`, Set<tokenId>>.
const CHAIN_ALIASES = { "binance-smart-chain": "bsc", eth: "ethereum", matic: "polygon", "polygon-pos": "polygon" };
async function zerionNftIds(walletAddr) {
  const out = new Map();
  const key = process.env.ZERION_API_KEY;
  if (!key) return out;
  try {
    const auth = Buffer.from(`${key}:`).toString("base64");
    const res = await fetch(
      `https://api.zerion.io/v1/wallets/${walletAddr}/positions/?currency=usd&filter%5Bpositions%5D=only_complex`,
      { headers: { Authorization: `Basic ${auth}`, accept: "application/json" } },
    );
    if (!res.ok) return out;
    const json = await res.json();
    for (const p of json.data ?? []) {
      const proto = (p.attributes?.protocol ?? "").toLowerCase();
      const chain = CHAIN_ALIASES[p.relationships?.chain?.data?.id] ?? p.relationships?.chain?.data?.id ?? "";
      const m = (p.attributes?.name ?? "").match(/\((\d{3,})\)\s*$/);
      if (!m) continue;
      for (const cfg of PROTOCOLS) {
        if (cfg.zerionMatch && proto.includes(cfg.zerionMatch)) {
          const k = `${cfg.name}:${chain}`;
          if (!out.has(k)) out.set(k, new Set());
          out.get(k).add(BigInt(m[1]));
        }
      }
    }
  } catch { /* sin Zerion: solo enumeración directa */ }
  return out;
}

const collectEvent = parseAbiItem(
  "event Collect(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1)",
);
const decreaseEvent = parseAbiItem(
  "event DecreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
);
const increaseEvent = parseAbiItem(
  "event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
);

const npmAbi = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "tokenOfOwnerByIndex", type: "function", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
  {
    name: "positions", type: "function", stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      { type: "uint96" }, { type: "address" }, { name: "token0", type: "address" }, { name: "token1", type: "address" },
      { name: "fee", type: "uint24" }, { type: "int24" }, { type: "int24" }, { type: "uint128" },
      { type: "uint256" }, { type: "uint256" }, { type: "uint128" }, { type: "uint128" },
    ],
  },
];

const erc20Abi = [
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
];

const CHUNK = 9000n; // rango máximo de getLogs en RPCs públicos
// Primer escaneo: ventana hacia atrás (override con LOOKBACK_BLOCKS). Los runs
// siguientes son incrementales desde last_block, así que da igual que sea grande.
const DEFAULT_LOOKBACK = BigInt(process.env.LOOKBACK_BLOCKS || "150000");
// Solo estas cadenas (CSV en ONLY_CHAINS), para pruebas puntuales.
const ONLY_CHAINS = (process.env.ONLY_CHAINS || "").split(",").map((s) => s.trim()).filter(Boolean);

// Precio histórico (DeFiLlama, gratis). Cache por token+hora.
const llamaCache = new Map();
async function llamaPrice(llamaChain, token, tsSec) {
  const key = `${llamaChain}:${token}:${Math.floor(tsSec / 3600)}`;
  if (llamaCache.has(key)) return llamaCache.get(key);
  let price = null;
  try {
    const res = await fetch(`https://coins.llama.fi/prices/historical/${tsSec}/${llamaChain}:${token}`);
    if (res.ok) {
      const json = await res.json();
      price = json.coins?.[`${llamaChain}:${token}`]?.price ?? null;
    }
  } catch { /* sin precio */ }
  llamaCache.set(key, price);
  return price;
}

async function scanWallet(client, cfg, protocol, npm, portfolioId, walletAddr, chainName, extraIds) {
  // Posiciones (tokenIds) de la wallet en este NPM: los NFT en la wallet
  // (enumeración) + los que están en FARMING (vienen de Zerion en extraIds).
  const ids = new Set(extraIds ?? []);
  try {
    const balance = Number(await client.readContract({ address: npm, abi: npmAbi, functionName: "balanceOf", args: [walletAddr] }));
    for (let i = 0; i < balance; i++) {
      try {
        ids.add(await client.readContract({ address: npm, abi: npmAbi, functionName: "tokenOfOwnerByIndex", args: [walletAddr, BigInt(i)] }));
      } catch { /* omite */ }
    }
  } catch { /* NPM sin enumeración o RPC caído: seguimos con extraIds */ }
  const tokenIds = [...ids];
  if (!tokenIds.length) return 0;

  // Rango de bloques: desde el último escaneado (o lookback en el primer run).
  const latest = await client.getBlockNumber();
  const { data: state } = await sb
    .from("onchain_scan_state")
    .select("last_block")
    .eq("portfolio_id", portfolioId).eq("chain", chainName).eq("protocol", protocol.name)
    .maybeSingle();
  let from = state?.last_block != null ? BigInt(state.last_block) + 1n : latest - DEFAULT_LOOKBACK;
  if (from < 0n) from = 0n;
  if (from > latest) return 0;

  // Metadatos de posición (tokens/decimales) cacheados por tokenId.
  const posMeta = new Map();
  async function metaFor(tokenId) {
    const k = tokenId.toString();
    if (posMeta.has(k)) return posMeta.get(k);
    const pos = await client.readContract({ address: npm, abi: npmAbi, functionName: "positions", args: [tokenId] });
    const [token0, token1] = [pos[2], pos[3]];
    const [dec0, sym0, dec1, sym1] = await Promise.all([
      client.readContract({ address: token0, abi: erc20Abi, functionName: "decimals" }),
      client.readContract({ address: token0, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: token1, abi: erc20Abi, functionName: "decimals" }),
      client.readContract({ address: token1, abi: erc20Abi, functionName: "symbol" }),
    ]);
    const m = { token0, token1, dec0: Number(dec0), dec1: Number(dec1), sym0, sym1 };
    posMeta.set(k, m);
    return m;
  }

  let found = 0;
  // Inserta un evento (deposit/withdraw/harvest) con precios del bloque.
  async function emit(kind, log, raw0, raw1) {
    const m = await metaFor(log.args.tokenId);
    const block = await client.getBlock({ blockNumber: log.blockNumber });
    const tsSec = Number(block.timestamp);
    const amount0 = Number(raw0) / 10 ** m.dec0;
    const amount1 = Number(raw1) / 10 ** m.dec1;
    const price0 = await llamaPrice(cfg.llama, m.token0, tsSec);
    const price1 = await llamaPrice(cfg.llama, m.token1, tsSec);

    const tokens = [];
    if (amount0 > 0) tokens.push({ symbol: m.sym0, amount: amount0, priceUsd: price0, valueUsd: price0 != null ? amount0 * price0 : null });
    if (amount1 > 0) tokens.push({ symbol: m.sym1, amount: amount1, priceUsd: price1, valueUsd: price1 != null ? amount1 * price1 : null });
    if (!tokens.length) return;

    const valueUsd = tokens.every((t) => t.valueUsd != null)
      ? tokens.reduce((s, t) => s + t.valueUsd, 0)
      : null;
    // Ignora polvo (< $0.01): decrease con 0 o redondeos.
    if (valueUsd != null && valueUsd < 0.01) return;

    const { error: insErr } = await sb.from("onchain_events").upsert({
      portfolio_id: portfolioId,
      event_key: `${chainName}:${log.transactionHash}:${log.logIndex}:${kind}`,
      kind,
      chain: chainName,
      protocol: protocol.name,
      wallet_address: walletAddr,
      position_ref: String(log.args.tokenId),
      label: `${m.sym0}/${m.sym1}`,
      tokens,
      value_usd: valueUsd,
      block_time: new Date(tsSec * 1000).toISOString(),
      tx_hash: log.transactionHash,
      includes_principal: false,
    }, { onConflict: "portfolio_id,event_key", ignoreDuplicates: true });
    if (insErr) console.error(`  insert evento: ${insErr.message}`);
    else found++;
  }

  let chunk = CHUNK; // adaptativo: los RPCs públicos limitan el rango de getLogs
  let start = from;
  while (start <= latest) {
    const end = start + chunk > latest ? latest : start + chunk;
    let collects = [];
    let decreases = [];
    let increases = [];
    try {
      [collects, decreases, increases] = await Promise.all([
        client.getLogs({ address: npm, event: collectEvent, args: { tokenId: tokenIds }, fromBlock: start, toBlock: end }),
        client.getLogs({ address: npm, event: decreaseEvent, args: { tokenId: tokenIds }, fromBlock: start, toBlock: end }),
        client.getLogs({ address: npm, event: increaseEvent, args: { tokenId: tokenIds }, fromBlock: start, toBlock: end }),
      ]);
    } catch (e) {
      const msg = String(e.message);
      if (/exceed|limit|range|too (large|many)|response size/i.test(msg) && chunk > 500n) {
        chunk = chunk / 2n; // reintenta el mismo tramo con la mitad de rango
        continue;
      }
      console.error(`  getLogs ${chainName} ${protocol.name} [${start}-${end}]: ${msg.slice(0, 100)}`);
      start = end + 1n;
      continue;
    }

    // Principal retirado por tx+tokenId, para separar fees en el Collect.
    const decreasedByTx = new Map();
    for (const d of decreases) {
      decreasedByTx.set(`${d.transactionHash}:${d.args.tokenId}`, { a0: d.args.amount0, a1: d.args.amount1 });
    }

    try {
      // Depósitos (añadir liquidez, incluye la apertura de la posición).
      for (const log of increases) await emit("deposit", log, log.args.amount0, log.args.amount1);
      // Retiradas (el principal que salió del pool).
      for (const log of decreases) await emit("withdraw", log, log.args.amount0, log.args.amount1);
      // Harvest = Collect − principal retirado en la misma tx (solo las fees).
      for (const log of collects) {
        const dec = decreasedByTx.get(`${log.transactionHash}:${log.args.tokenId}`);
        const fee0 = dec ? (log.args.amount0 > dec.a0 ? log.args.amount0 - dec.a0 : 0n) : log.args.amount0;
        const fee1 = dec ? (log.args.amount1 > dec.a1 ? log.args.amount1 - dec.a1 : 0n) : log.args.amount1;
        await emit("harvest", log, fee0, fee1);
      }
    } catch (e) {
      console.error(`  eventos ${chainName}: ${String(e.message).slice(0, 100)}`);
    }
    start = end + 1n;
  }

  // Guardar hasta dónde hemos escaneado.
  await sb.from("onchain_scan_state").upsert(
    { portfolio_id: portfolioId, chain: chainName, protocol: protocol.name, last_block: Number(latest), updated_at: new Date().toISOString() },
    { onConflict: "portfolio_id,chain,protocol" },
  );
  return found;
}

async function main() {
  const { data: wallets, error } = await sb
    .from("portfolio_wallets")
    .select("portfolio_id, address")
    .eq("chain_kind", "evm")
    .eq("is_active", true);
  if (error) { console.error("Error leyendo portfolio_wallets:", error.message); process.exit(1); }

  for (const w of wallets ?? []) {
    // tokenIds en farming (staked): el NFT no está en la wallet; los da Zerion.
    const farmingIds = await zerionNftIds(w.address);
    for (const protocol of PROTOCOLS) {
      for (const [chainName, npm] of Object.entries(protocol.npm)) {
        if (ONLY_CHAINS.length && !ONLY_CHAINS.includes(chainName)) continue;
        const cfg = CHAINS[chainName];
        if (!cfg) continue;
        const client = createPublicClient({ chain: cfg.chain, transport: http(cfg.rpc, { batch: true }) });
        try {
          const extra = farmingIds.get(`${protocol.name}:${chainName}`);
          const n = await scanWallet(client, cfg, protocol, npm, w.portfolio_id, w.address, chainName, extra);
          if (n > 0) console.log(`  ${chainName} ${protocol.name} ${w.address.slice(0, 8)} → ${n} harvests detectados`);
        } catch (e) {
          console.error(`  ${chainName} ${protocol.name}: ${String(e.message).slice(0, 120)}`);
        }
      }
    }
  }
  console.log("Done.");
}

main();
