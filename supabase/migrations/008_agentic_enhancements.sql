-- ============================================================
-- Migration 008: Agentic Infrastructure Enhancements
-- - Add conversation summary column for context compression
-- - Add computed behavioral aggregates trigger function
-- ============================================================

-- Add summary column to agent_conversations for context compression
ALTER TABLE platform.agent_conversations
  ADD COLUMN IF NOT EXISTS summary text;

-- Add index for observation queries by type (agent memory recall)
CREATE INDEX IF NOT EXISTS idx_observations_user_type_active
  ON platform.ai_observations (user_id, observation_type)
  WHERE is_active = true;

-- Add index for observation queries by source layer
CREATE INDEX IF NOT EXISTS idx_observations_user_layer_active
  ON platform.ai_observations (user_id, source_layer)
  WHERE is_active = true;

-- Add index for suggestion queries
CREATE INDEX IF NOT EXISTS idx_suggestions_user_status
  ON platform.ai_suggestions (user_id, status);

-- Add index for behavioral aggregates queries
CREATE INDEX IF NOT EXISTS idx_behavioral_aggregates_user_date
  ON platform.behavioral_aggregates (user_id, date DESC);

-- Function to compute daily behavioral aggregates for a user
CREATE OR REPLACE FUNCTION platform.compute_daily_aggregate(
  p_user_id uuid,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tasks_created int;
  v_tasks_completed int;
  v_habits_checked int;
  v_habits_missed int;
  v_xp_earned int;
  v_level_at int;
  v_achievements int;
  v_session_count int;
  v_peak_hour int;
BEGIN
  -- Tasks created today
  SELECT count(*) INTO v_tasks_created
  FROM platform.tasks
  WHERE created_by = p_user_id
    AND created_at::date = p_date;

  -- Tasks completed today
  SELECT count(*) INTO v_tasks_completed
  FROM platform.tasks
  WHERE (assigned_to = p_user_id OR created_by = p_user_id)
    AND completed_at::date = p_date;

  -- Habits checked today
  SELECT count(*) INTO v_habits_checked
  FROM platform.habit_check_ins
  WHERE user_id = p_user_id
    AND check_date = p_date;

  -- Habits missed (active habits not checked)
  SELECT count(*) INTO v_habits_missed
  FROM platform.habits h
  WHERE h.owner_id = p_user_id
    AND h.status = 'active'
    AND h.started_on <= p_date
    AND NOT EXISTS (
      SELECT 1 FROM platform.habit_check_ins hci
      WHERE hci.habit_id = h.id
        AND hci.check_date = p_date
    );

  -- XP earned today
  SELECT COALESCE(sum(amount), 0) INTO v_xp_earned
  FROM platform.xp_ledger
  WHERE user_id = p_user_id
    AND created_at::date = p_date;

  -- Current level
  SELECT COALESCE(current_level, 1) INTO v_level_at
  FROM platform.crawler_profiles
  WHERE user_id = p_user_id;

  -- Achievements unlocked today
  SELECT count(*) INTO v_achievements
  FROM platform.user_achievements
  WHERE user_id = p_user_id
    AND unlocked_at::date = p_date;

  -- Session count (agent conversations started today)
  SELECT count(*) INTO v_session_count
  FROM platform.agent_conversations
  WHERE user_id = p_user_id
    AND started_at::date = p_date;

  -- Peak activity hour
  SELECT EXTRACT(hour FROM created_at)::int INTO v_peak_hour
  FROM platform.engagement_events
  WHERE user_id = p_user_id
    AND created_at::date = p_date
  GROUP BY EXTRACT(hour FROM created_at)
  ORDER BY count(*) DESC
  LIMIT 1;

  -- Upsert the aggregate
  INSERT INTO platform.behavioral_aggregates (
    user_id, date,
    tasks_created, tasks_completed,
    habits_checked, habits_missed,
    xp_earned, level_at, achievements_unlocked,
    session_count, peak_activity_hour
  ) VALUES (
    p_user_id, p_date,
    v_tasks_created, v_tasks_completed,
    v_habits_checked, v_habits_missed,
    v_xp_earned, v_level_at, v_achievements,
    v_session_count, v_peak_hour
  )
  ON CONFLICT (user_id, date) DO UPDATE SET
    tasks_created = EXCLUDED.tasks_created,
    tasks_completed = EXCLUDED.tasks_completed,
    habits_checked = EXCLUDED.habits_checked,
    habits_missed = EXCLUDED.habits_missed,
    xp_earned = EXCLUDED.xp_earned,
    level_at = EXCLUDED.level_at,
    achievements_unlocked = EXCLUDED.achievements_unlocked,
    session_count = EXCLUDED.session_count,
    peak_activity_hour = EXCLUDED.peak_activity_hour;
END;
$$;
