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

// ── Aave V3: Supply/Withdraw/Borrow/Repay (Fase C2) ──────────────────────────
// Pool por cadena (mismos que src/lib/onchain/evm/aave.ts).
const AAVE_POOLS = {
  ethereum: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  arbitrum: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  base: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
  polygon: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  bsc: "0x6807dc923806fE8Fd134338EABCA509979a7e0cB",
};
const aaveSupplyEvent = parseAbiItem(
  "event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)",
);
const aaveWithdrawEvent = parseAbiItem(
  "event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount)",
);
const aaveBorrowEvent = parseAbiItem(
  "event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)",
);
const aaveRepayEvent = parseAbiItem(
  "event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)",
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ¿El error es por tamaño del rango (→ reducir tramo) o por rate-limit (→ esperar)?
const isSizeError = (msg) => /exceed|block range|too many results|response size|more than|query returned/i.test(msg);
const isRateError = (msg) => /too many request|429|rate ?limit|http request failed|internal|500|503/i.test(msg);

// getLogs con reintentos y backoff ante rate-limit del RPC gratuito. Los
// errores de tamaño se propagan para que el llamador reduzca el tramo.
async function getLogsRetry(client, params) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.getLogs(params);
    } catch (e) {
      const msg = String(e.message);
      if (!isSizeError(msg) && isRateError(msg) && attempt < 3) {
        await sleep(3000 * 2 ** attempt); // 3s → 6s → 12s
        continue;
      }
      throw e;
    }
  }
}

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
  let firstFailed = null; // primer bloque de un tramo fallido: el cursor no lo salta
  while (start <= latest) {
    const end = start + chunk > latest ? latest : start + chunk;
    let collects = [];
    let decreases = [];
    let increases = [];
    try {
      [collects, decreases, increases] = await Promise.all([
        getLogsRetry(client, { address: npm, event: collectEvent, args: { tokenId: tokenIds }, fromBlock: start, toBlock: end }),
        getLogsRetry(client, { address: npm, event: decreaseEvent, args: { tokenId: tokenIds }, fromBlock: start, toBlock: end }),
        getLogsRetry(client, { address: npm, event: increaseEvent, args: { tokenId: tokenIds }, fromBlock: start, toBlock: end }),
      ]);
      await sleep(150); // pacing: no agotar la cuota del RPC gratuito
    } catch (e) {
      const msg = String(e.message);
      // Tramo demasiado grande: reintenta el mismo tramo con la mitad de rango.
      if (isSizeError(msg) && chunk > 500n) {
        chunk = chunk / 2n;
        continue;
      }
      console.error(`  getLogs ${chainName} ${protocol.name} [${start}-${end}]: ${msg.slice(0, 100)}`);
      if (firstFailed == null) firstFailed = start; // se reintentará en el siguiente run
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

  // Guardar hasta dónde hemos escaneado (sin saltar tramos fallidos: si algo
  // falló, el cursor se queda justo antes y el siguiente run lo reintenta).
  const cursor = firstFailed != null ? firstFailed - 1n : latest;
  if (cursor >= from) {
    await sb.from("onchain_scan_state").upsert(
      { portfolio_id: portfolioId, chain: chainName, protocol: protocol.name, last_block: Number(cursor), updated_at: new Date().toISOString() },
      { onConflict: "portfolio_id,chain,protocol" },
    );
  }
  return found;
}

// Escanea el Pool de Aave V3 de una cadena para una wallet: cada Supply /
// Withdraw / Borrow / Repay se guarda como evento pendiente con su tipo
// contable (lending_supply / lending_withdraw / lending_borrow / lending_repay).
async function scanAave(client, cfg, portfolioId, walletAddr, chainName) {
  const pool = AAVE_POOLS[chainName];
  if (!pool) return 0;

  const latest = await client.getBlockNumber();
  const { data: state } = await sb
    .from("onchain_scan_state")
    .select("last_block")
    .eq("portfolio_id", portfolioId).eq("chain", chainName).eq("protocol", "Aave V3")
    .maybeSingle();
  let from = state?.last_block != null ? BigInt(state.last_block) + 1n : latest - DEFAULT_LOOKBACK;
  if (from < 0n) from = 0n;
  if (from > latest) return 0;

  // symbol/decimals del token subyacente (reserve), cacheado.
  const reserveMeta = new Map();
  async function metaFor(reserve) {
    const k = reserve.toLowerCase();
    if (reserveMeta.has(k)) return reserveMeta.get(k);
    const [dec, sym] = await Promise.all([
      client.readContract({ address: reserve, abi: erc20Abi, functionName: "decimals" }),
      client.readContract({ address: reserve, abi: erc20Abi, functionName: "symbol" }),
    ]);
    const m = { dec: Number(dec), sym };
    reserveMeta.set(k, m);
    return m;
  }

  let found = 0;
  async function emit(kind, log, reserve, rawAmount) {
    const m = await metaFor(reserve);
    const block = await client.getBlock({ blockNumber: log.blockNumber });
    const tsSec = Number(block.timestamp);
    const amount = Number(rawAmount) / 10 ** m.dec;
    if (amount <= 0) return;
    const price = await llamaPrice(cfg.llama, reserve, tsSec);
    const valueUsd = price != null ? amount * price : null;
    if (valueUsd != null && valueUsd < 0.01) return; // polvo

    const { error: insErr } = await sb.from("onchain_events").upsert({
      portfolio_id: portfolioId,
      event_key: `${chainName}:${log.transactionHash}:${log.logIndex}:${kind}`,
      kind,
      chain: chainName,
      protocol: "Aave V3",
      wallet_address: walletAddr,
      position_ref: walletAddr, // LivePosition.id de Aave = `${chain}:aave:${wallet}`
      label: `Aave · ${m.sym}`,
      tokens: [{ symbol: m.sym, amount, priceUsd: price, valueUsd }],
      value_usd: valueUsd,
      block_time: new Date(tsSec * 1000).toISOString(),
      tx_hash: log.transactionHash,
      includes_principal: false,
    }, { onConflict: "portfolio_id,event_key", ignoreDuplicates: true });
    if (insErr) console.error(`  insert evento aave: ${insErr.message}`);
    else found++;
  }

  let chunk = CHUNK;
  let start = from;
  let firstFailed = null;
  while (start <= latest) {
    const end = start + chunk > latest ? latest : start + chunk;
    let supplies = [];
    let withdraws = [];
    let borrows = [];
    let repays = [];
    try {
      // Solo se puede filtrar por args indexados: onBehalfOf (Supply/Borrow)
      // y user (Withdraw/Repay) — en todos los casos, la wallet del portfolio.
      [supplies, withdraws, borrows, repays] = await Promise.all([
        getLogsRetry(client, { address: pool, event: aaveSupplyEvent, args: { onBehalfOf: walletAddr }, fromBlock: start, toBlock: end }),
        getLogsRetry(client, { address: pool, event: aaveWithdrawEvent, args: { user: walletAddr }, fromBlock: start, toBlock: end }),
        getLogsRetry(client, { address: pool, event: aaveBorrowEvent, args: { onBehalfOf: walletAddr }, fromBlock: start, toBlock: end }),
        getLogsRetry(client, { address: pool, event: aaveRepayEvent, args: { user: walletAddr }, fromBlock: start, toBlock: end }),
      ]);
      await sleep(150);
    } catch (e) {
      const msg = String(e.message);
      if (isSizeError(msg) && chunk > 500n) {
        chunk = chunk / 2n;
        continue;
      }
      console.error(`  getLogs ${chainName} Aave [${start}-${end}]: ${msg.slice(0, 100)}`);
      if (firstFailed == null) firstFailed = start;
      start = end + 1n;
      continue;
    }

    try {
      for (const log of supplies) await emit("lending_supply", log, log.args.reserve, log.args.amount);
      for (const log of withdraws) await emit("lending_withdraw", log, log.args.reserve, log.args.amount);
      for (const log of borrows) await emit("lending_borrow", log, log.args.reserve, log.args.amount);
      for (const log of repays) await emit("lending_repay", log, log.args.reserve, log.args.amount);
    } catch (e) {
      console.error(`  eventos aave ${chainName}: ${String(e.message).slice(0, 100)}`);
    }
    start = end + 1n;
  }

  const cursor = firstFailed != null ? firstFailed - 1n : latest;
  if (cursor >= from) {
    await sb.from("onchain_scan_state").upsert(
      { portfolio_id: portfolioId, chain: chainName, protocol: "Aave V3", last_block: Number(cursor), updated_at: new Date().toISOString() },
      { onConflict: "portfolio_id,chain,protocol" },
    );
  }
  return found;
}

// ── Fase C3: transferencias de holds (entradas/salidas de la wallet) ────────
// kind transfer_in / transfer_out → transacciones deposit / withdrawal (Hold).

// Estado de escaneo genérico (last_block reutilizado como cursor numérico).
async function getScanCursor(portfolioId, chain, protocol) {
  const { data } = await sb
    .from("onchain_scan_state")
    .select("last_block")
    .eq("portfolio_id", portfolioId).eq("chain", chain).eq("protocol", protocol)
    .maybeSingle();
  return data?.last_block ?? null;
}
async function setScanCursor(portfolioId, chain, protocol, cursor) {
  await sb.from("onchain_scan_state").upsert(
    { portfolio_id: portfolioId, chain, protocol, last_block: cursor, updated_at: new Date().toISOString() },
    { onConflict: "portfolio_id,chain,protocol" },
  );
}

async function insertTransferEvent({ portfolioId, eventKey, kind, chain, protocol, walletAddr, positionRef, symbol, amount, price, tsSec, txHash }) {
  const valueUsd = price != null ? amount * price : null;
  if (valueUsd != null && valueUsd < 1) return false; // polvo/spam (< $1)
  const { error } = await sb.from("onchain_events").upsert({
    portfolio_id: portfolioId,
    event_key: eventKey,
    kind,
    chain,
    protocol,
    wallet_address: walletAddr,
    position_ref: positionRef,
    label: symbol,
    tokens: [{ symbol, amount, priceUsd: price, valueUsd }],
    value_usd: valueUsd,
    block_time: new Date(tsSec * 1000).toISOString(),
    tx_hash: txHash,
    includes_principal: false,
  }, { onConflict: "portfolio_id,event_key", ignoreDuplicates: true });
  if (error) { console.error(`  insert transfer: ${error.message}`); return false; }
  return true;
}

// Bitcoin (Ledger en hold): transacciones confirmadas vía mempool.space (gratis).
async function scanBitcoin(portfolioId, addr) {
  const res = await fetch(`https://mempool.space/api/address/${addr}/txs`);
  if (!res.ok) throw new Error(`mempool.space ${res.status}`);
  const txs = await res.json();
  const last = Number(await getScanCursor(portfolioId, "bitcoin", "Bitcoin") ?? 0);

  let found = 0;
  let maxHeight = last;
  for (const tx of txs) {
    if (!tx.status?.confirmed) continue;
    const height = tx.status.block_height ?? 0;
    if (height <= last) continue;
    if (height > maxHeight) maxHeight = height;

    // Delta neto de la wallet en la tx (sats): entradas − salidas.
    const inSats = tx.vout.filter((v) => v.scriptpubkey_address === addr).reduce((s, v) => s + v.value, 0);
    const outSats = tx.vin.filter((v) => v.prevout?.scriptpubkey_address === addr).reduce((s, v) => s + (v.prevout?.value ?? 0), 0);
    const net = (inSats - outSats) / 1e8;
    if (net === 0) continue;

    const tsSec = tx.status.block_time ?? Math.floor(Date.now() / 1000);
    const price = await llamaPrice("coingecko", "bitcoin", tsSec);
    const kind = net > 0 ? "transfer_in" : "transfer_out";
    const ok = await insertTransferEvent({
      portfolioId,
      eventKey: `bitcoin:${tx.txid}:${addr}:${kind}`,
      kind,
      chain: "bitcoin",
      protocol: "Bitcoin",
      walletAddr: addr,
      positionRef: addr, // hold id = `bitcoin:hold:${address}`
      symbol: "BTC",
      amount: Math.abs(net),
      price,
      tsSec,
      txHash: tx.txid,
    });
    if (ok) found++;
  }
  if (maxHeight > last) await setScanCursor(portfolioId, "bitcoin", "Bitcoin", maxHeight);
  return found;
}

// EVM: envíos/recepciones de la wallet vía Zerion (send/receive ya parseados,
// con símbolo y precio; excluye operaciones DeFi, que van por los escáneres
// de protocolo). Cursor = mined_at (epoch) de la tx más reciente vista.
async function scanEvmTransfers(portfolioId, addr) {
  const key = process.env.ZERION_API_KEY;
  if (!key) return 0;
  const auth = Buffer.from(`${key}:`).toString("base64");
  const res = await fetch(
    `https://api.zerion.io/v1/wallets/${addr}/transactions/?currency=usd&page[size]=100&filter[operation_types]=send,receive&filter[trash]=only_non_trash`,
    { headers: { Authorization: `Basic ${auth}`, accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`Zerion txs ${res.status}`);
  const json = await res.json();
  const last = Number(await getScanCursor(portfolioId, "evm", "Wallet") ?? 0);

  let found = 0;
  let maxTs = last;
  for (const tx of json.data ?? []) {
    const a = tx.attributes ?? {};
    const tsSec = a.mined_at ? Math.floor(new Date(a.mined_at).getTime() / 1000) : 0;
    if (!tsSec || tsSec <= last) continue;
    if (a.status && a.status !== "confirmed") continue;
    if (maxTs < tsSec) maxTs = tsSec;
    const chain = CHAIN_ALIASES[tx.relationships?.chain?.data?.id] ?? tx.relationships?.chain?.data?.id ?? "evm";

    for (const [i, tr] of (a.transfers ?? []).entries()) {
      const dir = tr.direction; // in | out
      if (dir !== "in" && dir !== "out") continue;
      const symbol = tr.fungible_info?.symbol ?? "?";
      const amount = Number(tr.quantity?.float ?? 0);
      if (!(amount > 0)) continue;
      // Tokens contables internos de protocolos (aTokens/deuda de Aave…): no
      // son movimientos del hold, los cubren los escáneres de protocolo.
      if (/^(a|variableDebt|stableDebt)[A-Z]/.test(symbol) || symbol === "?") continue;
      const price = tr.price != null ? Number(tr.price) : (tr.value != null ? Number(tr.value) / amount : null);
      if (price == null) continue; // sin precio = spam o token interno
      // position_ref = address del token en esa cadena (los holds usan
      // `${chain}:hold:${tokenAddress ?? symbol}` como id en vivo).
      const impl = (tr.fungible_info?.implementations ?? []).find((m) => (CHAIN_ALIASES[m.chain_id] ?? m.chain_id) === chain);
      const positionRef = impl?.address ?? symbol;
      const kind = dir === "in" ? "transfer_in" : "transfer_out";
      const ok = await insertTransferEvent({
        portfolioId,
        eventKey: `${chain}:${a.hash}:${i}:${kind}`,
        kind,
        chain,
        protocol: "Wallet",
        walletAddr: addr,
        positionRef,
        symbol,
        amount,
        price,
        tsSec,
        txHash: a.hash ?? null,
      });
      if (ok) found++;
    }
  }
  if (maxTs > last) await setScanCursor(portfolioId, "evm", "Wallet", maxTs);
  return found;
}

// Solana: transferencias parseadas vía Helius (gratis con la key existente).
// Cursor = slot de la tx más reciente vista.
const SOL_MINTS = {
  So11111111111111111111111111111111111111112: "SOL",
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: "JITOSOL",
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: "MSOL",
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: "JUP",
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": "RAY",
  orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE: "ORCA",
};
async function scanSolanaTransfers(portfolioId, addr) {
  const key = process.env.HELIUS_API_KEY;
  if (!key) return 0;
  const res = await fetch(`https://api.helius.xyz/v0/addresses/${addr}/transactions?api-key=${key}&limit=100&type=TRANSFER`);
  if (!res.ok) throw new Error(`Helius ${res.status}`);
  const txs = await res.json();
  const last = Number(await getScanCursor(portfolioId, "solana", "Wallet") ?? 0);

  let found = 0;
  let maxSlot = last;
  for (const tx of Array.isArray(txs) ? txs : []) {
    const slot = Number(tx.slot ?? 0);
    if (!slot || slot <= last) continue;
    if (tx.transactionError) continue;
    if (maxSlot < slot) maxSlot = slot;
    const tsSec = Number(tx.timestamp ?? Math.floor(Date.now() / 1000));

    // Delta neto por token para la wallet en la tx.
    const net = new Map(); // mint|SOL → amount neto
    for (const t of tx.nativeTransfers ?? []) {
      const amt = Number(t.amount ?? 0) / 1e9;
      if (t.toUserAccount === addr) net.set("SOL", (net.get("SOL") ?? 0) + amt);
      if (t.fromUserAccount === addr) net.set("SOL", (net.get("SOL") ?? 0) - amt);
    }
    for (const t of tx.tokenTransfers ?? []) {
      const amt = Number(t.tokenAmount ?? 0);
      if (!(amt > 0)) continue;
      if (t.toUserAccount === addr) net.set(t.mint, (net.get(t.mint) ?? 0) + amt);
      if (t.fromUserAccount === addr) net.set(t.mint, (net.get(t.mint) ?? 0) - amt);
    }

    for (const [mint, delta] of net) {
      const amount = Math.abs(delta);
      if (!(amount > 0)) continue;
      const isSol = mint === "SOL";
      const symbol = isSol ? "SOL" : (SOL_MINTS[mint] ?? `${mint.slice(0, 4)}…`);
      const price = isSol
        ? await llamaPrice("coingecko", "solana", tsSec)
        : await llamaPrice("solana", mint, tsSec);
      if (price == null) continue; // sin precio conocido = casi seguro spam/airdrop
      const kind = delta > 0 ? "transfer_in" : "transfer_out";
      const ok = await insertTransferEvent({
        portfolioId,
        eventKey: `solana:${tx.signature}:${mint}:${kind}`,
        kind,
        chain: "solana",
        protocol: "Wallet",
        walletAddr: addr,
        positionRef: isSol ? "SOL" : mint, // hold id = `solana:hold:${mint ?? symbol}`
        symbol,
        amount,
        price,
        tsSec,
        txHash: tx.signature ?? null,
      });
      if (ok) found++;
    }
  }
  if (maxSlot > last) await setScanCursor(portfolioId, "solana", "Wallet", maxSlot);
  return found;
}

async function main() {
  const { data: wallets, error } = await sb
    .from("portfolio_wallets")
    .select("portfolio_id, address, chain_kind")
    .eq("is_active", true);
  if (error) { console.error("Error leyendo portfolio_wallets:", error.message); process.exit(1); }

  // Bitcoin y Solana: transferencias de holds (Fase C3).
  for (const w of wallets ?? []) {
    try {
      if (w.chain_kind === "bitcoin") {
        const n = await scanBitcoin(w.portfolio_id, w.address);
        if (n > 0) console.log(`  bitcoin ${w.address.slice(0, 8)} → ${n} transferencias`);
      } else if (w.chain_kind === "solana") {
        const n = await scanSolanaTransfers(w.portfolio_id, w.address);
        if (n > 0) console.log(`  solana ${w.address.slice(0, 8)} → ${n} transferencias`);
      } else if (w.chain_kind === "evm") {
        const n = await scanEvmTransfers(w.portfolio_id, w.address);
        if (n > 0) console.log(`  evm ${w.address.slice(0, 8)} → ${n} transferencias`);
      }
    } catch (e) {
      console.error(`  transfers ${w.chain_kind} ${w.address.slice(0, 8)}: ${String(e.message).slice(0, 120)}`);
    }
  }

  for (const w of (wallets ?? []).filter((x) => x.chain_kind === "evm")) {
    // tokenIds en farming (staked): el NFT no está en la wallet; los da Zerion.
    const farmingIds = await zerionNftIds(w.address);
    for (const protocol of PROTOCOLS) {
      for (const [chainName, npm] of Object.entries(protocol.npm)) {
        if (ONLY_CHAINS.length && !ONLY_CHAINS.includes(chainName)) continue;
        const cfg = CHAINS[chainName];
        if (!cfg) continue;
        const client = createPublicClient({ chain: cfg.chain, transport: http(cfg.rpc, { batch: { batchSize: 3 } }) });
        try {
          const extra = farmingIds.get(`${protocol.name}:${chainName}`);
          const n = await scanWallet(client, cfg, protocol, npm, w.portfolio_id, w.address, chainName, extra);
          if (n > 0) console.log(`  ${chainName} ${protocol.name} ${w.address.slice(0, 8)} → ${n} harvests detectados`);
        } catch (e) {
          console.error(`  ${chainName} ${protocol.name}: ${String(e.message).slice(0, 120)}`);
        }
      }
    }

    // Aave V3 (Fase C2): supply/withdraw/borrow/repay por cadena.
    for (const chainName of Object.keys(AAVE_POOLS)) {
      if (ONLY_CHAINS.length && !ONLY_CHAINS.includes(chainName)) continue;
      const cfg = CHAINS[chainName];
      if (!cfg) continue;
      const client = createPublicClient({ chain: cfg.chain, transport: http(cfg.rpc, { batch: { batchSize: 3 } }) });
      try {
        const n = await scanAave(client, cfg, w.portfolio_id, w.address, chainName);
        if (n > 0) console.log(`  ${chainName} Aave V3 ${w.address.slice(0, 8)} → ${n} eventos detectados`);
      } catch (e) {
        console.error(`  ${chainName} Aave V3: ${String(e.message).slice(0, 120)}`);
      }
    }
  }
  console.log("Done.");
}

main();
