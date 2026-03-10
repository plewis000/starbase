-- =============================================
-- Migration 020: Create threads table
-- Enables the Comms/Threads feature (household messaging)
-- =============================================

CREATE TABLE IF NOT EXISTS platform.threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  household_id UUID NOT NULL REFERENCES platform.households(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  entity_type VARCHAR(50),  -- Optional: 'task', 'goal', 'habit'
  entity_id UUID,           -- Optional: linked entity ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for household listing (primary query pattern)
CREATE INDEX IF NOT EXISTS idx_threads_household_id ON platform.threads(household_id);

-- Index for entity lookups
CREATE INDEX IF NOT EXISTS idx_threads_entity ON platform.threads(entity_type, entity_id)
  WHERE entity_type IS NOT NULL;

-- Auto-update updated_at on modification
CREATE OR REPLACE FUNCTION platform.update_thread_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_threads_updated_at
  BEFORE UPDATE ON platform.threads
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_thread_updated_at();

-- Also bump thread.updated_at when a comment is added to it
CREATE OR REPLACE FUNCTION platform.update_thread_on_comment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.entity_type = 'thread' THEN
    UPDATE platform.threads SET updated_at = now() WHERE id = NEW.entity_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_comment_updates_thread
  AFTER INSERT ON platform.comments
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_thread_on_comment();

-- RLS
ALTER TABLE platform.threads ENABLE ROW LEVEL SECURITY;

-- Household members can see their household's threads
CREATE POLICY threads_select ON platform.threads
  FOR SELECT USING (
    household_id IN (
      SELECT hm.household_id FROM platform.household_members hm
      WHERE hm.user_id = auth.uid()
    )
  );

-- Household members can create threads in their household
CREATE POLICY threads_insert ON platform.threads
  FOR INSERT WITH CHECK (
    household_id IN (
      SELECT hm.household_id FROM platform.household_members hm
      WHERE hm.user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

-- Only thread creator can update
CREATE POLICY threads_update ON platform.threads
  FOR UPDATE USING (created_by = auth.uid());

-- Only thread creator can delete
CREATE POLICY threads_delete ON platform.threads
  FOR DELETE USING (created_by = auth.uid());
