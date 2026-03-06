-- Migration 014: EA Schema Alignment
-- Decision #55: EA classification/learning/storage lives in Starbase (ea schema).
-- Daemon handles synthesis/briefing via claude -p reading from these tables.
--
-- The ea schema was created in Session 15 (PR #8) but is missing:
-- 1. household_id on all tables (multi-tenant scoping)
-- 2. RLS policies (P006: migrations need permissions + RLS)
-- 3. Table grants for authenticated/service_role
-- 4. Some columns from the finalized LEARNING_LOOP.md design
--
-- This migration adds household_id, RLS, grants, and missing columns
-- without dropping existing data.

-- ============================================================
-- Grants on schema
-- ============================================================

GRANT USAGE ON SCHEMA ea TO authenticated;
GRANT USAGE ON SCHEMA ea TO service_role;

-- ============================================================
-- 1. category_config — add household_id, fix urgency_default type
-- ============================================================

ALTER TABLE ea.category_config
  ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES platform.households(id) ON DELETE CASCADE;

-- Backfill existing rows with Parker's household
UPDATE ea.category_config SET household_id = '9a620a0e-25bf-47b8-a8e2-c9be703bd80b' WHERE household_id IS NULL;

ALTER TABLE ea.category_config ALTER COLUMN household_id SET NOT NULL;

-- Add unique constraint for household scoping
ALTER TABLE ea.category_config DROP CONSTRAINT IF EXISTS category_config_category_name_key;
ALTER TABLE ea.category_config ADD CONSTRAINT category_config_household_category UNIQUE (household_id, category_name);

ALTER TABLE ea.category_config ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ea.category_config TO authenticated;
GRANT ALL ON ea.category_config TO service_role;

CREATE POLICY "category_config_household" ON ea.category_config
  FOR ALL TO authenticated
  USING (household_id IN (SELECT platform.get_user_household_ids()));

-- ============================================================
-- 2. sender_profiles — add household_id
-- ============================================================

ALTER TABLE ea.sender_profiles
  ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES platform.households(id) ON DELETE CASCADE;

UPDATE ea.sender_profiles SET household_id = '9a620a0e-25bf-47b8-a8e2-c9be703bd80b' WHERE household_id IS NULL;

ALTER TABLE ea.sender_profiles ALTER COLUMN household_id SET NOT NULL;

-- Unique on household + sender_email (existing column name)
ALTER TABLE ea.sender_profiles DROP CONSTRAINT IF EXISTS sender_profiles_sender_email_key;
ALTER TABLE ea.sender_profiles ADD CONSTRAINT sender_profiles_household_sender UNIQUE (household_id, sender_email);

ALTER TABLE ea.sender_profiles ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ea.sender_profiles TO authenticated;
GRANT ALL ON ea.sender_profiles TO service_role;

CREATE POLICY "sender_profiles_household" ON ea.sender_profiles
  FOR ALL TO authenticated
  USING (household_id IN (SELECT platform.get_user_household_ids()));

-- ============================================================
-- 3. explicit_rules — add household_id
-- ============================================================

ALTER TABLE ea.explicit_rules
  ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES platform.households(id) ON DELETE CASCADE;

UPDATE ea.explicit_rules SET household_id = '9a620a0e-25bf-47b8-a8e2-c9be703bd80b' WHERE household_id IS NULL;

ALTER TABLE ea.explicit_rules ALTER COLUMN household_id SET NOT NULL;

ALTER TABLE ea.explicit_rules ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ea.explicit_rules TO authenticated;
GRANT ALL ON ea.explicit_rules TO service_role;

CREATE POLICY "explicit_rules_household" ON ea.explicit_rules
  FOR ALL TO authenticated
  USING (household_id IN (SELECT platform.get_user_household_ids()));

-- ============================================================
-- 4. briefs — add household_id, add missing columns
-- ============================================================

ALTER TABLE ea.briefs
  ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES platform.households(id) ON DELETE CASCADE;

UPDATE ea.briefs SET household_id = '9a620a0e-25bf-47b8-a8e2-c9be703bd80b' WHERE household_id IS NULL;

ALTER TABLE ea.briefs ALTER COLUMN household_id SET NOT NULL;

-- Add columns from finalized design
ALTER TABLE ea.briefs
  ADD COLUMN IF NOT EXISTS gmail_draft_id TEXT,
  ADD COLUMN IF NOT EXISTS items_clicked TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS items_forwarded TEXT[] DEFAULT '{}';

ALTER TABLE ea.briefs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ea.briefs TO authenticated;
GRANT ALL ON ea.briefs TO service_role;

CREATE POLICY "briefs_household" ON ea.briefs
  FOR ALL TO authenticated
  USING (household_id IN (SELECT platform.get_user_household_ids()));

-- ============================================================
-- 5. email_signals — add household_id, add unique constraint
-- ============================================================

ALTER TABLE ea.email_signals
  ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES platform.households(id) ON DELETE CASCADE;

UPDATE ea.email_signals SET household_id = '9a620a0e-25bf-47b8-a8e2-c9be703bd80b' WHERE household_id IS NULL;

ALTER TABLE ea.email_signals ALTER COLUMN household_id SET NOT NULL;

-- Unique on household + gmail_message_id
ALTER TABLE ea.email_signals DROP CONSTRAINT IF EXISTS email_signals_gmail_message_id_key;
ALTER TABLE ea.email_signals ADD CONSTRAINT email_signals_household_gmail UNIQUE (household_id, gmail_message_id);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_email_signals_received ON ea.email_signals (household_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_signals_category ON ea.email_signals (household_id, category);
CREATE INDEX IF NOT EXISTS idx_email_signals_sender ON ea.email_signals (household_id, sender_domain);

ALTER TABLE ea.email_signals ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ea.email_signals TO authenticated;
GRANT ALL ON ea.email_signals TO service_role;

CREATE POLICY "email_signals_household" ON ea.email_signals
  FOR ALL TO authenticated
  USING (household_id IN (SELECT platform.get_user_household_ids()));

-- ============================================================
-- 6. draft_history — add household_id
-- ============================================================

ALTER TABLE ea.draft_history
  ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES platform.households(id) ON DELETE CASCADE;

UPDATE ea.draft_history SET household_id = '9a620a0e-25bf-47b8-a8e2-c9be703bd80b' WHERE household_id IS NULL;

ALTER TABLE ea.draft_history ALTER COLUMN household_id SET NOT NULL;

ALTER TABLE ea.draft_history ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ea.draft_history TO authenticated;
GRANT ALL ON ea.draft_history TO service_role;

CREATE POLICY "draft_history_household" ON ea.draft_history
  FOR ALL TO authenticated
  USING (household_id IN (SELECT platform.get_user_household_ids()));

-- ============================================================
-- 7. lenale_messages — add household_id
-- ============================================================

ALTER TABLE ea.lenale_messages
  ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES platform.households(id) ON DELETE CASCADE;

UPDATE ea.lenale_messages SET household_id = '9a620a0e-25bf-47b8-a8e2-c9be703bd80b' WHERE household_id IS NULL;

ALTER TABLE ea.lenale_messages ALTER COLUMN household_id SET NOT NULL;

ALTER TABLE ea.lenale_messages ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ea.lenale_messages TO authenticated;
GRANT ALL ON ea.lenale_messages TO service_role;

CREATE POLICY "lenale_messages_household" ON ea.lenale_messages
  FOR ALL TO authenticated
  USING (household_id IN (SELECT platform.get_user_household_ids()));

-- ============================================================
-- 8. reminders — add household_id
-- ============================================================

ALTER TABLE ea.reminders
  ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES platform.households(id) ON DELETE CASCADE;

UPDATE ea.reminders SET household_id = '9a620a0e-25bf-47b8-a8e2-c9be703bd80b' WHERE household_id IS NULL;

ALTER TABLE ea.reminders ALTER COLUMN household_id SET NOT NULL;

ALTER TABLE ea.reminders ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ea.reminders TO authenticated;
GRANT ALL ON ea.reminders TO service_role;

CREATE POLICY "reminders_household" ON ea.reminders
  FOR ALL TO authenticated
  USING (household_id IN (SELECT platform.get_user_household_ids()));

-- ============================================================
-- 9. scan_state — add household_id (operational state, less critical)
-- ============================================================

ALTER TABLE ea.scan_state
  ADD COLUMN IF NOT EXISTS household_id UUID;

UPDATE ea.scan_state SET household_id = '9a620a0e-25bf-47b8-a8e2-c9be703bd80b' WHERE household_id IS NULL;

ALTER TABLE ea.scan_state ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ea.scan_state TO authenticated;
GRANT ALL ON ea.scan_state TO service_role;

CREATE POLICY "scan_state_household" ON ea.scan_state
  FOR ALL TO authenticated USING (true);
