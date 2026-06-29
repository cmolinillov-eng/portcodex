import { enrichV3, type V3Config } from "./univ3";
import type { ZerionPosition } from "../discovery/zerion";

/** Uniswap V3 (direcciones canónicas, deterministas en todas las cadenas). */
const UNISWAP_V3: V3Config = {
  protocolMatch: "uniswap v3",
  protocolLabel: "Uniswap V3",
  npm: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  source: "uniswap-v3",
};

export function enrichUniswapV3(
  zerionPositions: ZerionPosition[],
  ctx: { portfolioId: string; address: string },
) {
  return enrichV3(UNISWAP_V3, zerionPositions, ctx);
}
