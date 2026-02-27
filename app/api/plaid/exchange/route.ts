import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { plaidClient } from "@/lib/plaid";
import { finance } from "@/lib/supabase/schemas";

// Safety limits — prevents runaway API costs
const MAX_SYNC_PAGES = 50; // Max Plaid API pages per sync (each page ~500 txns)
const MAX_TRANSACTIONS_PER_SYNC = 10000; // Hard cap on total transactions per sync
const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between syncs per item

// POST /api/plaid/exchange — Exchange public token for access token, store item + accounts
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { public_token, institution } = body;
  if (!public_token) return NextResponse.json({ error: "public_token is required" }, { status: 400 });

  try {
    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token,
    });

    const { access_token, item_id } = exchangeResponse.data;

    // Store access token in Supabase Vault (via RPC)
    const { data: vaultResult } = await supabase.rpc("vault_store_secret", {
      secret_value: access_token,
      secret_name: `plaid_access_${item_id}`,
    });

    const vaultId = vaultResult || null;

    // Create the plaid_item record
    const { data: plaidItem, error: itemError } = await finance(supabase)
      .from("plaid_items")
      .insert({
        user_id: user.id,
        plaid_item_id: item_id,
        institution_name: institution?.name || "Unknown",
        institution_id: institution?.institution_id || null,
        status: "active",
      })
      .select("*")
      .single();

    if (itemError) return NextResponse.json({ error: "Failed to store linked account" }, { status: 500 });

    // Fetch accounts from Plaid
    const accountsResponse = await plaidClient.accountsGet({ access_token });

    const accountInserts = accountsResponse.data.accounts.map((acct) => ({
      plaid_item_id: plaidItem.id,
      plaid_account_id: acct.account_id,
      name: acct.name,
      official_name: acct.official_name || null,
      type: mapAccountType(acct.type),
      subtype: acct.subtype || null,
      mask: acct.mask || null,
      current_balance: acct.balances.current,
      available_balance: acct.balances.available,
      credit_limit: acct.balances.limit || null,
      iso_currency_code: acct.balances.iso_currency_code || "USD",
      balance_updated_at: new Date().toISOString(),
    }));

    const { data: accounts, error: acctError } = await finance(supabase)
      .from("plaid_accounts")
      .insert(accountInserts)
      .select("*");

    if (acctError) return NextResponse.json({ error: "Failed to store accounts" }, { status: 500 });

    // Store integration record for token retrieval
    await supabase.schema("platform")
      .from("user_integrations")
      .upsert({
        user_id: user.id,
        service: "plaid",
        access_token_vault_id: vaultId,
        service_user_id: item_id,
        status: "active",
        scopes: ["transactions"],
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,service" });

    // Trigger initial transaction sync
    const syncResult = await syncTransactions(supabase, user.id, access_token, plaidItem.id);

    return NextResponse.json({
      item: plaidItem,
      accounts: accounts || [],
      sync: syncResult,
    }, { status: 201 });
  } catch (err: unknown) {
    // Never leak internal error details — log server-side only
    console.error("Plaid exchange error:", err);
    return NextResponse.json({ error: "Failed to link account" }, { status: 500 });
  }
}

function mapAccountType(plaidType: string): string {
  const typeMap: Record<string, string> = {
    depository: "checking",
    credit: "credit",
    loan: "loan",
    investment: "investment",
  };
  return typeMap[plaidType] || "other";
}

interface SyncResult {
  added: number;
  modified: number;
  removed: number;
  pages: number;
  capped: boolean;
  error?: string;
}

