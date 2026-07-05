import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });

// PancakeSwap V3 NonfungiblePositionManager (mismo address en todas las cadenas Pancake)
const NPM = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364";
const POOL = "0xc6a2db661d5a5690172d8eb0a7dea2d3008665a3";
const TOKEN_ID = 1497859n;

const npmAbi = [{
  name: "positions", type: "function", stateMutability: "view",
  inputs: [{ name: "tokenId", type: "uint256" }],
  outputs: [
    { name: "nonce", type: "uint96" }, { name: "operator", type: "address" },
    { name: "token0", type: "address" }, { name: "token1", type: "address" },
    { name: "fee", type: "uint24" }, { name: "tickLower", type: "int24" },
    { name: "tickUpper", type: "int24" }, { name: "liquidity", type: "uint128" },
    { name: "feeGrowthInside0LastX128", type: "uint256" }, { name: "feeGrowthInside1LastX128", type: "uint256" },
    { name: "tokensOwed0", type: "uint128" }, { name: "tokensOwed1", type: "uint128" },
  ],
}];
const poolAbi = [{
  name: "slot0", type: "function", stateMutability: "view", inputs: [],
  outputs: [
    { name: "sqrtPriceX96", type: "uint160" }, { name: "tick", type: "int24" },
    { name: "observationIndex", type: "uint16" }, { name: "observationCardinality", type: "uint16" },
    { name: "observationCardinalityNext", type: "uint16" }, { name: "feeProtocol", type: "uint32" },
    { name: "unlocked", type: "bool" },
  ],
}];
const erc20Abi = [
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
];

const factoryAbi = [{
  name: "getPool", type: "function", stateMutability: "view",
  inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }],
  outputs: [{ type: "address" }],
}];
const FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865"; // PancakeSwap V3 factory

const pos = await client.readContract({ address: NPM, abi: npmAbi, functionName: "positions", args: [TOKEN_ID] });
const [nonce, operator, token0, token1, fee, tickLower, tickUpper, liquidity, , , owed0, owed1] = pos;
console.log("positions() OK → token0=%s token1=%s fee=%s ticks=[%s,%s]", token0, token1, fee, tickLower, tickUpper);

// Pool real derivado del factory (el pool_address de Zerion era el del farm)
const realPool = await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: "getPool", args: [token0, token1, fee] });
const slot0 = await client.readContract({ address: realPool, abi: poolAbi, functionName: "slot0" });
const currentTick = Number(slot0[1]);

// Metadatos conocidos (evitamos llamadas extra que tumban el RPC público gratis).
// En producción esto se resuelve con multicall o cache de tokens.
const sym0 = "WETH", dec0 = 18, sym1 = "cbBTC", dec1 = 8;
void erc20Abi;

// tick → precio (token1 por token0), ajustado por decimales
const tickToPrice = (t) => Math.pow(1.0001, t) * Math.pow(10, dec0 - dec1);
const priceLower = tickToPrice(Number(tickLower));
const priceUpper = tickToPrice(Number(tickUpper));
const priceNow = tickToPrice(currentTick);
const inRange = Number(tickLower) <= currentTick && currentTick < Number(tickUpper);

console.log(`\n=== PancakeSwap V3  ${sym0}/${sym1}  (fee ${Number(fee)/10000}%)  · Base · NFT #${TOKEN_ID} ===`);
console.log(`Liquidez: ${liquidity}`);
console.log(`\nRANGO (${sym1} por ${sym0}):`);
console.log(`  mínimo:  ${priceLower.toPrecision(6)}`);
console.log(`  máximo:  ${priceUpper.toPrecision(6)}`);
console.log(`  actual:  ${priceNow.toPrecision(6)}`);
console.log(`\nESTADO: ${inRange ? "✅ DENTRO de rango (generando comisiones)" : "⚠️ FUERA de rango"}`);
console.log(`  tickLower=${tickLower}  tickActual=${currentTick}  tickUpper=${tickUpper}`);
console.log(`\nFEES sin reclamar (tokensOwed, pueden estar sin actualizar si está en farm):`);
console.log(`  ${sym0}: ${Number(owed0) / 10 ** dec0}`);
console.log(`  ${sym1}: ${Number(owed1) / 10 ** dec1}`);
console.log(`\n(Nota: las recompensas del farm —CAKE— van por MasterChef, aparte de estas fees de LP.)`);
