import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function getRequiredPublicEnv(
  name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno: ${name}`);
  }
  return value;
}

export function getSupabaseServerClient(): SupabaseClient {
  const supabaseUrl = getRequiredPublicEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabasePublishableKey = getRequiredPublicEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return createClient(supabaseUrl, supabasePublishableKey);
}

export function getSupabaseServiceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

