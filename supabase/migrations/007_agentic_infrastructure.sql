-- =============================================================
-- DESPERADO CLUB — Migration 007: Agentic Infrastructure
-- The intelligence layer. Everything the AI needs to know you,
-- adapt to you, and manage your household.
-- =============================================================
-- Covers:
--   1. Household entity & membership
--   2. Responsibility ownership & delegation (DEEP)
--   3. AI memory (observations, decisions, user model)
--   4. Config override layer
--   5. Behavioral aggregates
--   6. Onboarding system
--   7. AI suggestion pipeline
--   8. User boundaries
--   9. Life events & phases
--  10. Engagement tracking
--  11. Goal/habit motivation
--  12. Seasons & challenges
--  13. Notification intelligence
--  14. Progress history
--  15. Feedback system (agentic — Zev classifies, links, follows up)
--  16. Household invite codes
--  17. Quick-start onboarding track
--  18. Schema cleanup (duplicates, missing fields)
-- =============================================================


-- =============================================================
-- PART 1: HOUSEHOLD ENTITY
-- The structural relationship that currently only exists by assumption
-- =============================================================

CREATE TABLE platform.households (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL DEFAULT 'Our Household',
  timezone              TEXT NOT NULL DEFAULT 'America/Chicago',
  locale                TEXT NOT NULL DEFAULT 'en-US',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE platform.household_members (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          UUID NOT NULL REFERENCES platform.households(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role                  TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  display_name          TEXT,           -- Household-specific nickname
  joined_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, user_id)
);

-- Add household_id to crawler_profiles for household-scoped leaderboards
ALTER TABLE platform.crawler_profiles
  ADD COLUMN household_id UUID REFERENCES platform.households(id);


-- =============================================================
-- PART 2: RESPONSIBILITY OWNERSHIP & DELEGATION (DEEP DESIGN)
-- =============================================================
-- This is the "who owns what" layer. Distinct from task assignment.
--
-- Concepts:
--   RESPONSIBILITY = a standing area of ownership ("dishes", "grocery shopping", "bills")
--   DELEGATION     = a temporary or permanent transfer of a responsibility
--   ROTATION       = responsibilities that alternate on a schedule
--   LOAD TRACKING  = the AI tracks who's carrying what percentage of household work
--
-- The AI uses this to:
--   - Detect imbalance ("Parker did 80% of chores this month")
--   - Suggest rebalancing ("Want to swap laundry and dishes this week?")
--   - Understand context ("Lenale handles groceries, so grocery-related tasks route to her")
--   - Award XP fairly ("Responsibility bonus: +15 XP for your area")
-- =============================================================

-- Responsibility areas — standing categories of household work
CREATE TABLE platform.responsibilities (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          UUID NOT NULL REFERENCES platform.households(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,              -- "Dishes", "Grocery Shopping", "Bills & Finance"
  description           TEXT,
  category              TEXT NOT NULL CHECK (category IN (
    'chores', 'errands', 'finance', 'cooking', 'childcare',
    'pets', 'maintenance', 'admin', 'health', 'social', 'other'
  )),
  icon                  TEXT,
  -- Who currently owns this responsibility
  owner_user_id         UUID REFERENCES auth.users(id),
  -- Ownership type determines how the system treats it
  ownership_type        TEXT NOT NULL DEFAULT 'fixed' CHECK (ownership_type IN (
    'fixed',        -- One person always does it
    'rotating',     -- Alternates on a schedule
    'shared',       -- Both do it equally (no single owner)
    'flexible'      -- Whoever gets to it first
  )),
  -- For rotating responsibilities
  rotation_frequency    TEXT CHECK (rotation_frequency IN ('daily', 'weekly', 'biweekly', 'monthly')),
  rotation_next_switch  DATE,
  -- Effort estimate (used for load balancing calculations)
  effort_weight         INTEGER NOT NULL DEFAULT 5 CHECK (effort_weight BETWEEN 1 AND 10),
  -- Frequency of this responsibility (how often it needs doing)
  recurrence            TEXT CHECK (recurrence IN ('daily', 'weekly', 'biweekly', 'monthly', 'as_needed')),
  -- Status
  active                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Responsibility history — tracks every ownership change for load analysis
CREATE TABLE platform.responsibility_history (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  responsibility_id     UUID NOT NULL REFERENCES platform.responsibilities(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  action                TEXT NOT NULL CHECK (action IN (
    'assigned',     -- Initially assigned
    'rotated',      -- Automatic rotation
    'delegated',    -- Manually handed off
    'reclaimed',    -- Taken back
    'swapped'       -- Exchanged with another responsibility
  )),
  from_user_id          UUID REFERENCES auth.users(id),  -- Who it was transferred from (null for initial)
  reason                TEXT,           -- "Automatic rotation", "Parker asked", "Rebalancing"
  source                TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'system_ai', 'rotation')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Delegations — temporary transfers of responsibility
CREATE TABLE platform.delegations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          UUID NOT NULL REFERENCES platform.households(id) ON DELETE CASCADE,
  responsibility_id     UUID REFERENCES platform.responsibilities(id) ON DELETE SET NULL,
  -- Can also delegate a specific task (not just a responsibility)
  task_id               UUID REFERENCES platform.tasks(id) ON DELETE CASCADE,
  from_user_id          UUID NOT NULL REFERENCES auth.users(id),
  to_user_id            UUID NOT NULL REFERENCES auth.users(id),
  -- Delegation terms
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Requested, not yet accepted
    'accepted',     -- Accepted by the delegate
    'declined',     -- Declined by the delegate
    'active',       -- Currently in effect
    'completed',    -- Done / expired
    'cancelled'     -- Cancelled by the requester
  )),
  delegation_type       TEXT NOT NULL DEFAULT 'temporary' CHECK (delegation_type IN (
    'temporary',    -- Specific time period
    'permanent',    -- Until manually changed
    'one_time'      -- Just this once (e.g., "can you do dishes tonight?")
  )),
  starts_at             DATE,
  expires_at            DATE,           -- Null for permanent
  reason                TEXT,           -- "I'm traveling this week", "Feeling sick"
  -- Tracking
  accepted_at           TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  -- Was this AI-suggested?
  source                TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'system_ai', 'discord')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Can't delegate to yourself
  CHECK (from_user_id != to_user_id)
);

