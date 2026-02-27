-- =============================================================
-- STARBASE — Migration 005: Agentic Platform
-- Adds: Finance expansion (Plaid, budgets, splits, merchant rules),
--        Agent infrastructure (conversations, messages, actions, jobs),
--        Feedback system, Contact management, Home automation stubs,
--        Meal planning stubs, User integrations & preferences
-- =============================================================

-- =============================================================
-- FINANCE SCHEMA — Plaid Integration & Budget Management
-- =============================================================

-- Linked bank institutions via Plaid
CREATE TABLE finance.plaid_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  plaid_item_id         TEXT NOT NULL UNIQUE,
  institution_name      TEXT NOT NULL,
  institution_id        TEXT,
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'error', 'disconnected')),
  last_synced_at        TIMESTAMPTZ,
  cursor                TEXT,  -- Plaid sync cursor for incremental transaction fetch
  consent_expiration    TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Individual accounts within an institution
CREATE TABLE finance.plaid_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaid_item_id         UUID NOT NULL REFERENCES finance.plaid_items(id) ON DELETE CASCADE,
  plaid_account_id      TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,
  official_name         TEXT,
  type                  TEXT NOT NULL CHECK (type IN ('checking', 'savings', 'credit', 'loan', 'investment', 'other')),
  subtype               TEXT,
  mask                  TEXT,  -- Last 4 digits
  current_balance       NUMERIC(12,2),
  available_balance     NUMERIC(12,2),
  credit_limit          NUMERIC(12,2),
  iso_currency_code     TEXT DEFAULT 'USD',
  balance_updated_at    TIMESTAMPTZ,
  active                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Household sharing for accounts (joint accounts visible to both users)
CREATE TABLE finance.account_sharing (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaid_account_id      UUID NOT NULL REFERENCES finance.plaid_accounts(id) ON DELETE CASCADE,
  owner_user_id         UUID NOT NULL REFERENCES auth.users(id),
  shared_with_user_id   UUID NOT NULL REFERENCES auth.users(id),
  permission            TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'manage')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plaid_account_id, shared_with_user_id)
);

-- Expand existing transactions table
ALTER TABLE finance.transactions
  ADD COLUMN IF NOT EXISTS plaid_transaction_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS plaid_account_id     UUID REFERENCES finance.plaid_accounts(id),
  ADD COLUMN IF NOT EXISTS merchant_name        TEXT,
  ADD COLUMN IF NOT EXISTS merchant_category    TEXT,
  ADD COLUMN IF NOT EXISTS pending              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_split_parent      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS split_parent_id      UUID REFERENCES finance.transactions(id),
  ADD COLUMN IF NOT EXISTS original_amount      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS notes                TEXT,
  ADD COLUMN IF NOT EXISTS reviewed             BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS excluded             BOOLEAN NOT NULL DEFAULT false;

