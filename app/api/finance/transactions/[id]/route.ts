import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api/withAuth";
import { finance } from "@/lib/supabase/schemas";
import { parseBody, updateTransactionSchema } from "@/lib/schemas";

// PATCH /api/finance/transactions/[id] — Update transaction (categorize, notes, exclude, review)
export const PATCH = withUser(async (request: NextRequest, { supabase, user }, params) => {
  const id = params?.id;
  const parsed = await parseBody(request, updateTransactionSchema);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const data = parsed.data;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (data.category_id !== undefined) updates.category_id = data.category_id || null;
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.reviewed !== undefined) updates.reviewed = data.reviewed;
  if (data.excluded !== undefined) updates.excluded = data.excluded;
  if (data.merchant_name !== undefined) updates.merchant_name = data.merchant_name;
  if (data.description !== undefined) updates.description = data.description;

  const { data: transaction, error } = await finance(supabase)
    .from("transactions")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) { console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  // If category was changed, auto-create/update a merchant rule
  if (data.category_id && transaction?.merchant_name) {
    const pattern = transaction.merchant_name.toUpperCase().replace(/\s*#\d+.*$/, "%"); // Strip store numbers
    const { data: existingRule } = await finance(supabase)
      .from("merchant_rules")
      .select("id")
      .eq("merchant_pattern", pattern)
      .single();

    if (existingRule) {
      await finance(supabase)
        .from("merchant_rules")
        .update({ category_id: data.category_id, confidence: "user_confirmed", updated_at: new Date().toISOString() })
        .eq("id", existingRule.id);
    } else {
      await finance(supabase)
        .from("merchant_rules")
        .insert({
          merchant_pattern: pattern,
          category_id: data.category_id,
          created_by: user.id,
          confidence: "user_confirmed",
        });
    }
  }

  return NextResponse.json({ transaction });
});

// DELETE /api/finance/transactions/[id] — Delete a manual transaction
export const DELETE = withUser(async (_request: NextRequest, { supabase, user }, params) => {
  const id = params?.id;

  // Only allow deleting manual transactions
  const { data: tx } = await finance(supabase)
    .from("transactions")
    .select("source")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  if (tx.source !== "manual") {
    return NextResponse.json({ error: "Cannot delete Plaid-synced transactions" }, { status: 400 });
  }

  const { error } = await finance(supabase)
    .from("transactions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) { console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  return NextResponse.json({ success: true });
});
