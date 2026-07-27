import { NextResponse, type NextRequest } from "next/server";
import { getViewerAccess, ensurePortfolioAccess } from "@/lib/auth/viewer-access";
import { getSupabaseServiceClient, getSupabaseServerClient } from "@/lib/supabase/server";
import { capturePortfolioSnapshot } from "@/lib/snapshots/capture";
import { computeReinvestSplit, type ReinvestSplit, type SwapLeg } from "@/lib/onchain/reinvest-split";

/**
 * Harvests detectados on-chain (tabla onchain_events, rellenada por el worker).
 * GET: pendientes del portfolio.
 * PATCH: registrar uno como transacción `harvest` (cantidad/precio/fecha reales,
 * asignado a una posición manual) o descartarlo. Solo perfiles que operan.
 */

type EventToken = {
  symbol: string;
  amount: number;
  priceUsd: number | null;
  valueUsd: number | null;
  /** Solo eventos kind=swap: lado de la permuta y ref del hold de esa pata. */
  side?: "sold" | "bought";
  holdRef?: string;
  /** Gas/comisión de la tx en USD (solo en el primer token del evento). */
  feeUsd?: number;
};
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

// La comparación de cestas harvest↔redepósito (permuta implícita + exceso de
// capital) vive en un módulo puro para poder testearla de forma aislada.
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

/**
 * Enlace de un evento SIN position_ref. El escáner de transacciones casa cada
 * evento contra las posiciones VIVAS; la retirada que CIERRA una posición nunca
 * casa (al leerla ya no existe), así que llegaba huérfana y se quedaba en la
 * bandeja para siempre aunque su posición estuviera enlazada.
 *
 * Se recupera por (cadena, protocolo, etiqueta): el onchain_id del enlace
 * empieza por `cadena:protocolo:` y su position_id por la etiqueta del evento
 * ("SOL/USDC-…"). Solo si la coincidencia es ÚNICA — con dos posiciones del
 * mismo par y protocolo se deja en la bandeja antes que adivinar.
 *
 * Es seguro auto-ingerirlos porque performIngest abona la vuelta del capital al
 * hold (ver "VUELTA DEL CAPITAL AL HOLD"): el cierre no evapora el depositado.
 */
function resolveLinkByLabel(
  links: Map<string, LinkInfo>,
  ev: { chain: string; protocol: string; label: string | null },
): { onchainId: string; link: LinkInfo } | null {
  const label = (ev.label ?? "").trim();
  if (!label) return null;
  const chain = (ev.chain ?? "").trim().toLowerCase();
  const proto = (ev.protocol ?? "").trim().toLowerCase();
  if (!chain || !proto) return null;
  // "Kamino (ORCA)" → en el onchain_id va el protocolo base ("kamino").
  const protoBase = proto.split("(")[0].trim().replace(/\s+/g, "-");
  const hits: Array<{ onchainId: string; link: LinkInfo }> = [];
  for (const [onchainId, link] of links) {
    if (!onchainId.toLowerCase().startsWith(`${chain}:${protoBase}:`)) continue;
    const pid = (link.position_id ?? "").trim();
    if (pid === label || pid.startsWith(`${label}-`)) hits.push({ onchainId, link });
  }
  return hits.length === 1 ? hits[0] : null;
}

