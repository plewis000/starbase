-- ============================================================
-- Migration 015: Completion Credit System
-- Tracks who clicked Done (completed_by) and who gets XP credit (credited_to)
-- Everyone in credited_to gets full XP — no splitting, no coop bonus
-- ============================================================

-- 1. Add completed_by column — who actually clicked Done
ALTER TABLE platform.tasks
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES auth.users(id);

-- 2. Add credited_to array — all users who receive XP credit (includes completer)
-- Replaces the old co_completers column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'platform' AND table_name = 'tasks' AND column_name = 'co_completers'
  ) THEN
    ALTER TABLE platform.tasks RENAME COLUMN co_completers TO credited_to;
  ELSE
    ALTER TABLE platform.tasks ADD COLUMN IF NOT EXISTS credited_to UUID[] DEFAULT '{}';
  END IF;
END $$;

-- 3. Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_tasks_completed_by
  ON platform.tasks (completed_by)
  WHERE completed_at IS NOT NULL;

-- Drop old index if it exists, create new one
DROP INDEX IF EXISTS platform.idx_tasks_co_completers;

CREATE INDEX IF NOT EXISTS idx_tasks_credited_to
  ON platform.tasks USING GIN (credited_to)
  WHERE completed_at IS NOT NULL;

-- 4. Backfill completed_by from activity_log (for tasks completed before this column existed)
DO $$
DECLARE
  v_done_status_id UUID;
BEGIN
  SELECT id INTO v_done_status_id
  FROM config.task_statuses
  WHERE name = 'Done'
  LIMIT 1;

  IF v_done_status_id IS NOT NULL THEN
    -- Primary: use activity_log to find who set status to Done
    UPDATE platform.tasks t
    SET completed_by = (
      SELECT al.performed_by
      FROM platform.activity_log al
      WHERE al.entity_type = 'task'
        AND al.entity_id = t.id
        AND al.field_name = 'status_id'
        AND al.new_value = v_done_status_id::text
      ORDER BY al.performed_at DESC
      LIMIT 1
    )
    WHERE t.completed_at IS NOT NULL
      AND t.completed_by IS NULL;

    -- Fallback: no activity_log match -> use assigned_to, then created_by
    UPDATE platform.tasks
    SET completed_by = COALESCE(assigned_to, created_by)
    WHERE completed_at IS NOT NULL
      AND completed_by IS NULL;
  END IF;

  -- Backfill credited_to = ARRAY[completed_by] where completed but credited_to is empty
  UPDATE platform.tasks
  SET credited_to = ARRAY[completed_by]
  WHERE completed_at IS NOT NULL
    AND completed_by IS NOT NULL
    AND (credited_to IS NULL OR credited_to = '{}');
END $$;

-- 5. Achievement trigger types (remove coop_task_count, keep all others)
ALTER TABLE config.achievements
  DROP CONSTRAINT IF EXISTS achievements_trigger_type_check;

ALTER TABLE config.achievements
  ADD CONSTRAINT achievements_trigger_type_check CHECK (trigger_type IN (
    'task_count', 'task_streak', 'habit_streak', 'habit_count',
    'goal_completed', 'budget_under', 'login_streak', 'xp_total',
    'level_reached', 'shopping_count', 'speed_complete', 'zero_overdue',
    'custom', 'party_task_streak', 'party_habit_sync', 'combo_streak'
  ));

-- 6. Update compute_daily_aggregate to use credited_to
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

  -- Tasks completed today (credited_to with legacy fallback)
  SELECT count(*) INTO v_tasks_completed
  FROM platform.tasks
  WHERE (
    completed_by = p_user_id
    OR p_user_id = ANY(credited_to)
    OR (completed_by IS NULL AND (assigned_to = p_user_id OR created_by = p_user_id))
  )
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

-- Grant execute to authenticated users (OS-P006)
GRANT EXECUTE ON FUNCTION platform.compute_daily_aggregate(uuid, date) TO authenticated;
