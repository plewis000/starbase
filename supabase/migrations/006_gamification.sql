-- =============================================================
-- DESPERADO CLUB — Migration 006: Gamification Engine
-- Adds: Crawler profiles, XP system, achievements, loot boxes,
--        floors, party goals, leaderboard support
-- Theme: Dungeon Crawler Carl
-- =============================================================

-- =============================================================
-- CONFIG SCHEMA — Floors, Achievement Definitions, Loot Tiers
-- =============================================================

-- Dungeon floors that unlock with progression
CREATE TABLE config.floors (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_number          INTEGER NOT NULL UNIQUE,
  name                  TEXT NOT NULL,
  description           TEXT,
  min_level             INTEGER NOT NULL,
  max_level             INTEGER NOT NULL,
  icon                  TEXT,
  unlock_message        TEXT,       -- The System's announcement when you reach this floor
  color                 TEXT,       -- Hex color for UI theming
  active                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Achievement definitions (what can be unlocked)
CREATE TABLE config.achievements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,           -- The funny DCC-style name
  description           TEXT NOT NULL,           -- The System's sarcastic commentary
  category              TEXT NOT NULL CHECK (category IN (
    'productivity', 'finance', 'health', 'streak', 'social', 'meta', 'party', 'seasonal'
  )),
  tier                  TEXT NOT NULL CHECK (tier IN (
    'common', 'uncommon', 'rare', 'epic', 'legendary'
  )),
  xp_reward             INTEGER NOT NULL DEFAULT 50,
  icon                  TEXT,                    -- Emoji or icon identifier
  loot_box_tier         TEXT CHECK (loot_box_tier IN ('bronze', 'silver', 'gold', 'platinum')),
  trigger_type          TEXT NOT NULL CHECK (trigger_type IN (
    'task_count', 'task_streak', 'habit_streak', 'habit_count',
    'goal_completed', 'budget_under', 'login_streak', 'xp_total',
    'level_reached', 'shopping_count', 'speed_complete', 'zero_overdue',
    'custom', 'party_task_streak', 'party_habit_sync', 'combo_streak'
  )),
  trigger_config        JSONB NOT NULL DEFAULT '{}',  -- { threshold: 30, entity_type: "task", ... }
  is_hidden             BOOLEAN NOT NULL DEFAULT false,  -- Secret achievements
  is_party              BOOLEAN NOT NULL DEFAULT false,  -- Requires both crawlers
  is_repeatable         BOOLEAN NOT NULL DEFAULT false,  -- Can unlock multiple times
  sort_order            INTEGER NOT NULL DEFAULT 0,
  active                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Loot box tier definitions
CREATE TABLE config.loot_box_tiers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  TEXT NOT NULL UNIQUE,     -- 'bronze', 'silver', 'gold', 'platinum'
  name                  TEXT NOT NULL,             -- 'Bronze Box', 'Silver Box', etc.
  description           TEXT,                      -- The System's description
  color                 TEXT NOT NULL,             -- Hex color
  icon                  TEXT,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- XP action definitions (how much XP each action type gives)
CREATE TABLE config.xp_actions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,
  base_xp               INTEGER NOT NULL,
  description           TEXT,
  active                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- PLATFORM SCHEMA — Crawler Profiles & XP
-- =============================================================

-- Crawler profile (one per user)
CREATE TABLE platform.crawler_profiles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  crawler_name          TEXT,                     -- Display name in the crawl
  total_xp              INTEGER NOT NULL DEFAULT 0,
  current_level         INTEGER NOT NULL DEFAULT 1,
  current_floor_id      UUID REFERENCES config.floors(id),
  xp_to_next_level      INTEGER NOT NULL DEFAULT 100,
  login_streak          INTEGER NOT NULL DEFAULT 0,
  longest_login_streak  INTEGER NOT NULL DEFAULT 0,
  last_login_date       DATE,
  showcase_achievement_ids UUID[] DEFAULT '{}',   -- Up to 5 pinned achievements
  title                 TEXT,                     -- Custom title from achievements
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- XP transaction ledger (every XP change is recorded)
CREATE TABLE platform.xp_ledger (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  amount                INTEGER NOT NULL,         -- Positive or negative
  action_type           TEXT NOT NULL,            -- 'task_complete', 'habit_checkin', 'achievement', 'streak_break', etc.
  source_entity_type    TEXT,                     -- 'task', 'habit', 'goal', 'achievement', etc.
  source_entity_id      UUID,
  description           TEXT NOT NULL,            -- Human-readable: "Completed task: Fix kitchen sink"
  multiplier            NUMERIC(4,2) DEFAULT 1.0, -- For streak bonuses, party bonuses
  metadata              JSONB DEFAULT '{}',       -- Extra context
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Achievement unlocks (which user unlocked which achievement, when)
CREATE TABLE platform.achievement_unlocks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  achievement_id        UUID NOT NULL REFERENCES config.achievements(id),
  unlocked_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  xp_awarded            INTEGER NOT NULL,
  loot_box_id           UUID,                    -- References the loot box that was generated (if any)
  unlock_count          INTEGER NOT NULL DEFAULT 1,  -- For repeatable achievements
  metadata              JSONB DEFAULT '{}',       -- Context about what triggered it
  UNIQUE (user_id, achievement_id, unlock_count)
);

-- =============================================================
-- PLATFORM SCHEMA — Loot Boxes
-- =============================================================

-- Reward pool (user-defined rewards per tier)
CREATE TABLE platform.loot_box_rewards (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  tier_id               UUID NOT NULL REFERENCES config.loot_box_tiers(id),
  name                  TEXT NOT NULL,            -- "Favorite coffee", "Date night", etc.
  description           TEXT,
  icon                  TEXT,
  is_household          BOOLEAN NOT NULL DEFAULT false,  -- Shared reward vs personal
  active                BOOLEAN NOT NULL DEFAULT true,
  times_won             INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Loot boxes earned (from achievements)
CREATE TABLE platform.loot_boxes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  tier_id               UUID NOT NULL REFERENCES config.loot_box_tiers(id),
  source_achievement_id UUID REFERENCES config.achievements(id),
  source_description    TEXT NOT NULL,            -- "Unlocked: Domestic Warlord"
  opened                BOOLEAN NOT NULL DEFAULT false,
  opened_at             TIMESTAMPTZ,
  reward_id             UUID REFERENCES platform.loot_box_rewards(id),  -- Set when opened
  reward_redeemed       BOOLEAN NOT NULL DEFAULT false,
  redeemed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- PLATFORM SCHEMA — Party Goals & Household Competition
-- =============================================================

-- Party goals (shared between crawlers)
CREATE TABLE platform.party_goals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id               UUID NOT NULL REFERENCES platform.goals(id) ON DELETE CASCADE,
  is_party_goal         BOOLEAN NOT NULL DEFAULT true,
  party_xp_bonus        INTEGER NOT NULL DEFAULT 100,   -- Bonus XP when completed as team
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (goal_id)
);

-- Leaderboard snapshots (weekly/monthly)
CREATE TABLE platform.leaderboard_snapshots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type           TEXT NOT NULL CHECK (period_type IN ('weekly', 'monthly')),
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  xp_earned             INTEGER NOT NULL DEFAULT 0,
  tasks_completed       INTEGER NOT NULL DEFAULT 0,
  habits_checked        INTEGER NOT NULL DEFAULT 0,
  achievements_unlocked INTEGER NOT NULL DEFAULT 0,
  rank                  INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_type, period_start, user_id)
);

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

