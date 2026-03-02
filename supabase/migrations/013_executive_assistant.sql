-- Executive Assistant (EA) Module
-- Email intelligence layer: ingestion, classification, briefs, learning loop
-- Schema: ea (following platform/config/household/finance pattern)

CREATE SCHEMA IF NOT EXISTS ea;

-- Grant usage (required for Supabase API access)
GRANT USAGE ON SCHEMA ea TO postgres, anon, authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 1. sender_profiles — per-sender importance weights
-- ════════════════════════════════════════════════════════════
CREATE TABLE ea.sender_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_email TEXT,              -- exact email (nullable if using domain only)
  sender_domain TEXT NOT NULL,    -- domain pattern (e.g., "kp.org")
  display_name TEXT NOT NULL,     -- human-readable name
  category TEXT NOT NULL DEFAULT 'other',
  importance_weight NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  always_surface BOOLEAN NOT NULL DEFAULT false,
  auto_suppress BOOLEAN NOT NULL DEFAULT false,
  deduplicate BOOLEAN NOT NULL DEFAULT false,
  share_with TEXT[] DEFAULT '{}',  -- e.g., {"lenale"}
  learned_from TEXT DEFAULT 'seed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sender_profiles_domain ON ea.sender_profiles(sender_domain);
CREATE INDEX idx_sender_profiles_email ON ea.sender_profiles(sender_email) WHERE sender_email IS NOT NULL;
CREATE INDEX idx_sender_profiles_category ON ea.sender_profiles(category);

-- ════════════════════════════════════════════════════════════
-- 2. category_config — category-level weights and display prefs
-- ════════════════════════════════════════════════════════════
CREATE TABLE ea.category_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name TEXT NOT NULL UNIQUE,
  weight NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  detail_level TEXT NOT NULL DEFAULT 'summary'
    CHECK (detail_level IN ('one_liner', 'summary', 'full_context')),
  suppress_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.20,
  urgency_default INTEGER NOT NULL DEFAULT 3
    CHECK (urgency_default BETWEEN 1 AND 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════
-- 3. explicit_rules — user-defined hard rules
-- ════════════════════════════════════════════════════════════
CREATE TABLE ea.explicit_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type TEXT NOT NULL
    CHECK (rule_type IN ('always_surface', 'auto_suppress', 'share_flag', 'detail_override', 'category_override')),
  sender_pattern TEXT,            -- glob pattern, e.g., "*@kp.org"
  category TEXT,                  -- category this rule applies to
  action_value TEXT,              -- e.g., "lenale" for share_flag, "full_context" for detail_override
  source TEXT NOT NULL DEFAULT 'user_explicit'
    CHECK (source IN ('user_explicit', 'learned', 'inferred', 'seed')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════
-- 4. email_signals — processed email records
-- ════════════════════════════════════════════════════════════
CREATE TABLE ea.email_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id TEXT NOT NULL UNIQUE,
  gmail_thread_id TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  sender TEXT NOT NULL,
  sender_domain TEXT NOT NULL,
  subject TEXT,
  snippet TEXT,                   -- first ~200 chars
  category TEXT NOT NULL DEFAULT 'other',
  urgency_score INTEGER NOT NULL DEFAULT 3
    CHECK (urgency_score BETWEEN 1 AND 4),
  importance_score NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  deduplicate_key TEXT,           -- for grouping similar emails
  was_surfaced BOOLEAN NOT NULL DEFAULT false,
  brief_id UUID,                  -- which brief included this
  user_action TEXT DEFAULT 'pending'
    CHECK (user_action IN ('pending', 'clicked', 'forwarded', 'replied', 'ignored', 'suppressed')),
  action_timestamp TIMESTAMPTZ,
  forwarded_to TEXT,
  share_with TEXT[] DEFAULT '{}',
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_signals_received ON ea.email_signals(received_at DESC);
CREATE INDEX idx_email_signals_sender_domain ON ea.email_signals(sender_domain);
CREATE INDEX idx_email_signals_category ON ea.email_signals(category);
CREATE INDEX idx_email_signals_brief ON ea.email_signals(brief_id) WHERE brief_id IS NOT NULL;
CREATE INDEX idx_email_signals_gmail_thread ON ea.email_signals(gmail_thread_id) WHERE gmail_thread_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════
-- 5. briefs — brief history with feedback
-- ════════════════════════════════════════════════════════════
CREATE TABLE ea.briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_via TEXT NOT NULL DEFAULT 'discord'
    CHECK (delivered_via IN ('discord', 'email', 'both')),
  brief_type TEXT NOT NULL DEFAULT 'daily'
    CHECK (brief_type IN ('daily', 'on_demand', 'weekly')),
  items_count INTEGER NOT NULL DEFAULT 0,
  suppressed_count INTEGER NOT NULL DEFAULT 0,
  discord_message TEXT,           -- the actual brief text sent to Discord
  email_html TEXT,                -- the HTML brief sent via email
  feedback_rating INTEGER         -- 1=useful, 2=noisy, 3=missed
    CHECK (feedback_rating BETWEEN 1 AND 3),
  feedback_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════
-- 6. reminders — urgency-based follow-up tracking
-- ════════════════════════════════════════════════════════════
CREATE TABLE ea.reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_signal_id UUID NOT NULL REFERENCES ea.email_signals(id),
  reminder_after TIMESTAMPTZ NOT NULL,
  reminder_category TEXT NOT NULL DEFAULT 'general',
  reminded_count INTEGER NOT NULL DEFAULT 0,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reminders_pending ON ea.reminders(reminder_after)
  WHERE resolved = false;

-- ════════════════════════════════════════════════════════════
-- 7. lenale_messages — messages sent to Lenale + ack tracking
-- ════════════════════════════════════════════════════════════
CREATE TABLE ea.lenale_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id UUID REFERENCES ea.briefs(id),
  items JSONB NOT NULL DEFAULT '[]',    -- array of {email_signal_id, summary}
  discord_message_id TEXT,               -- for tracking reaction
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ
);

-- ════════════════════════════════════════════════════════════
-- 8. draft_history — email drafts and user feedback
-- ════════════════════════════════════════════════════════════
CREATE TABLE ea.draft_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_signal_id UUID REFERENCES ea.email_signals(id),
  draft_text TEXT NOT NULL,
  audience_type TEXT DEFAULT 'general',
  confidence_score NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  user_action TEXT DEFAULT 'pending'
    CHECK (user_action IN ('pending', 'approved', 'edited', 'rejected')),
  edited_text TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════
-- 9. scan_state — tracks last inbox scan position
-- ════════════════════════════════════════════════════════════
CREATE TABLE ea.scan_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  last_scan_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_history_id TEXT,            -- Gmail history ID for incremental sync
  emails_processed INTEGER NOT NULL DEFAULT 0
);

INSERT INTO ea.scan_state (id, last_scan_at, emails_processed)
VALUES ('default', now() - INTERVAL '1 day', 0);

-- ════════════════════════════════════════════════════════════
-- Grant table permissions to all roles
-- ════════════════════════════════════════════════════════════
GRANT ALL ON ALL TABLES IN SCHEMA ea TO postgres, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA ea TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ea TO authenticated;

-- Default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA ea GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA ea GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA ea GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated;
