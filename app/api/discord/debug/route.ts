import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { platform } from "@/lib/supabase/schemas";

// Temporary diagnostic endpoint — DELETE after debugging
export async function GET() {
  const results: Record<string, unknown> = {};

  // Check env vars
  results.SERVICE_ROLE_KEY_SET = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  results.SERVICE_ROLE_KEY_LENGTH = process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0;
  results.SUPABASE_URL_SET = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  results.PIPELINE_SECRET_SET = !!process.env.PIPELINE_SECRET;
  results.PIPELINE_SECRET_LENGTH = process.env.PIPELINE_SECRET?.length || 0;

  try {
    const supabase = createServiceClient();
    results.service_client_created = true;

    // Test query
    const { data, error } = await platform(supabase)
      .from("user_preferences")
      .select("user_id, preference_key, preference_value")
      .eq("preference_key", "discord_user_id");

    results.query_data = data;
    results.query_error = error;

    // Test with the exact filter resolveUser uses
    const discordId = "184900343862132736";
    const searchValue = JSON.stringify(discordId);
    results.search_value = searchValue;

    const { data: resolved, error: resolveErr } = await platform(supabase)
      .from("user_preferences")
      .select("user_id")
      .eq("preference_key", "discord_user_id")
      .eq("preference_value", searchValue)
      .single();

    results.resolved_data = resolved;
    results.resolved_error = resolveErr;
  } catch (e) {
    results.service_client_error = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(results);
}
