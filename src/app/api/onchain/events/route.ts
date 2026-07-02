import { NextResponse, type NextRequest } from "next/server";
import { getViewerAccess, ensurePortfolioAccess } from "@/lib/auth/viewer-access";
import { getSupabaseServiceClient, getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Harvests detectados on-chain (tabla onchain_events, rellenada por el worker).
 * GET: pendientes del portfolio.
 * PATCH: registrar uno como transacción `harvest` (cantidad/precio/fecha reales,
 * asignado a una posición manual) o descartarlo. Solo perfiles que operan.
 */

type EventToken = { symbol: string; amount: number; priceUsd: number | null; valueUsd: number | null };
type EventRow = {
  id: string;
  chain: string;
  protocol: string;
  label: string | null;
  tokens: EventToken[];
  value_usd: number | null;
  block_time: string | null;
  tx_hash: string | null;
  includes_principal: boolean;
  position_ref: string | null;
  status: string;
};

function getClient() {
  return getSupabaseServiceClient() ?? getSupabaseServerClient();
}

// LivePosition.id de la posición del evento: `${chain}:${slug}:${nftId}`.
// Permite casar el evento con position_links (Fase B).
const PROTOCOL_SLUGS: Record<string, string> = {
  "pancakeswap v3": "pancakeswap-v3",
  "uniswap v3": "uniswap-v3",
  projectx: "projectx",
  "aave v3": "aave", // position_ref = wallet → `${chain}:aave:${wallet}`
  wallet: "hold", // holds: position_ref = token address/mint → `${chain}:hold:${ref}`
  bitcoin: "hold", // position_ref = address → `bitcoin:hold:${address}`
};
function eventOnchainId(ev: { chain: string; protocol: string; position_ref: string | null }): string | null {
  const slug = PROTOCOL_SLUGS[ev.protocol.toLowerCase()];
  if (!slug || !ev.position_ref) return null;
  return `${ev.chain}:${slug}:${ev.position_ref}`;
}

type LinkInfo = { protocol: string; position_id: string; position_type: string; auto_ingest: boolean };

async function getLinks(portfolioId: string): Promise<Map<string, LinkInfo>> {
  const out = new Map<string, LinkInfo>();
  try {
    const { data } = await getClient()
      .from("position_links")
      .select("onchain_id, protocol, position_id, position_type, auto_ingest")
      .eq("portfolio_id", portfolioId);
    for (const l of data ?? []) out.set(l.onchain_id as string, l as LinkInfo);
  } catch {
    /* tabla sin crear: sin enlaces */
  }
  return out;
}

export async function GET(request: NextRequest) {
  const portfolioId = (request.nextUrl.searchParams.get("portfolioId") ?? "").trim();
  const access = await getViewerAccess();
  const check = ensurePortfolioAccess(access, portfolioId, false);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const { data, error } = await getClient()
    .from("onchain_events")
    .select("id, chain, protocol, label, tokens, value_usd, block_time, tx_hash, includes_principal, position_ref, status")
    .eq("portfolio_id", portfolioId)
    .eq("status", "pending")
    .order("block_time", { ascending: false });
  if (error) {
    // Tabla aún sin crear (migración pendiente): panel sin sección, no error.
    return NextResponse.json({ events: [] });
  }

  // Adjuntar el enlace contable si la posición está enlazada (preasignación).
  const links = await getLinks(portfolioId);
  const events = ((data ?? []) as EventRow[]).map((ev) => {
    const oid = eventOnchainId(ev as { chain: string; protocol: string; position_ref: string | null });
    const link = oid ? links.get(oid) ?? null : null;
    return { ...ev, link };
  });
  return NextResponse.json({ events });
}

export async function PATCH(request: NextRequest) {
  let body: {
    portfolioId?: string;
    eventId?: string;
    action?: "ingest" | "dismiss";
    positionId?: string;
    protocol?: string;
    positionType?: string;
    /** Crear una posición contable nueva a partir del evento (alta automática). */
    createNew?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }
  const portfolioId = (body.portfolioId ?? "").trim();
  const eventId = (body.eventId ?? "").trim();
  const action = body.action;

  const access = await getViewerAccess();
  const check = ensurePortfolioAccess(access, portfolioId, true);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });
  if (!eventId || !action) return NextResponse.json({ error: "Faltan eventId/action." }, { status: 400 });

  const client = getClient();
  const { data: ev, error: evErr } = await client
    .from("onchain_events")
    .select("id, portfolio_id, kind, chain, protocol, label, tokens, value_usd, block_time, tx_hash, status, position_ref")
    .eq("id", eventId)
    .eq("portfolio_id", portfolioId)
    .single();
  if (evErr || !ev) return NextResponse.json({ error: "Evento no encontrado." }, { status: 404 });
  if (ev.status !== "pending") return NextResponse.json({ error: "El evento ya fue procesado." }, { status: 409 });

  if (action === "dismiss") {
    const { error } = await client
      .from("onchain_events")
      .update({ status: "dismissed", ingested_at: new Date().toISOString() })
      .eq("id", eventId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // action === "ingest": crear transacciones `harvest` (una por token cobrado).
  // Si no llega posición explícita, usar el enlace de position_links (Fase B).
  let positionId = (body.positionId ?? "").trim();
  let protocol = (body.protocol ?? "").trim();
  let positionType = (body.positionType ?? "Liquidity Pool").trim();
  if (!positionId || !protocol) {
    const links = await getLinks(portfolioId);
    const oid = eventOnchainId(ev as { chain: string; protocol: string; position_ref: string | null });
    const link = oid ? links.get(oid) : undefined;
    if (link) {
      positionId = link.position_id;
      protocol = link.protocol;
      positionType = link.position_type;
    }
  }
  // Alta automática: crear la posición contable a partir del propio evento
  // (las posiciones son implícitas: nacen con su primera transacción). Así una
  // posición abierta on-chain entra en contabilidad sin ningún formulario.
  if ((!positionId || !protocol) && body.createNew === true) {
    const kindForType = (ev.kind as string) ?? "harvest";
    positionType = kindForType.startsWith("lending_")
      ? "Lending"
      : kindForType.startsWith("transfer_")
        ? "Hold"
        : "Liquidity Pool";
    protocol = ev.protocol;
    const refPart = (ev.position_ref ?? crypto.randomUUID().slice(0, 8)).toString().slice(-24);
    positionId = `${(ev.label ?? "onchain").toString().replace(/[^\w/.-]+/g, "-")}-${refPart}`;
  }
  if (!positionId || !protocol) {
    return NextResponse.json({ error: "Registrar requiere positionId y protocol (o un enlace en position_links)." }, { status: 400 });
  }

  const tokens = (ev.tokens ?? []) as EventToken[];
  const usable = tokens.filter((t) => t.amount > 0 && t.priceUsd != null);
  if (!usable.length) {
    return NextResponse.json({ error: "El evento no tiene tokens con precio; regístralo a mano." }, { status: 400 });
  }

  const timestamp = ev.block_time ?? new Date().toISOString();
  // Tipo contable según el evento detectado (Fases C1/C2):
  //   harvest → harvest (token_in), deposit → lp_deposit (token_in),
  //   withdraw → lp_withdraw (token_out); Aave: lending_supply/withdraw (colateral
  //   in/out) y lending_borrow con token_in (borrow) o token_out (repay), la
  //   misma semántica que el ajuste lending manual auditado.
  const kind = (ev.kind as string) ?? "harvest";
  const TX_TYPE: Record<string, string> = {
    harvest: "harvest",
    deposit: "lp_deposit",
    withdraw: "lp_withdraw",
    lending_supply: "lending_supply",
    lending_withdraw: "lending_withdraw",
    lending_borrow: "lending_borrow",
    lending_repay: "lending_borrow",
    transfer_in: "deposit",
    transfer_out: "withdrawal",
  };
  const txType = TX_TYPE[kind];
  if (!txType) return NextResponse.json({ error: `Tipo de evento no soportado: ${kind}.` }, { status: 400 });
  const NOTE_LABEL: Record<string, string> = {
    harvest: "Harvest",
    deposit: "Depósito",
    withdraw: "Retirada",
    lending_supply: "+Colateral",
    lending_withdraw: "-Colateral",
    lending_borrow: "+Préstamo",
    lending_repay: "-Préstamo",
    transfer_in: "Entrada",
    transfer_out: "Salida",
  };
  // token_out en retiradas de LP, retirada de colateral, repago y salidas.
  const isOut = kind === "withdraw" || kind === "lending_withdraw" || kind === "lending_repay" || kind === "transfer_out";
  // metadata.adjustType: mismo contrato que el flujo manual de lending_adjust.
  const ADJUST_TYPE: Record<string, string> = {
    lending_supply: "add_collateral",
    lending_withdraw: "remove_collateral",
    lending_borrow: "add_debt",
    lending_repay: "repay_debt",
  };
  if (kind.startsWith("lending_") && positionType === "Liquidity Pool") positionType = "Lending";
  if (kind.startsWith("transfer_") && positionType === "Liquidity Pool") positionType = "Hold";

  // Mismo grupo de operación → el botón "Deshacer" revierte la operación completa.
  const operationGroupId = crypto.randomUUID();
  const rows = usable.map((t) => ({
    portfolio_id: portfolioId,
    type: txType,
    operation_group_id: operationGroupId,
    token_in_symbol: isOut ? null : t.symbol.toUpperCase(),
    token_in_amount: isOut ? null : t.amount,
    token_out_symbol: isOut ? t.symbol.toUpperCase() : null,
    token_out_amount: isOut ? t.amount : null,
    spot_price: t.priceUsd as number,
    fee_amount: 0,
    notes: `${NOTE_LABEL[kind]} on-chain ${ev.protocol} (${ev.label ?? ""}) tx ${ev.tx_hash ?? ""}`.trim(),
    transaction_date: timestamp,
    protocol,
    position_id: positionId,
    position_type: positionType,
    metadata: {
      source: "onchain_ingest",
      eventId: ev.id,
      txHash: ev.tx_hash,
      chain: ev.chain,
      nftId: ev.position_ref,
      ...(ADJUST_TYPE[kind] ? { adjustType: ADJUST_TYPE[kind] } : {}),
    },
  }));

  const { error: txErr } = await client.from("transactions").insert(rows);
  if (txErr) return NextResponse.json({ error: `No se pudo crear la transacción: ${txErr.message}` }, { status: 500 });

  // Aprender el enlace: la próxima vez este NFT ya viene preasignado.
  const oid = eventOnchainId(ev as { chain: string; protocol: string; position_ref: string | null });
  if (oid) {
    await client
      .from("position_links")
      .upsert(
        { portfolio_id: portfolioId, onchain_id: oid, protocol, position_id: positionId, position_type: positionType },
        { onConflict: "portfolio_id,onchain_id" },
      )
      .then(() => undefined, () => undefined); // mejor esfuerzo (tabla puede no existir aún)
  }

  const { error: updErr } = await client
    .from("onchain_events")
    .update({ status: "ingested", ingested_at: new Date().toISOString() })
    .eq("id", eventId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, inserted: rows.length });
}
