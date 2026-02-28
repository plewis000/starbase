// ============================================================
// FILE: app/api/ai/suggestions/[id]/route.ts
// PURPOSE: Respond to an AI suggestion — accept, dismiss, snooze
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { isValidUUID, validateEnum, validateOptionalString } from "@/lib/validation";
import type { SuggestionStatus } from "@/lib/types";

const RESPONSE_ACTIONS: readonly SuggestionStatus[] = [
  "accepted", "dismissed", "snoozed",
] as const;

// PATCH /api/ai/suggestions/[id] — respond to a suggestion
export async function PATCH(
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

  // Verify the suggestion belongs to this user or their household
  const { data: suggestion } = await platform(supabase)
    .from("ai_suggestions")
    .select("user_id")
    .eq("id", id)
    .single();
  if (!suggestion) return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
  if (suggestion.user_id && suggestion.user_id !== user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();

  const actionCheck = validateEnum(body.action, "action", RESPONSE_ACTIONS);
  if (!actionCheck.valid) return NextResponse.json({ error: actionCheck.error }, { status: 400 });

  const feedbackCheck = validateOptionalString(body.feedback, "feedback", 1000);
  if (!feedbackCheck.valid) return NextResponse.json({ error: feedbackCheck.error }, { status: 400 });

  const updateFields: Record<string, unknown> = {
    status: actionCheck.value,
    responded_at: new Date().toISOString(),
    user_feedback: feedbackCheck.value,
  };

  // If snoozed, set snooze duration
  if (actionCheck.value === "snoozed") {
    const snoozeDays = body.snooze_days || 3;
    const snoozeUntil = new Date();
    snoozeUntil.setDate(snoozeUntil.getDate() + snoozeDays);
    updateFields.snoozed_until = snoozeUntil.toISOString();
  }

  const { data: updated, error } = await platform(supabase)
    .from("ai_suggestions")
    .update(updateFields)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ suggestion: updated });
}
