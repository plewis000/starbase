-- =============================================================
-- STARBASE — Phase 2A: Goals & Habits Engine
-- Merged system: Goals = outcomes, Habits = behaviors
-- Two views: Outcome View (goals with progress) + Behavior View (habits with streaks)
-- =============================================================

-- =============================================================
-- CONFIG TABLES
-- =============================================================

-- Goal categories (Health, Career, Financial, Personal Growth, Relationships, etc.)
CREATE TABLE config.goal_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  description   TEXT,
  display_color TEXT,
  icon          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB
);

-- Goal timeframes (Annual, Quarterly, Monthly, Open-ended)
CREATE TABLE config.goal_timeframes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  typical_days  INTEGER, -- null for open-ended
  display_color TEXT,
  icon          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB
);

-- Habit frequencies (Daily, Weekdays, X times per week, X times per month)
CREATE TABLE config.habit_frequencies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  description   TEXT,
  target_type   TEXT NOT NULL CHECK (target_type IN ('daily', 'weekly', 'monthly')),
  default_target INTEGER NOT NULL DEFAULT 1, -- e.g., 3 for "3x per week"
  display_color TEXT,
  icon          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB
);

-- Habit time-of-day preferences (Morning, Afternoon, Evening, Anytime)
CREATE TABLE config.habit_time_preferences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  display_color TEXT,
  icon          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB
);

-- =============================================================
-- PLATFORM TABLES — GOALS
-- =============================================================

-- Goals: outcomes you want to achieve ("Run a 5K by June")
CREATE TABLE platform.goals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  description       TEXT,

  -- Classification
  category_id       UUID REFERENCES config.goal_categories(id),
  timeframe_id      UUID REFERENCES config.goal_timeframes(id),

  -- Ownership
  owner_id          UUID NOT NULL REFERENCES auth.users(id),

  -- Timeline
  start_date        DATE,
  target_date       DATE,
  completed_at      TIMESTAMPTZ,

  -- Progress tracking
  progress_type     TEXT NOT NULL DEFAULT 'manual' CHECK (progress_type IN (
    'manual',           -- user updates progress % directly
    'milestone',        -- progress = completed milestones / total milestones
    'habit_driven',     -- progress = linked habit consistency
    'task_driven'       -- progress = completed linked tasks / total linked tasks
  )),
  progress_value    INTEGER NOT NULL DEFAULT 0 CHECK (progress_value >= 0 AND progress_value <= 100),
  target_value      NUMERIC,       -- for measurable goals (e.g., "run 5K" → 5.0)
  current_value     NUMERIC,       -- current measurement
  unit              TEXT,          -- e.g., "km", "lbs", "dollars", "books"

  -- Status
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'completed', 'abandoned', 'paused'
  )),

  -- Hierarchy
  parent_goal_id    UUID REFERENCES platform.goals(id),

  -- Standard fields
  source            TEXT NOT NULL DEFAULT 'manual',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata          JSONB
);

-- Goal milestones (sub-achievements within a goal)
CREATE TABLE platform.goal_milestones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id       UUID NOT NULL REFERENCES platform.goals(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  target_date   DATE,
  completed_at  TIMESTAMPTZ,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB
);

-- =============================================================
-- PLATFORM TABLES — HABITS
-- =============================================================

-- Habits: behaviors you want to maintain ("Run 3x per week")
CREATE TABLE platform.habits (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 TEXT NOT NULL,
  description           TEXT,

  -- Classification
  category_id           UUID REFERENCES config.goal_categories(id), -- reuse goal categories

  -- Schedule
  frequency_id          UUID REFERENCES config.habit_frequencies(id),
  target_count          INTEGER NOT NULL DEFAULT 1, -- how many times per frequency period
  time_preference_id    UUID REFERENCES config.habit_time_preferences(id),
  specific_days         INTEGER[], -- 0=Sun..6=Sat; null = any day within frequency

  -- Ownership
  owner_id              UUID NOT NULL REFERENCES auth.users(id),

  -- Streaks (denormalized for fast reads — recalculated from check-ins)
  current_streak        INTEGER NOT NULL DEFAULT 0,
  longest_streak        INTEGER NOT NULL DEFAULT 0,
  total_completions     INTEGER NOT NULL DEFAULT 0,
  last_completed_at     TIMESTAMPTZ,

  -- Status
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'paused', 'retired'
  )),
  started_on            DATE NOT NULL DEFAULT CURRENT_DATE,
  paused_at             TIMESTAMPTZ,
  retired_at            TIMESTAMPTZ,

  -- Standard fields
  source                TEXT NOT NULL DEFAULT 'manual',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata              JSONB
);

-- Habit check-ins (the actual daily/weekly records)
CREATE TABLE platform.habit_check_ins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id      UUID NOT NULL REFERENCES platform.habits(id) ON DELETE CASCADE,
  checked_by    UUID NOT NULL REFERENCES auth.users(id),
  check_date    DATE NOT NULL,

  -- Value tracking (for measurable habits: "ran 2.5 km")
  value         NUMERIC,
  unit          TEXT,

  -- Context
  note          TEXT,
  mood          TEXT CHECK (mood IN ('great', 'good', 'neutral', 'tough', 'terrible') OR mood IS NULL),

  -- Standard fields
  source        TEXT NOT NULL DEFAULT 'manual',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB,

  -- One check-in per habit per user per day
  UNIQUE(habit_id, checked_by, check_date)
);

