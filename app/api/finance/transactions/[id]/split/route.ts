import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { finance } from "@/lib/supabase/schemas";

// POST /api/finance/transactions/[id]/split — Split a transaction into categories
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { splits } = body;
  if (!Array.isArray(splits) || splits.length < 2) {
    return NextResponse.json({ error: "Must provide at least 2 splits" }, { status: 400 });
  }

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
  const splitTotal = splits.reduce((sum: number, s: { amount: number }) => sum + Number(s.amount), 0);
  const parentAmount = Math.abs(Number(parent.amount));
  const tolerance = 0.01;

  if (Math.abs(splitTotal - parentAmount) > tolerance) {
    return NextResponse.json({
      error: `Splits total ${splitTotal.toFixed(2)} does not match transaction amount ${parentAmount.toFixed(2)}`,
    }, { status: 400 });
  }

  // Validate each split has amount and category
  for (const split of splits) {
    if (!split.amount || Number(split.amount) <= 0) {
      return NextResponse.json({ error: "Each split must have a positive amount" }, { status: 400 });
    }
    if (!split.category_id) {
      return NextResponse.json({ error: "Each split must have a category_id" }, { status: 400 });
    }
  }

  // Create the splits
  const inserts = splits.map((s: { amount: number; category_id: string; description?: string }) => ({
    parent_transaction_id: id,
    amount: Number(s.amount),
    category_id: s.category_id,
    description: typeof s.description === "string" ? s.description.trim() : null,
  }));

  const { data: createdSplits, error: insertError } = await finance(supabase)
    .from("transaction_splits")
    .insert(inserts)
    .select("*");

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

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
}

// DELETE /api/finance/transactions/[id]/split — Remove all splits (unsplit)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Delete all splits
  const { error: deleteError } = await finance(supabase)
    .from("transaction_splits")
    .delete()
    .eq("parent_transaction_id", id);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

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
}