type PendingEvent = {
  id: string;
  /** Clave del evento: sirve para localizar sus llegadas al hold (`…:in:SÍMBOLO`). */
  event_key?: string | null;
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
  const withAmount = tokens.filter((t) => t.amount > 0);
  const usable = withAmount.filter((t) => t.priceUsd != null && t.priceUsd > 0);
  if (!usable.length) {
    return { ok: false, error: "El evento no tiene tokens con precio; regístralo a mano.", status: 400 };
  }
  // Si SOLO algunos tokens tienen precio, NO se ingiere a medias: ingerir solo
  // los valorables descartaría el resto EN SILENCIO (rendimiento que desaparece
  // del Modelo 100). Se deja el evento entero pendiente para registrarlo a mano
  // con todos los precios — así nada se pierde sin que nadie lo vea.
  if (usable.length < withAmount.length) {
    return {
      ok: false,
      error: `El evento tiene ${withAmount.length - usable.length} token(s) sin precio; regístralo a mano para no perder rendimiento.`,
      status: 400,
    };
  }

  const timestamp = ev.block_time ?? new Date().toISOString();
  // Tipo contable según el evento detectado (Fases C1/C2/C3), misma semántica
  // que el flujo manual auditado.
  const kind = (ev.kind as string) ?? "harvest";

  // ─── PERMUTA (swap de wallet): dos filas con posiciones DISTINTAS ────────
  // El lado vendido sale de su hold (withdrawal, tributa como swap_out por
  // FIFO en el motor fiscal) y el comprado entra en el suyo (deposit, nace
  // lote swap_in a FMV). Si el token comprado no tiene posición aún, se crea
  // implícita y se enlaza con auto_ingest (los siguientes eventos fluyen).
  if (kind === "swap") {
    const sold = usable.filter((t) => t.side === "sold" && t.holdRef);
    const bought = usable.filter((t) => t.side === "bought" && t.holdRef);
    if (!sold.length || !bought.length) {
      return { ok: false, error: "Permuta sin las dos patas con precio; regístrala a mano.", status: 400 };
    }
    const links = await getLinks(portfolioId);
    const refId = (r: string) => (r.includes(":") ? r : `${ev.chain}:hold:${r}`);
    const soldLabel = sold.map((t) => `${t.amount.toFixed(6)} ${t.symbol}`).join(" + ");
    const boughtLabel = bought.map((t) => `${t.amount.toFixed(6)} ${t.symbol}`).join(" + ");
    const operationGroupId = crypto.randomUUID();
    const noteTail = `on-chain permuta (${ev.label ?? ""}) tx ${ev.tx_hash ?? ""}`.trim();
    const rows: Array<Record<string, unknown>> = [];

    for (const t of sold) {
      const link = links.get(refId(t.holdRef!));
      if (!link) {
        // Vender un token sin posición contable = historia incompleta (no hay
        // lotes que consumir). Mejor pendiente que una venta sin base.
        return { ok: false, error: `Permuta: el token vendido (${t.symbol}) no tiene posición enlazada — regístrala a mano.`, status: 400 };
      }
      rows.push({
        portfolio_id: portfolioId,
        type: "withdrawal",
        operation_group_id: operationGroupId,
        token_in_symbol: null,
        token_in_amount: null,
        token_out_symbol: t.symbol.toUpperCase(),
        token_out_amount: t.amount,
        spot_price: t.priceUsd,
        // Gas de la tx (USD): Art. 35 — resta del valor de transmisión.
        fee_amount: t.feeUsd && t.feeUsd > 0 ? t.feeUsd : 0,
        notes: `Permuta (entrega) ${noteTail}`,
        transaction_date: timestamp,
        protocol: link.protocol,
        position_id: link.position_id,
        position_type: link.position_type || "Hold",
        metadata: { source: "onchain_swap", eventId: ev.id, swapBought: boughtLabel, swapSold: soldLabel },
      });
    }
    for (const t of bought) {
      const oid = refId(t.holdRef!);
      let link = links.get(oid);
      if (!link) {
        const positionId = `${t.symbol.toUpperCase()}-${oid.slice(-24).replace(/[^\w-]+/g, "-")}`;
        link = { protocol: "Wallet", position_id: positionId, position_type: "Hold", auto_ingest: true };
        await client.from("position_links").upsert(
          { portfolio_id: portfolioId, onchain_id: oid, protocol: "Wallet", position_id: positionId, position_type: "Hold", auto_ingest: true },
          { onConflict: "portfolio_id,onchain_id" },
        );
      }
      rows.push({
        portfolio_id: portfolioId,
        type: "deposit",
        operation_group_id: operationGroupId,
        token_in_symbol: t.symbol.toUpperCase(),
        token_in_amount: t.amount,
        token_out_symbol: null,
        token_out_amount: null,
        spot_price: t.priceUsd,
        fee_amount: 0,
        notes: `Permuta (recepción) ${noteTail}`,
        transaction_date: timestamp,
        protocol: link.protocol,
        position_id: link.position_id,
        position_type: link.position_type || "Hold",
        metadata: { source: "onchain_swap", eventId: ev.id, swapBought: boughtLabel, swapSold: soldLabel },
      });
    }

    const { error: swapErr } = await client.from("transactions").insert(rows);
    if (swapErr) return { ok: false, error: swapErr.message, status: 500 };
    return { ok: true, inserted: rows.length };
  }
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

  // deposit/withdraw sobre posiciones que NO son LP (Beefy y otros vaults del
  // adaptador genérico van como Staking; holds como Hold): el tipo contable
  // debe seguir al tipo de posición. Con lp_deposit a secas, el trigger de
  // integridad exigiría metadata.lp que estas posiciones no tienen y el
  // evento se quedaría atascado.
  let effectiveTxType = txType;
  if (kind === "deposit" || kind === "withdraw") {
    const pt = positionType.toLowerCase();
    if (pt.includes("staking")) effectiveTxType = kind === "deposit" ? "staking_deposit" : "staking_withdrawal";
    else if (pt.includes("hold")) effectiveTxType = kind === "deposit" ? "deposit" : "withdrawal";
    else if (pt.includes("lending")) effectiveTxType = kind === "deposit" ? "lending_supply" : "lending_withdraw";
  }

  // metadata.lp: el trigger validate_transaction_integrity la exige en
  // lp_deposit/lp_withdraw (tokenA/B, rango, ratio). Se hereda del último
  // lp_deposit de la posición — mismo criterio que el flujo manual
  // (getLatestLpMetadata). Sin depósito previo no hay rango/ratio fiables:
  // el evento se queda en la bandeja para registrarlo a mano.
  let lpMeta: Record<string, unknown> | null = null;
  if (effectiveTxType === "lp_deposit" || effectiveTxType === "lp_withdraw") {
    const { data: lastDep } = await client
      .from("transactions")
      .select("metadata")
      .eq("portfolio_id", portfolioId)
      .eq("position_id", positionId)
      .eq("protocol", protocol)
      .eq("type", "lp_deposit")
      .is("deleted_at", null)
      .order("transaction_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    lpMeta = (lastDep?.metadata as { lp?: Record<string, unknown> } | null)?.lp ?? null;
    if (!lpMeta) {
      return { ok: false, error: "La posición no tiene metadata LP previa (rango/ratio); registra este movimiento a mano.", status: 400 };
    }
  }

  // ─── REINVERSIÓN DE HARVEST ────────────────────────────────────────────
  // Un depósito tras un harvest de valor similar es la reinversión del yield:
  // se registra con la semántica manual auditada (metadata.source =
  // "harvest_reinvest") para que el capital aportado NO se infle — el yield
  // suma al valor, no al depositado. Se empareja primero con harvests de la
  // MISMA posición; si no hay, con el de OTRA posición del portfolio (el
  // gestor cobra en un pool y reinvierte en otro) siempre que el candidato
  // sea ÚNICO y su posición contable esté enlazada (para saber de qué
  // pending descontar).
  let isReinvest = false;
  let reinvestSplit: ReinvestSplit | null = null;
  let reinvestHarvestId: string | null = null;
  // Posición ORIGEN del harvest (cuyo pending se consume). Por defecto, la
  // propia posición destino (reinversión clásica en el mismo pool).
  let reinvestSourcePositionId = positionId;
  let reinvestSourceProtocol = protocol;
  if (kind === "deposit" && ev.block_time && ev.value_usd != null) {
    try {
      // Hacia atrás 48h: el gestor puede cobrar hoy y reinvertir mañana; el
      // pending contable no caduca, así que el emparejamiento tampoco exige
      // inmediatez. Hacia delante 45min: los harvests de Kamino/Meteora se
      // detectan por delta de caché y su block_time es la hora de la LECTURA
      // (hasta un ciclo del worker DESPUÉS del claim real).
      const windowStart = new Date(new Date(ev.block_time).getTime() - 48 * 3600_000).toISOString();
      const windowEnd = new Date(new Date(ev.block_time).getTime() + 45 * 60_000).toISOString();
      const { data: recentHarvests } = await client
        .from("onchain_events")
        .select("id, value_usd, tokens, block_time, position_ref, chain, protocol")
        .eq("portfolio_id", portfolioId)
        .eq("kind", "harvest")
        .in("status", ["ingested", "pending"])
        .gte("block_time", windowStart)
        .lte("block_time", windowEnd)
        .order("block_time", { ascending: false });
      // Harvests ya consumidos por otra reinversión (para no emparejar dos
      // veces el mismo pending).
      const { data: usedHarvests } = await client
        .from("transactions")
        .select("metadata")
        .eq("portfolio_id", portfolioId)
        .contains("metadata", { source: "harvest_reinvest" })
        .is("deleted_at", null);
      const consumedIds = new Set(
        (usedHarvests ?? [])
          .map((r) => (r.metadata as Record<string, unknown> | null)?.reinvestHarvestId)
          .filter((x): x is string => typeof x === "string"),
      );
      // Candidatos: no consumidos y de valor similar (±50%).
      const candidates = (recentHarvests ?? []).filter((h) => {
        if (consumedIds.has(h.id as string)) return false;
        const hv = Number(h.value_usd ?? 0);
        return hv > 0 && Math.abs(Number(ev.value_usd) - hv) / hv <= 0.5;
      });
      // 1º la propia posición: el MÁS CERCANO en el tiempo (orden desc).
      let match = candidates.find((h) => (h.position_ref ?? "") === (ev.position_ref ?? ""));
      // 2º otra posición del portfolio, solo con candidato ÚNICO (sin
      // ambigüedad) y enlace conocido → el pending se descuenta del origen.
      if (!match) {
        const others = candidates.filter((h) => (h.position_ref ?? "") !== (ev.position_ref ?? ""));
        if (others.length === 1) {
          const links = await getLinks(portfolioId);
          const srcOid = eventOnchainId(others[0] as { chain: string; protocol: string; position_ref: string | null });
          const srcLink = srcOid ? links.get(srcOid) : undefined;
          if (srcLink) {
            match = others[0];
            reinvestSourcePositionId = srcLink.position_id;
            reinvestSourceProtocol = srcLink.protocol;
          }
        }
      }
      if (match) {
        isReinvest = true;
        reinvestHarvestId = match.id as string;
        // La cesta redepositada puede diferir de la cobrada: detectar la
        // permuta implícita (swapLegs) y el exceso aportado como capital.
        reinvestSplit = computeReinvestSplit(
          ((match.tokens ?? []) as EventToken[]),
          usable,
          Number(match.value_usd ?? 0),
        );
      }
    } catch {
      /* sin detección: se registra como depósito normal */
    }
  }

  // Mismo grupo de operación → el botón "Deshacer" revierte la operación completa.
  const operationGroupId = crypto.randomUUID();
  const noteTail = `on-chain ${ev.protocol} (${ev.label ?? ""}) tx ${ev.tx_hash ?? ""}`.trim();
  const buildRow = (t: EventToken, amount: number, reinvest: boolean, swapLegs?: SwapLeg[], noteLabel?: string) => ({
    portfolio_id: portfolioId,
    type: effectiveTxType,
    operation_group_id: operationGroupId,
    token_in_symbol: isOut ? null : t.symbol.toUpperCase(),
    token_in_amount: isOut ? null : amount,
    token_out_symbol: isOut ? t.symbol.toUpperCase() : null,
    token_out_amount: isOut ? amount : null,
    spot_price: t.priceUsd as number,
    fee_amount: t.feeUsd && t.feeUsd > 0 ? t.feeUsd : 0,
    notes: `${noteLabel ?? (reinvest ? "Reinversión de harvest" : NOTE_LABEL[kind])} ${noteTail}`.trim(),
    transaction_date: timestamp,
    protocol,
    position_id: positionId,
    position_type: positionType,
    metadata: {
      ...(lpMeta ? { lp: lpMeta } : {}),
      // harvest_reinvest: el motor contable lo excluye del capital aportado
      // (isHarvestReinvestInternal) y consume el harvest pendiente.
      source: reinvest ? "harvest_reinvest" : "onchain_ingest",
      onchainIngest: true,
      // ID del harvest emparejado → evita re-consumir el mismo pending en
      // otra reinversión (detección de "ya consumido").
      ...(reinvest && reinvestHarvestId ? { reinvestHarvestId } : {}),
      eventId: ev.id,
      txHash: ev.tx_hash,
      chain: ev.chain,
      nftId: ev.position_ref,
      ...(reinvest ? { sourcePositionId: reinvestSourcePositionId, sourceProtocol: reinvestSourceProtocol } : {}),
      // swapLegs: permuta implícita dentro de la reinversión (cesta
      // redepositada ≠ cesta cobrada). El motor fiscal consume por FIFO el
      // lote del vendido y crea el del comprado con base trasladada; el
      // dashboard mueve el pending del harvest de un token al otro.
      ...(swapLegs && swapLegs.length > 0 ? { swapLegs } : {}),
      ...(ADJUST_TYPE[kind] ? { adjustType: ADJUST_TYPE[kind] } : {}),
    },
  });

  const rows: Array<ReturnType<typeof buildRow>> = [];
  for (const t of usable) {
    if (!isReinvest) {
      rows.push(buildRow(t, t.amount, false));
      continue;
    }
    // Porción cubierta por el harvest → reinversión (movimiento interno);
    // porción que excede su valor → aportación genuina de capital (antes la
    // tolerancia ±50% del match la absorbía y el depositado quedaba corto).
    const sym = t.symbol.toUpperCase();
    const capitalAmount = reinvestSplit?.capitalBySymbol.get(sym) ?? 0;
    const reinvestAmount = t.amount - capitalAmount;
    if (reinvestAmount > 0) {
      rows.push(buildRow(t, reinvestAmount, true, reinvestSplit?.swapLegsBySymbol.get(sym)));
    }
    if (capitalAmount > 0) {
      rows.push(buildRow(t, capitalAmount, false, undefined, "Aportación de capital junto a reinversión (exceso sobre el harvest)"));
    }
  }
  if (!rows.length) {
    return { ok: false, error: "La reinversión no generó filas contables; regístralo a mano.", status: 400 };
  }

  // ─── VUELTA DEL CAPITAL AL HOLD en una retirada/cierre ───────────────────
  // Retirar de un pool NO destruye el capital: vuelve a la wallet. El worker ya
  // emite esa llegada (emitHoldArrivals → eventos `${clave}:in:SÍMBOLO`), pero
  // el escáner de transacciones de Solana no, así que un cierre restaba del
  // pool sin abonar la wallet y el Total Depositado perdía ese importe.
  // Aquí se abona en la MISMA operación (mismo operation_group_id → deshacer en
  // bloque) solo si nadie más emitió la llegada. Total neutro: el capital
  // cambia de sitio, no desaparece.
  if (kind === "withdraw" && ev.event_key) {
    const { data: siblings } = await client
      .from("onchain_events")
      .select("id")
      .eq("portfolio_id", portfolioId)
      .like("event_key", `${ev.event_key}:in:%`)
      .limit(1);
    if (!siblings || siblings.length === 0) {
      const holdBySymbol = new Map<string, LinkInfo>();
      for (const l of (await getLinks(portfolioId)).values()) {
        const pid = (l.position_id ?? "").trim().toUpperCase();
        const sym = pid.includes("-") ? pid.slice(0, pid.indexOf("-")) : pid;
        if ((l.position_type ?? "") === "Hold" && sym && !holdBySymbol.has(sym)) holdBySymbol.set(sym, l);
      }
      for (const t of usable) {
        const sym = t.symbol.toUpperCase();
        const hold = holdBySymbol.get(sym);
        // Sin hold contable para ese token no se inventa destino: queda como
        // hoy (el gestor lo adopta desde el panel) en vez de crear una
        // posición fantasma con una base que nadie ha comprobado.
        if (!hold) continue;
        rows.push({
          portfolio_id: portfolioId,
          type: "deposit",
          operation_group_id: operationGroupId,
          token_in_symbol: sym,
          token_in_amount: t.amount,
          token_out_symbol: null,
          token_out_amount: null,
          spot_price: Number(t.priceUsd),
          fee_amount: 0,
          notes: `Vuelta a la wallet por ${ev.label ?? "retirada"} (on-chain)`,
          transaction_date: timestamp,
          protocol: hold.protocol,
          position_id: hold.position_id,
          position_type: hold.position_type || "Hold",
          metadata: {
            source: "onchain_ingest",
            onchainIngest: true,
            eventId: ev.id,
            txHash: ev.tx_hash,
            chain: ev.chain,
            nftId: ev.position_ref,
            // Traza: de qué retirada es esta llegada (auditoría/depuración).
            holdArrivalOf: ev.event_key,
          },
        } as unknown as ReturnType<typeof buildRow>);
      }
    }
  }

  // Idempotencia dura: si ya existen transacciones vivas para este eventId (un
  // run anterior insertó pero falló al marcar el evento como ingerido, y este
  // se re-procesó), no volver a insertar → cero duplicados. Solo se re-marca
  // el evento como ingerido más abajo.
  const { data: already } = await client
    .from("transactions")
    .select("id")
    .eq("portfolio_id", portfolioId)
    .is("deleted_at", null)
    .contains("metadata", { eventId: ev.id })
    .limit(1);
  if (already && already.length > 0) {
    await client.from("onchain_events").update({ status: "ingested", ingested_at: new Date().toISOString() }).eq("id", ev.id);
    return { ok: true, inserted: 0 };
  }

  const { error: txErr } = await client.from("transactions").insert(rows);
  if (txErr) return { ok: false, error: `No se pudo crear la transacción: ${txErr.message}`, status: 500 };

  // Aprender el enlace (con auto_ingest: a partir de aquí, todo automático).
  // ignoreDuplicates: si el enlace YA existe, no se toca — un gestor que puso
  // auto_ingest=false en rodaje (o fijó otra posición a mano) no debe ver su
  // decisión machacada por cada ingesta.
  const oid = eventOnchainId(ev as { chain: string; protocol: string; position_ref: string | null });
  if (oid) {
    await client
      .from("position_links")
      .upsert(
        { portfolio_id: portfolioId, onchain_id: oid, protocol, position_id: positionId, position_type: positionType, auto_ingest: true },
        { onConflict: "portfolio_id,onchain_id", ignoreDuplicates: true },
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
  // Bypass de SERVICIO (worker/cron): con el secreto compartido, la ingesta
  // automática corre SIN sesión de operador → la contabilidad avanza sola
  // aunque nadie abra el panel (antes solo se ingería al cargar el dashboard).
  const cronSecret = process.env.CRON_SECRET;
  const isCron = Boolean(cronSecret) && request.headers.get("x-cron-secret") === cronSecret;
  let canWrite = false;
  if (isCron) {
    canWrite = true;
  } else {
    const access = await getViewerAccess();
    const check = ensurePortfolioAccess(access, portfolioId, false);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });
    canWrite = ensurePortfolioAccess(access, portfolioId, true).ok;
  }

  const { data, error } = await getClient()
    .from("onchain_events")
    .select("id, event_key, kind, chain, protocol, label, tokens, value_usd, block_time, tx_hash, includes_principal, position_ref, status")
    .eq("portfolio_id", portfolioId)
    .eq("status", "pending")
    .order("block_time", { ascending: false });
  if (error) {
    // Tabla aún sin crear (migración pendiente): panel sin sección, no error.
    return NextResponse.json({ events: [] });
  }

  const links = await getLinks(portfolioId);
  // LÍNEA BASE de cada posición: todo lo POSTERIOR se contabiliza solo.
  // Antes se usaba la fecha del ENLACE, lo que dejaba atascadas para siempre
  // operaciones reales anteriores a él (p.ej. una permuta de la mañana en una
  // wallet que se enlazó por la tarde). Lo correcto es la fecha de ADOPCIÓN:
  // lo anterior ya está dentro del saldo inicial adoptado; lo posterior, no.
  // Sin adopción propia se usa la del portfolio; si tampoco, el enlace.
  const adoptionByPosition = new Map<string, number>();
  let portfolioBaselineMs: number | null = null;
  {
    const { data: adopts } = await getClient()
      .from("transactions")
      .select("position_id, transaction_date")
      .eq("portfolio_id", portfolioId)
      .is("deleted_at", null)
      .contains("metadata", { source: "onchain_adopt" });
    for (const a of adopts ?? []) {
      const ts = Date.parse((a.transaction_date as string) ?? "");
      if (!Number.isFinite(ts)) continue;
      const pid = (a.position_id as string) ?? "";
      // Una posición re-adoptada (base corregida) conserva la fecha ORIGINAL:
      // la más antigua es la que marca desde cuándo el libro está completo.
      if (pid && (!adoptionByPosition.has(pid) || ts < adoptionByPosition.get(pid)!)) {
        adoptionByPosition.set(pid, ts);
      }
      if (portfolioBaselineMs === null || ts < portfolioBaselineMs) portfolioBaselineMs = ts;
    }
  }
  const events: Array<EventRow & { kind?: string | null; link: LinkInfo | null }> = [];
  let autoIngested = 0;
  // canWrite ya resuelto arriba (operador con sesión, o servicio con secreto).
  const client = getClient();

  for (const raw of (data ?? []) as Array<EventRow & { kind?: string | null }>) {
    let link = (() => {
      const oid = eventOnchainId(raw as { chain: string; protocol: string; position_ref: string | null });
      return oid ? links.get(oid) ?? null : null;
    })();
    // Sin position_ref (retirada que cerró la posición) → recuperar por etiqueta.
    if (!link && !raw.position_ref) link = resolveLinkByLabel(links, raw)?.link ?? null;

    // INGESTA AUTOMÁTICA: posición enlazada con auto_ingest y evento posterior
    // a su LÍNEA BASE (adopción de la posición → del portfolio → enlace).
    const blockMs = raw.block_time ? Date.parse(raw.block_time) : NaN;
    const baselineMs = link
      ? adoptionByPosition.get(link.position_id) ??
        portfolioBaselineMs ??
        (link.created_at ? Date.parse(link.created_at) : NaN)
      : NaN;
    const isNewer = Number.isFinite(blockMs) && Number.isFinite(baselineMs) && blockMs > baselineMs;
    if (canWrite && link && link.auto_ingest && isNewer) {
      // NO RESUCITAR lo deshecho/borrado a propósito: si existe una transacción
      // BORRADA para este evento, el gestor lo quitó queriendo (deshacer deja
      // el evento en 'pending', pero la idempotencia de performIngest solo mira
      // filas vivas, así que sin esta guarda la auto-ingesta lo re-insertaba).
      const { data: undone } = await client
        .from("transactions")
        .select("id")
        .eq("portfolio_id", portfolioId)
        .contains("metadata", { eventId: raw.id })
        .not("deleted_at", "is", null)
        .limit(1);
      if (undone && undone.length > 0) {
        await client
          .from("onchain_events")
          .update({ status: "dismissed", ingested_at: new Date().toISOString() })
          .eq("id", raw.id)
          .eq("status", "pending");
        continue;
      }
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

  // AUTOCURACIÓN: si la función murió tras reclamar un evento (status pasó a
  // 'ingested') pero antes de insertar sus transacciones, el evento quedaba
  // "contabilizado" en el aire para siempre. Se revisan los reclamos de las
  // últimas 48h sin transacción asociada — ni viva ni borrada: si el gestor
  // borró la operación a mano, NO se resucita — y se re-ingieren (la ingesta
  // es idempotente por eventId).
  if (canWrite) {
    try {
      const since = new Date(Date.now() - 48 * 3600_000).toISOString();
      const { data: recent } = await client
        .from("onchain_events")
        .select("id, event_key, kind, chain, protocol, label, tokens, value_usd, block_time, tx_hash, includes_principal, position_ref, status")
        .eq("portfolio_id", portfolioId)
        .eq("status", "ingested")
        .gte("ingested_at", since);
      for (const raw of (recent ?? []) as Array<EventRow & { kind?: string | null }>) {
        const { data: anyTx } = await client
          .from("transactions")
          .select("id")
          .eq("portfolio_id", portfolioId)
          .contains("metadata", { eventId: raw.id })
          .limit(1);
        if (anyTx && anyTx.length > 0) continue; // contabilizado (o retirado a propósito)
        const oid = eventOnchainId(raw as { chain: string; protocol: string; position_ref: string | null });
        const link = oid ? links.get(oid) ?? null : null;
        if (!link) continue;
        const res = await performIngest(raw as PendingEvent, portfolioId, link.position_id, link.protocol, link.position_type);
        if (res.ok) autoIngested++;
      }
    } catch {
      /* mejor esfuerzo */
    }
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

  // Reclamo atómico (mismo contrato que la auto-ingesta del GET): dos clics
  // simultáneos, o un clic en paralelo con la auto-ingesta, no pueden
  // contabilizar el evento dos veces.
  const { data: claimed } = await client
    .from("onchain_events")
    .update({ status: "ingested", ingested_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("status", "pending")
    .select("id");
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: "El evento ya fue procesado." }, { status: 409 });
  }

  const result = await performIngest(ev as PendingEvent, portfolioId, positionId, protocol, positionType);
  if (!result.ok) {
    // Devolver a pendiente para que no desaparezca de la bandeja.
    await client.from("onchain_events").update({ status: "pending", ingested_at: null }).eq("id", eventId);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, inserted: result.inserted });
}
