import { NextResponse, after } from "next/server";
import { withUser } from "@/lib/api/withAuth";

/**
 * GET /api/user — returns the authenticated user's profile
 *
 * Response: { id, email, full_name, avatar_url }
 */
export const GET = withUser(async (_request, { supabase, user }) => {
  // Background: ensure gamification profile exists + track login (P024: use after() for serverless)
  after(async () => {
    try {
      const { ensureProfile, updateLoginStreak, awardXp } = await import("@/lib/gamification");
      await ensureProfile(supabase, user.id);
      const { isNew } = await updateLoginStreak(supabase, user.id);
      if (isNew) {
        await awardXp(supabase, user.id, 5, "daily_login", "Daily login bonus");
      }
    } catch { /* gamification is non-critical */ }
  });

  // Check integration statuses
  const hasDiscord = !!process.env.DISCORD_BOT_TOKEN && !!process.env.DISCORD_GUILD_ID;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;

  let plaidAccounts = 0;
  try {
    const { count } = await supabase.schema("finance")
      .from("plaid_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    plaidAccounts = count || 0;
  } catch { /* ignore */ }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
      avatar_url: user.user_metadata?.avatar_url || null,
    },
    integrations: {
      discord: { connected: hasDiscord },
      plaid: { connected: plaidAccounts > 0, accounts: plaidAccounts },
      anthropic: { connected: hasAnthropic },
    },
  });
});
