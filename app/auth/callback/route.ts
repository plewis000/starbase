import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile, updateLoginStreak, awardXp } from "@/lib/gamification";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Initialize gamification profile + track login streak (non-blocking)
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        (async () => {
          try {
            await ensureProfile(supabase, user.id);
            await updateLoginStreak(supabase, user.id);
            await awardXp(supabase, user.id, 5, "daily_login", "Daily login bonus");
          } catch (err) {
            console.error("Login gamification error:", err);
          }
        })();
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth failed — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
