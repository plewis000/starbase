-- ============================================================
-- Migration 009: Schema Alignment
-- Adds columns used by application code that were missing from
-- the original onboarding schema definition.
-- ============================================================

-- onboarding_state: add household_id for multi-user households
ALTER TABLE platform.onboarding_state
  ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES platform.households(id),
  ADD COLUMN IF NOT EXISTS current_question_index INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS refinement_completed_at TIMESTAMPTZ;

-- Drop the unique constraint on user_id alone (allow per-household onboarding)
-- and add a new unique constraint on user_id + household_id
DO $$
BEGIN
  -- Only drop if exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'onboarding_state_user_id_key'
    AND conrelid = 'platform.onboarding_state'::regclass
  ) THEN
    ALTER TABLE platform.onboarding_state DROP CONSTRAINT onboarding_state_user_id_key;
    ALTER TABLE platform.onboarding_state ADD CONSTRAINT onboarding_state_user_household_key UNIQUE (user_id, household_id);
  END IF;
END$$;

-- onboarding_responses: add onboarding_id to link responses to onboarding sessions
-- Also add application-used fields
ALTER TABLE platform.onboarding_responses
  ADD COLUMN IF NOT EXISTS onboarding_id UUID REFERENCES platform.onboarding_state(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS reviewed_by_user BOOLEAN NOT NULL DEFAULT false;

-- Make question_text nullable since the agent submits responses
-- with just question_key (text comes from config.onboarding_questions)
ALTER TABLE platform.onboarding_responses
  ALTER COLUMN question_text DROP NOT NULL;

-- Default question_text to empty string for existing rows
UPDATE platform.onboarding_responses
  SET question_text = ''
  WHERE question_text IS NULL;

-- Add check_date alias column to habit_check_ins if it uses check_in_date
-- (different columns used by different code paths)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'platform' AND table_name = 'habit_check_ins' AND column_name = 'check_date'
  ) THEN
    -- check_date might already exist; the code uses both check_date and check_in_date
    -- If check_in_date exists but not check_date, rename it
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'platform' AND table_name = 'habit_check_ins' AND column_name = 'check_in_date'
    ) THEN
      ALTER TABLE platform.habit_check_ins RENAME COLUMN check_in_date TO check_date;
    END IF;
  END IF;
END$$;

-- Index for onboarding_id lookups
CREATE INDEX IF NOT EXISTS idx_onboarding_responses_session
  ON platform.onboarding_responses(onboarding_id);
