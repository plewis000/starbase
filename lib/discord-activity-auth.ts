// Discord Activity auth layer
// Verifies Discord bearer token → resolves Supabase user → returns service client with context

import { createServiceClient } from "@/lib/supabase/service";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext, getHouseholdMemberIds } from "@/lib/household";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActivityContext {
  supabase: SupabaseClient;
  userId: string;
  householdId: string;
  memberIds: string[];
  discordUserId: string;
}

// Verify Discord access token and resolve to app user
export async function authenticateActivity(
  authHeader: string | null
): Promise<ActivityContext | { error: string; status: number }> {
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Missing or invalid Authorization header", status: 401 };
  }

  const accessToken = authHeader.slice(7);

  // Verify token with Discord API — get the Discord user
  const discordRes = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!discordRes.ok) {
    return { error: "Invalid Discord token", status: 401 };
  }

  const discordUser = await discordRes.json();
  const discordUserId: string = discordUser.id;

  // Resolve Discord user to Supabase user via user_preferences
  const supabase = createServiceClient();
  const { data: pref } = await platform(supabase)
    .from("user_preferences")
    .select("user_id")
    .eq("preference_key", "discord_user_id")
    .eq("preference_value", JSON.stringify(discordUserId))
    .single();

  if (!pref) {
    return {
      error: "Discord account not linked. Use /link in Discord first.",
      status: 403,
    };
  }

  const userId = pref.user_id;

  // Get household context
  const ctx = await getHouseholdContext(supabase, userId);
  if (!ctx) {
    return { error: "No household found", status: 404 };
  }

  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);

  return {
    supabase,
    userId,
    householdId: ctx.household_id,
    memberIds,
    discordUserId,
  };
}
