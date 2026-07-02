import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { ensurePortfolioAccess, getViewerAccess } from "@/lib/auth/viewer-access";
import { validateCsrf } from "@/lib/security/csrf";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * Deshacer una operación del gestor desde "Actividad Reciente".
 *
 * Dos modos:
 *  - "operation": deshace una operación normal (añadir posición, rebalanceo,
 *    harvest, edición…). Todas sus filas comparten operation_group_id, así que
 *    basta con soft-borrarlas (deleted_at = now). Recuperable.
 *  - "restore": deshace un BORRADO de posición. El borrado soft-borró las
 *    transacciones de la posición e insertó un snapshot position_closed. Para
 *    deshacerlo: re-activamos las transacciones (deleted_at = null) y
 *    soft-borramos el snapshot de cierre, para que su realizedPnl deje de
 *    contar (si no, la posición volvería como activa Y su cierre se sumaría →
 *    doble conteo).
 */

type UndoPayload = {
  portfolioId?: string;
  mode?: "operation" | "restore";
  operationGroupId?: string;
  protocol?: string;
  positionId?: string;
};

function sanitizeText(value: string | undefined): string {
  return (value ?? "").trim();
}

function getUndoClient(): SupabaseClient {
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

    const payload = (await request.json()) as UndoPayload;
    const portfolioId = sanitizeText(payload.portfolioId);
    const mode = payload.mode === "restore" ? "restore" : "operation";

    if (!portfolioId) {
      return NextResponse.json({ error: "Falta el portfolio." }, { status: 400 });
    }

    const access = await getViewerAccess();
    const accessCheck = ensurePortfolioAccess(access, portfolioId, true);
    if (!accessCheck.ok) {
      return NextResponse.json({ error: accessCheck.error }, { status: accessCheck.status });
    }

    const clientIp = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "unknown";
    const rateLimit = checkRateLimit(
      `transactions-undo:${access.userId ?? "anon"}:${portfolioId}:${clientIp}`,
      { limit: 30, windowMs: 60_000 },
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiadas acciones en poco tiempo. Inténtalo de nuevo en unos segundos." },
        { status: 429 },
      );
    }

    const client = getUndoClient();
    const now = new Date().toISOString();

    if (mode === "restore") {
      const protocol = sanitizeText(payload.protocol);
      const positionId = sanitizeText(payload.positionId);
      if (!protocol || !positionId) {
        return NextResponse.json(
          { error: "Faltan datos para restaurar la posición (protocol, positionId)." },
          { status: 400 },
        );
      }

      // 1. Re-activar las transacciones de capital (todo menos el snapshot de cierre).
      const restored = await client
        .from("transactions")
        .update({ deleted_at: null })
        .eq("portfolio_id", portfolioId)
        .eq("protocol", protocol)
        .eq("position_id", positionId)
        .neq("type", "position_closed")
        .not("deleted_at", "is", null)
        .select("id");
      if (restored.error) throw new Error(restored.error.message);

      // 2. Soft-borrar el snapshot de cierre para que su realizedPnl deje de contar.
      const closed = await client
        .from("transactions")
        .update({ deleted_at: now })
        .eq("portfolio_id", portfolioId)
        .eq("protocol", protocol)
        .eq("position_id", positionId)
        .eq("type", "position_closed")
        .is("deleted_at", null)
        .select("id");
      if (closed.error) throw new Error(closed.error.message);

      return NextResponse.json({
        ok: true,
        mode,
        restoredRows: (restored.data ?? []).length,
        removedSnapshots: (closed.data ?? []).length,
      });
    }

    // mode === "operation": soft-borrar todas las filas activas del grupo.
    const operationGroupId = sanitizeText(payload.operationGroupId);
    if (!operationGroupId) {
      return NextResponse.json(
        { error: "Falta el identificador de la operación a deshacer." },
        { status: 400 },
      );
    }

    const undone = await client
      .from("transactions")
      .update({ deleted_at: now })
      .eq("portfolio_id", portfolioId)
      .eq("operation_group_id", operationGroupId)
      .is("deleted_at", null)
      .select("id, metadata");
    if (undone.error) throw new Error(undone.error.message);

    if ((undone.data ?? []).length === 0) {
      return NextResponse.json(
        { error: "No se encontró la operación a deshacer (puede que ya esté deshecha)." },
        { status: 404 },
      );
    }

    // Si la operación venía de un evento on-chain ingerido, devolver el
    // evento a la bandeja (pending): la operación real no desaparece de la
    // blockchain — así se puede re-registrar en la posición correcta.
    const eventIds = [
      ...new Set(
        (undone.data ?? [])
          .map((r) => (r.metadata as Record<string, unknown> | null)?.eventId)
          .filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    ];
    if (eventIds.length > 0) {
      await client
        .from("onchain_events")
        .update({ status: "pending", ingested_at: null })
        .in("id", eventIds)
        .then(() => undefined, () => undefined); // mejor esfuerzo
    }

    return NextResponse.json({
      ok: true,
      mode,
      undoneRows: (undone.data ?? []).length,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Undo operation error:", error);
    return NextResponse.json({ error: "Error inesperado al deshacer la operación." }, { status: 400 });
  }
}
