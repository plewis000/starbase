import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { finance } from "@/lib/supabase/schemas";
import { syncTransactions, SYNC_COOLDOWN_MS } from "@/app/api/plaid/exchange/route";

// POST /api/plaid/sync — Manually trigger transaction sync for all linked accounts
// Has built-in cooldown protection via syncTransactions (5 min per item)
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get all active plaid items with last sync time
  const { data: items } = await finance(supabase)
    .from("plaid_items")
    .select("id, plaid_item_id, last_synced_at")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (!items || items.length === 0) {
    return NextResponse.json({ error: "No linked accounts" }, { status: 400 });
  }

  // Quick check: if ALL items were synced recently, skip entirely
  const allRecent = items.every((item) =>
    item.last_synced_at && (Date.now() - new Date(item.last_synced_at).getTime()) < SYNC_COOLDOWN_MS
  );
  if (allRecent) {
    return NextResponse.json({
      message: "All accounts were synced recently. Try again in a few minutes.",
      synced: 0,
    });
  }

  // Get access token
  const { data: integration } = await supabase.schema("platform")
    .from("user_integrations")
    .select("access_token_vault_id, service_user_id")
    .eq("user_id", user.id)
    .eq("service", "plaid")
    .single();

  if (!integration?.access_token_vault_id) {
    return NextResponse.json({ error: "No Plaid credentials found" }, { status: 400 });
  }

  const { data: secret } = await supabase.rpc("vault_retrieve_secret", {
    secret_id: integration.access_token_vault_id,
  });

  const accessToken = secret as string;
  if (!accessToken) {
    return NextResponse.json({ error: "Could not retrieve access token" }, { status: 500 });
  }

  const results = [];
  for (const item of items) {
    // syncTransactions enforces per-item cooldown internally
    const syncResult = await syncTransactions(supabase, user.id, accessToken, item.id);
    results.push({ item_id: item.id, ...syncResult });
  }

  return NextResponse.json({ results });
}