-- Responsibility-to-task/habit linking — connects standing responsibilities to actual work items
CREATE TABLE platform.responsibility_links (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  responsibility_id     UUID NOT NULL REFERENCES platform.responsibilities(id) ON DELETE CASCADE,
  entity_type           TEXT NOT NULL CHECK (entity_type IN ('task', 'habit', 'goal', 'shopping_list')),
  entity_id             UUID NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (responsibility_id, entity_type, entity_id)
);

-- Load snapshots — AI-computed distribution of household work
-- Computed daily, used for balance analysis
CREATE TABLE platform.load_snapshots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          UUID NOT NULL REFERENCES platform.households(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  period_type           TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  period_start          DATE NOT NULL,
  -- Counts
  tasks_completed       INTEGER NOT NULL DEFAULT 0,
  tasks_assigned        INTEGER NOT NULL DEFAULT 0,
  habits_completed      INTEGER NOT NULL DEFAULT 0,
  chores_completed      INTEGER NOT NULL DEFAULT 0,
  errands_completed     INTEGER NOT NULL DEFAULT 0,
  -- Weighted effort score (uses responsibility effort_weight)
  effort_score          NUMERIC(8,2) NOT NULL DEFAULT 0,
  -- Percentage of total household work this user did
  household_share_pct   NUMERIC(5,2),
  -- How many delegations sent vs received
  delegations_sent      INTEGER NOT NULL DEFAULT 0,
  delegations_received  INTEGER NOT NULL DEFAULT 0,
  -- AI-generated summary
  ai_summary            TEXT,
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, user_id, period_type, period_start)
);


-- =============================================================
-- PART 3: AI MEMORY & USER MODEL
-- =============================================================

-- AI observations — what the system has noticed about each user
CREATE TABLE platform.ai_observations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES auth.users(id),        -- Null = household-level observation
  household_id          UUID REFERENCES platform.households(id),
  -- What was observed
  category              TEXT NOT NULL CHECK (category IN (
    'productivity', 'habits', 'finance', 'schedule', 'engagement',
    'gamification', 'relationship', 'preference', 'health', 'general'
  )),
  observation           TEXT NOT NULL,   -- Human-readable: "Completes 80% of tasks before noon"
  -- Structured data the AI extracted
  data                  JSONB NOT NULL DEFAULT '{}',
  -- Confidence and lifecycle
  confidence            NUMERIC(3,2) NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  source                TEXT NOT NULL CHECK (source IN (
    'behavioral',   -- Derived from usage data
    'declared',     -- User told us directly
    'inferred',     -- AI concluded from multiple signals
    'conversational'-- Extracted from chat
  )),
  -- Observations can become stale
  valid_from            TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until           TIMESTAMPTZ,     -- Null = still valid
  is_active             BOOLEAN NOT NULL DEFAULT true,
  -- Version tracking: which observation this supersedes
  supersedes_id         UUID REFERENCES platform.ai_observations(id),
  -- What data informed this observation
  evidence              JSONB DEFAULT '{}',  -- { source_queries: [...], data_points: N, date_range: ... }
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI decisions — every autonomous action the system took, with reasoning
CREATE TABLE platform.ai_decisions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES auth.users(id),
  household_id          UUID REFERENCES platform.households(id),
  -- What was decided
  decision_type         TEXT NOT NULL CHECK (decision_type IN (
    'config_override',      -- Changed a gamification/system parameter
    'notification_adjust',  -- Changed notification behavior
    'suggestion_generated', -- Created a suggestion for the user
    'delegation_suggested', -- Suggested a responsibility rebalance
    'achievement_adjusted', -- Modified achievement difficulty
    'schedule_adjusted',    -- Changed timing of nudges/reminders
    'onboarding_adapted',   -- Modified onboarding flow based on responses
    'boundary_respected',   -- Chose NOT to do something because of a boundary
    'other'
  )),
  summary               TEXT NOT NULL,   -- "Reduced Parker's daily task target from 8 to 5"
  reasoning             TEXT NOT NULL,   -- "Completion rate dropped 30% over 2 weeks, suggesting burnout"
  -- What data informed this decision
  observation_ids       UUID[] DEFAULT '{}',  -- References to ai_observations that led here
  input_data            JSONB DEFAULT '{}',   -- The behavioral data snapshot used
  -- What was the result
  action_taken          JSONB NOT NULL DEFAULT '{}',  -- { table: "config_overrides", operation: "insert", ... }
  outcome               TEXT CHECK (outcome IN (
    'pending',      -- Just made, hasn't played out yet
    'effective',    -- The change had the desired effect
    'ineffective',  -- No measurable impact
    'reversed',     -- Was rolled back
    'superseded'    -- Replaced by a newer decision
  )) DEFAULT 'pending',
  outcome_measured_at   TIMESTAMPTZ,
  -- Audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User model — the AI's structured understanding of each person
