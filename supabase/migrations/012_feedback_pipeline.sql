-- Migration 012: Feedback Pipeline Infrastructure
-- Adds pipeline state tracking to existing feedback table
-- Supports: submit → approve → worker → preview → verify → deploy flow

-- Pipeline status tracks the worker's state machine (independent from user-facing status)
ALTER TABLE platform.feedback ADD COLUMN IF NOT EXISTS pipeline_status TEXT
  CHECK (pipeline_status IN ('queued', 'working', 'preview_ready', 'approved', 'rejected', 'failed'));

-- Git/deploy tracking
ALTER TABLE platform.feedback ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE platform.feedback ADD COLUMN IF NOT EXISTS preview_url TEXT;
ALTER TABLE platform.feedback ADD COLUMN IF NOT EXISTS pr_number INTEGER;

-- Worker diagnostics
ALTER TABLE platform.feedback ADD COLUMN IF NOT EXISTS worker_log TEXT;
ALTER TABLE platform.feedback ADD COLUMN IF NOT EXISTS worker_started_at TIMESTAMPTZ;
ALTER TABLE platform.feedback ADD COLUMN IF NOT EXISTS worker_completed_at TIMESTAMPTZ;

-- Discord message tracking (for button interactions)
ALTER TABLE platform.feedback ADD COLUMN IF NOT EXISTS discord_message_id TEXT;

-- Index for worker polling: find queued jobs fast
CREATE INDEX IF NOT EXISTS idx_feedback_pipeline_queue
  ON platform.feedback (priority ASC NULLS LAST, created_at ASC)
  WHERE status = 'planned' AND pipeline_status = 'queued';

-- Index for active pipeline jobs
CREATE INDEX IF NOT EXISTS idx_feedback_pipeline_active
  ON platform.feedback (pipeline_status)
  WHERE pipeline_status IS NOT NULL AND pipeline_status NOT IN ('approved', 'rejected');

-- Grant permissions (OS-P006: every table change needs grants)
GRANT ALL ON platform.feedback TO authenticated;
GRANT SELECT ON platform.feedback TO anon;