async function syncTransactions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  accessToken: string,
  plaidItemId: string,
): Promise<SyncResult> {
  const result: SyncResult = { added: 0, modified: 0, removed: 0, pages: 0, capped: false };

  try {
    // Enforce cooldown — prevent repeated syncs
    const { data: item } = await finance(supabase)
      .from("plaid_items")
      .select("cursor, last_synced_at")
      .eq("id", plaidItemId)
      .single();

    if (item?.last_synced_at) {
      const elapsed = Date.now() - new Date(item.last_synced_at).getTime();
      if (elapsed < SYNC_COOLDOWN_MS) {
        return { ...result, error: `Sync cooldown: ${Math.ceil((SYNC_COOLDOWN_MS - elapsed) / 1000)}s remaining` };
      }
    }

    let cursor = item?.cursor || undefined;
    let hasMore = true;
    const allAdded: PlaidTransaction[] = [];
    const allModified: PlaidTransaction[] = [];
    const allRemoved: string[] = [];

    // Circuit breaker: cap pages and total transaction count
    while (hasMore && result.pages < MAX_SYNC_PAGES) {
      result.pages++;

      const response = await plaidClient.transactionsSync({
        access_token: accessToken,
        cursor: cursor || undefined,
      });

      const { added, modified, removed, next_cursor, has_more } = response.data;
      allAdded.push(...(added as PlaidTransaction[]));
      allModified.push(...(modified as PlaidTransaction[]));
      allRemoved.push(...removed.map((r) => r.transaction_id));
      cursor = next_cursor;
      hasMore = has_more;

      // Hard cap on total transactions
      if (allAdded.length + allModified.length > MAX_TRANSACTIONS_PER_SYNC) {
        result.capped = true;
        console.warn(`Sync capped at ${MAX_TRANSACTIONS_PER_SYNC} transactions for item ${plaidItemId}`);
        break;
      }
    }

    if (hasMore && result.pages >= MAX_SYNC_PAGES) {
      result.capped = true;
      console.warn(`Sync capped at ${MAX_SYNC_PAGES} pages for item ${plaidItemId}. More data available.`);
    }

    // Build account ID map (plaid_account_id → our UUID)
    const { data: accounts } = await finance(supabase)
      .from("plaid_accounts")
      .select("id, plaid_account_id")
      .eq("plaid_item_id", plaidItemId);

    const accountMap = new Map((accounts || []).map((a) => [a.plaid_account_id, a.id]));

    // Fetch merchant rules for auto-classification (limit to 500 most-used)
    const { data: rules } = await finance(supabase)
      .from("merchant_rules")
      .select("merchant_pattern, category_id")
      .order("match_count", { ascending: false })
      .limit(500);

    // Fetch Plaid category mappings
    const { data: categories } = await supabase.schema("config")
      .from("expense_categories")
      .select("id, plaid_category_mapping")
      .not("plaid_category_mapping", "is", null);

    // Process added transactions — BATCH upsert (not one-by-one)
    if (allAdded.length > 0) {
      const inserts = allAdded.map((tx) => {
        const categoryId = classifyTransaction(tx, rules || [], categories || []);
        return {
          user_id: userId,
          plaid_transaction_id: tx.transaction_id,
          plaid_account_id: accountMap.get(tx.account_id) || null,
          amount: Math.abs(tx.amount),
          description: tx.name,
          merchant_name: tx.merchant_name || tx.name,
          merchant_category: tx.personal_finance_category?.primary || null,
          transaction_date: tx.date,
          pending: tx.pending,
          source: "plaid",
          category_id: categoryId,
          reviewed: !!categoryId,
        };
      });

      // Batch upsert in chunks of 500 to avoid payload limits
      for (let i = 0; i < inserts.length; i += 500) {
        const chunk = inserts.slice(i, i + 500);
        await finance(supabase)
          .from("transactions")
          .upsert(chunk, { onConflict: "plaid_transaction_id" });
      }
      result.added = allAdded.length;
    }

    // Process modified transactions — batch update in chunks
    if (allModified.length > 0) {
      for (let i = 0; i < allModified.length; i += 500) {
        const chunk = allModified.slice(i, i + 500);
        for (const tx of chunk) {
          await finance(supabase)
            .from("transactions")
            .update({
              amount: Math.abs(tx.amount),
              description: tx.name,
              merchant_name: tx.merchant_name || tx.name,
              pending: tx.pending,
              transaction_date: tx.date,
              updated_at: new Date().toISOString(),
            })
            .eq("plaid_transaction_id", tx.transaction_id);
        }
      }
      result.modified = allModified.length;
    }

    // Process removed transactions — batch delete
    if (allRemoved.length > 0) {
      for (let i = 0; i < allRemoved.length; i += 500) {
        const chunk = allRemoved.slice(i, i + 500);
        await finance(supabase)
          .from("transactions")
          .delete()
          .in("plaid_transaction_id", chunk);
      }
      result.removed = allRemoved.length;
    }

    // Update cursor and last_synced_at (saves cursor even if capped — resumes next sync)
    await finance(supabase)
      .from("plaid_items")
      .update({
        cursor,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", plaidItemId);

    return result;
  } catch (err) {
    console.error("Transaction sync error:", err);
    return { ...result, error: "Sync failed — will retry on next webhook" };
  }
}

interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  amount: number;
  name: string;
  merchant_name?: string;
  date: string;
  pending: boolean;
  personal_finance_category?: { primary: string; detailed: string };
}

// Safe merchant pattern matching — no regex, simple string operations only
function classifyTransaction(
  tx: PlaidTransaction,
  rules: { merchant_pattern: string; category_id: string }[],
  categories: { id: string; plaid_category_mapping: Record<string, unknown> }[],
): string | null {
  const merchantName = (tx.merchant_name || tx.name || "").toUpperCase();

  // 1. Check merchant rules first (user-confirmed patterns)
  // Uses simple string matching instead of regex to prevent ReDoS
  for (const rule of rules) {
    const pattern = rule.merchant_pattern.toUpperCase();
    if (pattern.endsWith("%") && pattern.startsWith("%")) {
      // %PATTERN% — contains match
      const core = pattern.slice(1, -1);
      if (core && merchantName.includes(core)) return rule.category_id;
    } else if (pattern.endsWith("%")) {
      // PATTERN% — starts with
      const prefix = pattern.slice(0, -1);
      if (prefix && merchantName.startsWith(prefix)) return rule.category_id;
    } else if (pattern.startsWith("%")) {
      // %PATTERN — ends with
      const suffix = pattern.slice(1);
      if (suffix && merchantName.endsWith(suffix)) return rule.category_id;
    } else {
      // Exact match
      if (merchantName === pattern) return rule.category_id;
    }
  }

  // 2. Fall back to Plaid category mapping
  if (tx.personal_finance_category?.primary) {
    const plaidPrimary = tx.personal_finance_category.primary;
    for (const cat of categories) {
      const mapping = cat.plaid_category_mapping;
      if (mapping && Array.isArray(mapping.plaid_categories)) {
        if (mapping.plaid_categories.includes(plaidPrimary)) {
          return cat.id;
        }
      }
    }
  }

  return null;
}

export { syncTransactions, classifyTransaction, SYNC_COOLDOWN_MS };
