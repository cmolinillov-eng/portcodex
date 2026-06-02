import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { ensurePortfolioAccess, getViewerAccess } from "@/lib/auth/viewer-access";
import { validateCsrf } from "@/lib/security/csrf";
import { categorizeTransactionsSequence } from "@/lib/tax/categorize";
import { getWalletProtocolMetaSync } from "@/lib/tax/wallet-classification";
import { fetchCurrentEurRate, getTaxYear } from "@/lib/tax/eur-conversion";
import type { CategorizeInput, TaxLot } from "@/lib/tax/types";

/**
 * POST /api/transactions/traceability/backfill
 *
 * Body: { portfolioId: string }
 *
 * Reprocesa TODAS las transacciones del portfolio en orden cronológico:
 *   1. Borra tax_lots / tax_events / fiscal_* existentes del portfolio
 *   2. Reconstruye los lotes FIFO desde cero
 *   3. Persiste anotaciones en transactions.fiscal_*
 *   4. Crea filas en tax_lots con los lotes resultantes (estado final)
 *   5. Crea filas en tax_events con los eventos tributables
 *   6. Idempotente — puedes ejecutarlo varias veces sin duplicar
 *
 * Si las tablas tax_lots/tax_events no existen (phase21 no aplicada),
 * devuelve 503 con un hint.
 */

interface Payload {
  portfolioId?: string;
}

function getClient(): SupabaseClient {
  const serviceClient = getSupabaseServiceClient();
  if (serviceClient) return serviceClient;
  return getSupabaseServerClient();
}

function isMissingTableError(message: string | null | undefined): boolean {
  if (!message) return false;
  return (
    /tax_lots|tax_events|wallet_protocols|fiscal_/i.test(message) &&
    /does not exist|column .* does not exist|relation .* does not exist/i.test(message)
  );
}

