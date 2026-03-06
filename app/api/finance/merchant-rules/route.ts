import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api/withAuth";
import { finance, config } from "@/lib/supabase/schemas";
import { parseBody, createMerchantRuleSchema } from "@/lib/schemas";

// GET /api/finance/merchant-rules — List all merchant classification rules
export const GET = withUser(async (_request: NextRequest, { supabase, user }) => {
  const { data: rules, error } = await finance(supabase)
    .from("merchant_rules")
    .select("*")
    .eq("created_by", user.id)
    .order("match_count", { ascending: false })
    .limit(500);

  if (error) { console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  // Enrich with category names
  const { data: categories } = await config(supabase)
    .from("expense_categories")
    .select("id, name, slug, display_color, icon")
    .eq("active", true);

  const categoryMap = new Map((categories || []).map((c) => [c.id, c]));

  const enriched = (rules || []).map((r) => ({
    ...r,
    category: categoryMap.get(r.category_id) || null,
  }));

  return NextResponse.json({ rules: enriched });
});

// POST /api/finance/merchant-rules — Create a merchant classification rule
export const POST = withUser(async (request: NextRequest, { supabase, user }) => {
  const parsed = await parseBody(request, createMerchantRuleSchema);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const data = parsed.data;

  const { data: rule, error } = await finance(supabase)
    .from("merchant_rules")
    .insert({
      merchant_pattern: data.merchant_pattern.toUpperCase(),
      category_id: data.category_id,
      created_by: user.id,
      confidence: "user_confirmed",
    })
    .select("*")
    .single();

  if (error) { console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  return NextResponse.json({ rule }, { status: 201 });
});
