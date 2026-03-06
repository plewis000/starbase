import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { finance } from "@/lib/supabase/schemas";
import { syncTransactions } from "@/app/api/plaid/exchange/route";
import { verifyPlaidWebhook } from "@/lib/plaid-webhook-verify";

// Fallback shared secret — used only when Plaid JWT header is absent
const WEBHOOK_VERIFY_TOKEN = process.env.PLAID_WEBHOOK_VERIFY_TOKEN;

// POST /api/plaid/webhook — Receive Plaid webhooks for transaction updates
// NOTE: This route is excluded from auth middleware (see middleware.ts matcher)
export async function POST(request: NextRequest) {
  // Read body as text for JWT hash verification
  const bodyText = await request.text();
  let body;
  try { body = JSON.parse(bodyText); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // Verify webhook authenticity — prefer Plaid JWT, fall back to shared secret
  const plaidVerificationHeader = request.headers.get("plaid-verification");

  if (plaidVerificationHeader) {
    // Primary: Plaid JWT verification
    const valid = await verifyPlaidWebhook(bodyText, plaidVerificationHeader);
    if (!valid) {
      console.error("[plaid-webhook] JWT verification failed — rejecting");
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 403 });
    }
  } else {
    // Fallback: shared secret header
    if (!WEBHOOK_VERIFY_TOKEN) {
      console.error("PLAID_WEBHOOK_VERIFY_TOKEN not configured — rejecting webhook");
      return NextResponse.json({ error: "Webhook verification not configured" }, { status: 500 });
    }
    const providedToken = request.headers.get("x-webhook-token");
    if (providedToken !== WEBHOOK_VERIFY_TOKEN) {
      return NextResponse.json({ error: "Invalid webhook token" }, { status: 403 });
    }
  }

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

  if (webhook_code === "ITEM_ERROR") {
    // Mark item as errored — no sync needed
    await finance(supabase)
      .from("plaid_items")
      .update({ status: "error", updated_at: new Date().toISOString() })
      .eq("id", plaidItem.id);
    return NextResponse.json({ received: true, action: "item_error_flagged" });
  }

  // For sync-triggering webhooks, get access token and sync
  const syncCodes = ["SYNC_UPDATES_AVAILABLE", "INITIAL_UPDATE", "HISTORICAL_UPDATE", "DEFAULT_UPDATE", "TRANSACTIONS_REMOVED"];
  if (!syncCodes.includes(webhook_code)) {
    return NextResponse.json({ received: true, action: "ignored" });
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

  // syncTransactions has built-in cooldown protection (5 min)
  // This prevents webhook → sync → webhook amplification loops
  const syncResult = await syncTransactions(supabase, plaidItem.user_id, accessToken, plaidItem.id);

  return NextResponse.json({ received: true, sync: syncResult });
}
