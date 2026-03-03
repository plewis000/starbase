-- Migration 013: Entity Links — Cross-Module Dual-Nature Pattern
-- Enables items to live in multiple contexts:
--   shopping_item ↔ task (buy groceries is both a list item and a deadline task)
--   habit → task (today's habit check-in can spawn a task)
--   goal ↔ task (already exists via goal_tasks, this is the generic version)
--
-- Design: bidirectional linking with optional lifecycle sync.
-- Items don't become other items — they get linked.

-- Entity links table
CREATE TABLE IF NOT EXISTS platform.entity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source entity
  source_type TEXT NOT NULL CHECK (source_type IN ('task', 'habit', 'goal', 'shopping_item')),
  source_id UUID NOT NULL,

  -- Target entity
  target_type TEXT NOT NULL CHECK (target_type IN ('task', 'habit', 'goal', 'shopping_item')),
  target_id UUID NOT NULL,

  -- Relationship metadata
  link_type TEXT NOT NULL CHECK (link_type IN ('derived_from', 'tracks', 'syncs_with')),
  sync_completion BOOLEAN NOT NULL DEFAULT false,

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}',

  -- Constraints
  CONSTRAINT unique_entity_link UNIQUE (source_type, source_id, target_type, target_id),
  CONSTRAINT no_self_link CHECK (NOT (source_type = target_type AND source_id = target_id))
);

-- Indexes for lookup from either direction
CREATE INDEX IF NOT EXISTS idx_entity_links_source
  ON platform.entity_links (source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_entity_links_target
  ON platform.entity_links (target_type, target_id);

-- Index for sync-completion hooks
CREATE INDEX IF NOT EXISTS idx_entity_links_sync
  ON platform.entity_links (source_type, source_id)
  WHERE sync_completion = true;

-- RLS: all authenticated users in the household can read/write links
ALTER TABLE platform.entity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_links_select" ON platform.entity_links
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "entity_links_insert" ON platform.entity_links
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "entity_links_delete" ON platform.entity_links
  FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- Grant permissions (follows existing pattern from 011)
GRANT ALL ON platform.entity_links TO authenticated;
GRANT ALL ON platform.entity_links TO service_role;
