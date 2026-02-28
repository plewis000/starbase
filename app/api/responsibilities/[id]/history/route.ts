// ============================================================
// FILE: app/api/responsibilities/[id]/history/route.ts
// PURPOSE: Responsibility ownership history — full audit trail
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext } from "@/lib/household";
import { isValidUUID, validatePagination } from "@/lib/validation";

// GET /api/responsibilities/[id]/history — paginated history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) {
    return NextResponse.json({ error: "No household found" }, { status: 404 });
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    history: history || [],
    total: count || 0,
  });
}