-- Three layers: declared (user said), observed (AI noticed), inferred (AI concluded)
CREATE TABLE platform.user_model (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  -- Attribute being modeled
  attribute             TEXT NOT NULL,    -- "productivity_peak_time", "motivation_style", "stress_triggers"
  category              TEXT NOT NULL CHECK (category IN (
    'personality', 'schedule', 'productivity', 'health', 'finance',
    'communication', 'motivation', 'household_role', 'preferences', 'relationships'
  )),
  -- The value (structured)
  value                 JSONB NOT NULL,   -- { peak_hours: [9, 10, 11], confidence: 0.85 }
  -- Which layer
  layer                 TEXT NOT NULL CHECK (layer IN ('declared', 'observed', 'inferred')),
  -- Confidence and source
  confidence            NUMERIC(3,2) NOT NULL DEFAULT 0.5,
  source_observation_id UUID REFERENCES platform.ai_observations(id),
  -- Versioning
  version               INTEGER NOT NULL DEFAULT 1,
  is_current            BOOLEAN NOT NULL DEFAULT true,
  previous_version_id   UUID REFERENCES platform.user_model(id),
  -- Lifecycle
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, attribute, version)
);


-- =============================================================
-- PART 4: CONFIG OVERRIDE LAYER
-- =============================================================

-- Per-user or per-household overrides that sit on top of global config
-- The AI writes these; the application reads base config + overrides at runtime
CREATE TABLE platform.config_overrides (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Scope: user-level, household-level, or global
  user_id               UUID REFERENCES auth.users(id),
  household_id          UUID REFERENCES platform.households(id),
  -- What config is being overridden
  config_table          TEXT NOT NULL,    -- 'xp_actions', 'achievements', 'notification_channels', etc.
  config_key            TEXT NOT NULL,    -- The slug or identifier of the config row
  config_field          TEXT NOT NULL,    -- The column being overridden: 'base_xp', 'trigger_config', etc.
  -- The override value
  override_value        JSONB NOT NULL,   -- The new value (typed as the original column)
  -- Why and who
  reason                TEXT NOT NULL,    -- "Completion rate suggests current XP too low for engagement"
  original_instruction  TEXT,             -- The natural language that triggered this: "make fitness stuff worth more XP"
  created_by            TEXT NOT NULL DEFAULT 'system_ai' CHECK (created_by IN ('system_ai', 'user', 'admin')),
  decision_id           UUID REFERENCES platform.ai_decisions(id),
  -- Lifecycle
  active                BOOLEAN NOT NULL DEFAULT true,
  expires_at            TIMESTAMPTZ,     -- Null = permanent until manually changed
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Natural language config change log — stores the original request + what changed
CREATE TABLE platform.config_change_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  -- The human's instruction
  instruction           TEXT NOT NULL,    -- "Make achievements harder"
  channel               TEXT NOT NULL CHECK (channel IN ('discord', 'web', 'claude_code')),
  -- What the AI did with it
  interpretation        TEXT NOT NULL,    -- "Increased all achievement trigger thresholds by 25%"
  overrides_created     UUID[] DEFAULT '{}',  -- References to config_overrides rows
  -- Confirmation
  status                TEXT NOT NULL DEFAULT 'applied' CHECK (status IN (
    'applied',      -- Executed immediately
    'pending',      -- Waiting for user confirmation
    'confirmed',    -- User confirmed after preview
    'rejected',     -- User said no
    'rolled_back'   -- Applied then reversed
  )),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =============================================================
-- PART 5: BEHAVIORAL AGGREGATES
-- =============================================================

-- Pre-computed daily rollups — the AI reads these instead of querying raw tables
CREATE TABLE platform.behavioral_aggregates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  period_date           DATE NOT NULL,
  -- Task metrics
  tasks_created         INTEGER NOT NULL DEFAULT 0,
  tasks_completed       INTEGER NOT NULL DEFAULT 0,
  tasks_overdue         INTEGER NOT NULL DEFAULT 0,
  task_completion_rate  NUMERIC(5,2),    -- Percentage
  avg_task_completion_hours NUMERIC(8,2), -- Average time from creation to done
  -- Habit metrics
  habits_checked_in     INTEGER NOT NULL DEFAULT 0,
  habits_missed         INTEGER NOT NULL DEFAULT 0,
  habit_completion_rate NUMERIC(5,2),
  active_streaks        INTEGER NOT NULL DEFAULT 0,
  broken_streaks        INTEGER NOT NULL DEFAULT 0,
  -- Goal metrics
  milestones_completed  INTEGER NOT NULL DEFAULT 0,
  goal_progress_delta   NUMERIC(5,2),    -- Net progress change this day
  -- Gamification
  xp_earned             INTEGER NOT NULL DEFAULT 0,
  achievements_unlocked INTEGER NOT NULL DEFAULT 0,
  loot_boxes_earned     INTEGER NOT NULL DEFAULT 0,
  loot_boxes_opened     INTEGER NOT NULL DEFAULT 0,
  -- Finance (if available)
  transactions_logged   INTEGER NOT NULL DEFAULT 0,
  total_spent           NUMERIC(12,2),
  budget_adherence_pct  NUMERIC(5,2),
  -- Time patterns (hour buckets — when was the user most active?)
  activity_by_hour      JSONB DEFAULT '{}',  -- { "9": 5, "10": 8, "14": 3 } = actions per hour
  -- Engagement
  app_sessions          INTEGER NOT NULL DEFAULT 0,
  notifications_sent    INTEGER NOT NULL DEFAULT 0,
  notifications_read    INTEGER NOT NULL DEFAULT 0,
  -- Mood (average from habit check-ins, 1-5 scale)
  avg_mood              NUMERIC(3,2),
  -- Computed at
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_date)
);


-- =============================================================
-- PART 6: ONBOARDING SYSTEM
-- =============================================================