-- Transaction splits (child rows of a split parent)
CREATE TABLE finance.transaction_splits (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_transaction_id UUID NOT NULL REFERENCES finance.transactions(id) ON DELETE CASCADE,
  amount                NUMERIC(12,2) NOT NULL,
  category_id           UUID REFERENCES config.expense_categories(id),
  description           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Learned merchant-to-category rules (the "ML" system)
CREATE TABLE finance.merchant_rules (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_pattern      TEXT NOT NULL,  -- Supports SQL LIKE patterns (e.g., 'COSTCO%')
  category_id           UUID NOT NULL REFERENCES config.expense_categories(id),
  created_by            UUID REFERENCES auth.users(id),
  confidence            TEXT NOT NULL DEFAULT 'user_confirmed'
                        CHECK (confidence IN ('auto', 'plaid_mapped', 'user_confirmed')),
  match_count           INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-category monthly budgets
CREATE TABLE finance.budgets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id           UUID NOT NULL REFERENCES config.expense_categories(id),
  monthly_amount        NUMERIC(12,2) NOT NULL,
  effective_from        DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until       DATE,  -- NULL = currently active
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Budget alert rules
CREATE TABLE finance.budget_alerts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id             UUID NOT NULL REFERENCES finance.budgets(id) ON DELETE CASCADE,
  threshold_percent     INTEGER NOT NULL CHECK (threshold_percent > 0 AND threshold_percent <= 100),
  channel               TEXT NOT NULL DEFAULT 'discord' CHECK (channel IN ('discord', 'web', 'both')),
  last_triggered_at     TIMESTAMPTZ,
  active                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Expand expense_categories with Plaid mapping
ALTER TABLE config.expense_categories
  ADD COLUMN IF NOT EXISTS plaid_category_mapping JSONB,       -- Maps Plaid category codes to this category
  ADD COLUMN IF NOT EXISTS is_income              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS budget_default          NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS slug                    TEXT;

-- =============================================================
-- PLATFORM SCHEMA — Agent Infrastructure
-- =============================================================

-- Agent conversation threads
CREATE TABLE platform.agent_conversations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  channel               TEXT NOT NULL CHECK (channel IN ('discord', 'web', 'claude_code', 'cron')),
  channel_id            TEXT,  -- Discord channel/DM ID, or null for web/cron
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Individual messages within conversations
CREATE TABLE platform.agent_messages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id       UUID NOT NULL REFERENCES platform.agent_conversations(id) ON DELETE CASCADE,
  role                  TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content               TEXT NOT NULL,
  tool_calls            JSONB,  -- Array of tool calls the agent made
  tokens_used           INTEGER,
  model                 TEXT,  -- 'haiku', 'sonnet', etc.
  cost_cents            NUMERIC(8,4),  -- Estimated cost for this message
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit log of every action the agent takes
CREATE TABLE platform.agent_actions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id       UUID REFERENCES platform.agent_conversations(id),  -- Nullable for cron-triggered actions
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  action_type           TEXT NOT NULL,  -- 'create_task', 'check_habit', 'query_budget', etc.
  entity_type           TEXT,           -- 'task', 'habit', 'transaction', etc.
  entity_id             UUID,
  summary               TEXT NOT NULL,  -- Human-readable one-liner for #logs channel
  channel               TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scheduled job configuration
CREATE TABLE platform.scheduled_jobs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL UNIQUE,
  description           TEXT,
  cron_expression       TEXT NOT NULL,  -- Standard cron format
  target_user_id        UUID REFERENCES auth.users(id),  -- Null = runs for all users
  channel               TEXT NOT NULL DEFAULT 'discord',
  config                JSONB NOT NULL DEFAULT '{}',  -- Job-specific settings
  active                BOOLEAN NOT NULL DEFAULT true,
  last_run_at           TIMESTAMPTZ,
  next_run_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- PLATFORM SCHEMA — User Integrations & Preferences
-- =============================================================

-- OAuth tokens and integration credentials per user per service
CREATE TABLE platform.user_integrations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  service               TEXT NOT NULL CHECK (service IN (
    'google_gmail', 'google_calendar', 'google_contacts', 'plaid', 'discord', 'home_assistant'
  )),
  access_token_vault_id TEXT,  -- Reference to Supabase Vault secret
  refresh_token_vault_id TEXT, -- Reference to Supabase Vault secret
  token_expiry          TIMESTAMPTZ,
  scopes                TEXT[],
  service_user_id       TEXT,  -- External service's user/account ID
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'expired', 'revoked', 'pending')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, service)
);

-- Per-user agent and system preferences
CREATE TABLE platform.user_preferences (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  preference_key        TEXT NOT NULL,
  preference_value      JSONB NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, preference_key)
);

-- =============================================================
-- PLATFORM SCHEMA — Feedback System
-- =============================================================

CREATE TABLE platform.feedback (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by          UUID NOT NULL REFERENCES auth.users(id),
  type                  TEXT NOT NULL DEFAULT 'improvement'
                        CHECK (type IN ('bug', 'feature_request', 'improvement', 'complaint')),
  body                  TEXT NOT NULL,
  channel               TEXT NOT NULL DEFAULT 'web'
                        CHECK (channel IN ('discord', 'web', 'claude_code')),
  status                TEXT NOT NULL DEFAULT 'new'
                        CHECK (status IN ('new', 'acknowledged', 'planned', 'in_progress', 'done', 'wont_fix')),
  priority              TEXT DEFAULT 'medium'
                        CHECK (priority IN ('low', 'medium', 'high')),
  tags                  TEXT[],
  resolved_at           TIMESTAMPTZ,
  resolution_notes      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- PLATFORM SCHEMA — Contact Management
-- =============================================================

-- Synced from Google Contacts (labeled group only)
CREATE TABLE platform.contacts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  google_contact_id     TEXT,
  full_name             TEXT NOT NULL,
  email                 TEXT,
  phone                 TEXT,
  birthday              DATE,
  anniversary           DATE,
  relationship          TEXT,  -- friend, family, coworker, etc.
  notes                 TEXT,
  tags                  TEXT[],
  last_synced_at        TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, google_contact_id)
);

-- Contact events (birthdays, anniversaries, custom recurring events)
CREATE TABLE platform.contact_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id            UUID NOT NULL REFERENCES platform.contacts(id) ON DELETE CASCADE,
  event_type            TEXT NOT NULL CHECK (event_type IN ('birthday', 'anniversary', 'custom')),
  event_name            TEXT,  -- Required for 'custom', e.g., "Kid's birthday", "Annual trip"
  event_date            DATE NOT NULL,
  recurrence            TEXT NOT NULL DEFAULT 'yearly'
                        CHECK (recurrence IN ('yearly', 'once', 'monthly')),
  reminder_days_before  INTEGER NOT NULL DEFAULT 3,
  notes                 TEXT,
  last_reminded_at      TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- PLATFORM SCHEMA — Home Automation (stubs for Phase 9)
