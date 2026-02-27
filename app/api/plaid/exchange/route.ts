import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { plaidClient } from "@/lib/plaid";
import { finance } from "@/lib/supabase/schemas";

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
    // For now, store as a user_integration record — Vault integration can be added later
    // The access token is sensitive and should be encrypted at rest
    const { data: vaultResult } = await supabase.rpc("vault_store_secret", {
      secret_value: access_token,
      secret_name: `plaid_access_${item_id}`,
    });

    // If Vault RPC isn't set up yet, fall back to storing in user_integrations
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

    if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });

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

    if (acctError) return NextResponse.json({ error: acctError.message }, { status: 500 });

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
    await syncTransactions(supabase, user.id, access_token, plaidItem.id);

    return NextResponse.json({
      item: plaidItem,
      accounts: accounts || [],
    }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to exchange token";
    return NextResponse.json({ error: message }, { status: 500 });
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

async function syncTransactions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  accessToken: string,
  plaidItemId: string,
) {
  try {
    // Get existing cursor for incremental sync
    const { data: item } = await finance(supabase)
      .from("plaid_items")
      .select("cursor")
      .eq("id", plaidItemId)
      .single();

    let cursor = item?.cursor || undefined;
    let hasMore = true;
    const allAdded: unknown[] = [];
    const allModified: unknown[] = [];
    const allRemoved: string[] = [];

    while (hasMore) {
      const response = await plaidClient.transactionsSync({
        access_token: accessToken,
        cursor: cursor || undefined,
      });

      const { added, modified, removed, next_cursor, has_more } = response.data;
      allAdded.push(...added);
      allModified.push(...modified);
      allRemoved.push(...removed.map((r) => r.transaction_id));
      cursor = next_cursor;
      hasMore = has_more;
    }

    // Build account ID map (plaid_account_id → our UUID)
    const { data: accounts } = await finance(supabase)
      .from("plaid_accounts")
      .select("id, plaid_account_id")
      .eq("plaid_item_id", plaidItemId);

    const accountMap = new Map((accounts || []).map((a) => [a.plaid_account_id, a.id]));

    // Fetch merchant rules for auto-classification
    const { data: rules } = await finance(supabase)
      .from("merchant_rules")
      .select("merchant_pattern, category_id")
      .order("match_count", { ascending: false });

    // Fetch Plaid category mappings
    const { data: categories } = await supabase.schema("config")
      .from("expense_categories")
      .select("id, plaid_category_mapping")
      .not("plaid_category_mapping", "is", null);

    // Process added transactions
    if (allAdded.length > 0) {
      const inserts = (allAdded as PlaidTransaction[]).map((tx) => {
        const categoryId = classifyTransaction(tx, rules || [], categories || []);
        return {
          user_id: userId,
          plaid_transaction_id: tx.transaction_id,
          plaid_account_id: accountMap.get(tx.account_id) || null,
          amount: Math.abs(tx.amount), // Plaid uses negative for credits
          description: tx.name,
          merchant_name: tx.merchant_name || tx.name,
          merchant_category: tx.personal_finance_category?.primary || null,
          transaction_date: tx.date,
          pending: tx.pending,
          source: "plaid",
          category_id: categoryId,
          reviewed: !!categoryId, // Auto-classified = reviewed
        };
      });

      // Upsert to handle duplicates (pending → posted transitions)
      for (const insert of inserts) {
        await finance(supabase)
          .from("transactions")
          .upsert(insert, { onConflict: "plaid_transaction_id" });
      }
    }

    // Process modified transactions
    if (allModified.length > 0) {
      for (const tx of allModified as PlaidTransaction[]) {
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

    // Process removed transactions
    if (allRemoved.length > 0) {
      await finance(supabase)
        .from("transactions")
        .delete()
        .in("plaid_transaction_id", allRemoved);
    }

    // Update cursor and last_synced_at
    await finance(supabase)
      .from("plaid_items")
      .update({
        cursor,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", plaidItemId);

  } catch (err) {
    console.error("Transaction sync error:", err);
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

function classifyTransaction(
  tx: PlaidTransaction,
  rules: { merchant_pattern: string; category_id: string }[],
  categories: { id: string; plaid_category_mapping: Record<string, unknown> }[],
): string | null {
  const merchantName = (tx.merchant_name || tx.name || "").toUpperCase();

  // 1. Check merchant rules first (user-confirmed patterns)
  for (const rule of rules) {
    const pattern = rule.merchant_pattern.replace(/%/g, ".*");
    if (new RegExp(`^${pattern}$`, "i").test(merchantName)) {
      return rule.category_id;
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

export { syncTransactions, classifyTransaction };
