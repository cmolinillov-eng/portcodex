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
import { HDKey } from "@scure/bip32";
import { base58check, bech32 } from "@scure/base";
import { sha256 } from "@noble/hashes/sha256";
import { ripemd160 } from "@noble/hashes/ripemd160";

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
  rpcUrls: { default: { http: ["https://hyperliquid.drpc.org"] } },
});
// Fallbacks de drpc.org: es de los pocos RPC gratuitos que aceptan eth_getLogs
// con filtros (bsc-dataseed, mainnet.base.org y publicnode lo limitan/bloquean).
// HyperEVM TAMBIÉN va por drpc: el RPC oficial (rpc.hyperliquid.xyz) rechaza
// rangos >~50 bloques ("invalid block range") y tarda minutos por petición —
// era la causa de los timeouts de 30 min del workflow. drpc sirve 9000 bloques
// en <1s (verificado 2026-07-06).
const CHAINS = {
  ethereum: { chain: mainnet, rpc: process.env.RPC_ETHEREUM || "https://eth.drpc.org", llama: "ethereum" },
  arbitrum: { chain: arbitrum, rpc: process.env.RPC_ARBITRUM || "https://arbitrum.drpc.org", llama: "arbitrum" },
  base: { chain: base, rpc: process.env.RPC_BASE || "https://base.drpc.org", llama: "base" },
  polygon: { chain: polygon, rpc: process.env.RPC_POLYGON || "https://polygon.drpc.org", llama: "polygon" },
  bsc: { chain: bsc, rpc: process.env.RPC_BSC || "https://bsc.drpc.org", llama: "bsc" },
  hyperevm: { chain: hyperevm, rpc: process.env.RPC_HYPEREVM || "https://hyperliquid.drpc.org", llama: "hyperliquid" },
};

// Presupuesto de tiempo global del worker: el workflow mata el job a los 25
// min; salir limpio ANTES (con los cursores checkpointeados por tramo)
// garantiza que cada run avanza aunque una cadena esté lenta, en vez de morir
// cancelado y repetirlo todo. Override con WORKER_DEADLINE_MIN.
const DEADLINE_AT = Date.now() + Number(process.env.WORKER_DEADLINE_MIN || 20) * 60_000;
let deadlineLogged = false;
function pastDeadline() {
  if (Date.now() < DEADLINE_AT) return false;
  if (!deadlineLogged) {
    deadlineLogged = true;
    console.error("  ⏱ presupuesto de tiempo agotado: cierre limpio (los cursores continúan en el próximo run).");
  }
  return true;
}

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
const aavePoolAbi = [{
  name: "getUserAccountData", type: "function", stateMutability: "view",
  inputs: [{ name: "user", type: "address" }],
  outputs: [
    { name: "totalCollateralBase", type: "uint256" },
    { name: "totalDebtBase", type: "uint256" },
    { name: "availableBorrowsBase", type: "uint256" },
    { name: "currentLiquidationThreshold", type: "uint256" },
    { name: "ltv", type: "uint256" },
    { name: "healthFactor", type: "uint256" },
  ],
}];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ¿El error es por tamaño del rango (→ reducir tramo) o por rate-limit (→ esperar)?
// "unknown RPC error" + "Cannot read properties of undefined (reading 'error')"
// es la firma con la que el RPC público de HyperEVM rechaza rangos que no le
// caben — hay que tratarlo como error de tamaño para que el tramo se parta.
const isSizeError = (msg) =>
  /exceed|block range|ranges? over|not supported|too many results|response size|more than|query returned|unknown rpc error|cannot read properties of undefined/i.test(
    msg,
  );
const isRateError = (msg) => /too many request|429|rate ?limit|http request failed|internal|500|503|took too long/i.test(msg);

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

