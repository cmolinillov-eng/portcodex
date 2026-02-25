import { getSupabaseServiceClient } from "@/lib/supabase/server";

type AdminAuditInput = {
  actorId: string | null;
  action: string;
  targetTable: string;
  targetId: string;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
};

export async function recordAdminAudit(input: AdminAuditInput): Promise<void> {
  const client = getSupabaseServiceClient();
  if (!client) return;

  const payload = {
    actor_id: input.actorId,
    action: input.action,
    target_table: input.targetTable,
    target_id: input.targetId,
    before_data: input.beforeData ?? null,
    after_data: input.afterData ?? null,
  };

  const insertResult = await client.from("admin_audit_logs").insert(payload);
  if (!insertResult.error) return;

  // Si la tabla no existe aún en el proyecto, no bloqueamos la operación principal.
  const message = insertResult.error.message.toLowerCase();
  if (message.includes("admin_audit_logs")) return;
  if (message.includes("does not exist")) return;
}

