import { address, getProgramDerivedAddress, getAddressEncoder, getAddressDecoder } from "@solana/kit";
import { getSolanaRpc, TOKEN_PROGRAM, TOKEN_2022_PROGRAM } from "./rpc";
import type { LivePosition } from "../types";

/**
 * Adaptador Orca (whirlpools / liquidez concentrada en Solana). Lee on-chain las
 * posiciones del usuario: cada posición es un NFT ("OWP") en su wallet; del NFT
 * se deriva la cuenta de posición (rango + liquidez + whirlpool), y del pool se
 * saca el tick actual → DENTRO/FUERA de rango. Genérico para cualquier address.
 *
 * Requiere un RPC fiable (Helius); el público trunca. Token mints conocidos para
 * etiquetar el par sin llamadas extra.
 */

const WHIRLPOOL_PROGRAM = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";
const enc = getAddressEncoder();
const dec = getAddressDecoder();

const KNOWN: Record<string, { sym: string; dec: number }> = {
  So11111111111111111111111111111111111111112: { sym: "SOL", dec: 9 },
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { sym: "USDC", dec: 6 },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { sym: "USDT", dec: 6 },
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": { sym: "PYUSD", dec: 6 },
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: { sym: "JitoSOL", dec: 9 },
};
const sym = (mint: string) => KNOWN[mint]?.sym ?? `${mint.slice(0, 4)}…`;

const i32 = (b: Buffer, o: number) => b.readInt32LE(o);

async function getBuf(rpc: ReturnType<typeof getSolanaRpc>, addr: string): Promise<Buffer | null> {
  const r = await rpc.getAccountInfo(address(addr), { encoding: "base64" }).send();
  if (!r.value) return null;
  return Buffer.from((r.value.data as [string, string])[0], "base64");
}

async function ownedMints(rpc: ReturnType<typeof getSolanaRpc>, owner: string): Promise<string[]> {
  const mints: string[] = [];
  for (const program of [TOKEN_PROGRAM, TOKEN_2022_PROGRAM]) {
    try {
      const r = await rpc
        .getTokenAccountsByOwner(address(owner), { programId: address(program) }, { encoding: "jsonParsed" })
        .send();
      for (const a of r.value ?? []) {
        const info = (a.account.data as { parsed: { info: { mint: string; tokenAmount: { uiAmount: number | null } } } }).parsed.info;
        if ((info.tokenAmount.uiAmount ?? 0) > 0) mints.push(info.mint);
      }
    } catch {
      /* ignora un programa si el RPC lo bloquea */
    }
  }
  return mints;
}

export async function enrichOrca(
  ctx: { portfolioId: string; address: string },
): Promise<{ positions: LivePosition[]; warnings: string[] }> {
  const positions: LivePosition[] = [];
  const warnings: string[] = [];
  const rpc = getSolanaRpc();

  let mints: string[];
  try {
    mints = await ownedMints(rpc, ctx.address);
  } catch (e) {
    return { positions, warnings: [`Orca: no se pudieron leer token accounts: ${(e as Error).message}`.slice(0, 140)] };
  }

  for (const mint of mints) {
    try {
      // PDA de la posición = ["position", mint] bajo el programa de whirlpools.
      const [posPda] = await getProgramDerivedAddress({
        programAddress: address(WHIRLPOOL_PROGRAM),
        seeds: [Buffer.from("position"), enc.encode(address(mint))],
      });
      const pos = await getBuf(rpc, posPda);
      if (!pos || pos.length < 96) continue; // no es una posición de Orca

      // Position: disc(8) whirlpool(32)@8 positionMint(32)@40 liquidity(u128)@72 tickLower@88 tickUpper@92
      const whirlpool = dec.decode(pos.subarray(8, 40));
      const tickLower = i32(pos, 88);
      const tickUpper = i32(pos, 92);

      const wp = await getBuf(rpc, whirlpool);
      if (!wp) continue;
      // Whirlpool: tickCurrent(i32)@81 tokenMintA(32)@101 tokenMintB(32)@181
      const tickCurrent = i32(wp, 81);
      const tokenMintA = dec.decode(wp.subarray(101, 133));
      const tokenMintB = dec.decode(wp.subarray(181, 213));
      const inRange = tickLower <= tickCurrent && tickCurrent < tickUpper;

      const da = KNOWN[tokenMintA]?.dec ?? 0;
      const db = KNOWN[tokenMintB]?.dec ?? 0;
      const tickToPrice = (t: number) => Math.pow(1.0001, t) * Math.pow(10, da - db);

      positions.push({
        id: `solana:orca:${mint}`,
        portfolioId: ctx.portfolioId,
        walletAddress: ctx.address,
        chainKind: "solana",
        chain: "solana",
        protocol: "Orca",
        kind: "liquidity",
        label: `${sym(tokenMintA)}/${sym(tokenMintB)}`,
        tokens: [
          { symbol: sym(tokenMintA), address: tokenMintA, amount: 0, valueUsd: null },
          { symbol: sym(tokenMintB), address: tokenMintB, amount: 0, valueUsd: null },
        ],
        valueUsd: null, // TODO: derivar de liquidez + sqrtPrice + precios
        range: { lower: tickToPrice(tickLower), upper: tickToPrice(tickUpper), current: tickToPrice(tickCurrent), inRange },
        unclaimedUsd: null,
        meta: { positionMint: mint, whirlpool, tickLower, tickUpper, tickCurrent },
        source: "orca",
      });
    } catch {
      /* no es una posición de Orca o cuenta ilegible */
    }
  }
  return { positions, warnings };
}
