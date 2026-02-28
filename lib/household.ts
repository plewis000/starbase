// ============================================================
// FILE: lib/household.ts
// PURPOSE: Shared household lookup helper — resolves current user's
//          household_id for any route that needs household-scoped data
// PART OF: Desperado Club
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";
import { platform } from "@/lib/supabase/schemas";

export interface HouseholdContext {
  household_id: string;
  role: string;
  user_id: string;
}

// Resolve the current user's household membership.
// Returns null if user has no household — callers should return 404 or prompt onboarding.
export async function getHouseholdContext(
  supabase: SupabaseClient,
  userId: string
): Promise<HouseholdContext | null> {
  const { data: membership } = await platform(supabase)
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", userId)
    .single();

  if (!membership) return null;

  return {
    household_id: membership.household_id,
    role: membership.role,
    user_id: userId,
  };
}

// Get all user IDs belonging to a household.
// Used for scoping queries to household members.
export async function getHouseholdMemberIds(
  supabase: SupabaseClient,
  householdId: string
): Promise<string[]> {
  const { data: members } = await platform(supabase)
    .from("household_members")
    .select("user_id")
    .eq("household_id", householdId);

  return (members || []).map((m) => m.user_id);
}

// Verify a task belongs to the user's household (created_by is a household member).
// Returns the task if access is allowed, null otherwise.
export async function verifyTaskHouseholdAccess(
  supabase: SupabaseClient,
  taskId: string,
  householdMemberIds: string[]
): Promise<boolean> {
  const { data: task } = await platform(supabase)
    .from("tasks")
    .select("created_by")
    .eq("id", taskId)
    .single();

  if (!task) return false;
  return householdMemberIds.includes(task.created_by);
}

// Require household context or return 404 response.
// Convenience wrapper used by most routes.
export function requireHousehold(ctx: HouseholdContext | null) {
  if (!ctx) {
    return { error: "No household found", status: 404 as const };
  }
  return null;
}
