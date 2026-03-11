import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { ensurePortfolioAccess, getViewerAccess } from "@/lib/auth/viewer-access";
import { validateCsrf } from "@/lib/security/csrf";
import { checkRateLimit } from "@/lib/security/rate-limit";

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
};

function sanitize(value: string | undefined): string {
  return (value ?? "").trim();
}

function getClient(): SupabaseClient {
  const serviceClient = getSupabaseServiceClient();
  if (serviceClient) return serviceClient;
  return getSupabaseServerClient();
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

    // 1. Soft-delete all existing transactions for this position
    const softDelete = await client
      .from("transactions")
      .update({ deleted_at: now })
      .eq("portfolio_id", portfolioId)
      .eq("protocol", protocol)
      .eq("position_id", positionId)
      .is("deleted_at", null)
      .select("id");

    if (softDelete.error) {
      throw new Error(`No se pudieron archivar las transacciones anteriores: ${softDelete.error.message}`);
    }

    // 2. Build new transaction(s)
    const isLp = positionType.toLowerCase().includes("liquidity") || positionType.toLowerCase().includes("pool");
    const lpTokenB = sanitize(payload.lpTokenSymbolB).toUpperCase();
    const lpAmountB = Number(payload.lpAmountB ?? 0);
    const lpEntryPriceB = Number(payload.lpEntryPriceB ?? 0);
    const lpRangeLower = Number(payload.lpRangeLower ?? 0);
    const lpRangeUpper = Number(payload.lpRangeUpper ?? 0);

    const groupId = randomUUID();
    const rows: Array<Record<string, unknown>> = [];

    if (isLp && lpTokenB) {
      // LP position: two rows (one per token)
      const entryPriceRatio = lpEntryPriceB > 0 && entryPrice > 0
        ? entryPrice / lpEntryPriceB
        : 0;

      const metadata = {
        lp: {
          tokenA: tokenSymbol,
          tokenB: lpTokenB,
          rangeLower: lpRangeLower,
          rangeUpper: lpRangeUpper,
          entryPriceRatio,
        },
      };

      rows.push({
        portfolio_id: portfolioId,
        type: "lp_deposit",
        operation_group_id: groupId,
        token_in_symbol: tokenSymbol,
        token_in_amount: amount,
        token_out_symbol: null,
        token_out_amount: null,
        spot_price: entryPrice,
        fee_amount: 0,
        notes: `[Editado] ${tokenSymbol}/${lpTokenB}`,
        transaction_date: now,
        protocol,
        position_id: positionId,
        position_type: "Liquidity Pool",
        metadata,
      });

      rows.push({
        portfolio_id: portfolioId,
        type: "lp_deposit",
        operation_group_id: groupId,
        token_in_symbol: lpTokenB,
        token_in_amount: lpAmountB,
        token_out_symbol: null,
        token_out_amount: null,
        spot_price: lpEntryPriceB,
        fee_amount: 0,
        notes: `[Editado] ${tokenSymbol}/${lpTokenB}`,
        transaction_date: now,
        protocol,
        position_id: positionId,
        position_type: "Liquidity Pool",
        metadata,
      });
    } else {
      // Simple position: one row
      const isLending = positionType.toLowerCase().includes("lending");
      const isStaking = positionType.toLowerCase().includes("staking");
      let type: string = "deposit";
      if (isLending) type = "lending_supply";
      else if (isStaking) type = "staking_deposit";

      rows.push({
        portfolio_id: portfolioId,
        type,
        operation_group_id: groupId,
        token_in_symbol: tokenSymbol,
        token_in_amount: amount,
        token_out_symbol: null,
        token_out_amount: null,
        spot_price: entryPrice,
        fee_amount: 0,
        notes: `[Editado] ${tokenSymbol}`,
        transaction_date: now,
        protocol,
        position_id: positionId,
        position_type: positionType,
        metadata: null,
      });
    }

    // 3. Insert new transaction(s)
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
      throw new Error(`No se pudo guardar la posición editada: ${insertError.message}`);
    }

    return NextResponse.json({
      ok: true,
      archivedRows: (softDelete.data ?? []).length,
      insertedRows: rows.length,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Edit position error:", error);
    const message = error instanceof Error ? error.message : "Error inesperado al editar la posición.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