export async function POST(request: NextRequest) {
  try {
    const csrfCheck = validateCsrf(request);
    if (!csrfCheck.ok) {
      return NextResponse.json({ error: csrfCheck.error }, { status: csrfCheck.status });
    }

    const payload = (await request.json()) as Payload;
    const portfolioId = (payload.portfolioId ?? "").trim();
    if (!portfolioId) {
      return NextResponse.json({ error: "portfolioId es obligatorio." }, { status: 400 });
    }

    const viewer = await getViewerAccess();
    const access = ensurePortfolioAccess(viewer, portfolioId, true /* requireOperate */);
    if (!access.ok) {
      const fail = access as { error: string; status: number };
      return NextResponse.json({ error: fail.error }, { status: fail.status });
    }

    const client = getClient();

    // 1. Cargar todas las transacciones del portfolio
    const { data: rows, error: readError } = await client
      .from("transactions")
      .select(
        "id, type, protocol, position_id, position_type, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount, spot_price, transaction_date, metadata",
      )
      .eq("portfolio_id", portfolioId)
      .is("deleted_at", null)
      .order("transaction_date", { ascending: true });

    if (readError) {
      return NextResponse.json({ error: `read transactions: ${readError.message}` }, { status: 500 });
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({
        ok: true,
        stats: { transactions: 0, lots: 0, events: 0 },
        message: "Portfolio sin transacciones — nada que backfillar.",
      });
    }

    // 2. Tipo de cambio actual
    const eurRate = (await fetchCurrentEurRate()) ?? 0.92;

    // 3. Limpiar estado fiscal anterior (idempotencia)
    const cleanupErrors: string[] = [];
    const delLots = await client.from("tax_lots").delete().eq("portfolio_id", portfolioId);
    if (delLots.error) {
      if (isMissingTableError(delLots.error.message)) {
        return NextResponse.json(
          {
            error:
              "Las tablas tax_lots / tax_events aún no existen. Aplica supabase/sql/phase21_tax_module.sql en Supabase antes de continuar.",
            hint: "phase21_tax_module.sql",
          },
          { status: 503 },
        );
      }
      cleanupErrors.push(`tax_lots delete: ${delLots.error.message}`);
    }
    const delEvents = await client.from("tax_events").delete().eq("portfolio_id", portfolioId);
    if (delEvents.error) cleanupErrors.push(`tax_events delete: ${delEvents.error.message}`);

    // 4. Adaptar transacciones a CategorizeInput
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

    // 5. Ejecutar motor de categorización en secuencia
    const { results, finalLots } = categorizeTransactionsSequence(inputs, {
      fxRateUsdToEur: eurRate,
      initialLots: [],
      walletProtocolResolver: (protocol) => getWalletProtocolMetaSync(protocol),
    });

    // 6. Insertar tax_lots
    // Mantenemos solo los lotes finales (incluidos los exhausted para trazabilidad).
    // Mapa synthetic_id → row para post-insertar el id real en lots_consumed.
    const now = new Date().toISOString();
    const lotRows = finalLots.map((lot) => ({
      portfolio_id: portfolioId,
      token_symbol: lot.tokenSymbol,
      amount: lot.amount,
      cost_basis_eur: lot.costBasisEur,
      original_amount: lot.originalAmount,
      original_cost_basis_eur: lot.originalCostBasisEur,
      acquired_at: lot.acquiredAt,
      acquired_via_transaction_id: lot.acquiredViaTransactionId,
      acquired_via_event: lot.acquiredViaEvent,
      exhausted_at: lot.exhaustedAt,
    }));

    let insertedLotsCount = 0;
    const syntheticToRealLotId = new Map<string, string>();
    if (lotRows.length > 0) {
      // Insertamos en bloques para no exceder el límite de payload de Supabase
      const CHUNK = 500;
      for (let i = 0; i < lotRows.length; i += CHUNK) {
        const chunk = lotRows.slice(i, i + CHUNK);
        const { data: inserted, error: insertError } = await client
          .from("tax_lots")
          .insert(chunk)
          .select("id");
        if (insertError) {
          if (isMissingTableError(insertError.message)) {
            return NextResponse.json(
              {
                error: "Tabla tax_lots no existe. Aplica phase21_tax_module.sql.",
              },
              { status: 503 },
            );
          }
          return NextResponse.json(
            { error: `insert tax_lots: ${insertError.message}` },
            { status: 500 },
          );
        }
        if (inserted) {
          inserted.forEach((row, idx) => {
            const lot = finalLots[i + idx];
            if (lot && (row as { id: string }).id) {
              syntheticToRealLotId.set(lot.id, (row as { id: string }).id);
            }
          });
        }
        insertedLotsCount += chunk.length;
      }
    }

    // 7. Construir y persistir tax_events (con lots_consumed re-mapeados a IDs reales)
    const eventRows: Array<Record<string, unknown>> = [];
    for (const res of results) {
      for (const ev of res.taxEvents) {
        const remappedLotsConsumed = ev.lotsConsumed
          ? ev.lotsConsumed.map((lc) => ({
              lot_id: syntheticToRealLotId.get(lc.lotId) ?? lc.lotId,
              amount_consumed: lc.amountConsumed,
              cost_basis_consumed_eur: lc.costBasisConsumedEur,
              acquired_at: lc.acquiredAt,
            }))
          : null;
        eventRows.push({
          portfolio_id: portfolioId,
          transaction_id: ev.transactionId,
          event_type: ev.eventType,
          event_date: ev.eventDate,
          tax_year: getTaxYear(ev.eventDate),
          proceeds_eur: ev.proceedsEur,
          cost_basis_eur: ev.costBasisEur,
          realized_gain_eur: ev.realizedGainEur,
          income_type: ev.incomeType,
          token_symbol: ev.tokenSymbol,
          token_amount: ev.tokenAmount,
          lots_consumed: remappedLotsConsumed,
          notes: ev.notes,
        });
      }
    }

    let insertedEventsCount = 0;
    if (eventRows.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < eventRows.length; i += CHUNK) {
        const chunk = eventRows.slice(i, i + CHUNK);
        const { error: insertError } = await client.from("tax_events").insert(chunk);
        if (insertError) {
          if (isMissingTableError(insertError.message)) {
            return NextResponse.json(
              { error: "Tabla tax_events no existe. Aplica phase21_tax_module.sql." },
              { status: 503 },
            );
          }
          return NextResponse.json(
            { error: `insert tax_events: ${insertError.message}` },
            { status: 500 },
          );
        }
        insertedEventsCount += chunk.length;
      }
    }

    // 8. Actualizar columnas fiscal_* en transactions
    // Hacemos updates individuales (Postgres no permite bulk update con
    // valores distintos por fila desde un cliente JS sencillo).
    let updatedTxCount = 0;
    const updateErrors: string[] = [];
    for (const res of results) {
      const original = inputs[res.txIndex];
      if (!original.id) continue;
      const { annotation } = res;
      const { error: updateError } = await client
        .from("transactions")
        .update({
          fiscal_category: annotation.category,
          fiscal_income_type: annotation.incomeType,
          fiscal_value_eur: annotation.valueEur || null,
          fiscal_cost_basis_eur: annotation.costBasisEur || null,
          fiscal_realized_gain_eur: annotation.realizedGainEur || null,
          fiscal_notes: annotation.notes,
          fiscal_processed_at: now,
          fiscal_inferred: annotation.inferred,
          fiscal_wallet_kind: annotation.walletKind,
        })
        .eq("id", original.id);
      if (updateError) {
        if (isMissingTableError(updateError.message)) {
          return NextResponse.json(
            { error: "Columnas fiscal_* no existen. Aplica phase21_tax_module.sql." },
            { status: 503 },
          );
        }
        updateErrors.push(updateError.message);
        continue;
      }
      updatedTxCount += 1;
    }

    return NextResponse.json({
      ok: true,
      stats: {
        transactions: updatedTxCount,
        totalTransactions: inputs.length,
        lots: insertedLotsCount,
        events: insertedEventsCount,
      },
      cleanupWarnings: cleanupErrors.length > 0 ? cleanupErrors : undefined,
      updateErrors: updateErrors.length > 0 ? updateErrors.slice(0, 5) : undefined,
      eurRate,
      processedAt: now,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Suppress unused warning for TaxLot (used implicitly via categorize)
export type _UsedTaxLot = TaxLot;
