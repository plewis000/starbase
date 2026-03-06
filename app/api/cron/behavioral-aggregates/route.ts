import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { platform } from "@/lib/supabase/schemas";

/**
 * CRON: Compute daily behavioral aggregates for all active users.
 * Runs daily at 3 AM UTC (10 PM CT).
 * Calls the platform.compute_daily_aggregate() function for yesterday's data.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Get all active users
  const { data: users, error: usersErr } = await platform(supabase)
    .from("users")
    .select("id")
    .eq("status", "active");

  if (usersErr || !users) {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }

  // Compute for yesterday (cron runs after midnight)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10);

  let computed = 0;
  const errors: string[] = [];

  for (const user of users) {
    try {
      const { error } = await supabase.rpc("compute_daily_aggregate", {
        p_user_id: user.id,
        p_date: dateStr,
      });
      if (error) {
        errors.push(`${user.id}: ${error.message}`);
      } else {
        computed++;
      }
    } catch (err) {
      errors.push(`${user.id}: ${err}`);
    }
  }

  return NextResponse.json({
    computed,
    total_users: users.length,
    date: dateStr,
    errors: errors.length > 0 ? errors : undefined,
  });
}
