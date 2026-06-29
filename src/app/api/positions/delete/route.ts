import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { ensurePortfolioAccess, getViewerAccess } from "@/lib/auth/viewer-access";
import { validateCsrf } from "@/lib/security/csrf";
import { checkRateLimit } from "@/lib/security/rate-limit";

type DeletePositionPayload = {
  portfolioId?: string;
  protocol?: string;
  positionId?: string;
};

function sanitizeText(value: string | undefined): string {
  return (value ?? "").trim();
}

function getDeleteClient(): SupabaseClient {
  const serviceClient = getSupabaseServiceClient();
  if (serviceClient) return serviceClient;
  return getSupabaseServerClient();
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  return 0;
}

/**
 * Compute a closure snapshot from active transactions + current prices.
 * Returns null if there are no meaningful transactions to snapshot.
 */
async function computeClosureSnapshot(
  client: SupabaseClient,
  portfolioId: string,
  protocol: string,
  positionId: string,
): Promise<{
  totalDeposited: number;
  valueAtClose: number;
  realizedPnl: number;
  tokenSymbol: string;
  positionType: string;
  balances: Record<string, number>;
} | null> {
  // 1. Fetch active transactions for this position
  const { data: txRows } = await client
    .from("transactions")
    .select("type, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount, spot_price, position_type, metadata")
    .eq("portfolio_id", portfolioId)
    .eq("protocol", protocol)
    .eq("position_id", positionId)
    .is("deleted_at", null);

  if (!txRows || txRows.length === 0) return null;

  const capitalInTypes = new Set(["deposit", "staking_deposit", "lp_deposit", "lending_supply"]);
  const capitalOutTypes = new Set(["withdrawal", "staking_withdrawal", "lp_withdraw", "lending_withdraw"]);

  let totalDeposited = 0;
  const balances: Record<string, number> = {};
  const tokenSet = new Set<string>();
  let positionType = "Hold";

  for (const tx of txRows) {
    const txType = (tx.type ?? "").trim();
    if (txType === "position_closed") continue;
    const inAmount = toNumber(tx.token_in_amount);
    const outAmount = toNumber(tx.token_out_amount);
    const inSymbol = ((tx.token_in_symbol ?? "") as string).toUpperCase();
    const outSymbol = ((tx.token_out_symbol ?? "") as string).toUpperCase();
    const spotPrice = toNumber(tx.spot_price);
    positionType = (tx.position_type as string) ?? positionType;

    if (capitalInTypes.has(txType)) {
      totalDeposited += inAmount * spotPrice;
      if (inSymbol) {
        balances[inSymbol] = (balances[inSymbol] ?? 0) + inAmount;
        tokenSet.add(inSymbol);
      }
    } else if (capitalOutTypes.has(txType)) {
      totalDeposited -= outAmount * spotPrice;
      if (outSymbol) {
        balances[outSymbol] = (balances[outSymbol] ?? 0) - outAmount;
      }
    }
  }

  // 2. Get current prices for the tokens in this position
  const symbols = Object.keys(balances).filter((s) => (balances[s] ?? 0) > 0);
  if (symbols.length === 0) return null;

  // La tabla cached_prices usa las columnas token_symbol/price (uppercase),
  // igual que el dashboard y la captura de snapshots. Antes se consultaba
  // symbol/price_usd en minúsculas: columnas inexistentes → la query fallaba,
  // priceMap quedaba vacío y valueAtClose=0, lo que registraba un realizedPnl
  // = -totalDeposited (pérdida total del cost basis) al borrar una posición.
  const { data: priceRows } = await client
    .from("cached_prices")
    .select("token_symbol, price")
    .in("token_symbol", symbols.map((s) => s.toUpperCase()));

  const priceMap = new Map<string, number>();
  for (const row of priceRows ?? []) {
    priceMap.set(((row.token_symbol ?? "") as string).toUpperCase(), toNumber(row.price));
  }

  // 3. Calculate value at close
  let valueAtClose = 0;
  for (const [symbol, balance] of Object.entries(balances)) {
    const positiveBalance = Math.max(0, balance);
    const price = priceMap.get(symbol) ?? 0;
    valueAtClose += positiveBalance * price;
  }

  const realizedPnl = valueAtClose - totalDeposited;
  const tokenSymbol = symbols.join("/");

  return { totalDeposited, valueAtClose, realizedPnl, tokenSymbol, positionType, balances };
}