const CHUNK = 9000n; // rango máximo de getLogs (límite free-tier de drpc: 10000)
// Chunk inicial por cadena (override puntual si algún RPC exige rangos menores).
const CHUNK_BY_CHAIN = {};
// Tope duro de tramos fallidos consecutivos por (cadena, protocolo): si el RPC
// está caído, no gastamos los 25 min del workflow golpeando en balde. Antes:
// un run con hyperevm roto cancelaba TODO (incluida Solana, Bitcoin y demás).
const MAX_CONSECUTIVE_FAILS = 5;
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

  let chunk = CHUNK_BY_CHAIN[chainName] ?? CHUNK; // adaptativo por cadena
  let start = from;
  let firstFailed = null; // primer bloque de un tramo fallido: el cursor no lo salta
  let consecutiveFails = 0;
  while (start <= latest) {
    // Presupuesto agotado: salir SIN tocar el cursor final (los checkpoints
    // por tramo ya persisten el progreso; el próximo run continúa desde ahí).
    if (pastDeadline()) return found;
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
      consecutiveFails = 0;
      await sleep(150); // pacing: no agotar la cuota del RPC gratuito
    } catch (e) {
      const msg = String(e.message);
      // Tramo demasiado grande: reintenta el mismo tramo con la mitad de rango.
      if (isSizeError(msg) && chunk > 50n) {
        chunk = chunk / 2n;
        continue;
      }
      console.error(`  getLogs ${chainName} ${protocol.name} [${start}-${end}]: ${msg.slice(0, 100)}`);
      if (firstFailed == null) firstFailed = start; // se reintentará en el siguiente run
      consecutiveFails++;
      if (consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
        console.error(`  ${chainName}/${protocol.name}: ${consecutiveFails} fallos seguidos → abandono este par (se reintenta en el próximo run).`);
        return found;
      }
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
    // Checkpoint por tramo: si el job muere a mitad (timeout del workflow,
    // cancelación), el siguiente run continúa desde aquí en vez de repetir
    // toda la ventana. Solo mientras no haya tramos fallidos pendientes.
    if (firstFailed == null) {
      await sb.from("onchain_scan_state").upsert(
        { portfolio_id: portfolioId, chain: chainName, protocol: protocol.name, last_block: Number(end), updated_at: new Date().toISOString() },
        { onConflict: "portfolio_id,chain,protocol" },
      );
    }
    start = end + 1n;
  }

  // Cursor final (sin saltar tramos fallidos: si algo falló, el cursor se
  // queda justo antes y el siguiente run lo reintenta).
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

  const { data: state } = await sb
    .from("onchain_scan_state")
    .select("last_block")
    .eq("portfolio_id", portfolioId).eq("chain", chainName).eq("protocol", "Aave V3")
    .maybeSingle();

  // Primer escaneo de esta cadena: solo si la wallet tiene algo en Aave aquí
  // (colateral o deuda). Evita quemar la cuota del RPC gratuito en cadenas
  // vacías. Con cursor existente se sigue escaneando siempre (incremental).
  if (state?.last_block == null) {
    try {
      const d = await client.readContract({ address: pool, abi: aavePoolAbi, functionName: "getUserAccountData", args: [walletAddr] });
      if (d[0] === 0n && d[1] === 0n) return 0;
    } catch {
      return 0; // RPC caído: se reintenta en el próximo run
    }
  }

  const latest = await client.getBlockNumber();
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

  let chunk = CHUNK_BY_CHAIN[chainName] ?? CHUNK;
  let start = from;
  let firstFailed = null;
  let consecutiveFails = 0;
  while (start <= latest) {
    if (pastDeadline()) return found; // checkpoints por tramo ya persistidos
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
      consecutiveFails = 0;
      await sleep(150);
    } catch (e) {
      const msg = String(e.message);
      if (isSizeError(msg) && chunk > 50n) {
        chunk = chunk / 2n;
        continue;
      }
      console.error(`  getLogs ${chainName} Aave [${start}-${end}]: ${msg.slice(0, 100)}`);
      if (firstFailed == null) firstFailed = start;
      consecutiveFails++;
      if (consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
        console.error(`  ${chainName}/Aave: ${consecutiveFails} fallos seguidos → abandono este par (se reintenta en el próximo run).`);
        return found;
      }
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
    // Checkpoint por tramo (mismo motivo que en scanWallet).
    if (firstFailed == null) {
      await sb.from("onchain_scan_state").upsert(
        { portfolio_id: portfolioId, chain: chainName, protocol: "Aave V3", last_block: Number(end), updated_at: new Date().toISOString() },
        { onConflict: "portfolio_id,chain,protocol" },
      );
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

// ── Bitcoin (Ledger en hold): transacciones confirmadas vía indexador público ──
// Acepta dirección individual O clave extendida (xpub/ypub/zpub) de monedero
// HD: se derivan las direcciones con actividad y el delta se netea POR TX a
// través de TODAS ellas — sin esto, cada gasto con cambio interno emitiría
// una transferencia fantasma de salida + otra de entrada.
const BTC_API_HOSTS = ["https://blockstream.info/api", "https://mempool.space/api"];
async function btcApi(pathname) {
  let lastErr = null;
  for (const host of BTC_API_HOSTS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${host}${pathname}`);
        if (res.status === 429 || res.status >= 500) {
          await sleep(500 * (attempt + 1));
          lastErr = new Error(`${host} ${res.status}`);
          continue;
        }
        if (!res.ok) throw new Error(`${host} ${res.status}`);
        return await res.json();
      } catch (e) {
        lastErr = e;
        await sleep(400 * (attempt + 1));
      }
    }
  }
  throw lastErr ?? new Error("btc api failed");
}

const b58btc = base58check(sha256);
function btcHash160(pk) { return ripemd160(sha256(pk)); }
function btcAddressFor(kind, pk) {
  if (kind === "zpub") return bech32.encode("bc", [0, ...bech32.toWords(btcHash160(pk))]);
  if (kind === "ypub") {
    const redeem = new Uint8Array(22); redeem[0] = 0x00; redeem[1] = 0x14; redeem.set(btcHash160(pk), 2);
    const sh = btcHash160(redeem);
    const payload = new Uint8Array(21); payload[0] = 0x05; payload.set(sh, 1);
    return b58btc.encode(payload);
  }
  const h = btcHash160(pk);
  const payload = new Uint8Array(21); payload[0] = 0x00; payload.set(h, 1);
  return b58btc.encode(payload);
}
function btcToXpubVersion(extKey) {
  const raw = b58btc.decode(extKey);
  const out = new Uint8Array(raw);
  new DataView(out.buffer).setUint32(0, 0x0488b21e, false);
  return b58btc.encode(out);
}
/** Direcciones CON ACTIVIDAD de una clave extendida (mismo criterio que la app:
 *  el prefijo miente — Ledger exporta Native SegWit como xpub — así que se
 *  sondea el esquema real y se escanean ambas ramas con gap-limit 20). */
async function btcDeriveUsedAddresses(extKey) {
  const hd = HDKey.fromExtendedKey(btcToXpubVersion(extKey));
  const statsOf = async (a) => {
    const j = await btcApi(`/address/${a}`);
    const cs = j.chain_stats ?? {}; const ms = j.mempool_stats ?? {};
    return (cs.tx_count ?? 0) + (ms.tx_count ?? 0);
  };
  // Sondeo del esquema real (10 primeras de recepción por esquema).
  let scheme = "zpub";
  const probeBranch = hd.deriveChild(0);
  outer: for (const kind of ["zpub", "ypub", "xpub"]) {
    for (let i = 0; i < 10; i++) {
      if ((await statsOf(btcAddressFor(kind, probeBranch.deriveChild(i).publicKey))) > 0) {
        scheme = kind;
        break outer;
      }
    }
  }
  const used = [];
  for (const branchIndex of [0, 1]) {
    const branch = hd.deriveChild(branchIndex);
    let empty = 0;
    for (let i = 0; i < 200 && empty < 20; i++) {
      const a = btcAddressFor(scheme, branch.deriveChild(i).publicKey);
      if ((await statsOf(a)) > 0) { used.push(a); empty = 0; } else empty++;
      await sleep(60);
    }
  }
  return used;
}

async function scanBitcoin(portfolioId, walletAddr) {
  const isExtended = /^(x|y|z)pub[1-9A-HJ-NP-Za-km-z]{100,115}$/.test(walletAddr);
  const addresses = isExtended ? await btcDeriveUsedAddresses(walletAddr) : [walletAddr];
  if (!addresses.length) return 0;
  const ours = new Set(addresses);

  // Todas las txs de todas nuestras direcciones, únicas por txid.
  const byTxid = new Map();
  for (const a of addresses) {
    const txs = await btcApi(`/address/${a}/txs`);
    for (const tx of txs) if (!byTxid.has(tx.txid)) byTxid.set(tx.txid, tx);
    await sleep(80);
  }

  const last = Number(await getScanCursor(portfolioId, "bitcoin", "Bitcoin") ?? 0);
  let found = 0;
  let maxHeight = last;
  for (const tx of byTxid.values()) {
    if (!tx.status?.confirmed) continue;
    const height = tx.status.block_height ?? 0;
    if (height <= last) continue;
    if (height > maxHeight) maxHeight = height;

    // Delta neto del MONEDERO en la tx (sats): entradas − salidas de todas
    // nuestras direcciones. El cambio interno se anula solo.
    const inSats = tx.vout.filter((v) => ours.has(v.scriptpubkey_address)).reduce((s, v) => s + v.value, 0);
    const outSats = tx.vin.filter((v) => ours.has(v.prevout?.scriptpubkey_address)).reduce((s, v) => s + (v.prevout?.value ?? 0), 0);
    const net = (inSats - outSats) / 1e8;
    if (net === 0) continue;

    const tsSec = tx.status.block_time ?? Math.floor(Date.now() / 1000);
    const price = await llamaPrice("coingecko", "bitcoin", tsSec);
    const kind = net > 0 ? "transfer_in" : "transfer_out";
    const ok = await insertTransferEvent({
      portfolioId,
      eventKey: `bitcoin:${tx.txid}:${walletAddr.slice(0, 24)}:${kind}`,
      kind,
      chain: "bitcoin",
      protocol: "Bitcoin",
      walletAddr,
      positionRef: walletAddr, // hold id = `bitcoin:hold:${address|xpub}`
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
  // send/receive = transferencias del hold; trade = swaps de wallet (permuta
  // fiscal — antes no se pedían y la permuta se perdía).
  const res = await fetch(
    `https://api.zerion.io/v1/wallets/${addr}/transactions/?currency=usd&page[size]=100&filter[operation_types]=send,receive,trade&filter[trash]=only_non_trash`,
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

    // ── PERMUTA (trade de Zerion): swap dentro de la wallet → un solo evento
    // kind=swap con las dos patas; la ingesta lo convierte en permuta fiscal.
    if (a.operation_type === "trade") {
      const legs = [];
      for (const tr of a.transfers ?? []) {
        const dir = tr.direction;
        if (dir !== "in" && dir !== "out") continue;
        const symbol = tr.fungible_info?.symbol ?? "?";
        const amount = Number(tr.quantity?.float ?? 0);
        if (!(amount > 0)) continue;
        if (/^(a|variableDebt|stableDebt)[A-Z]/.test(symbol) || symbol === "?") continue;
        const price = tr.price != null ? Number(tr.price) : (tr.value != null ? Number(tr.value) / amount : null);
        if (price == null || price <= 0) continue;
        const impl = (tr.fungible_info?.implementations ?? []).find((m) => (CHAIN_ALIASES[m.chain_id] ?? m.chain_id) === chain);
        legs.push({ symbol, amount, priceUsd: price, valueUsd: amount * price, side: dir === "out" ? "sold" : "bought", holdRef: impl?.address ?? symbol });
      }
      const soldLegs = legs.filter((l) => l.side === "sold");
      const boughtLegs = legs.filter((l) => l.side === "bought");
      if (soldLegs.length && boughtLegs.length) {
        const soldUsd = soldLegs.reduce((s, l) => s + l.valueUsd, 0);
        const boughtUsd = boughtLegs.reduce((s, l) => s + l.valueUsd, 0);
        const maxUsd = Math.max(soldUsd, boughtUsd);
        if (maxUsd >= 0.5 && Math.abs(soldUsd - boughtUsd) / maxUsd <= 0.3) {
          const { error } = await sb.from("onchain_events").upsert({
            portfolio_id: portfolioId,
            event_key: `${chain}:${a.hash}:swap`,
            kind: "swap",
            chain,
            protocol: "Wallet",
            wallet_address: addr,
            position_ref: soldLegs[0].holdRef,
            label: `${soldLegs.map((l) => l.symbol).join("+")} → ${boughtLegs.map((l) => l.symbol).join("+")}`,
            tokens: legs,
            value_usd: boughtUsd,
            block_time: new Date(tsSec * 1000).toISOString(),
            tx_hash: a.hash ?? null,
            includes_principal: false,
          }, { onConflict: "portfolio_id,event_key", ignoreDuplicates: true });
          if (error) console.error(`  insert swap evm: ${error.message}`);
          else found++;
        }
      }
      continue;
    }

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
  // Cursor 1s por debajo del máximo: el timestamp EVM (segundos) no es único,
  // así que dos transferencias en el mismo segundo podrían perderse si el
  // cursor las deja justo en el borde. Reprocesar ese segundo es seguro
  // (event_key idempotente por hash+índice → no duplica).
  if (maxTs > last) await setScanCursor(portfolioId, "evm", "Wallet", maxTs - 1);
  return found;
}

// ── Solana vía Helius: LP de Orca/Kamino + transferencias de holds ───────────
// Un solo pase por el historial parseado, clasificando cada tx:
//   COLLECT_FEES (Orca)                → harvest de la posición LP
//   tx que toca Whirlpool / Kamino     → deposit/withdraw de LP (signo neto)
//   TRANSFER / CCTP puro               → entrada/salida del hold
//   SWAP y demás                       → se ignoran (movimiento interno)
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
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": "PYUSD",
  USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA: "USDS",
};
const WHIRLPOOL_PROGRAM = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";
const KAMINO_LIQUIDITY_PROGRAM = "6LtLpnUFNByNXLyCoK9wA2MykKAmQNZKBdY8s47dehDc";
const METEORA_DLMM_PROGRAM = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";

// Posiciones LP de Solana conocidas del portfolio (de onchain_cache): para
// casar cada evento LP con su posición viva → auto-asignación por enlaces.
async function solanaLpPositions(portfolioId) {
  const out = [];
  try {
    const { data } = await sb
      .from("onchain_cache")
      .select("source, positions")
      .eq("portfolio_id", portfolioId)
      .in("source", ["kamino", "meteora", "snapshot"]);
    for (const row of data ?? []) {
      const list = row.source === "snapshot" ? row.positions?.positions ?? [] : row.positions ?? [];
      for (const p of list) {
        if (p.chain !== "solana" || p.kind !== "liquidity") continue;
        const symbols = new Set(
          String(p.label ?? "")
            .split(/[/+·]/)
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean),
        );
        if (symbols.size) out.push({ id: p.id, protocol: p.protocol ?? "Orca", label: p.label, symbols });
      }
    }
  } catch { /* sin caché: eventos sin preasignar */ }
  // De-dup por id (el snapshot puede repetir las kamino).
  const seen = new Set();
  return out.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

async function scanSolanaTransfers(portfolioId, addr) {
  const key = process.env.HELIUS_API_KEY;
  if (!key) return 0;
  const res = await fetch(`https://api.helius.xyz/v0/addresses/${addr}/transactions?api-key=${key}&limit=100`);
  if (!res.ok) throw new Error(`Helius ${res.status}`);
  const txs = await res.json();
  const last = Number(await getScanCursor(portfolioId, "solana", "Wallet") ?? 0);
  const lpPositions = await solanaLpPositions(portfolioId);

  let found = 0;
  let maxSlot = last;
  for (const tx of Array.isArray(txs) ? txs : []) {
    const slot = Number(tx.slot ?? 0);
    if (!slot || slot <= last) continue;
    if (tx.transactionError) continue;
    if (maxSlot < slot) maxSlot = slot;
    const tsSec = Number(tx.timestamp ?? Math.floor(Date.now() / 1000));
    const type = String(tx.type ?? "");
    const source = String(tx.source ?? "");
    const programs = new Set((tx.instructions ?? []).map((i) => i.programId));

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
    // Dedupe SOL/wSOL: al operar con pools, Helius reporta el wSOL del vault
    // Y su (des)envoltura como transferencia nativa — el mismo dinero dos
    // veces. Si ambos van en el mismo sentido con importe ~igual, es unwrap.
    const WSOL = "So11111111111111111111111111111111111111112";
    const wsol = net.get(WSOL) ?? 0;
    if (wsol !== 0) {
      net.delete(WSOL);
      const sol = net.get("SOL") ?? 0;
      let merged;
      if (
        sol !== 0 &&
        Math.sign(sol) === Math.sign(wsol) &&
        Math.abs(Math.abs(sol) - Math.abs(wsol)) / Math.max(Math.abs(sol), Math.abs(wsol)) < 0.1
      ) {
        merged = Math.sign(sol) * Math.max(Math.abs(sol), Math.abs(wsol)); // unwrap duplicado
      } else {
        merged = sol + wsol;
      }
      if (merged !== 0) net.set("SOL", merged);
      else net.delete("SOL");
    }
    if (!net.size) continue;

    // Tokens del delta con precio histórico.
    const tokens = [];
    let totalUsd = 0;
    for (const [mint, delta] of net) {
      const amount = Math.abs(delta);
      if (!(amount > 0)) continue;
      const isSol = mint === "SOL";
      const symbol = isSol ? "SOL" : (SOL_MINTS[mint] ?? `${mint.slice(0, 4)}…`);
      const price = isSol
        ? await llamaPrice("coingecko", "solana", tsSec)
        : await llamaPrice("solana", mint, tsSec);
      if (price == null) continue; // sin precio conocido = spam/airdrop/dust interno
      const valueUsd = amount * price;
      if (valueUsd < 0.5) continue; // polvo
      tokens.push({ symbol, mint, delta, amount, priceUsd: price, valueUsd });
      totalUsd += delta > 0 ? valueUsd : -valueUsd;
    }
    if (!tokens.length) continue;

    // ── PERMUTA (swap de wallet): antes se ignoraba y la permuta fiscal se
    // perdía. Un SWAP con pata vendida y comprada de valor comparable es un
    // intercambio del hold: se emite kind=swap con las dos patas (side +
    // holdRef) y la ingesta lo convierte en withdrawal(swap_out) +
    // deposit(swap_in). Si los valores no casan (zap a pool, interacción
    // rara), se ignora: los depósitos LP ya los emiten sus ramas.
    if (type === "SWAP") {
      const soldLegs = tokens.filter((t) => t.delta < 0);
      const boughtLegs = tokens.filter((t) => t.delta > 0);
      if (soldLegs.length && boughtLegs.length) {
        const soldUsd = soldLegs.reduce((s, t) => s + t.valueUsd, 0);
        const boughtUsd = boughtLegs.reduce((s, t) => s + t.valueUsd, 0);
        const maxUsd = Math.max(soldUsd, boughtUsd);
        if (maxUsd >= 0.5 && Math.abs(soldUsd - boughtUsd) / maxUsd <= 0.3) {
          const holdRefOf = (t) => (t.mint === "SOL" ? "SOL" : t.mint);
          const evTokens = [
            ...soldLegs.map((t) => ({ symbol: t.symbol, amount: t.amount, priceUsd: t.priceUsd, valueUsd: t.valueUsd, side: "sold", holdRef: holdRefOf(t) })),
            ...boughtLegs.map((t) => ({ symbol: t.symbol, amount: t.amount, priceUsd: t.priceUsd, valueUsd: t.valueUsd, side: "bought", holdRef: holdRefOf(t) })),
          ];
          const { error } = await sb.from("onchain_events").upsert({
            portfolio_id: portfolioId,
            event_key: `solana:${tx.signature}:swap`,
            kind: "swap",
            chain: "solana",
            protocol: "Wallet",
            wallet_address: addr,
            position_ref: holdRefOf(soldLegs[0]),
            label: `${soldLegs.map((t) => t.symbol).join("+")} → ${boughtLegs.map((t) => t.symbol).join("+")}`,
            tokens: evTokens,
            value_usd: boughtUsd,
            block_time: new Date(tsSec * 1000).toISOString(),
            tx_hash: tx.signature ?? null,
            includes_principal: false,
          }, { onConflict: "portfolio_id,event_key", ignoreDuplicates: true });
          if (error) console.error(`  insert swap solana: ${error.message}`);
          else found++;
        }
      }
      continue;
    }

    const isOrcaCollect = type === "COLLECT_FEES";
    const isMeteora = programs.has(METEORA_DLMM_PROGRAM);
    // Un SWAP directo (UI de Orca, o Jupiter enrutando por estos pools) toca
    // los mismos programas que un depósito/retirada de LP y su delta neto
    // (vendido ≈ comprado) haría que el signo — y por tanto la clasificación
    // deposit/withdraw — dependiera de la deriva del precio horario: moneda
    // al aire contabilizada. Los swaps son movimiento interno: fuera.
    const isLpTx =
      type !== "SWAP" &&
      (isOrcaCollect ||
        programs.has(WHIRLPOOL_PROGRAM) ||
        programs.has(KAMINO_LIQUIDITY_PROGRAM) ||
        isMeteora ||
        source === "KAMINO_FARMS");

    if (isLpTx) {
      // ── Evento de LP: harvest / deposit / withdraw ─────────────────────
      // Helius NO parsea las tx de Kamino ni Meteora (type=UNKNOWN): un cobro
      // de fees/recompensas y una retirada de principal se ven IGUAL (dinero
      // entrante). Clasificar money-in por signo confundiría un harvest con una
      // retirada (y viceversa) → contabilidad corrupta. Por eso, para Kamino y
      // Meteora, el escáner SOLO emite DEPÓSITOS (money-out = añadir liquidez);
      // sus harvests y retiradas los detecta el worker de caché comparando
      // estado de posición entre lecturas (delta de fees cobradas / caída de
      // principal), que es la señal fiable. Orca SÍ separa COLLECT_FEES (harvest)
      // de la retirada, así que su money-in es fiable y se clasifica por signo.
      const isOrca = isOrcaCollect || programs.has(WHIRLPOOL_PROGRAM);
      if (!isOrca && totalUsd >= 0) continue;
      const kind = isOrcaCollect ? "harvest" : totalUsd < 0 ? "deposit" : "withdraw";
      const symbols = new Set(tokens.map((t) => t.symbol.toUpperCase()));
      // Casar con la posición viva por conjunto de tokens (⊆).
      const candidates = lpPositions.filter((p) => [...symbols].every((s) => p.symbols.has(s)));
      const protoNeedle = isOrca ? "orca" : isMeteora ? "meteora" : "kamino";
      const byProtocol = candidates.filter((p) => p.protocol.toLowerCase().includes(protoNeedle));
      const match = byProtocol.length === 1 ? byProtocol[0] : candidates.length === 1 ? candidates[0] : null;

      const evTokens = tokens.map((t) => ({ symbol: t.symbol, amount: t.amount, priceUsd: t.priceUsd, valueUsd: t.valueUsd }));
      const valueUsd = evTokens.reduce((s, t) => s + t.valueUsd, 0);
      if (valueUsd < 0.5) continue;
      const { error } = await sb.from("onchain_events").upsert({
        portfolio_id: portfolioId,
        event_key: `solana:${tx.signature}:${kind}`,
        kind,
        chain: "solana",
        protocol: match?.protocol ?? (isOrca ? "Orca" : isMeteora ? "Meteora" : "Kamino"),
        wallet_address: addr,
        // ref = LivePosition.id completo → el endpoint lo usa tal cual para
        // casar con position_links (auto-asignación y auto-ingesta).
        position_ref: match?.id ?? null,
        label: match?.label ?? [...symbols].join("/"),
        tokens: evTokens,
        value_usd: valueUsd,
        block_time: new Date(tsSec * 1000).toISOString(),
        tx_hash: tx.signature ?? null,
        includes_principal: false,
      }, { onConflict: "portfolio_id,event_key", ignoreDuplicates: true });
      if (error) console.error(`  insert lp solana: ${error.message}`);
      else found++;
      continue;
    }

    // ── Transferencias del hold (entrada/salida pura de la wallet) ────────
    const isPlainTransfer = type === "TRANSFER" || source.startsWith("CIRCLE_CCTP") || type === "RECEIVE_MESSAGE";
    if (!isPlainTransfer) continue; // SWAP y otros DeFi: movimiento interno

    for (const t of tokens) {
      const kind = t.delta > 0 ? "transfer_in" : "transfer_out";
      const ok = await insertTransferEvent({
        portfolioId,
        eventKey: `solana:${tx.signature}:${t.mint}:${kind}`,
        kind,
        chain: "solana",
        protocol: "Wallet",
        walletAddr: addr,
        positionRef: t.mint === "SOL" ? "SOL" : t.mint, // hold id = `solana:hold:${mint}`
        symbol: t.symbol,
        amount: t.amount,
        price: t.priceUsd,
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
    if (pastDeadline()) break;
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
    if (pastDeadline()) break;
    // tokenIds en farming (staked): el NFT no está en la wallet; los da Zerion.
    const farmingIds = await zerionNftIds(w.address);
    for (const protocol of PROTOCOLS) {
      for (const [chainName, npm] of Object.entries(protocol.npm)) {
        if (pastDeadline()) break;
        if (ONLY_CHAINS.length && !ONLY_CHAINS.includes(chainName)) continue;
        const cfg = CHAINS[chainName];
        if (!cfg) continue;
        const client = createPublicClient({ chain: cfg.chain, transport: http(cfg.rpc, { batch: { batchSize: 3 }, timeout: 12_000, retryCount: 0 }) });
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
      if (pastDeadline()) break;
      if (ONLY_CHAINS.length && !ONLY_CHAINS.includes(chainName)) continue;
      const cfg = CHAINS[chainName];
      if (!cfg) continue;
      const client = createPublicClient({ chain: cfg.chain, transport: http(cfg.rpc, { batch: { batchSize: 3 }, timeout: 12_000, retryCount: 0 }) });
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
