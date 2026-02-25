import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

function getRequiredPublicEnv(
  name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno: ${name}`);
  }
  return value;
}

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const supabaseUrl = getRequiredPublicEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabasePublishableKey = getRequiredPublicEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  browserClient = createClient(supabaseUrl, supabasePublishableKey);
  return browserClient;
}

