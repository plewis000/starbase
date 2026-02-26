import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Schema-aware query helpers.
 *
 * All Starbase tables live in custom schemas (platform, config, household, finance).
 * The Supabase JS client defaults to 'public', so we must specify the schema.
 *
 * IMPORTANT: These schemas must be added to the Supabase project's exposed schemas
 * in Dashboard > Settings > API > Exposed schemas (add: platform, config, household, finance).
 */

export function platform(supabase: SupabaseClient) {
  return supabase.schema("platform");
}

export function config(supabase: SupabaseClient) {
  return supabase.schema("config");
}

export function household(supabase: SupabaseClient) {
  return supabase.schema("household");
}

export function finance(supabase: SupabaseClient) {
  return supabase.schema("finance");
}
