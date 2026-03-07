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
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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

  // Observation decay: reduce confidence of old inferred/observed observations
  // Observations older than 60 days with no updates lose 5% confidence per run
  // Observations below 0.15 confidence get deactivated
  let decayed = 0;
  let expired = 0;
  try {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // Deactivate very low confidence observations
    const { data: expiredObs } = await platform(supabase)
      .from("ai_observations")
      .update({ is_active: false })
      .eq("is_active", true)
      .lt("confidence", 0.15)
      .in("source_layer", ["observed", "inferred"])
      .select("id");
    expired = expiredObs?.length || 0;

    // Decay confidence for stale non-declared observations
    const { data: staleObs } = await platform(supabase)
      .from("ai_observations")
      .select("id, confidence")
      .eq("is_active", true)
      .in("source_layer", ["observed", "inferred"])
      .lt("created_at", sixtyDaysAgo.toISOString())
      .gt("confidence", 0.15);

    if (staleObs && staleObs.length > 0) {
      for (const obs of staleObs) {
        const newConf = Math.round((obs.confidence * 0.95) * 100) / 100;
        await platform(supabase)
          .from("ai_observations")
          .update({ confidence: newConf })
          .eq("id", obs.id);
        decayed++;
      }
    }
  } catch (err) {
    errors.push(`observation decay: ${err}`);
  }

  return NextResponse.json({
    computed,
    total_users: users.length,
    date: dateStr,
    observation_decay: { decayed, expired },
    errors: errors.length > 0 ? errors : undefined,
  });
}