-- Config tables (read: all authenticated, write: admin)
ALTER TABLE config.floors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "floors_read" ON config.floors FOR SELECT TO authenticated USING (true);
CREATE POLICY "floors_write_admin" ON config.floors FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');

ALTER TABLE config.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "achievements_read" ON config.achievements FOR SELECT TO authenticated USING (true);
CREATE POLICY "achievements_write_admin" ON config.achievements FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');

ALTER TABLE config.loot_box_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loot_box_tiers_read" ON config.loot_box_tiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "loot_box_tiers_write_admin" ON config.loot_box_tiers FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');

ALTER TABLE config.xp_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "xp_actions_read" ON config.xp_actions FOR SELECT TO authenticated USING (true);
CREATE POLICY "xp_actions_write_admin" ON config.xp_actions FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');

-- Crawler profiles (read: all authenticated for leaderboard, write: own)
ALTER TABLE platform.crawler_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crawler_profiles_read" ON platform.crawler_profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "crawler_profiles_write" ON platform.crawler_profiles
  FOR ALL TO authenticated USING (auth.uid() = user_id);

-- XP ledger (own only)
ALTER TABLE platform.xp_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "xp_ledger_read" ON platform.xp_ledger
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "xp_ledger_write" ON platform.xp_ledger
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Achievement unlocks (read: all for social, write: own)
ALTER TABLE platform.achievement_unlocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "achievement_unlocks_read" ON platform.achievement_unlocks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "achievement_unlocks_write" ON platform.achievement_unlocks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Loot box rewards (own)
ALTER TABLE platform.loot_box_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loot_box_rewards_own" ON platform.loot_box_rewards
  FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Loot boxes (own)
ALTER TABLE platform.loot_boxes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loot_boxes_own" ON platform.loot_boxes
  FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Party goals (all authenticated - household shared)
ALTER TABLE platform.party_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "party_goals_authenticated" ON platform.party_goals
  FOR ALL TO authenticated USING (true);

-- Leaderboard (read: all, write: system)
ALTER TABLE platform.leaderboard_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leaderboard_read" ON platform.leaderboard_snapshots
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "leaderboard_write" ON platform.leaderboard_snapshots
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- =============================================================
-- INDEXES
-- =============================================================

CREATE INDEX idx_crawler_profiles_level ON platform.crawler_profiles(current_level DESC);
CREATE INDEX idx_crawler_profiles_xp ON platform.crawler_profiles(total_xp DESC);
CREATE INDEX idx_xp_ledger_user ON platform.xp_ledger(user_id, created_at DESC);
CREATE INDEX idx_xp_ledger_action ON platform.xp_ledger(action_type);
CREATE INDEX idx_achievement_unlocks_user ON platform.achievement_unlocks(user_id, unlocked_at DESC);
CREATE INDEX idx_achievement_unlocks_achievement ON platform.achievement_unlocks(achievement_id);
CREATE INDEX idx_achievements_trigger ON config.achievements(trigger_type) WHERE active = true;
CREATE INDEX idx_achievements_category ON config.achievements(category);
CREATE INDEX idx_loot_boxes_user ON platform.loot_boxes(user_id, created_at DESC);
CREATE INDEX idx_loot_boxes_unopened ON platform.loot_boxes(user_id) WHERE opened = false;
CREATE INDEX idx_loot_box_rewards_tier ON platform.loot_box_rewards(user_id, tier_id) WHERE active = true;
CREATE INDEX idx_leaderboard_period ON platform.leaderboard_snapshots(period_type, period_start DESC);
CREATE INDEX idx_party_goals_goal ON platform.party_goals(goal_id);
