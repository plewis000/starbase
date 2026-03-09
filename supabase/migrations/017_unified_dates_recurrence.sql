-- 017: Unified Task System — Date, Recurrence, Habits
-- Adds start_date, recurrence_mode, is_habit, streak fields, and task_completions table.

-- Add start_date (replaces schedule_date semantically)
ALTER TABLE platform.tasks ADD COLUMN IF NOT EXISTS start_date DATE;
UPDATE platform.tasks SET start_date = schedule_date
  WHERE schedule_date IS NOT NULL AND start_date IS NULL;

-- Add recurrence_mode: fixed (from due_date) or flexible (from completion)
ALTER TABLE platform.tasks ADD COLUMN IF NOT EXISTS recurrence_mode TEXT DEFAULT 'fixed'
  CHECK (recurrence_mode IN ('fixed', 'flexible'));

-- Mark existing recurring tasks as 'fixed' (current behavior intent)
UPDATE platform.tasks SET recurrence_mode = 'fixed' WHERE recurrence_rule IS NOT NULL;

-- Add is_habit flag for unified habit tasks
ALTER TABLE platform.tasks ADD COLUMN IF NOT EXISTS is_habit BOOLEAN DEFAULT FALSE;

-- Habit-specific streak fields (denormalized for fast reads)
ALTER TABLE platform.tasks
  ADD COLUMN IF NOT EXISTS streak_current INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_longest INT DEFAULT 0;

-- Task completions table (replaces habit_check_ins for unified tasks, adds history for all tasks)
CREATE TABLE IF NOT EXISTS platform.task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES platform.tasks(id) ON DELETE CASCADE,
  recurrence_source_id UUID,
  completed_by UUID NOT NULL REFERENCES auth.users(id),
  completed_date DATE NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  mood TEXT CHECK (mood IN ('great','good','neutral','tough','terrible')),
  value NUMERIC,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, completed_by, completed_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_task_completions_task ON platform.task_completions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_date ON platform.task_completions(completed_date);
CREATE INDEX IF NOT EXISTS idx_tasks_start_date ON platform.tasks(start_date);
CREATE INDEX IF NOT EXISTS idx_tasks_is_habit ON platform.tasks(is_habit) WHERE is_habit = TRUE;

-- RLS: same open policy as other platform tables (app-level scoping)
ALTER TABLE platform.task_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tc_select" ON platform.task_completions FOR SELECT USING (TRUE);
CREATE POLICY "tc_insert" ON platform.task_completions FOR INSERT WITH CHECK (completed_by = auth.uid());
CREATE POLICY "tc_delete" ON platform.task_completions FOR DELETE USING (completed_by = auth.uid());
