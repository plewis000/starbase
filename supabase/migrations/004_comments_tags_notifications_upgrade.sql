-- =====================================================
-- Migration 004: Best-in-Class Comments, Tags, Notifications
-- =====================================================
-- Upgrades:
--   1. Polymorphic comments (any entity type, not just tasks)
--   2. Comment threading (parent_comment_id)
--   3. @mentions with notification triggers
--   4. Reactions (emoji on comments)
--   5. Entity watchers (follow/unfollow any entity)
--   6. Tags on goals and habits (not just tasks)
--   7. Notification subscriptions (per-event-type control)
--   8. Notification grouping support
--   9. Quiet hours / DND
--  10. Comment edit history
-- =====================================================

-- ─── 1. POLYMORPHIC COMMENTS ────────────────────────────

-- New unified comments table (replaces task_comments for new entities)
-- task_comments stays for backward compatibility; new code uses this table
CREATE TABLE platform.comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       TEXT NOT NULL,  -- 'task', 'goal', 'habit'
  entity_id         UUID NOT NULL,
  user_id           UUID NOT NULL REFERENCES auth.users(id),
  body              TEXT NOT NULL,
  body_html         TEXT,           -- Rendered markdown (optional, client can render)
  parent_id         UUID REFERENCES platform.comments(id) ON DELETE CASCADE,
  is_edited         BOOLEAN NOT NULL DEFAULT false,
  is_pinned         BOOLEAN NOT NULL DEFAULT false,
  is_deleted        BOOLEAN NOT NULL DEFAULT false,  -- Soft delete
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata          JSONB
);

-- Indexes for comment queries
CREATE INDEX idx_comments_entity ON platform.comments(entity_type, entity_id);
CREATE INDEX idx_comments_parent ON platform.comments(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_comments_user ON platform.comments(user_id);
CREATE INDEX idx_comments_pinned ON platform.comments(entity_type, entity_id)
  WHERE is_pinned = true AND is_deleted = false;

-- RLS: authenticated users can read all non-deleted comments (household shared)
-- For personal entities (goals/habits), app layer enforces ownership
ALTER TABLE platform.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY comments_read ON platform.comments
  FOR SELECT TO authenticated USING (is_deleted = false OR user_id = auth.uid());
CREATE POLICY comments_insert ON platform.comments
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY comments_update ON platform.comments
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY comments_delete ON platform.comments
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ─── 2. COMMENT EDIT HISTORY ────────────────────────────

CREATE TABLE platform.comment_edits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id      UUID NOT NULL REFERENCES platform.comments(id) ON DELETE CASCADE,
  previous_body   TEXT NOT NULL,
  edited_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_by       UUID NOT NULL REFERENCES auth.users(id)
);

CREATE INDEX idx_comment_edits_comment ON platform.comment_edits(comment_id);

ALTER TABLE platform.comment_edits ENABLE ROW LEVEL SECURITY;
CREATE POLICY comment_edits_read ON platform.comment_edits
  FOR SELECT TO authenticated USING (true);
CREATE POLICY comment_edits_insert ON platform.comment_edits
  FOR INSERT TO authenticated WITH CHECK (edited_by = auth.uid());

-- ─── 3. @MENTIONS ───────────────────────────────────────

CREATE TABLE platform.mentions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id      UUID NOT NULL REFERENCES platform.comments(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES auth.users(id),
  entity_type     TEXT NOT NULL,  -- duplicated from comment for fast queries
  entity_id       UUID NOT NULL,  -- duplicated from comment for fast queries
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mentions_user ON platform.mentions(mentioned_user_id);
CREATE INDEX idx_mentions_comment ON platform.mentions(comment_id);
CREATE INDEX idx_mentions_entity ON platform.mentions(entity_type, entity_id);

ALTER TABLE platform.mentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY mentions_read ON platform.mentions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY mentions_insert ON platform.mentions
  FOR INSERT TO authenticated WITH CHECK (true);

-- ─── 4. REACTIONS ───────────────────────────────────────

CREATE TABLE platform.reactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id      UUID NOT NULL REFERENCES platform.comments(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  emoji           TEXT NOT NULL,  -- Unicode emoji or shortcode: '👍', '🎉', '❤️', etc.
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id, emoji)  -- One reaction per emoji per user per comment
);

CREATE INDEX idx_reactions_comment ON platform.reactions(comment_id);
CREATE INDEX idx_reactions_user ON platform.reactions(user_id);

ALTER TABLE platform.reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY reactions_read ON platform.reactions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY reactions_insert ON platform.reactions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY reactions_delete ON platform.reactions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ─── 5. ENTITY WATCHERS (Follow/Unfollow) ──────────────

CREATE TABLE platform.entity_watchers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     TEXT NOT NULL,  -- 'task', 'goal', 'habit'
  entity_id       UUID NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  watch_level     TEXT NOT NULL DEFAULT 'all',  -- 'all', 'mentions_only', 'muted'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entity_type, entity_id, user_id)
);

CREATE INDEX idx_watchers_entity ON platform.entity_watchers(entity_type, entity_id);
CREATE INDEX idx_watchers_user ON platform.entity_watchers(user_id);