-- =============================================================

CREATE TABLE config.home_areas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  icon                  TEXT,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  active                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE platform.home_devices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ha_entity_id          TEXT NOT NULL UNIQUE,
  friendly_name         TEXT NOT NULL,
  device_type           TEXT NOT NULL CHECK (device_type IN (
    'light', 'lock', 'thermostat', 'sensor', 'switch', 'cover', 'camera', 'climate', 'other'
  )),
  area_id               UUID REFERENCES config.home_areas(id),
  protocol              TEXT CHECK (protocol IN ('zwave', 'zigbee', 'wifi', 'thread', 'other')),
  is_monitored          BOOLEAN NOT NULL DEFAULT true,
  last_synced_at        TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE platform.home_scenes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  description           TEXT,
  actions               JSONB NOT NULL DEFAULT '[]',  -- Array of HA service calls
  trigger_phrase        TEXT,  -- Natural language trigger, e.g., "good night"
  created_by            UUID REFERENCES auth.users(id),
  active                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE platform.home_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id             UUID NOT NULL REFERENCES platform.home_devices(id) ON DELETE CASCADE,
  event_type            TEXT NOT NULL CHECK (event_type IN ('state_change', 'alert', 'anomaly')),
  old_state             TEXT,
  new_state             TEXT,
  logged_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- HOUSEHOLD SCHEMA — Meal Planning (stubs for Phase 7)
-- =============================================================

