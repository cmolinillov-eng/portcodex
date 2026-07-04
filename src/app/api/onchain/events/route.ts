import { NextResponse, type NextRequest } from "next/server";
import { getViewerAccess, ensurePortfolioAccess } from "@/lib/auth/viewer-access";
import { getSupabaseServiceClient, getSupabaseServerClient } from "@/lib/supabase/server";
import { capturePortfolioSnapshot } from "@/lib/snapshots/capture";

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
  if (!ev.position_ref) return null;
  // El escáner de Solana emite ya el LivePosition.id completo como ref
  // (p.ej. "solana:orca:MINT" o "solana:kamino:STRATEGY").
  if (ev.position_ref.includes(":")) return ev.position_ref;
  const slug = PROTOCOL_SLUGS[ev.protocol.toLowerCase()];
  if (!slug) return null;
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
  // priceUsd > 0 (no solo != null): un precio 0 crearía una fila que el motor
  // fiscal degrada a "datos incompletos" y el rendimiento desaparecería del
  // Modelo 100 en silencio. Mejor dejar el evento en bandeja y registrarlo
  // a mano con precio correcto.
  const usable = tokens.filter((t) => t.amount > 0 && t.priceUsd != null && t.priceUsd > 0);
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

  // metadata.lp: el trigger validate_transaction_integrity la exige en
  // lp_deposit/lp_withdraw (tokenA/B, rango, ratio). Se hereda del último
  // lp_deposit de la posición — mismo criterio que el flujo manual
  // (getLatestLpMetadata). Sin depósito previo no hay rango/ratio fiables:
  // el evento se queda en la bandeja para registrarlo a mano.
  let lpMeta: Record<string, unknown> | null = null;
  if (txType === "lp_deposit" || txType === "lp_withdraw") {
    const { data: lastDep } = await client
      .from("transactions")
      .select("metadata")
      .eq("portfolio_id", portfolioId)
      .eq("position_id", positionId)
      .eq("type", "lp_deposit")
      .order("transaction_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    lpMeta = (lastDep?.metadata as { lp?: Record<string, unknown> } | null)?.lp ?? null;
    if (!lpMeta) {
      return { ok: false, error: "La posición no tiene metadata LP previa (rango/ratio); registra este movimiento a mano.", status: 400 };
    }
  }

  // ─── REINVERSIÓN DE HARVEST ────────────────────────────────────────────
  // Un depósito poco después de un harvest de la MISMA posición y con valor
  // similar es la reinversión del yield: se registra con la semántica manual
  // auditada (metadata.source = "harvest_reinvest") para que el capital
  // aportado NO se infle — el yield suma al valor, no al depositado.
  let isReinvest = false;
  if (kind === "deposit" && ev.block_time && ev.value_usd != null) {
    try {
      const windowStart = new Date(new Date(ev.block_time).getTime() - 45 * 60_000).toISOString();
      const { data: recentHarvests } = await client
        .from("onchain_events")
        .select("id, value_usd")
        .eq("portfolio_id", portfolioId)
        .eq("kind", "harvest")
        .eq("position_ref", ev.position_ref ?? "")
        .in("status", ["ingested", "pending"])
        .gte("block_time", windowStart)
        .lte("block_time", ev.block_time);
      const match = (recentHarvests ?? []).find((h) => {
        const hv = Number(h.value_usd ?? 0);
        return hv > 0 && Math.abs(Number(ev.value_usd) - hv) / hv <= 0.5;
      });
      if (match) isReinvest = true;
    } catch {
      /* sin detección: se registra como depósito normal */
    }
  }

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
    notes: `${isReinvest ? "Reinversión de harvest" : NOTE_LABEL[kind]} on-chain ${ev.protocol} (${ev.label ?? ""}) tx ${ev.tx_hash ?? ""}`.trim(),
    transaction_date: timestamp,
    protocol,
    position_id: positionId,
    position_type: positionType,
    metadata: {
      ...(lpMeta ? { lp: lpMeta } : {}),
      // harvest_reinvest: el motor contable lo excluye del capital aportado
      // (isHarvestReinvestInternal) y consume el harvest pendiente.
      source: isReinvest ? "harvest_reinvest" : "onchain_ingest",
      onchainIngest: true,
      eventId: ev.id,
      txHash: ev.tx_hash,
      chain: ev.chain,
      nftId: ev.position_ref,
      ...(isReinvest ? { sourcePositionId: positionId, sourceProtocol: protocol } : {}),
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
  // La ingesta automática ESCRIBE contabilidad: solo si el viewer puede operar.
  const canWrite = ensurePortfolioAccess(access, portfolioId, true).ok;
  const client = getClient();

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
    if (canWrite && link && link.auto_ingest && isNewer) {
      // Reclamo atómico: dos GET concurrentes no pueden ingerir el mismo
      // evento dos veces (RCM duplicado). Solo quien "gana" el update sigue.
      const { data: claimed } = await client
        .from("onchain_events")
        .update({ status: "ingested", ingested_at: new Date().toISOString() })
        .eq("id", raw.id)
        .eq("status", "pending")
        .select("id");
      if (!claimed || claimed.length === 0) continue; // otro proceso lo tomó

      const result = await performIngest(raw as PendingEvent, portfolioId, link.position_id, link.protocol, link.position_type);
      if (result.ok) {
        autoIngested++;
        continue; // ya contabilizado: fuera de la bandeja
      }
      // Falló tras el reclamo: devolver a pendiente para que no se pierda.
      await client.from("onchain_events").update({ status: "pending", ingested_at: null }).eq("id", raw.id);
    }
    events.push({ ...raw, link });
  }

  // La evolución del portfolio recoge las operaciones automáticas del día
  // (además del snapshot diario de medianoche).
  if (autoIngested > 0) {
    try {
      await capturePortfolioSnapshot({ client: getClient(), portfolioId, trigger: "post_operation", notes: "auto-ingesta on-chain" });
    } catch {
      /* mejor esfuerzo */
    }
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
