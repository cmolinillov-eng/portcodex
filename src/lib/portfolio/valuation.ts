/**
 * MOTOR DE VALORACIÓN CANÓNICO (FASE 1 — fuente de verdad única).
 *
 * Función PURA que, a partir de las transacciones activas + precios, calcula
 * los totales del portfolio: valor de mercado, depositado (cost basis),
 * harvest pendiente, deuda y composición. Es la ÚNICA definición de "cuánto
 * vale el portfolio": la usan el snapshot de la curva (capture.ts), la
 * cabecera del dashboard y el informe. Antes cada uno lo calculaba por su
 * cuenta y divergían.
 *
 * Reglas (idénticas a las que tenía get-dashboard-data, ahora centralizadas):
 *  - Balance por (protocolo, posición, símbolo) desde las tx de capital.
 *  - Movimientos internos (harvest_reinvest, rebalance_transfer,
 *    rebalance_harvest_out) NO cuentan como capital depositado.
 *  - lending_borrow: pedir prestado extrae capital (resta depositado) y crea
 *    deuda; repagar lo restituye. El valor neto resta la deuda a precio actual.
 *  - Harvest pendiente = harvest cobrado − reinvertido (incl. permuta de
 *    swapLegs), neteado por símbolo a precio actual, ≥ 0. Los harvests con
 *    posición nula (históricos informativos) NO cuentan como pendiente.
 *  - El valor total del portfolio = Σ valor posiciones − deuda + pendiente.
 *
 * No toca BD ni hace I/O.
 */

export type ValuationTx = {
  type: string | null;
  token_in_symbol: string | null;
  token_in_amount: number | string | null;
  token_out_symbol: string | null;
  token_out_amount: number | string | null;
  spot_price: number | string | null;
  position_id: string | null;
  position_type: string | null;
  protocol: string | null;
  metadata: unknown;
  notes?: string | null;
};

export type PositionValue = {
  key: string; // protocol::positionId
  protocol: string;
  positionId: string;
  positionType: string;
  bucket: PortfolioBucket;
  tokens: Array<{ symbol: string; balance: number; valueUsd: number }>;
  valueUsd: number; // Σ tokens (colateral); la deuda se resta en el total global
};

export type PortfolioBucket = "Hold" | "Staking" | "Liquidity Pool" | "Lending";

export type PortfolioValuation = {
  totalValueUsd: number; // Σ valor posiciones − deuda + harvest pendiente
  totalDepositedUsd: number; // cost basis acumulado (sin movimientos internos)
  pendingHarvestUsd: number; // harvest cobrado no reinvertido (≥ 0)
  debtUsd: number; // deuda viva de lending a precio actual
  composition: Record<PortfolioBucket, number>;
  byPosition: PositionValue[];
  depositedByPosition: Map<string, number>; // key protocol::positionId → USD
};

const CAPITAL_IN = new Set(["deposit", "staking_deposit", "lp_deposit", "lending_supply"]);
const CAPITAL_OUT = new Set(["withdrawal", "staking_withdrawal", "lp_withdraw", "lending_withdraw"]);
const INTERNAL_SOURCES = new Set(["harvest_reinvest", "rebalance_transfer", "rebalance_harvest_out"]);

