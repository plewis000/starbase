import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service role client — bypasses RLS. Use ONLY in trusted server-side contexts
// (Discord webhook handlers, pipeline API, cron jobs) where there is no user session
// but the request is already authenticated via other means (ed25519 signature, PIPELINE_SECRET, etc.)
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for service client");
  }

  return createSupabaseClient(url, key);
}
