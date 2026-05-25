import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { ensurePortfolioAccess, getViewerAccess } from "@/lib/auth/viewer-access";
import { validateCsrf } from "@/lib/security/csrf";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { autoClosePositionIfEmpty } from "@/lib/positions/auto-close";

type EditPositionPayload = {
  portfolioId?: string;
  protocol?: string;
  positionId?: string;
  positionType?: string;
  tokenSymbol?: string;
  amount?: number;
  entryPrice?: number;
  lpTokenSymbolB?: string;
  lpAmountB?: number;
  lpEntryPriceB?: number;
  lpRangeLower?: number;
  lpRangeUpper?: number;
  isCorrelated?: boolean;
};

function sanitize(value: string | undefined): string {
  return (value ?? "").trim();
}

function getClient(): SupabaseClient {
  const serviceClient = getSupabaseServiceClient();
  if (serviceClient) return serviceClient;
  return getSupabaseServerClient();
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

const CAPITAL_IN = new Set(["deposit", "staking_deposit", "lp_deposit", "lending_supply"]);
const CAPITAL_OUT = new Set(["withdrawal", "staking_withdrawal", "lp_withdraw", "lending_withdraw"]);

type TokenState = { balance: number; costUsd: number };

function applyTxToState(state: Map<string, TokenState>, tx: {
  type: string | null;
  token_in_symbol: string | null;
  token_in_amount: string | number | null;
  token_out_symbol: string | null;
  token_out_amount: string | number | null;
  spot_price: string | number | null;
}) {
  const txType = (tx.type ?? "").trim();
  const inSymbol = (tx.token_in_symbol ?? "").toUpperCase();
  const outSymbol = (tx.token_out_symbol ?? "").toUpperCase();
  const inAmount = toNumber(tx.token_in_amount);
  const outAmount = toNumber(tx.token_out_amount);
  const spotPrice = toNumber(tx.spot_price);

  const isIn = CAPITAL_IN.has(txType);
  const isOut = CAPITAL_OUT.has(txType);
  if (!isIn && !isOut) return;

  const symbol = isIn ? inSymbol : outSymbol;
  if (!symbol) return;

  if (!state.has(symbol)) state.set(symbol, { balance: 0, costUsd: 0 });
  const entry = state.get(symbol)!;

  if (isIn) {
    entry.balance += inAmount;
    entry.costUsd += inAmount * spotPrice;
  } else {
    if (entry.balance > 0 && outAmount > 0) {
      const fraction = Math.min(1, outAmount / entry.balance);
      entry.costUsd -= entry.costUsd * fraction;
    }
    entry.balance -= outAmount;
    if (entry.balance < 0) entry.balance = 0;
  }
}

function mapPositionTypeToTxType(positionType: string, side: "in" | "out"): string {
  const normalized = positionType.toLowerCase();
  if (normalized.includes("lending")) return side === "in" ? "lending_supply" : "lending_withdraw";
  if (normalized.includes("staking")) return side === "in" ? "staking_deposit" : "staking_withdrawal";
  if (normalized.includes("liquidity") || normalized.includes("pool")) {
    return side === "in" ? "lp_deposit" : "lp_withdraw";
  }
  return side === "in" ? "deposit" : "withdrawal";
}

export async function POST(request: NextRequest) {
  try {
    const csrfCheck = validateCsrf(request);
    if (!csrfCheck.ok) {
      return NextResponse.json({ error: csrfCheck.error }, { status: csrfCheck.status });
    }

    const payload = (await request.json()) as EditPositionPayload;
    const portfolioId = sanitize(payload.portfolioId);
    const protocol = sanitize(payload.protocol);
    const positionId = sanitize(payload.positionId);
    const positionType = sanitize(payload.positionType) || "Hold";
    const tokenSymbol = sanitize(payload.tokenSymbol).toUpperCase();
    const amount = Number(payload.amount ?? 0);
    const entryPrice = Number(payload.entryPrice ?? 0);

    if (!portfolioId || !protocol || !positionId || !tokenSymbol) {
      return NextResponse.json(
        { error: "Faltan datos obligatorios (portfolioId, protocol, positionId, tokenSymbol)." },
        { status: 400 },
      );
    }

    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: "Cantidad inválida." }, { status: 400 });
    }

    if (!Number.isFinite(entryPrice) || entryPrice < 0) {
      return NextResponse.json({ error: "Precio de entrada inválido." }, { status: 400 });
    }

    const access = await getViewerAccess();
    const accessCheck = ensurePortfolioAccess(access, portfolioId, true);
    if (!accessCheck.ok) {
      return NextResponse.json({ error: accessCheck.error }, { status: accessCheck.status });
    }

    const clientIp = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "unknown";
    const rateLimit = checkRateLimit(
      `positions-edit:${access.userId ?? "anon"}:${portfolioId}:${clientIp}`,
      { limit: 30, windowMs: 60_000 },
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiadas ediciones en poco tiempo. Inténtalo de nuevo en unos segundos." },
        { status: 429 },
      );
    }

    const client = getClient();
    const now = new Date().toISOString();

    // 1. Leer estado actual de la posición desde transactions activas.
    //    No borramos nada — el histórico se preserva. Lo que hacemos es emitir
    //    un par atómico {withdrawal del estado actual, deposit del estado deseado}
    //    por cada token relevante, marcado con reason="manual_edit".
    const existingTxs = await client
      .from("transactions")
      .select("type, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount, spot_price")
      .eq("portfolio_id", portfolioId)
      .eq("protocol", protocol)
      .eq("position_id", positionId)
      .is("deleted_at", null);

    if (existingTxs.error) {
      throw new Error(`No se pudo leer el estado actual: ${existingTxs.error.message}`);
    }

    const currentState = new Map<string, TokenState>();
    for (const tx of existingTxs.data ?? []) {
      applyTxToState(currentState, tx);
    }

    // 2. Determinar el estado deseado (1 token Hold/Staking/Lending, 2 tokens LP).
    const isLp = positionType.toLowerCase().includes("liquidity") || positionType.toLowerCase().includes("pool");
    const lpTokenB = sanitize(payload.lpTokenSymbolB).toUpperCase();
    const lpAmountB = Number(payload.lpAmountB ?? 0);
    const lpEntryPriceB = Number(payload.lpEntryPriceB ?? 0);
    const lpRangeLower = Number(payload.lpRangeLower ?? 0);
    const lpRangeUpper = Number(payload.lpRangeUpper ?? 0);

    type TargetSpec = { symbol: string; amount: number; entryPrice: number };
    const targets: TargetSpec[] = [{ symbol: tokenSymbol, amount, entryPrice }];
    if (isLp && lpTokenB) {
      targets.push({ symbol: lpTokenB, amount: lpAmountB, entryPrice: lpEntryPriceB });
    }

    // 3. Para cada token diana, comparar con estado actual y emitir filas si difiere.
    const entryPriceRatio = isLp && entryPrice > 0 && lpEntryPriceB > 0
      ? entryPrice / lpEntryPriceB
      : 0;
    const lpMetadata = isLp
      ? {
          lp: {
            tokenA: tokenSymbol,
            tokenB: lpTokenB,
            rangeLower: lpRangeLower,
            rangeUpper: lpRangeUpper,
            entryPriceRatio,
            isCorrelated: payload.isCorrelated === true,
          },
        }
      : null;

    const groupId = randomUUID();
    const rows: Array<Record<string, unknown>> = [];
    const inTxType = mapPositionTypeToTxType(positionType, "in");
    const outTxType = mapPositionTypeToTxType(positionType, "out");

    for (const target of targets) {
      const existing = currentState.get(target.symbol) ?? { balance: 0, costUsd: 0 };
      const currentAvgPrice = existing.balance > 0 ? existing.costUsd / existing.balance : 0;
      const targetCostUsd = target.amount * target.entryPrice;

      // No-op si no hay cambio significativo
      const amountUnchanged = Math.abs(existing.balance - target.amount) < 1e-9;
      const priceUnchanged = Math.abs(currentAvgPrice - target.entryPrice) < 1e-6 * Math.max(1, target.entryPrice);
      if (amountUnchanged && priceUnchanged) continue;

      const previousState = {
        balance: existing.balance,
        costUsd: existing.costUsd,
        avgPrice: currentAvgPrice,
      };
      const newState = {
        balance: target.amount,
        costUsd: targetCostUsd,
        avgPrice: target.entryPrice,
      };
      const editMetadata = {
        reason: "manual_edit",
        editedAt: now,
        editedBy: access.userId ?? null,
        previousState,
        newState,
        ...(lpMetadata ? lpMetadata : {}),
      };

      // 3a. Withdrawal de TODO el balance actual a su avgPrice histórico.
      //     Esto saca exactamente el currentCostUsd, dejando la posición vacía.
      if (existing.balance > 0) {
        rows.push({
          portfolio_id: portfolioId,
          type: outTxType,
          operation_group_id: groupId,
          token_in_symbol: null,
          token_in_amount: null,
          token_out_symbol: target.symbol,
          token_out_amount: existing.balance,
          spot_price: currentAvgPrice,
          fee_amount: 0,
          notes: `[Edit] Reset ${target.symbol} balance previo`,
          transaction_date: now,
          protocol,
          position_id: positionId,
          position_type: positionType,
          metadata: editMetadata,
        });
      }

      // 3b. Deposit del nuevo estado al nuevo entryPrice.
      if (target.amount > 0) {
        rows.push({
          portfolio_id: portfolioId,
          type: inTxType,
          operation_group_id: groupId,
          token_in_symbol: target.symbol,
          token_in_amount: target.amount,
          token_out_symbol: null,
          token_out_amount: null,
          spot_price: target.entryPrice,
          fee_amount: 0,
          notes: `[Edit] ${target.symbol} → ${target.amount} @ ${target.entryPrice}`,
          transaction_date: now,
          protocol,
          position_id: positionId,
          position_type: positionType,
          metadata: editMetadata,
        });
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, insertedRows: 0, message: "Sin cambios respecto al estado actual." });
    }

    // 4. Insertar las filas de ajuste (atómicas vía operation_group_id).
    let insertError = (await client.from("transactions").insert(rows)).error;
    if (insertError && insertError.message.toLowerCase().includes("operation_group_id")) {
      const fallbackRows = rows.map((row) => {
        const clone = { ...row };
        delete clone.operation_group_id;
        return clone;
      });
      insertError = (await client.from("transactions").insert(fallbackRows)).error;
    }

    if (insertError) {
      throw new Error(`No se pudo guardar la edición: ${insertError.message}`);
    }

    // Auto-cierre: si la edición dejó la posición vacía (todos los targets a 0),
    // emitir position_closed para capturar el realizedPnl en el dashboard.
    try {
      await autoClosePositionIfEmpty({
        client,
        portfolioId,
        protocol,
        positionId,
        positionType,
        spotPriceFor: (symbol: string) => {
          // En edit usamos el spot_price tecleado por el usuario como referencia.
          // Si no coincide con el símbolo objetivo, devolvemos 0 (no penaliza el cierre).
          const upper = symbol.toUpperCase();
          if (upper === tokenSymbol) return entryPrice;
          if (upper === lpTokenB) return lpEntryPriceB;
          return 0;
        },
      });
    } catch {
      // Auto-close no crítico
    }

    return NextResponse.json({
      ok: true,
      insertedRows: rows.length,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Edit position error:", error);
    const message = error instanceof Error ? error.message : "Error inesperado al editar la posición.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