function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function asObject(v: unknown): Record<string, unknown> | null {
  if (!v) return null;
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function flag(meta: unknown, notes: string | null | undefined, key: string): string | null {
  const m = asObject(meta);
  if (m && typeof m[key] === "string") return m[key] as string;
  const n = asObject(notes ?? null);
  if (n && typeof n[key] === "string") return n[key] as string;
  return null;
}

function bucketOf(positionType: string): PortfolioBucket {
  const t = positionType.toLowerCase();
  if (t.includes("lending")) return "Lending";
  if (t.includes("staking")) return "Staking";
  if (t.includes("liquidity") || t.includes("pool") || t.includes("lp")) return "Liquidity Pool";
  return "Hold";
}

/** Clave estable de posición: protocolo + positionId (nunca solo positionId,
 *  que colisionaría entre protocolos). */
export function positionKey(protocol: string | null, positionId: string | null): string {
  return `${(protocol ?? "Wallet").trim()}::${positionId ?? ""}`;
}

export function computePortfolioValuation(
  txs: ValuationTx[],
  priceOf: (symbol: string) => number,
): PortfolioValuation {
  // Balance por (posición, símbolo) y tipo de bucket por posición.
  const balByPosSym = new Map<string, { symbol: string; balance: number }>();
  const bucketByPos = new Map<string, { protocol: string; positionId: string; positionType: string }>();
  const debtByToken = new Map<string, number>();
  const depositedByPosition = new Map<string, number>();
  const pendingByPosSym = new Map<string, number>(); // key posKey::symbol → cantidad

  let totalDepositedUsd = 0;

  for (const tx of txs) {
    const type = (tx.type ?? "").trim();
    if (!type) continue;
    const inSym = (tx.token_in_symbol ?? "").toUpperCase();
    const outSym = (tx.token_out_symbol ?? "").toUpperCase();
    const inAmt = toNum(tx.token_in_amount);
    const outAmt = toNum(tx.token_out_amount);
    const spot = toNum(tx.spot_price);
    const posKey = positionKey(tx.protocol, tx.position_id);
    const positionId = tx.position_id ?? "";
    const positionType = (tx.position_type ?? "Hold").trim();
    if (positionId) {
      bucketByPos.set(posKey, { protocol: (tx.protocol ?? "Wallet").trim(), positionId, positionType });
    }

    const source = flag(tx.metadata, tx.notes, "source");
    const reason = flag(tx.metadata, tx.notes, "reason");
    const isInternal = INTERNAL_SOURCES.has(source ?? "") || INTERNAL_SOURCES.has(reason ?? "");

    if (type === "harvest") {
      if (positionId && inSym) {
        const k = `${posKey}::${inSym}`;
        pendingByPosSym.set(k, (pendingByPosSym.get(k) ?? 0) + inAmt);
      }
      continue;
    }

    if (type === "lending_borrow") {
      const net = (outAmt - inAmt) * spot; // <0 al pedir, >0 al repagar
      totalDepositedUsd += net;
      depositedByPosition.set(posKey, (depositedByPosition.get(posKey) ?? 0) + net);
      if (inSym && inAmt > 0) debtByToken.set(inSym, (debtByToken.get(inSym) ?? 0) + inAmt);
      if (outSym && outAmt > 0) debtByToken.set(outSym, (debtByToken.get(outSym) ?? 0) - outAmt);
      continue;
    }

    if (CAPITAL_IN.has(type)) {
      if (positionId && inSym) {
        const k = `${posKey}::${inSym}`;
        const cur = balByPosSym.get(k) ?? { symbol: inSym, balance: 0 };
        cur.balance += inAmt;
        balByPosSym.set(k, cur);
      }
      if (!isInternal) {
        totalDepositedUsd += inAmt * spot;
        depositedByPosition.set(posKey, (depositedByPosition.get(posKey) ?? 0) + inAmt * spot);
      }
      // Reinversión de harvest: descuenta del pending del ORIGEN.
      if (source === "harvest_reinvest" && inSym && inAmt > 0) {
        const srcPos = flag(tx.metadata, tx.notes, "sourcePositionId") ?? positionId;
        const srcProto = flag(tx.metadata, tx.notes, "sourceProtocol") ?? tx.protocol;
        const srcKey = positionKey(srcProto, srcPos);
        const k = `${srcKey}::${inSym}`;
        pendingByPosSym.set(k, (pendingByPosSym.get(k) ?? 0) - inAmt);
        // Permuta implícita: lo vendido sale del pending, lo comprado entra.
        const legs = asObject(tx.metadata)?.swapLegs;
        if (Array.isArray(legs)) {
          for (const raw of legs) {
            const leg = asObject(raw) ?? {};
            const sold = typeof leg.soldSymbol === "string" ? leg.soldSymbol.toUpperCase() : "";
            const bought = typeof leg.boughtSymbol === "string" ? leg.boughtSymbol.toUpperCase() : "";
            const soldAmt = toNum(leg.soldAmount);
            const boughtAmt = toNum(leg.boughtAmount);
            if (!sold || !bought || soldAmt <= 0 || boughtAmt <= 0) continue;
            pendingByPosSym.set(`${srcKey}::${sold}`, (pendingByPosSym.get(`${srcKey}::${sold}`) ?? 0) - soldAmt);
            pendingByPosSym.set(`${srcKey}::${bought}`, (pendingByPosSym.get(`${srcKey}::${bought}`) ?? 0) + boughtAmt);
          }
        }
      }
      // Rebalance: hereda cost basis del origen (depositedDelta) sin tocar total.
      if (source === "rebalance_transfer" && positionId) {
        const dd = toNum(asObject(tx.metadata)?.depositedDelta);
        if (dd !== 0) depositedByPosition.set(posKey, (depositedByPosition.get(posKey) ?? 0) + dd);
      }
      continue;
    }

    if (CAPITAL_OUT.has(type)) {
      if (positionId && outSym) {
        const k = `${posKey}::${outSym}`;
        const cur = balByPosSym.get(k) ?? { symbol: outSym, balance: 0 };
        cur.balance -= outAmt;
        balByPosSym.set(k, cur);
      }
      if (!isInternal) {
        totalDepositedUsd -= outAmt * spot;
        depositedByPosition.set(posKey, (depositedByPosition.get(posKey) ?? 0) - outAmt * spot);
      }
      if (source === "rebalance_transfer" && positionId) {
        const dd = toNum(asObject(tx.metadata)?.depositedDelta);
        if (dd !== 0) depositedByPosition.set(posKey, (depositedByPosition.get(posKey) ?? 0) + dd);
      }
      // Harvest arrastrado al destino de un rebalance: sale del pending del origen.
      if ((source === "rebalance_harvest_out" || reason === "rebalance_harvest_out") && positionId && outSym && outAmt > 0) {
        const k = `${posKey}::${outSym}`;
        pendingByPosSym.set(k, (pendingByPosSym.get(k) ?? 0) - outAmt);
      }
      continue;
    }
  }

  // Valor por posición y composición.
  const byPosMap = new Map<string, PositionValue>();
  const composition: Record<PortfolioBucket, number> = { Hold: 0, Staking: 0, "Liquidity Pool": 0, Lending: 0 };
  for (const [k, { symbol, balance }] of balByPosSym) {
    if (balance <= 0) continue;
    const posKey = k.slice(0, k.lastIndexOf("::"));
    const meta = bucketByPos.get(posKey);
    const value = balance * priceOf(symbol);
    if (value <= 0) continue;
    const bucket = bucketOf(meta?.positionType ?? "Hold");
    let pos = byPosMap.get(posKey);
    if (!pos) {
      pos = {
        key: posKey,
        protocol: meta?.protocol ?? "Wallet",
        positionId: meta?.positionId ?? "",
        positionType: meta?.positionType ?? "Hold",
        bucket,
        tokens: [],
        valueUsd: 0,
      };
      byPosMap.set(posKey, pos);
    }
    pos.tokens.push({ symbol, balance, valueUsd: value });
    pos.valueUsd += value;
    composition[bucket] += value;
  }

  // Deuda de lending: resta al valor neto y al bucket Lending.
  let debtUsd = 0;
  for (const [symbol, amount] of debtByToken) {
    if (amount <= 0) continue;
    const dv = amount * priceOf(symbol);
    if (dv <= 0) continue;
    debtUsd += dv;
    composition.Lending -= dv;
  }

  // Harvest pendiente neto por símbolo (≥ 0). Los pendientes de posición nula
  // no entran (los harvests históricos informativos van con posición nula).
  const pendingBySymbol = new Map<string, number>();
  for (const [k, amount] of pendingByPosSym) {
    const symbol = k.slice(k.lastIndexOf("::") + 2);
    pendingBySymbol.set(symbol, (pendingBySymbol.get(symbol) ?? 0) + amount);
  }
  let pendingHarvestUsd = 0;
  for (const [symbol, amount] of pendingBySymbol) {
    if (amount <= 0) continue;
    pendingHarvestUsd += amount * priceOf(symbol);
  }

  const byPosition = [...byPosMap.values()].sort((a, b) => b.valueUsd - a.valueUsd);
  const positionsValue = byPosition.reduce((s, p) => s + p.valueUsd, 0);
  const totalValueUsd = positionsValue - debtUsd + pendingHarvestUsd;

  return {
    totalValueUsd,
    totalDepositedUsd,
    pendingHarvestUsd,
    debtUsd,
    composition,
    byPosition,
    depositedByPosition,
  };
}