CREATE TABLE household.recipes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 TEXT NOT NULL,
  source_url            TEXT,
  servings              INTEGER DEFAULT 4,
  prep_time_minutes     INTEGER,
  cook_time_minutes     INTEGER,
  instructions          TEXT,
  tags                  TEXT[],  -- 'quick', 'healthy', 'kid-friendly', etc.
  notes                 TEXT,
  created_by            UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE household.recipe_ingredients (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id             UUID NOT NULL REFERENCES household.recipes(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  quantity              TEXT,  -- "1.5 lbs", "2 cups", "3 cloves"
  category_id           UUID REFERENCES config.shopping_categories(id),
  is_optional           BOOLEAN NOT NULL DEFAULT false,
  sort_order            INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE household.meal_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start            DATE NOT NULL,  -- Monday of the week
  created_by            UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE household.meal_plan_entries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id          UUID NOT NULL REFERENCES household.meal_plans(id) ON DELETE CASCADE,
  recipe_id             UUID REFERENCES household.recipes(id),  -- Nullable for non-recipe entries
  day_of_week           INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Monday
  meal_type             TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  label                 TEXT,  -- For non-recipe entries: "Leftovers", "Eat out", etc.
  servings_override     INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- ROW LEVEL SECURITY — All new tables
-- =============================================================

-- Finance tables
ALTER TABLE finance.plaid_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plaid_items_own" ON finance.plaid_items
  FOR ALL TO authenticated USING (auth.uid() = user_id);

ALTER TABLE finance.plaid_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plaid_accounts_own" ON finance.plaid_accounts
  FOR ALL TO authenticated
  USING (plaid_item_id IN (SELECT id FROM finance.plaid_items WHERE user_id = auth.uid()));

ALTER TABLE finance.account_sharing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_sharing_involved" ON finance.account_sharing
  FOR ALL TO authenticated
  USING (auth.uid() = owner_user_id OR auth.uid() = shared_with_user_id);

ALTER TABLE finance.transaction_splits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transaction_splits_own" ON finance.transaction_splits
  FOR ALL TO authenticated
  USING (parent_transaction_id IN (SELECT id FROM finance.transactions WHERE user_id = auth.uid()));

ALTER TABLE finance.merchant_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "merchant_rules_authenticated" ON finance.merchant_rules
  FOR ALL TO authenticated USING (true);

ALTER TABLE finance.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "budgets_own" ON finance.budgets
  FOR ALL TO authenticated USING (auth.uid() = user_id);

ALTER TABLE finance.budget_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "budget_alerts_own" ON finance.budget_alerts
  FOR ALL TO authenticated
  USING (budget_id IN (SELECT id FROM finance.budgets WHERE user_id = auth.uid()));

-- Platform tables — Agent
ALTER TABLE platform.agent_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_conversations_own" ON platform.agent_conversations
  FOR ALL TO authenticated USING (auth.uid() = user_id);

ALTER TABLE platform.agent_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_messages_own" ON platform.agent_messages
  FOR ALL TO authenticated
  USING (conversation_id IN (SELECT id FROM platform.agent_conversations WHERE user_id = auth.uid()));

ALTER TABLE platform.agent_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_actions_own" ON platform.agent_actions
  FOR ALL TO authenticated USING (auth.uid() = user_id);

ALTER TABLE platform.scheduled_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scheduled_jobs_admin" ON platform.scheduled_jobs
  FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');

-- Platform tables — User
ALTER TABLE platform.user_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_integrations_own" ON platform.user_integrations
  FOR ALL TO authenticated USING (auth.uid() = user_id);

ALTER TABLE platform.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_preferences_own" ON platform.user_preferences
  FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Platform tables — Feedback (both users can see all)
ALTER TABLE platform.feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feedback_read_all" ON platform.feedback
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "feedback_write_own" ON platform.feedback
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = submitted_by);
CREATE POLICY "feedback_update_own" ON platform.feedback
  FOR UPDATE TO authenticated USING (auth.uid() = submitted_by);

-- Platform tables — Contacts
ALTER TABLE platform.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_own" ON platform.contacts
  FOR ALL TO authenticated USING (auth.uid() = user_id);

ALTER TABLE platform.contact_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contact_events_own" ON platform.contact_events
  FOR ALL TO authenticated
  USING (contact_id IN (SELECT id FROM platform.contacts WHERE user_id = auth.uid()));

-- Platform tables — Home (authenticated read/write for household)
ALTER TABLE platform.home_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "home_devices_authenticated" ON platform.home_devices
  FOR ALL TO authenticated USING (true);

ALTER TABLE platform.home_scenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "home_scenes_authenticated" ON platform.home_scenes
  FOR ALL TO authenticated USING (true);

ALTER TABLE platform.home_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "home_events_authenticated" ON platform.home_events
  FOR ALL TO authenticated USING (true);

-- Config tables
ALTER TABLE config.home_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "home_areas_read" ON config.home_areas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "home_areas_write_admin" ON config.home_areas
  FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');

-- Household tables — Recipes and meal planning (shared household)
ALTER TABLE household.recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recipes_authenticated" ON household.recipes
  FOR ALL TO authenticated USING (true);

ALTER TABLE household.recipe_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recipe_ingredients_authenticated" ON household.recipe_ingredients
  FOR ALL TO authenticated USING (true);

ALTER TABLE household.meal_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meal_plans_authenticated" ON household.meal_plans
  FOR ALL TO authenticated USING (true);

ALTER TABLE household.meal_plan_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meal_plan_entries_authenticated" ON household.meal_plan_entries
  FOR ALL TO authenticated USING (true);

-- =============================================================
-- INDEXES for performance
-- =============================================================

-- Finance
CREATE INDEX idx_transactions_plaid_id ON finance.transactions(plaid_transaction_id) WHERE plaid_transaction_id IS NOT NULL;
CREATE INDEX idx_transactions_account ON finance.transactions(plaid_account_id) WHERE plaid_account_id IS NOT NULL;
CREATE INDEX idx_transactions_date ON finance.transactions(transaction_date DESC);
CREATE INDEX idx_transactions_user_date ON finance.transactions(user_id, transaction_date DESC);
CREATE INDEX idx_transactions_category ON finance.transactions(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX idx_transactions_reviewed ON finance.transactions(reviewed) WHERE reviewed = false;
CREATE INDEX idx_transactions_pending ON finance.transactions(pending) WHERE pending = true;
CREATE INDEX idx_transaction_splits_parent ON finance.transaction_splits(parent_transaction_id);
CREATE INDEX idx_merchant_rules_pattern ON finance.merchant_rules(merchant_pattern);
CREATE INDEX idx_budgets_active ON finance.budgets(category_id, effective_from DESC) WHERE effective_until IS NULL;
CREATE INDEX idx_plaid_accounts_item ON finance.plaid_accounts(plaid_item_id);

-- Agent
CREATE INDEX idx_agent_conversations_user ON platform.agent_conversations(user_id, last_message_at DESC);
CREATE INDEX idx_agent_messages_conversation ON platform.agent_messages(conversation_id, created_at);
CREATE INDEX idx_agent_actions_user ON platform.agent_actions(user_id, created_at DESC);
CREATE INDEX idx_agent_actions_entity ON platform.agent_actions(entity_type, entity_id) WHERE entity_id IS NOT NULL;

-- Contacts
CREATE INDEX idx_contacts_user ON platform.contacts(user_id);
CREATE INDEX idx_contact_events_date ON platform.contact_events(event_date);

-- Home
CREATE INDEX idx_home_events_device ON platform.home_events(device_id, logged_at DESC);

-- Feedback
CREATE INDEX idx_feedback_status ON platform.feedback(status) WHERE status NOT IN ('done', 'wont_fix');

-- Recipes
CREATE INDEX idx_recipe_ingredients_recipe ON household.recipe_ingredients(recipe_id);
CREATE INDEX idx_meal_plan_entries_plan ON household.meal_plan_entries(meal_plan_id);
