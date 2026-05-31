import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { ensurePortfolioAccess, getViewerAccess } from "@/lib/auth/viewer-access";
import { categorizeTransactionsSequence } from "@/lib/tax/categorize";
import { getWalletProtocolMetaSync } from "@/lib/tax/wallet-classification";
import { fetchCurrentEurRate } from "@/lib/tax/eur-conversion";
import type { CategorizeInput, FiscalAnnotation, WalletKind } from "@/lib/tax/types";

/**
 * GET /api/transactions/traceability?portfolioId=xxx
 *
 * Devuelve TODAS las transacciones del portfolio enriquecidas con
 * categorización fiscal calculada en tiempo real.
 *
 * No persiste en BD. Las anotaciones son recomputables siempre.
 */

function getClient(): SupabaseClient {
  const service = getSupabaseServiceClient();
  if (service) return service;
  return getSupabaseServerClient();
}

interface TraceabilityEntry {
  id: string;
  transactionDate: string;
  type: string;
  protocol: string;
  walletKind: WalletKind | null;
  positionType: string;
  tokenInSymbol: string | null;
  tokenInAmount: number | null;
  tokenOutSymbol: string | null;
  tokenOutAmount: number | null;
  notes: string | null;
  fiscal: FiscalAnnotation;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get("portfolioId") ?? "";
    if (!portfolioId) {
      return NextResponse.json({ error: "portfolioId es obligatorio." }, { status: 400 });
    }

    const viewer = await getViewerAccess();
    const access = ensurePortfolioAccess(viewer, portfolioId);
    if (!access.ok) {
      const fail = access as { error: string; status: number };
      return NextResponse.json({ error: fail.error }, { status: fail.status });
    }

    const client = getClient();

    // Cargar todas las transacciones del portfolio
    const { data: rows, error } = await client
      .from("transactions")
      .select(
        "id, type, protocol, position_id, position_type, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount, spot_price, transaction_date, metadata, notes",
      )
      .eq("portfolio_id", portfolioId)
      .is("deleted_at", null)
      .order("transaction_date", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({
        entries: [],
        walletSummary: [],
        eurRate: null,
        meta: { total: 0 },
      });
    }

    // Tipo de cambio actual
    const eurRate = (await fetchCurrentEurRate()) ?? 0.92;

    // Adaptar a CategorizeInput
    const inputs: CategorizeInput[] = (rows as Array<{
      id: string;
      type: string | null;
      protocol: string | null;
      position_id: string | null;
      position_type: string | null;
      token_in_symbol: string | null;
      token_in_amount: number | string | null;
      token_out_symbol: string | null;
      token_out_amount: number | string | null;
      spot_price: number | string | null;
      transaction_date: string;
      metadata: Record<string, unknown> | null;
      notes: string | null;
    }>).map((row) => ({
      id: row.id,
      portfolioId,
      type: (row.type ?? "").trim(),
      protocol: (row.protocol ?? "Wallet").trim(),
      positionType: (row.position_type ?? "Hold").trim(),
      tokenInSymbol: row.token_in_symbol,
      tokenInAmount: row.token_in_amount !== null ? Number(row.token_in_amount) : null,
      tokenOutSymbol: row.token_out_symbol,
      tokenOutAmount: row.token_out_amount !== null ? Number(row.token_out_amount) : null,
      spotPriceUsd: row.spot_price !== null ? Number(row.spot_price) : 0,
      transactionDate: row.transaction_date,
      metadata: row.metadata,
    }));

    // Ejecutar categorización secuencial (construye lotes FIFO sobre la marcha)
    const { results } = categorizeTransactionsSequence(inputs, {
      fxRateUsdToEur: eurRate,
      initialLots: [],
      walletProtocolResolver: (protocol) => getWalletProtocolMetaSync(protocol),
    });

    // Construir el listado final (orden descendente para la UI)
    const entries: TraceabilityEntry[] = results
      .map((res, i) => {
        const original = inputs[res.txIndex] ?? inputs[i];
        return {
          id: original.id ?? `${original.transactionDate}-${i}`,
          transactionDate: original.transactionDate,
          type: original.type,
          protocol: original.protocol,
          walletKind: res.annotation.walletKind,
          positionType: original.positionType,
          tokenInSymbol: original.tokenInSymbol,
          tokenInAmount: original.tokenInAmount,
          tokenOutSymbol: original.tokenOutSymbol,
          tokenOutAmount: original.tokenOutAmount,
          notes: (rows[res.txIndex]?.notes as string | null) ?? null,
          fiscal: res.annotation,
        };
      })
      .sort((a, b) => Date.parse(b.transactionDate) - Date.parse(a.transactionDate));

    // Resumen por wallet (para los filtros de la UI)
    const walletCounter = new Map<string, { name: string; kind: WalletKind | null; count: number }>();
    for (const e of entries) {
      const key = `${e.protocol}::${e.walletKind ?? "other"}`;
      const cur = walletCounter.get(key);
      if (cur) cur.count += 1;
      else walletCounter.set(key, { name: e.protocol, kind: e.walletKind, count: 1 });
    }

    const walletSummary = Array.from(walletCounter.values()).sort((a, b) => b.count - a.count);

    return NextResponse.json({
      entries,
      walletSummary,
      eurRate,
      meta: { total: entries.length },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
