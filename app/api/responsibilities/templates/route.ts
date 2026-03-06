// ============================================================
// FILE: app/api/responsibilities/templates/route.ts
// PURPOSE: Responsibility templates — pre-built household tasks
//          Used during onboarding to help users pick responsibilities
// PART OF: The Keep
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { config } from "@/lib/supabase/schemas";

// GET /api/responsibilities/templates — list all templates, optionally filtered by category
export const GET = withAuth(async (request: NextRequest, { supabase }) => {
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
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ templates: templates || [] });
});
