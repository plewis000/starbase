import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api/withAuth";
import { finance } from "@/lib/supabase/schemas";
import { parseBody, splitTransactionSchema } from "@/lib/schemas";

// POST /api/finance/transactions/[id]/split — Split a transaction into categories
export const POST = withUser(async (request: NextRequest, { supabase, user }, params) => {
  const id = params?.id;
  const parsed = await parseBody(request, splitTransactionSchema);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { splits } = parsed.data;

  // Fetch the parent transaction
  const { data: parent, error: fetchError } = await finance(supabase)
    .from("transactions")
    .select("id, amount, user_id, is_split_parent")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !parent) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  if (parent.is_split_parent) {
    return NextResponse.json({ error: "Transaction is already split. Delete existing splits first." }, { status: 400 });
  }

  // Validate splits sum to parent amount
  const splitTotal = splits.reduce((sum, s) => sum + s.amount, 0);
  const parentAmount = Math.abs(Number(parent.amount));
  const tolerance = 0.01;

  if (Math.abs(splitTotal - parentAmount) > tolerance) {
    return NextResponse.json({
      error: `Splits total ${splitTotal.toFixed(2)} does not match transaction amount ${parentAmount.toFixed(2)}`,
    }, { status: 400 });
  }

  // Create the splits
  const inserts = splits.map((s) => ({
    parent_transaction_id: id,
    amount: s.amount,
    category_id: s.category_id,
    description: s.description ?? null,
  }));

  const { data: createdSplits, error: insertError } = await finance(supabase)
    .from("transaction_splits")
    .insert(inserts)
    .select("*");

  if (insertError) { console.error(insertError.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  // Mark parent as split
  await finance(supabase)
    .from("transactions")
    .update({
      is_split_parent: true,
      original_amount: parent.amount,
      reviewed: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json({ splits: createdSplits }, { status: 201 });
});

// DELETE /api/finance/transactions/[id]/split — Remove all splits (unsplit)
export const DELETE = withUser(async (_request: NextRequest, { supabase, user }, params) => {
  const id = params?.id;

  // Verify parent transaction belongs to the user before touching splits
  const { data: parent } = await finance(supabase)
    .from("transactions")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!parent) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  // Delete all splits
  const { error: deleteError } = await finance(supabase)
    .from("transaction_splits")
    .delete()
    .eq("parent_transaction_id", id);

  if (deleteError) { console.error(deleteError.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  // Unmark parent
  await finance(supabase)
    .from("transactions")
    .update({
      is_split_parent: false,
      reviewed: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);

  return NextResponse.json({ success: true });
});