-- Onboarding state machine — tracks where each user is in progressive disclosure
CREATE TABLE platform.onboarding_state (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  -- Phase tracking
  current_phase         TEXT NOT NULL DEFAULT 'interview' CHECK (current_phase IN (
    'interview',    -- Phase 1: Initial conversational Q&A (Day 1)
    'observation',  -- Phase 2: Silent observation period (Days 2-7)
    'refinement',   -- Phase 3: AI surfaces observations for confirmation
    'active',       -- Ongoing: regular micro-check-ins
    'complete'      -- User has been fully onboarded (never truly reached — always evolving)
  )),
  -- Interview progress
  interview_started_at  TIMESTAMPTZ,
  interview_completed_at TIMESTAMPTZ,
  questions_answered    INTEGER NOT NULL DEFAULT 0,
  questions_total       INTEGER NOT NULL DEFAULT 10,
  -- Observation phase
  observation_started_at TIMESTAMPTZ,
  observation_ends_at   TIMESTAMPTZ,     -- Auto-transition to refinement
  observations_generated INTEGER NOT NULL DEFAULT 0,
  -- Refinement phase
  refinement_started_at TIMESTAMPTZ,
  refinements_confirmed INTEGER NOT NULL DEFAULT 0,
  refinements_corrected INTEGER NOT NULL DEFAULT 0,
  -- Overall
  onboarding_score      NUMERIC(5,2),    -- How well the AI knows this user (0-100%)
  last_check_in_at      TIMESTAMPTZ,     -- Last micro-check-in
  next_check_in_at      TIMESTAMPTZ,     -- Scheduled next check-in
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Onboarding responses — stores both raw conversation and extracted structured data
CREATE TABLE platform.onboarding_responses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  -- The question
  question_key          TEXT NOT NULL,    -- 'daily_routine', 'household_split', 'pain_points', etc.
  question_text         TEXT NOT NULL,    -- The actual question Zev asked
  -- The response
  raw_response          TEXT NOT NULL,    -- What the user said (verbatim)
  -- AI-extracted structured data
  extracted_data        JSONB NOT NULL DEFAULT '{}',  -- Parsed into structured fields
  -- Confidence in the extraction
  extraction_confidence NUMERIC(3,2) NOT NULL DEFAULT 0.8,
  -- Phase and channel
  phase                 TEXT NOT NULL CHECK (phase IN ('interview', 'refinement', 'micro_checkin')),
  channel               TEXT NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'discord')),
  -- Lifecycle
  superseded_by         UUID REFERENCES platform.onboarding_responses(id),  -- If re-asked later
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Interview question definitions — the questions Zev asks, in order
-- Stored as data so the AI can evolve the interview over time
CREATE TABLE config.onboarding_questions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_key          TEXT NOT NULL UNIQUE,
  question_text         TEXT NOT NULL,    -- Default text (AI may personalize)
  category              TEXT NOT NULL,    -- 'routine', 'household', 'goals', 'preferences', etc.
  phase                 TEXT NOT NULL DEFAULT 'interview',
  sort_order            INTEGER NOT NULL DEFAULT 0,
  -- What the AI should extract from the answer
  extraction_schema     JSONB NOT NULL DEFAULT '{}',  -- { fields: [{ name: "wake_time", type: "time" }, ...] }
  -- Can be deactivated if the AI learns it's not useful
  active                BOOLEAN NOT NULL DEFAULT true,
  -- Effectiveness tracking
  avg_extraction_confidence NUMERIC(3,2),
  times_asked           INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =============================================================
-- PART 7: AI SUGGESTION PIPELINE
-- =============================================================

CREATE TABLE platform.ai_suggestions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES auth.users(id),         -- Null = household-level
  household_id          UUID REFERENCES platform.households(id),
  -- The suggestion
  category              TEXT NOT NULL CHECK (category IN (
    'rebalance',        -- Household load rebalancing
    'habit_adjust',     -- Modify a habit target/schedule
    'goal_suggest',     -- Suggest a new goal
    'gamification',     -- XP/achievement/reward adjustment
    'delegation',       -- Suggest delegating something
    'celebration',      -- Acknowledge something worth celebrating
    'routine',          -- Suggest a routine change
    'financial',        -- Budget/spending insight
    'relationship',     -- Household dynamic observation
    'system',           -- Platform improvement
    'general'
  )),
  title                 TEXT NOT NULL,    -- Short headline
  body                  TEXT NOT NULL,    -- Full explanation
  -- The action the user can take
  action_type           TEXT CHECK (action_type IN (
    'approve',          -- Yes, do this
    'navigate',         -- Go to a page/entity
    'create',           -- Create a new entity
    'configure',        -- Change a setting
    'acknowledge'       -- Just FYI, no action needed
  )),
  action_data           JSONB DEFAULT '{}',  -- { url: "/crawl/party", entity_id: "...", etc. }
  -- Priority and confidence
  priority              TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  confidence            NUMERIC(3,2) NOT NULL DEFAULT 0.7,
  -- Status
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'seen',             -- User saw it but hasn't acted
    'accepted',
    'dismissed',
    'expired',
    'auto_applied'      -- System applied it automatically (low-stakes)
  )),
  -- Which decision or observation triggered this
  decision_id           UUID REFERENCES platform.ai_decisions(id),
  observation_ids       UUID[] DEFAULT '{}',
  -- Lifecycle
  expires_at            TIMESTAMPTZ,     -- Auto-expire if not acted on
  seen_at               TIMESTAMPTZ,
  acted_at              TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =============================================================
-- PART 8: USER BOUNDARIES
-- =============================================================

