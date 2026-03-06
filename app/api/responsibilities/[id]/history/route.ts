// ============================================================
// FILE: app/api/responsibilities/[id]/history/route.ts
// PURPOSE: Responsibility ownership history — full audit trail
// PART OF: The Keep
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { isValidUUID, validatePagination } from "@/lib/validation";

// GET /api/responsibilities/[id]/history — paginated history
export const GET = withAuth(async (request: NextRequest, { supabase, ctx }, params) => {
  const id = params?.id;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  // Verify responsibility belongs to household
  const { data: responsibility } = await platform(supabase)
    .from("responsibilities")
    .select("id")
    .eq("id", id)
    .eq("household_id", ctx.household_id)
    .single();

  if (!responsibility) {
    return NextResponse.json({ error: "Responsibility not found" }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const { limit, offset } = validatePagination(
    searchParams.get("limit"),
    searchParams.get("offset")
  );

  const { data: history, error, count } = await platform(supabase)
    .from("responsibility_history")
    .select("*", { count: "exact" })
    .eq("responsibility_id", id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({
    history: history || [],
    total: count || 0,
  });
});
