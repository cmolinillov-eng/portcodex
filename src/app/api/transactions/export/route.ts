import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { ensurePortfolioAccess, getViewerAccess } from "@/lib/auth/viewer-access";

type TransactionExportRow = {
  transaction_date: string | null;
  type: string | null;
  movement_origin: string;
  operation_group_id: string | null;
  protocol: string | null;
  position_id: string | null;
  position_type: string | null;
  token_in_symbol: string | null;
  token_in_amount: string | number | null;
  token_out_symbol: string | null;
  token_out_amount: string | number | null;
  spot_price: string | number | null;
  fee_amount: string | number | null;
  notes: string | null;
  metadata: unknown;
};

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function getMovementOrigin(metadata: unknown, notes: string | null): string {
  const fromMetadata = parseJsonObject(metadata);
  if (fromMetadata && fromMetadata.source === "harvest_reinvest") return "Reinversión de harvest";
  const fromNotes = parseJsonObject(notes);
  if (fromNotes && fromNotes.source === "harvest_reinvest") return "Reinversión de harvest";
  return "Operación estándar";
}

function getQueryClient(): SupabaseClient {
  const service = getSupabaseServiceClient();
  if (service) return service;
  return getSupabaseServerClient();
}

function sanitizeDate(value: string | null): string | null {
  if (!value) return null;
  const date = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return date;
}

function startOfDayIso(date: string): string {
  return `${date}T00:00:00.000Z`;
}

function endOfDayIso(date: string): string {
  return `${date}T23:59:59.999Z`;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const portfolioId = (url.searchParams.get("portfolioId") ?? "").trim();
    const startDate = sanitizeDate(url.searchParams.get("startDate"));
    const endDate = sanitizeDate(url.searchParams.get("endDate"));

    if (!portfolioId) {
      return NextResponse.json({ error: "portfolioId es obligatorio." }, { status: 400 });
    }

    const access = await getViewerAccess();
    const accessCheck = ensurePortfolioAccess(access, portfolioId, false);
    if (!accessCheck.ok) {
      return NextResponse.json({ error: accessCheck.error }, { status: accessCheck.status });
    }

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "startDate y endDate son obligatorios (YYYY-MM-DD)." }, { status: 400 });
    }

    if (startDate > endDate) {
      return NextResponse.json({ error: "La fecha inicio no puede ser mayor que la fecha fin." }, { status: 400 });
    }

    const client = getQueryClient();
    const withDeletedFilter = await client
      .from("transactions")
      .select(
        "transaction_date, type, operation_group_id, metadata, protocol, position_id, position_type, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount, spot_price, fee_amount, notes",
      )
      .eq("portfolio_id", portfolioId)
      .is("deleted_at", null)
      .gte("transaction_date", startOfDayIso(startDate))
      .lte("transaction_date", endOfDayIso(endDate))
      .order("transaction_date", { ascending: true });

    const fallbackQuery =
      withDeletedFilter.error && withDeletedFilter.error.message.toLowerCase().includes("deleted_at")
        ? await client
            .from("transactions")
            .select(
              "transaction_date, type, operation_group_id, metadata, protocol, position_id, position_type, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount, spot_price, fee_amount, notes",
            )
            .eq("portfolio_id", portfolioId)
            .gte("transaction_date", startOfDayIso(startDate))
            .lte("transaction_date", endOfDayIso(endDate))
            .order("transaction_date", { ascending: true })
        : null;

    const data = (fallbackQuery?.data ?? withDeletedFilter.data) as TransactionExportRow[] | null;
    const error = fallbackQuery?.error ?? withDeletedFilter.error;
    if (error) {
      throw new Error(error.message);
    }

    const rows = ((data ?? []) as TransactionExportRow[]).map((row) => ({
      ...row,
      movement_origin: getMovementOrigin(row.metadata, row.notes),
    }));

    return NextResponse.json({ rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado exportando transacciones.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