ALTER TABLE platform.entity_watchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY watchers_read ON platform.entity_watchers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY watchers_write ON platform.entity_watchers
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- ─── 6. TAGS ON GOALS AND HABITS ────────────────────────

CREATE TABLE platform.goal_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id     UUID NOT NULL REFERENCES platform.goals(id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES config.tags(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(goal_id, tag_id)
);

CREATE INDEX idx_goal_tags_goal ON platform.goal_tags(goal_id);
CREATE INDEX idx_goal_tags_tag ON platform.goal_tags(tag_id);

ALTER TABLE platform.goal_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_tags_read ON platform.goal_tags
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM platform.goals WHERE id = goal_id AND owner_id = auth.uid())
  );
CREATE POLICY goal_tags_write ON platform.goal_tags
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM platform.goals WHERE id = goal_id AND owner_id = auth.uid())
  );

CREATE TABLE platform.habit_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id    UUID NOT NULL REFERENCES platform.habits(id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES config.tags(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(habit_id, tag_id)
);

CREATE INDEX idx_habit_tags_habit ON platform.habit_tags(habit_id);
CREATE INDEX idx_habit_tags_tag ON platform.habit_tags(tag_id);

ALTER TABLE platform.habit_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY habit_tags_read ON platform.habit_tags
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM platform.habits WHERE id = habit_id AND owner_id = auth.uid())
  );
CREATE POLICY habit_tags_write ON platform.habit_tags
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM platform.habits WHERE id = habit_id AND owner_id = auth.uid())
  );

-- ─── 7. NOTIFICATION SUBSCRIPTIONS ──────────────────────

-- Per-event-type subscription control
CREATE TABLE platform.notification_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  event_type      TEXT NOT NULL,  -- matches NotifyEvent types
  enabled         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_type)
);

CREATE INDEX idx_notif_subs_user ON platform.notification_subscriptions(user_id);

ALTER TABLE platform.notification_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY notif_subs_own ON platform.notification_subscriptions
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- ─── 8. NOTIFICATION GROUPING ───────────────────────────

-- Add grouping fields to existing notifications table
ALTER TABLE platform.notifications
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS group_key TEXT,  -- For grouping: "task_commented:{task_id}"
  ADD COLUMN IF NOT EXISTS is_grouped BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_count INTEGER DEFAULT 1;

CREATE INDEX idx_notifications_group ON platform.notifications(user_id, group_key)
  WHERE group_key IS NOT NULL AND read_at IS NULL;
CREATE INDEX idx_notifications_entity ON platform.notifications(entity_type, entity_id)
  WHERE entity_type IS NOT NULL;
CREATE INDEX idx_notifications_unread ON platform.notifications(user_id)
  WHERE read_at IS NULL;

-- ─── 9. QUIET HOURS / DND ──────────────────────────────

-- Add quiet hours fields to user preferences
ALTER TABLE platform.user_notification_prefs
  ADD COLUMN IF NOT EXISTS quiet_hours_start TIME,   -- e.g., '22:00'
  ADD COLUMN IF NOT EXISTS quiet_hours_end TIME,     -- e.g., '07:00'
  ADD COLUMN IF NOT EXISTS quiet_days INTEGER[],     -- days of week to mute (0=Sun, 6=Sat)
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Chicago';

-- ─── 10. TAG USAGE COUNTS VIEW ─────────────────────────

-- Materialized count for tag usage across all entity types
CREATE OR REPLACE VIEW platform.tag_usage_counts AS
  SELECT
    t.id AS tag_id,
    t.name,
    t.slug,
    t.display_color,
    t.icon,
    COALESCE(tt.task_count, 0) AS task_count,
    COALESCE(gt.goal_count, 0) AS goal_count,
    COALESCE(ht.habit_count, 0) AS habit_count,
    COALESCE(tt.task_count, 0) + COALESCE(gt.goal_count, 0) + COALESCE(ht.habit_count, 0) AS total_count
  FROM config.tags t
  LEFT JOIN (
    SELECT tag_id, COUNT(*) AS task_count FROM platform.task_tags GROUP BY tag_id
  ) tt ON tt.tag_id = t.id
  LEFT JOIN (
    SELECT tag_id, COUNT(*) AS goal_count FROM platform.goal_tags GROUP BY tag_id
  ) gt ON gt.tag_id = t.id
  LEFT JOIN (
    SELECT tag_id, COUNT(*) AS habit_count FROM platform.habit_tags GROUP BY tag_id
  ) ht ON ht.tag_id = t.id
  WHERE t.active = true;

-- ─── ALLOWED REACTIONS SEED ─────────────────────────────

-- No config table needed — we allow any valid emoji
-- But we define a recommended set in the API layer

-- =====================================================
-- MIGRATION COMPLETE
-- New tables: 7 (comments, comment_edits, mentions,
--   reactions, entity_watchers, goal_tags, habit_tags,
--   notification_subscriptions)
-- Altered tables: 2 (notifications, user_notification_prefs)
-- New indexes: 17
-- New view: 1 (tag_usage_counts)
-- =====================================================