CREATE TABLE platform.user_boundaries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  -- What the boundary covers
  category              TEXT NOT NULL CHECK (category IN (
    'topic',            -- "Never mention my weight"
    'comparison',       -- "Don't compare me to Lenale on X"
    'notification',     -- "Don't notify me about X"
    'auto_adjust',      -- "Never auto-adjust my fitness goals"
    'timing',           -- "Don't contact me during work hours"
    'tone',             -- "Don't be sarcastic about finance"
    'data',             -- "Don't track my location"
    'general'
  )),
  boundary              TEXT NOT NULL,    -- Human-readable description
  -- Structured scope (what entities/topics does this apply to?)
  scope                 JSONB NOT NULL DEFAULT '{}',  -- { topics: ["weight", "fitness"], entities: [...] }
  -- How it was created
  source                TEXT NOT NULL DEFAULT 'declared' CHECK (source IN ('declared', 'inferred')),
  -- Is this still active?
  active                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =============================================================
-- PART 9: LIFE EVENTS & PHASES
-- =============================================================

CREATE TABLE platform.life_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          UUID REFERENCES platform.households(id),
  user_id               UUID REFERENCES auth.users(id),   -- Null = affects whole household
  -- Event details
  event_type            TEXT NOT NULL CHECK (event_type IN (
    'vacation',         -- Time off, travel
    'illness',          -- Sick, recovery
    'work_crunch',      -- Heavy work period
    'holiday',          -- Holiday season
    'celebration',      -- Birthday, anniversary
    'transition',       -- Moving, new job, baby
    'guest',            -- Having visitors
    'other'
  )),
  title                 TEXT NOT NULL,    -- "Beach vacation", "Lenale sick"
  description           TEXT,
  starts_at             DATE NOT NULL,
  ends_at               DATE,            -- Null = single day
  -- How should the system respond?
  impact                TEXT NOT NULL DEFAULT 'reduce' CHECK (impact IN (
    'reduce',           -- Reduce expectations, ease off notifications
    'pause',            -- Pause gamification tracking entirely
    'boost',            -- Increase motivation (e.g., post-vacation catch-up)
    'celebrate',        -- Special acknowledgment
    'none'              -- Just informational
  )),
  -- Adjustments during this event
  xp_multiplier         NUMERIC(3,2) DEFAULT 1.0,  -- 0.5 = half XP expectations, 2.0 = double
  suppress_notifications BOOLEAN NOT NULL DEFAULT false,
  -- Status
  active                BOOLEAN NOT NULL DEFAULT true,
  source                TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'system_ai', 'calendar')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Gamification seasons/challenges — time-bound themed events
