import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api/withAuth";
import { finance } from "@/lib/supabase/schemas";

// PATCH /api/finance/transactions/[id] — Update transaction (categorize, notes, exclude, review)
export const PATCH = withUser(async (request: NextRequest, { supabase, user }, params) => {
  const id = params?.id;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.category_id !== undefined) updates.category_id = body.category_id || null;
  if (body.notes !== undefined) updates.notes = typeof body.notes === "string" ? body.notes.trim() : null;
  if (body.reviewed !== undefined) updates.reviewed = body.reviewed;
  if (body.excluded !== undefined) updates.excluded = body.excluded;
  if (body.merchant_name !== undefined) updates.merchant_name = typeof body.merchant_name === "string" ? body.merchant_name.trim() : null;
  if (body.description !== undefined) updates.description = typeof body.description === "string" ? body.description.trim() : null;

  const { data: transaction, error } = await finance(supabase)
    .from("transactions")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) { console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  // If category was changed, auto-create/update a merchant rule
  if (body.category_id && transaction?.merchant_name) {
    const pattern = transaction.merchant_name.toUpperCase().replace(/\s*#\d+.*$/, "%"); // Strip store numbers
    const { data: existingRule } = await finance(supabase)
      .from("merchant_rules")
      .select("id")
      .eq("merchant_pattern", pattern)
      .single();

    if (existingRule) {
      await finance(supabase)
        .from("merchant_rules")
        .update({ category_id: body.category_id, confidence: "user_confirmed", updated_at: new Date().toISOString() })
        .eq("id", existingRule.id);
    } else {
      await finance(supabase)
        .from("merchant_rules")
        .insert({
          merchant_pattern: pattern,
          category_id: body.category_id,
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
