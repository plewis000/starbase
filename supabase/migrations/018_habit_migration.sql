-- =============================================================
-- STARBASE — 018: Habit Migration (Unified Task System Phase 3)
--
-- Habits are now tasks with is_habit=true. This migration:
-- 1. Would migrate habit data → tasks (0 habits in production, no data to move)
-- 2. Documents the mapping for future reference
-- 3. Adds any missing structural pieces
--
-- Field mapping (habits → tasks):
--   habits.owner_id        → tasks.owner_ids[1]
--   habits.status           → active=not completed, retired=completed_at set
--   habits.current_streak   → tasks.streak_current
--   habits.longest_streak   → tasks.streak_longest
--   habits.frequency_id     → tasks.recurrence_rule (RRULE string)
--   habits.started_on       → tasks.start_date
--   habits.total_completions → COUNT(task_completions)
--   habit_check_ins.*       → task_completions.*
--   goal_habits.habit_id    → goal_tasks.task_id
-- =============================================================

-- If habits existed, we would migrate them like this:
-- INSERT INTO platform.tasks (title, description, is_habit, recurrence_mode, ...)
--   SELECT title, description, true, 'flexible', ...
--   FROM platform.habits WHERE status IN ('active', 'paused');

-- Since 0 habits exist in production, no data migration needed.
-- The old habits/habit_check_ins tables remain for reference but are no longer written to.
-- All new habit operations go through tasks + task_completions.

-- Add weight column to goal_tasks for habit-driven goal progress calculation
ALTER TABLE platform.goal_tasks
  ADD COLUMN IF NOT EXISTS weight NUMERIC NOT NULL DEFAULT 1.0;