CREATE TABLE config.seasons (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,    -- "February Fitness Floor", "Spring Cleaning Challenge"
  description           TEXT,
  theme                 TEXT,             -- DCC-themed narrative
  starts_at             DATE NOT NULL,
  ends_at               DATE NOT NULL,
  -- What does this season affect?
  xp_multiplier_category TEXT,           -- 'health', 'chores', etc. — which category gets boosted
  xp_multiplier         NUMERIC(3,2) DEFAULT 1.5,
  -- Unlockable achievements during this season
  achievement_ids       UUID[] DEFAULT '{}',
  -- Status
  active                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =============================================================
-- PART 10: ENGAGEMENT TRACKING
-- =============================================================

-- Lightweight event tracking for feature usage and engagement patterns
CREATE TABLE platform.engagement_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  -- What happened
  event_type            TEXT NOT NULL,    -- 'page_view', 'feature_used', 'loot_box_opened', 'notification_read', etc.
  event_data            JSONB DEFAULT '{}',  -- { page: "/crawl", feature: "leaderboard", etc. }
  -- When
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =============================================================
-- PART 11: GOAL/HABIT MOTIVATION ("WHY")
-- =============================================================

-- Add motivation fields to existing goals and habits tables
ALTER TABLE platform.goals
  ADD COLUMN motivation TEXT,            -- "Why this matters to me"
  ADD COLUMN motivation_tags TEXT[] DEFAULT '{}';  -- ['health', 'family', 'financial_security']

ALTER TABLE platform.habits
  ADD COLUMN motivation TEXT,
  ADD COLUMN motivation_tags TEXT[] DEFAULT '{}';


-- =============================================================
-- PART 12: NOTIFICATION INTELLIGENCE
-- =============================================================

-- Per-user notification fatigue tracking
CREATE TABLE platform.notification_intelligence (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  -- Adaptive frequency
  daily_cap             INTEGER NOT NULL DEFAULT 20,      -- Max notifications per day
  current_daily_count   INTEGER NOT NULL DEFAULT 0,
  last_reset_date       DATE,
  -- Engagement signals
  avg_read_rate_7d      NUMERIC(5,2),    -- Percentage of notifications read in last 7 days
  avg_response_time_min NUMERIC(8,2),    -- Average time to read after delivery
  -- Batching preferences (AI-learned)
  preferred_batch_time  TIME,            -- When to deliver batched notifications
  batch_enabled         BOOLEAN NOT NULL DEFAULT false,
  -- Channel effectiveness (AI-learned)
  discord_read_rate     NUMERIC(5,2),
  web_read_rate         NUMERIC(5,2),
  preferred_channel     TEXT,            -- 'discord', 'web', 'both'
  -- Fatigue detection
  fatigue_score         NUMERIC(3,2) DEFAULT 0,  -- 0 = fine, 1 = completely fatigued
  last_fatigue_check    TIMESTAMPTZ,
  -- Updated by AI
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =============================================================
-- PART 13: PROGRESS HISTORY
-- =============================================================

-- Track goal progress over time (not just current snapshot)
CREATE TABLE platform.goal_progress_history (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id               UUID NOT NULL REFERENCES platform.goals(id) ON DELETE CASCADE,
  progress_value        NUMERIC(10,2) NOT NULL,  -- The progress value at this point
  progress_pct          NUMERIC(5,2),
  source                TEXT NOT NULL DEFAULT 'system' CHECK (source IN ('system', 'manual', 'habit', 'task', 'milestone')),
  note                  TEXT,
  recorded_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =============================================================
-- PART 15: FEEDBACK SYSTEM (AGENTIC)
-- =============================================================
-- Conversational feedback from any user. Zev classifies, links,
-- and follows up. Drives the AI suggestion pipeline.
--
-- Input surfaces: Zev chat, Discord, web form (floating button)
-- Agentic loop: submit → classify → link related → cluster →
--   surface as AI suggestion → accept → auto-create task → done → notify
-- =============================================================

CREATE TABLE platform.feedback (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          UUID REFERENCES platform.households(id) ON DELETE CASCADE,
  submitted_by          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type                  TEXT NOT NULL DEFAULT 'feedback' CHECK (type IN ('bug', 'wish', 'feedback', 'question')),
  body                  TEXT NOT NULL,
  page_url              TEXT,                -- auto-captured from where they were
  screenshot_url        TEXT,                -- optional screenshot
  -- AI-populated fields (Zev fills these after submission)
  ai_classified_type    TEXT,                -- Zev's inferred type (may differ from user-selected)
  ai_classified_severity TEXT CHECK (ai_classified_severity IN ('critical', 'major', 'minor', 'cosmetic', NULL)),
  ai_extracted_feature  TEXT,                -- what part of the app this relates to
  related_feedback_ids  UUID[],              -- Zev-linked similar submissions
  -- Triage fields (set during review, not at submission)
  status                TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'planned', 'in_progress', 'done', 'wont_fix')),
  priority              INTEGER CHECK (priority BETWEEN 1 AND 5),
  response              TEXT,                -- reply back to the submitter
  response_by           UUID REFERENCES auth.users(id),
  resolution_notified   BOOLEAN NOT NULL DEFAULT false,
  -- Metadata
  tags                  TEXT[],
  conversation_id       UUID,               -- links to chat session where it was submitted
  source                TEXT NOT NULL DEFAULT 'web_form' CHECK (source IN ('chat', 'discord', 'web_form', 'system')),
  task_id               UUID,               -- auto-created task if feedback becomes actionable
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE platform.feedback_votes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id           UUID NOT NULL REFERENCES platform.feedback(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (feedback_id, user_id)
);


-- =============================================================
-- PART 16: HOUSEHOLD INVITE CODES
-- =============================================================
-- Simple invite flow: admin generates a code, partner enters it, joins household.
-- No UUID sharing required.

CREATE TABLE platform.household_invites (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          UUID NOT NULL REFERENCES platform.households(id) ON DELETE CASCADE,
  invite_code           TEXT NOT NULL UNIQUE,
  created_by            UUID NOT NULL REFERENCES auth.users(id),
  role                  TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  max_uses              INTEGER NOT NULL DEFAULT 1,
  times_used            INTEGER NOT NULL DEFAULT 0,
  expires_at            TIMESTAMPTZ,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =============================================================
-- PART 17: QUICK-START ONBOARDING
-- =============================================================
-- Add track field to onboarding_state: 'full' (10 questions) or 'quick' (2-3 fields, skip interview)
-- Quick-start goes straight to 'active' phase after basic setup

ALTER TABLE platform.onboarding_state
  ADD COLUMN IF NOT EXISTS track TEXT NOT NULL DEFAULT 'full' CHECK (track IN ('full', 'quick'));


-- =============================================================
-- PART 14: SCHEMA CLEANUP
-- =============================================================

-- Drop empty health schema (never used, health data lives in goals/habits)
-- NOTE: Uncomment only after verifying no references exist
-- DROP SCHEMA IF EXISTS health;

-- Add updated_at to tables missing it (gamification)
ALTER TABLE platform.xp_ledger ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE platform.achievement_unlocks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE platform.loot_boxes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE platform.loot_box_rewards ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Add progress_pct column to goals if not present (for goal_progress_history consistency)
-- (Already exists as progress_value INTEGER, we need the percentage too)
ALTER TABLE platform.goals ADD COLUMN IF NOT EXISTS progress_pct NUMERIC(5,2) DEFAULT 0;

-- Fix: Add FK constraint on achievement_unlocks.loot_box_id (was missing)
-- NOTE: Can't add FK if orphaned data exists. Run data cleanup first if needed.
-- ALTER TABLE platform.achievement_unlocks
--   ADD CONSTRAINT fk_achievement_unlocks_loot_box
--   FOREIGN KEY (loot_box_id) REFERENCES platform.loot_boxes(id);


-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

-- Household (all members can read/write their household)
ALTER TABLE platform.households ENABLE ROW LEVEL SECURITY;
CREATE POLICY "households_member" ON platform.households
  FOR ALL TO authenticated
  USING (id IN (SELECT household_id FROM platform.household_members WHERE user_id = auth.uid()));

ALTER TABLE platform.household_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "household_members_read" ON platform.household_members
  FOR SELECT TO authenticated
  USING (household_id IN (SELECT household_id FROM platform.household_members WHERE user_id = auth.uid()));
CREATE POLICY "household_members_write" ON platform.household_members
  FOR ALL TO authenticated
  USING (household_id IN (SELECT hm.household_id FROM platform.household_members hm WHERE hm.user_id = auth.uid() AND hm.role = 'admin'));

-- Responsibilities (household shared)
ALTER TABLE platform.responsibilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "responsibilities_household" ON platform.responsibilities
  FOR ALL TO authenticated
  USING (household_id IN (SELECT household_id FROM platform.household_members WHERE user_id = auth.uid()));

ALTER TABLE platform.responsibility_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "responsibility_history_read" ON platform.responsibility_history
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "responsibility_history_write" ON platform.responsibility_history
  FOR INSERT TO authenticated WITH CHECK (true);

ALTER TABLE platform.delegations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delegations_household" ON platform.delegations
  FOR ALL TO authenticated
  USING (household_id IN (SELECT household_id FROM platform.household_members WHERE user_id = auth.uid()));

ALTER TABLE platform.responsibility_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "responsibility_links_read" ON platform.responsibility_links
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "responsibility_links_write" ON platform.responsibility_links
  FOR ALL TO authenticated USING (true);

ALTER TABLE platform.load_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "load_snapshots_household" ON platform.load_snapshots
  FOR ALL TO authenticated
  USING (household_id IN (SELECT household_id FROM platform.household_members WHERE user_id = auth.uid()));

-- AI memory (own + household observations)
ALTER TABLE platform.ai_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_observations_read" ON platform.ai_observations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR household_id IN (SELECT household_id FROM platform.household_members WHERE user_id = auth.uid()));
CREATE POLICY "ai_observations_write" ON platform.ai_observations
  FOR INSERT TO authenticated WITH CHECK (true);

ALTER TABLE platform.ai_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_decisions_read" ON platform.ai_decisions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR household_id IN (SELECT household_id FROM platform.household_members WHERE user_id = auth.uid()));
CREATE POLICY "ai_decisions_write" ON platform.ai_decisions
  FOR INSERT TO authenticated WITH CHECK (true);

ALTER TABLE platform.user_model ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_model_own" ON platform.user_model
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- Config overrides (own + household)
ALTER TABLE platform.config_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config_overrides_read" ON platform.config_overrides
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL OR household_id IN (SELECT household_id FROM platform.household_members WHERE user_id = auth.uid()));
CREATE POLICY "config_overrides_write" ON platform.config_overrides
  FOR ALL TO authenticated USING (true);

ALTER TABLE platform.config_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config_change_log_own" ON platform.config_change_log
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- Behavioral aggregates (own data only)
ALTER TABLE platform.behavioral_aggregates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "behavioral_aggregates_own" ON platform.behavioral_aggregates
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- Onboarding (own data only)
ALTER TABLE platform.onboarding_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "onboarding_state_own" ON platform.onboarding_state
  FOR ALL TO authenticated USING (user_id = auth.uid());

ALTER TABLE platform.onboarding_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "onboarding_responses_own" ON platform.onboarding_responses
  FOR ALL TO authenticated USING (user_id = auth.uid());

ALTER TABLE config.onboarding_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "onboarding_questions_read" ON config.onboarding_questions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "onboarding_questions_write_admin" ON config.onboarding_questions
  FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');

-- AI suggestions (own + household)
ALTER TABLE platform.ai_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_suggestions_read" ON platform.ai_suggestions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL OR household_id IN (SELECT household_id FROM platform.household_members WHERE user_id = auth.uid()));
CREATE POLICY "ai_suggestions_write" ON platform.ai_suggestions
  FOR ALL TO authenticated USING (true);

-- User boundaries (own only — private)
ALTER TABLE platform.user_boundaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_boundaries_own" ON platform.user_boundaries
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- Life events (own + household)
ALTER TABLE platform.life_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "life_events_read" ON platform.life_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL OR household_id IN (SELECT household_id FROM platform.household_members WHERE user_id = auth.uid()));
CREATE POLICY "life_events_write" ON platform.life_events
  FOR ALL TO authenticated USING (true);

-- Seasons (config — read all, write admin)
ALTER TABLE config.seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seasons_read" ON config.seasons FOR SELECT TO authenticated USING (true);
CREATE POLICY "seasons_write_admin" ON config.seasons FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');

-- Engagement events (own only)
ALTER TABLE platform.engagement_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engagement_events_own" ON platform.engagement_events
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- Notification intelligence (own only)
ALTER TABLE platform.notification_intelligence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_intelligence_own" ON platform.notification_intelligence
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- Feedback (household-scoped, anyone can submit)
ALTER TABLE platform.feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feedback_read" ON platform.feedback
  FOR SELECT TO authenticated
  USING (household_id IN (SELECT household_id FROM platform.household_members WHERE user_id = auth.uid())
    OR submitted_by = auth.uid());
CREATE POLICY "feedback_insert" ON platform.feedback
  FOR INSERT TO authenticated WITH CHECK (submitted_by = auth.uid());
CREATE POLICY "feedback_update" ON platform.feedback
  FOR UPDATE TO authenticated
  USING (household_id IN (SELECT household_id FROM platform.household_members WHERE user_id = auth.uid()));

ALTER TABLE platform.feedback_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feedback_votes_read" ON platform.feedback_votes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "feedback_votes_write" ON platform.feedback_votes
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- Household invites (admin creates, anyone redeems)
ALTER TABLE platform.household_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "household_invites_read" ON platform.household_invites
  FOR SELECT TO authenticated
  USING (household_id IN (SELECT household_id FROM platform.household_members WHERE user_id = auth.uid()));
CREATE POLICY "household_invites_write" ON platform.household_invites
  FOR ALL TO authenticated
  USING (household_id IN (SELECT hm.household_id FROM platform.household_members hm WHERE hm.user_id = auth.uid() AND hm.role = 'admin'));
-- Anyone can read by invite_code (for redeeming) — handled via service role in API

-- Goal progress history (via goal ownership)
ALTER TABLE platform.goal_progress_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goal_progress_history_read" ON platform.goal_progress_history
  FOR SELECT TO authenticated
  USING (goal_id IN (SELECT id FROM platform.goals WHERE owner_id = auth.uid()));
CREATE POLICY "goal_progress_history_write" ON platform.goal_progress_history
  FOR INSERT TO authenticated WITH CHECK (true);


-- =============================================================
-- INDEXES
-- =============================================================

-- Household
CREATE INDEX idx_household_members_household ON platform.household_members(household_id);
CREATE INDEX idx_household_members_user ON platform.household_members(user_id);

-- Responsibilities (DEEP)
CREATE INDEX idx_responsibilities_household ON platform.responsibilities(household_id) WHERE active = true;
CREATE INDEX idx_responsibilities_owner ON platform.responsibilities(owner_user_id) WHERE active = true;
CREATE INDEX idx_responsibilities_category ON platform.responsibilities(category);
CREATE INDEX idx_responsibility_history_resp ON platform.responsibility_history(responsibility_id, created_at DESC);
CREATE INDEX idx_responsibility_history_user ON platform.responsibility_history(user_id, created_at DESC);
CREATE INDEX idx_delegations_household ON platform.delegations(household_id) WHERE status IN ('pending', 'active');
CREATE INDEX idx_delegations_to_user ON platform.delegations(to_user_id, status);
CREATE INDEX idx_delegations_from_user ON platform.delegations(from_user_id, status);
CREATE INDEX idx_responsibility_links_resp ON platform.responsibility_links(responsibility_id);
CREATE INDEX idx_responsibility_links_entity ON platform.responsibility_links(entity_type, entity_id);
CREATE INDEX idx_load_snapshots_household ON platform.load_snapshots(household_id, period_type, period_start DESC);
CREATE INDEX idx_load_snapshots_user ON platform.load_snapshots(user_id, period_type, period_start DESC);

-- AI Memory
CREATE INDEX idx_ai_observations_user ON platform.ai_observations(user_id, category) WHERE is_active = true;
CREATE INDEX idx_ai_observations_household ON platform.ai_observations(household_id) WHERE is_active = true;
CREATE INDEX idx_ai_observations_source ON platform.ai_observations(source);
CREATE INDEX idx_ai_decisions_user ON platform.ai_decisions(user_id, created_at DESC);
CREATE INDEX idx_ai_decisions_type ON platform.ai_decisions(decision_type);
CREATE INDEX idx_ai_decisions_outcome ON platform.ai_decisions(outcome) WHERE outcome = 'pending';
CREATE INDEX idx_user_model_user ON platform.user_model(user_id, category) WHERE is_current = true;
CREATE INDEX idx_user_model_attribute ON platform.user_model(user_id, attribute) WHERE is_current = true;

-- Config overrides
CREATE INDEX idx_config_overrides_user ON platform.config_overrides(user_id, config_table) WHERE active = true;
CREATE INDEX idx_config_overrides_household ON platform.config_overrides(household_id, config_table) WHERE active = true;
CREATE INDEX idx_config_overrides_expiry ON platform.config_overrides(expires_at) WHERE active = true AND expires_at IS NOT NULL;

-- Behavioral aggregates
CREATE INDEX idx_behavioral_aggregates_user ON platform.behavioral_aggregates(user_id, period_date DESC);

-- Onboarding
CREATE INDEX idx_onboarding_responses_user ON platform.onboarding_responses(user_id, created_at DESC);

-- AI suggestions
CREATE INDEX idx_ai_suggestions_user ON platform.ai_suggestions(user_id, status) WHERE status = 'pending';
CREATE INDEX idx_ai_suggestions_household ON platform.ai_suggestions(household_id, status) WHERE status = 'pending';
CREATE INDEX idx_ai_suggestions_expiry ON platform.ai_suggestions(expires_at) WHERE status = 'pending' AND expires_at IS NOT NULL;

-- User boundaries
CREATE INDEX idx_user_boundaries_user ON platform.user_boundaries(user_id, category) WHERE active = true;

-- Life events
CREATE INDEX idx_life_events_active ON platform.life_events(starts_at, ends_at) WHERE active = true;
CREATE INDEX idx_life_events_user ON platform.life_events(user_id) WHERE active = true;
CREATE INDEX idx_life_events_household ON platform.life_events(household_id) WHERE active = true;

-- Engagement
CREATE INDEX idx_engagement_events_user ON platform.engagement_events(user_id, created_at DESC);
CREATE INDEX idx_engagement_events_type ON platform.engagement_events(event_type, created_at DESC);

-- Notification intelligence
-- (single row per user, no additional indexes needed beyond PK)

-- Goal progress history
CREATE INDEX idx_goal_progress_history_goal ON platform.goal_progress_history(goal_id, recorded_at DESC);

-- Feedback
CREATE INDEX idx_feedback_household ON platform.feedback(household_id, status) WHERE status != 'done';
CREATE INDEX idx_feedback_submitted_by ON platform.feedback(submitted_by, created_at DESC);
CREATE INDEX idx_feedback_status ON platform.feedback(status, priority DESC) WHERE status NOT IN ('done', 'wont_fix');
CREATE INDEX idx_feedback_type ON platform.feedback(type, created_at DESC);
CREATE INDEX idx_feedback_votes_feedback ON platform.feedback_votes(feedback_id);

-- Household invites
CREATE INDEX idx_household_invites_code ON platform.household_invites(invite_code) WHERE is_active = true;
CREATE INDEX idx_household_invites_household ON platform.household_invites(household_id);

-- Seasons
CREATE INDEX idx_seasons_active ON config.seasons(starts_at, ends_at) WHERE active = true;
