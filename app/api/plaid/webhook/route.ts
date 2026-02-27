import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { finance } from "@/lib/supabase/schemas";
import { plaidClient } from "@/lib/plaid";
import { syncTransactions } from "@/app/api/plaid/exchange/route";

// POST /api/plaid/webhook — Receive Plaid webhooks for transaction updates
export async function POST(request: NextRequest) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { webhook_type, webhook_code, item_id } = body;

  // Only handle transaction webhooks
  if (webhook_type !== "TRANSACTIONS") {
    return NextResponse.json({ received: true });
  }

  const supabase = await createClient();

  // Look up the item
  const { data: plaidItem } = await finance(supabase)
    .from("plaid_items")
    .select("id, user_id, plaid_item_id")
    .eq("plaid_item_id", item_id)
    .single();

  if (!plaidItem) {
    return NextResponse.json({ error: "Unknown item" }, { status: 404 });
  }

  // Get access token from user_integrations
  const { data: integration } = await supabase.schema("platform")
    .from("user_integrations")
    .select("access_token_vault_id")
    .eq("user_id", plaidItem.user_id)
    .eq("service", "plaid")
    .single();

  if (!integration?.access_token_vault_id) {
    return NextResponse.json({ error: "No access token found" }, { status: 500 });
  }

  // Retrieve access token from Vault
  const { data: secret } = await supabase.rpc("vault_retrieve_secret", {
    secret_id: integration.access_token_vault_id,
  });

  const accessToken = secret as string;
  if (!accessToken) {
    return NextResponse.json({ error: "Could not retrieve access token" }, { status: 500 });
  }

  switch (webhook_code) {
    case "SYNC_UPDATES_AVAILABLE":
    case "INITIAL_UPDATE":
    case "HISTORICAL_UPDATE":
    case "DEFAULT_UPDATE":
      await syncTransactions(supabase, plaidItem.user_id, accessToken, plaidItem.id);
      break;

    case "TRANSACTIONS_REMOVED":
      // Handled by syncTransactions via the removed array
      await syncTransactions(supabase, plaidItem.user_id, accessToken, plaidItem.id);
      break;

    case "ITEM_ERROR":
      // Mark item as errored
      await finance(supabase)
        .from("plaid_items")
        .update({ status: "error", updated_at: new Date().toISOString() })
        .eq("id", plaidItem.id);
      break;
  }

  return NextResponse.json({ received: true });
}