-- =============================================================
-- LINKING TABLES — Goals ↔ Habits ↔ Tasks
-- =============================================================

-- Goals linked to habits (a goal can be driven by multiple habits)
CREATE TABLE platform.goal_habits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id     UUID NOT NULL REFERENCES platform.goals(id) ON DELETE CASCADE,
  habit_id    UUID NOT NULL REFERENCES platform.habits(id) ON DELETE CASCADE,
  weight      NUMERIC NOT NULL DEFAULT 1.0, -- relative importance for progress calculation
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(goal_id, habit_id)
);

-- Goals linked to tasks (a goal can have actionable tasks)
CREATE TABLE platform.goal_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id     UUID NOT NULL REFERENCES platform.goals(id) ON DELETE CASCADE,
  task_id     UUID NOT NULL REFERENCES platform.tasks(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(goal_id, task_id)
);

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

-- Config tables: read all authenticated, write admin
ALTER TABLE config.goal_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE config.goal_timeframes ENABLE ROW LEVEL SECURITY;
ALTER TABLE config.habit_frequencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE config.habit_time_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "config_read_authenticated" ON config.goal_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_write_admin" ON config.goal_categories FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');

CREATE POLICY "config_read_authenticated" ON config.goal_timeframes FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_write_admin" ON config.goal_timeframes FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');

CREATE POLICY "config_read_authenticated" ON config.habit_frequencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_write_admin" ON config.habit_frequencies FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');

CREATE POLICY "config_read_authenticated" ON config.habit_time_preferences FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_write_admin" ON config.habit_time_preferences FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');

-- Platform tables: goals are personal (owner sees own), habits are personal
ALTER TABLE platform.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.goal_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.habit_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.goal_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.goal_tasks ENABLE ROW LEVEL SECURITY;

-- Goals: owner can read/write own goals; shared household view via explicit query
CREATE POLICY "goals_read_own" ON platform.goals FOR SELECT TO authenticated
  USING (owner_id = auth.uid());
CREATE POLICY "goals_write_own" ON platform.goals FOR ALL TO authenticated
  USING (owner_id = auth.uid());

-- Goal milestones: follow parent goal ownership
CREATE POLICY "milestones_read" ON platform.goal_milestones FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM platform.goals WHERE id = goal_id AND owner_id = auth.uid()));
CREATE POLICY "milestones_write" ON platform.goal_milestones FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM platform.goals WHERE id = goal_id AND owner_id = auth.uid()));

-- Habits: owner can read/write own habits
CREATE POLICY "habits_read_own" ON platform.habits FOR SELECT TO authenticated
  USING (owner_id = auth.uid());
CREATE POLICY "habits_write_own" ON platform.habits FOR ALL TO authenticated
  USING (owner_id = auth.uid());

-- Check-ins: owner of the habit can see all check-ins; user can write own
CREATE POLICY "checkins_read" ON platform.habit_check_ins FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM platform.habits WHERE id = habit_id AND owner_id = auth.uid()));
CREATE POLICY "checkins_write" ON platform.habit_check_ins FOR ALL TO authenticated
  USING (checked_by = auth.uid());

-- Goal-habit links: follow goal ownership
CREATE POLICY "goal_habits_read" ON platform.goal_habits FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM platform.goals WHERE id = goal_id AND owner_id = auth.uid()));
CREATE POLICY "goal_habits_write" ON platform.goal_habits FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM platform.goals WHERE id = goal_id AND owner_id = auth.uid()));

-- Goal-task links: follow goal ownership
CREATE POLICY "goal_tasks_read" ON platform.goal_tasks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM platform.goals WHERE id = goal_id AND owner_id = auth.uid()));
CREATE POLICY "goal_tasks_write" ON platform.goal_tasks FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM platform.goals WHERE id = goal_id AND owner_id = auth.uid()));

-- =============================================================
-- INDEXES
-- =============================================================

-- Goals
CREATE INDEX idx_goals_owner ON platform.goals(owner_id);
CREATE INDEX idx_goals_category ON platform.goals(category_id);
CREATE INDEX idx_goals_status ON platform.goals(status);
CREATE INDEX idx_goals_target_date ON platform.goals(target_date);
CREATE INDEX idx_goals_parent ON platform.goals(parent_goal_id);

-- Goal milestones
CREATE INDEX idx_milestones_goal ON platform.goal_milestones(goal_id);

-- Habits
CREATE INDEX idx_habits_owner ON platform.habits(owner_id);
CREATE INDEX idx_habits_category ON platform.habits(category_id);
CREATE INDEX idx_habits_status ON platform.habits(status);
CREATE INDEX idx_habits_frequency ON platform.habits(frequency_id);

-- Check-ins (most queried table — needs to be fast)
CREATE INDEX idx_checkins_habit ON platform.habit_check_ins(habit_id);
CREATE INDEX idx_checkins_date ON platform.habit_check_ins(check_date);
CREATE INDEX idx_checkins_habit_date ON platform.habit_check_ins(habit_id, check_date);
CREATE INDEX idx_checkins_user_date ON platform.habit_check_ins(checked_by, check_date);

-- Linking tables
CREATE INDEX idx_goal_habits_goal ON platform.goal_habits(goal_id);
CREATE INDEX idx_goal_habits_habit ON platform.goal_habits(habit_id);
CREATE INDEX idx_goal_tasks_goal ON platform.goal_tasks(goal_id);
CREATE INDEX idx_goal_tasks_task ON platform.goal_tasks(task_id);