export async function POST(request: NextRequest) {
  try {
    const csrfCheck = validateCsrf(request);
    if (!csrfCheck.ok) {
      return NextResponse.json({ error: csrfCheck.error }, { status: csrfCheck.status });
    }

    const payload = (await request.json()) as DeletePositionPayload;
    const portfolioId = sanitizeText(payload.portfolioId);
    const protocol = sanitizeText(payload.protocol);
    const positionId = sanitizeText(payload.positionId);

    if (!portfolioId || !protocol || !positionId) {
      return NextResponse.json(
        { error: "Faltan datos para eliminar la posición (portfolioId, protocol, positionId)." },
        { status: 400 },
      );
    }

    const access = await getViewerAccess();
    const accessCheck = ensurePortfolioAccess(access, portfolioId, true);
    if (!accessCheck.ok) {
      return NextResponse.json({ error: accessCheck.error }, { status: accessCheck.status });
    }

    const clientIp = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "unknown";
    const rateLimit = checkRateLimit(
      `positions-delete:${access.userId ?? "anon"}:${portfolioId}:${clientIp}`,
      { limit: 20, windowMs: 60_000 },
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiadas eliminaciones en poco tiempo. Inténtalo de nuevo en unos segundos." },
        { status: 429 },
      );
    }

    const client = getDeleteClient();
    const now = new Date().toISOString();

    // 1. Compute closure snapshot BEFORE soft-deleting
    const snapshot = await computeClosureSnapshot(client, portfolioId, protocol, positionId);

    // 2. Soft-delete all active transactions for this position
    const softDeleteAttempt = await client
      .from("transactions")
      .update({ deleted_at: now })
      .eq("portfolio_id", portfolioId)
      .eq("protocol", protocol)
      .eq("position_id", positionId)
      .is("deleted_at", null)
      .select("id");

    if (softDeleteAttempt.error) {
      throw new Error(softDeleteAttempt.error.message);
    }

    // 3. Insert closure snapshot row (type: "position_closed")
    if (snapshot) {
      const snapshotRow = {
        portfolio_id: portfolioId,
        type: "position_closed",
        token_in_symbol: snapshot.tokenSymbol || "CLOSED",
        // La tabla transactions tiene CHECK token_in_amount > 0 y spot_price > 0
        // (transactions_token_in_amount_positive_chk / _spot_price_positive_chk).
        // El snapshot es un marcador: las cifras reales viven en metadata.closure
        // y ninguna lógica contable lee estos dos campos para position_closed
        // (el dashboard solo suma metadata.closure.realizedPnl). Usamos 1/1 como
        // sentinela positiva para satisfacer los constraints. Antes eran 0/0, lo
        // que hacía fallar SIEMPRE el insert → el cierre nunca se guardaba y el
        // P&L realizado de la posición borrada desaparecía del portfolio.
        token_in_amount: 1,
        token_out_symbol: null,
        token_out_amount: null,
        spot_price: 1,
        fee_amount: 0,
        notes: `Posición cerrada — eliminada`,
        transaction_date: now,
        protocol,
        position_id: positionId,
        position_type: snapshot.positionType,
        metadata: {
          closure: {
            totalDeposited: snapshot.totalDeposited,
            valueAtClose: snapshot.valueAtClose,
            realizedPnl: snapshot.realizedPnl,
            reason: "deleted" as const,
            closedAt: now,
            balances: snapshot.balances,
          },
        },
      };

      const { error: snapshotError } = await client.from("transactions").insert(snapshotRow);
      if (snapshotError && process.env.NODE_ENV !== "production") {
        // No usamos un fallback type="withdrawal": el dashboard solo cuenta el
        // P&L realizado de filas position_closed, así que un withdrawal perdería
        // el cierre igualmente. Si esto falla, lo registramos para diagnóstico.
        console.error("Closure snapshot insert failed:", snapshotError.message);
      }
    }

    return NextResponse.json({
      ok: true,
      mode: "soft_delete",
      canUndo: true,
      deletedRows: (softDeleteAttempt.data ?? []).length,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Delete position error:", error);
    return NextResponse.json({ error: "Error inesperado al eliminar la posición." }, { status: 400 });
  }
}
