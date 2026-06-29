import { enrichV3, type V3Config } from "./univ3";
import type { ZerionPosition } from "../discovery/zerion";

/** PancakeSwap V3 (mismas direcciones en todas las cadenas Pancake). */
const PANCAKE_V3: V3Config = {
  protocolMatch: "pancakeswap v3",
  protocolLabel: "PancakeSwap V3",
  npm: "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
  factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
  source: "pancakeswap-v3",
};

export function enrichPancakeV3(
  zerionPositions: ZerionPosition[],
  ctx: { portfolioId: string; address: string },
) {
  return enrichV3(PANCAKE_V3, zerionPositions, ctx);
}
