// ============================================================
// FILE: app/api/responsibilities/templates/route.ts
// PURPOSE: Responsibility templates — pre-built household tasks
//          Used during onboarding to help users pick responsibilities
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { config } from "@/lib/supabase/schemas";

// GET /api/responsibilities/templates — list all templates, optionally filtered by category
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const category = request.nextUrl.searchParams.get("category");

  let query = config(supabase)
    .from("responsibility_templates")
    .select("*")
    .order("sort_order");

  if (category) {
    query = query.eq("category", category);
  }

  const { data: templates, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ templates: templates || [] });
}
