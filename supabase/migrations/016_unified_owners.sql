-- ============================================================
-- Migration 016: Unified Multi-Owner Model
-- Replaces assigned_to (single UUID) + metadata.additional_owners (JSON array)
-- with a single owner_ids UUID[] column.
-- ============================================================

-- 1. Add owner_ids column
ALTER TABLE platform.tasks
  ADD COLUMN IF NOT EXISTS owner_ids UUID[] DEFAULT '{}';

-- 2. Backfill: merge assigned_to + metadata->'additional_owners' into owner_ids
DO $$
DECLARE
  r RECORD;
  v_owners UUID[];
  v_additional UUID[];
BEGIN
  FOR r IN
    SELECT id, assigned_to, metadata
    FROM platform.tasks
    WHERE owner_ids = '{}' OR owner_ids IS NULL
  LOOP
    v_owners := '{}';

    -- Start with assigned_to if present
    IF r.assigned_to IS NOT NULL THEN
      v_owners := ARRAY[r.assigned_to];
    END IF;

    -- Append additional_owners from metadata JSON
    IF r.metadata IS NOT NULL AND r.metadata ? 'additional_owners' THEN
      SELECT COALESCE(array_agg(elem::uuid), '{}')
      INTO v_additional
      FROM jsonb_array_elements_text(r.metadata->'additional_owners') AS elem;

      -- Merge without duplicates
      SELECT COALESCE(array_agg(DISTINCT u), '{}')
      INTO v_owners
      FROM unnest(v_owners || v_additional) AS u;
    END IF;

    -- Update if we found any owners
    IF array_length(v_owners, 1) > 0 THEN
      UPDATE platform.tasks
      SET owner_ids = v_owners
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- 3. Create GIN index on owner_ids for array contains queries
CREATE INDEX IF NOT EXISTS idx_tasks_owner_ids
  ON platform.tasks USING GIN (owner_ids);

-- 4. Update compute_daily_aggregate: replace assigned_to fallback with owner_ids
CREATE OR REPLACE FUNCTION platform.compute_daily_aggregate(
  p_user_id uuid,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
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

  -- Tasks completed today (credited_to, completed_by, or owner_ids fallback)
  SELECT count(*) INTO v_tasks_completed
  FROM platform.tasks
  WHERE (
    completed_by = p_user_id
    OR p_user_id = ANY(credited_to)
    OR (completed_by IS NULL AND p_user_id = ANY(owner_ids))
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
  FROM platform.achievement_unlocks
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
$fn$;

-- 5. Keep assigned_to synced as owner_ids[1] via trigger
-- This preserves backward compat for any missed references
CREATE OR REPLACE FUNCTION platform.sync_assigned_to_from_owner_ids()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- Only sync if owner_ids was actually changed
  IF NEW.owner_ids IS DISTINCT FROM OLD.owner_ids THEN
    NEW.assigned_to := CASE
      WHEN array_length(NEW.owner_ids, 1) > 0 THEN NEW.owner_ids[1]
      ELSE NULL
    END;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sync_assigned_to ON platform.tasks;
CREATE TRIGGER trg_sync_assigned_to
  BEFORE UPDATE ON platform.tasks
  FOR EACH ROW
  EXECUTE FUNCTION platform.sync_assigned_to_from_owner_ids();

-- Grant execute
GRANT EXECUTE ON FUNCTION platform.compute_daily_aggregate(uuid, date) TO authenticated;
