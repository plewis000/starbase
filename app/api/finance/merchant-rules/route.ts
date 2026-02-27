import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { finance, config } from "@/lib/supabase/schemas";

// GET /api/finance/merchant-rules — List all merchant classification rules
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: rules, error } = await finance(supabase)
    .from("merchant_rules")
    .select("*")
    .order("match_count", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
}

// POST /api/finance/merchant-rules — Create a merchant classification rule
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { merchant_pattern, category_id } = body;

  if (!merchant_pattern || typeof merchant_pattern !== "string" || !merchant_pattern.trim()) {
    return NextResponse.json({ error: "merchant_pattern is required" }, { status: 400 });
  }
  if (!category_id) {
    return NextResponse.json({ error: "category_id is required" }, { status: 400 });
  }

  const { data: rule, error } = await finance(supabase)
    .from("merchant_rules")
    .insert({
      merchant_pattern: merchant_pattern.trim().toUpperCase(),
      category_id,
      created_by: user.id,
      confidence: "user_confirmed",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rule }, { status: 201 });
}
