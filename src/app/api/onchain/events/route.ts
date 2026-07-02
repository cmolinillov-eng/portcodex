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

type LinkInfo = { protocol: string; position_id: string; position_type: string; auto_ingest: boolean; created_at?: string };

async function getLinks(portfolioId: string): Promise<Map<string, LinkInfo>> {
  const out = new Map<string, LinkInfo>();
  try {
    const { data } = await getClient()
      .from("position_links")
      .select("onchain_id, protocol, position_id, position_type, auto_ingest, created_at")
      .eq("portfolio_id", portfolioId);
    for (const l of data ?? []) out.set(l.onchain_id as string, l as LinkInfo);
  } catch {
    /* tabla sin crear: sin enlaces */
  }
  return out;
}

type PendingEvent = {
  id: string;
  portfolio_id?: string;
  kind?: string | null;
  chain: string;
  protocol: string;
  label: string | null;
  tokens: unknown;
  value_usd: number | null;
  block_time: string | null;
  tx_hash: string | null;
  position_ref: string | null;
  status?: string;
};

/**
 * Convierte un evento pendiente en transacciones contables (una por token,
 * mismo operation_group_id → deshacer en bloque), aprende el enlace y marca
 * el evento como ingerido. Compartido por la confirmación manual (PATCH) y
 * la ingesta AUTOMÁTICA (GET) de posiciones ya enlazadas.
 */
async function performIngest(
  ev: PendingEvent,
  portfolioId: string,
  positionId: string,
  protocol: string,
  positionType: string,
): Promise<{ ok: true; inserted: number } | { ok: false; error: string; status: number }> {
  const client = getClient();
  const tokens = (ev.tokens ?? []) as EventToken[];
  const usable = tokens.filter((t) => t.amount > 0 && t.priceUsd != null);
  if (!usable.length) {
    return { ok: false, error: "El evento no tiene tokens con precio; regístralo a mano.", status: 400 };
  }

  const timestamp = ev.block_time ?? new Date().toISOString();
  // Tipo contable según el evento detectado (Fases C1/C2/C3), misma semántica
  // que el flujo manual auditado.
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
  if (!txType) return { ok: false, error: `Tipo de evento no soportado: ${kind}.`, status: 400 };
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
  if (txErr) return { ok: false, error: `No se pudo crear la transacción: ${txErr.message}`, status: 500 };

  // Aprender el enlace (con auto_ingest: a partir de aquí, todo automático).
  const oid = eventOnchainId(ev as { chain: string; protocol: string; position_ref: string | null });
  if (oid) {
    await client
      .from("position_links")
      .upsert(
        { portfolio_id: portfolioId, onchain_id: oid, protocol, position_id: positionId, position_type: positionType, auto_ingest: true },
        { onConflict: "portfolio_id,onchain_id" },
      )
      .then(() => undefined, () => undefined); // mejor esfuerzo (tabla puede no existir aún)
  }

  const { error: updErr } = await client
    .from("onchain_events")
    .update({ status: "ingested", ingested_at: new Date().toISOString() })
    .eq("id", ev.id);
  if (updErr) return { ok: false, error: updErr.message, status: 500 };

  return { ok: true, inserted: rows.length };
}

export async function GET(request: NextRequest) {
  const portfolioId = (request.nextUrl.searchParams.get("portfolioId") ?? "").trim();
  const access = await getViewerAccess();
  const check = ensurePortfolioAccess(access, portfolioId, false);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const { data, error } = await getClient()
    .from("onchain_events")
    .select("id, kind, chain, protocol, label, tokens, value_usd, block_time, tx_hash, includes_principal, position_ref, status")
    .eq("portfolio_id", portfolioId)
    .eq("status", "pending")
    .order("block_time", { ascending: false });
  if (error) {
    // Tabla aún sin crear (migración pendiente): panel sin sección, no error.
    return NextResponse.json({ events: [] });
  }

  const links = await getLinks(portfolioId);
  const events: Array<EventRow & { kind?: string | null; link: LinkInfo | null }> = [];
  let autoIngested = 0;

  for (const raw of (data ?? []) as Array<EventRow & { kind?: string | null }>) {
    const oid = eventOnchainId(raw as { chain: string; protocol: string; position_ref: string | null });
    const link = oid ? links.get(oid) ?? null : null;

    // INGESTA AUTOMÁTICA: posición ya enlazada con auto_ingest y evento
    // posterior a la creación del enlace (lo anterior al enlace suele estar
    // ya contabilizado a mano → queda en la bandeja para revisión).
    const isNewer =
      link?.created_at && raw.block_time
        ? new Date(raw.block_time).getTime() > new Date(link.created_at).getTime()
        : false;
    if (link && link.auto_ingest && isNewer) {
      const result = await performIngest(raw as PendingEvent, portfolioId, link.position_id, link.protocol, link.position_type);
      if (result.ok) {
        autoIngested++;
        continue; // ya contabilizado: fuera de la bandeja
      }
    }
    events.push({ ...raw, link });
  }

  return NextResponse.json({ events, autoIngested });
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

  const result = await performIngest(ev as PendingEvent, portfolioId, positionId, protocol, positionType);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, inserted: result.inserted });
}
