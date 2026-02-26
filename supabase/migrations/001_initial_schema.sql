-- =============================================================
-- STARBASE — Initial Schema Migration
-- Phase 0B: All platform + config tables, RLS on every table
-- =============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- SCHEMAS
-- =============================================================
CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS household;
CREATE SCHEMA IF NOT EXISTS finance;
CREATE SCHEMA IF NOT EXISTS health;
CREATE SCHEMA IF NOT EXISTS config;

-- =============================================================
-- CONFIG TABLES
-- Pattern: id, name, display_color, icon, sort_order, active,
--          created_at, metadata
-- =============================================================

-- Task priorities
CREATE TABLE config.task_priorities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  display_color TEXT,
  icon          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB
);

-- Task statuses
CREATE TABLE config.task_statuses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  display_color TEXT,
  icon          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB
);

-- Task types
CREATE TABLE config.task_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  display_color TEXT,
  icon          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB
);

-- Domains (household, finance, health, etc.)
CREATE TABLE config.domains (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  display_color TEXT,
  icon          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB
);

-- Domain settings (feature flags per domain)
CREATE TABLE config.domain_settings (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_slug               TEXT NOT NULL REFERENCES config.domains(slug),
  show_start_date           BOOLEAN NOT NULL DEFAULT false,
  show_estimated_duration   BOOLEAN NOT NULL DEFAULT false,
  show_dependencies         BOOLEAN NOT NULL DEFAULT false,
  show_gantt                BOOLEAN NOT NULL DEFAULT false,
  show_kanban               BOOLEAN NOT NULL DEFAULT true,
  default_view              TEXT NOT NULL DEFAULT 'list',
  gamification_enabled      BOOLEAN NOT NULL DEFAULT false,
  shared_between_users      BOOLEAN NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata                  JSONB
);

-- Notification channels
CREATE TABLE config.notification_channels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  display_color TEXT,
  icon          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB
);

-- Shopping list categories
CREATE TABLE config.shopping_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  display_color TEXT,
  icon          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB
);

-- Expense categories
CREATE TABLE config.expense_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  display_color TEXT,
  icon          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB
);

-- Recurrence patterns
CREATE TABLE config.recurrence_patterns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  display_color TEXT,
  icon          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB
);

-- Config change log (audit trail for all admin changes)
CREATE TABLE config.change_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name    TEXT NOT NULL,
  row_id        UUID NOT NULL,
  old_value     JSONB,
  new_value     JSONB,
  changed_by    UUID REFERENCES auth.users(id),
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- PLATFORM TABLES
-- =============================================================

-- Users (mirrors auth.users, adds app-level profile)
CREATE TABLE platform.users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  full_name     TEXT,
  avatar_url    TEXT,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  source        TEXT NOT NULL DEFAULT 'google',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Task Engine
CREATE TABLE platform.tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  description         TEXT,
  status_id           UUID REFERENCES config.task_statuses(id),
  priority_id         UUID REFERENCES config.task_priorities(id),
  task_type_id        UUID REFERENCES config.task_types(id),
  assigned_to         UUID REFERENCES auth.users(id),
  created_by          UUID REFERENCES auth.users(id),
  due_date            DATE,
  schedule_date       DATE,
  completed_at        TIMESTAMPTZ,
  recurrence_id       UUID REFERENCES config.recurrence_patterns(id),
  parent_task_id      UUID REFERENCES platform.tasks(id),
  source              TEXT NOT NULL DEFAULT 'manual',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata            JSONB
);

-- Task domain memberships (a task can belong to multiple domains)
CREATE TABLE platform.task_domain_memberships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES platform.tasks(id) ON DELETE CASCADE,
  domain_slug TEXT NOT NULL REFERENCES config.domains(slug),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notification Service
CREATE TABLE platform.notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  channel_id      UUID REFERENCES config.notification_channels(id),
  title           TEXT NOT NULL,
  body            TEXT,
  sent_at         TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  reply_context   JSONB,
  source          TEXT NOT NULL DEFAULT 'system',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB
);

-- User notification preferences
CREATE TABLE platform.user_notification_prefs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  channel_id      UUID NOT NULL REFERENCES config.notification_channels(id),
  enabled         BOOLEAN NOT NULL DEFAULT true,
  config          JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Calendar Bridge
CREATE TABLE platform.calendar_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  external_id     TEXT,
  title           TEXT NOT NULL,
  description     TEXT,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ,
  all_day         BOOLEAN NOT NULL DEFAULT false,
  calendar_source TEXT NOT NULL DEFAULT 'google',
  source          TEXT NOT NULL DEFAULT 'google',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB
);

-- People Registry
CREATE TABLE platform.people (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  relationship    TEXT,
  notes           TEXT,
  linked_user_id  UUID REFERENCES auth.users(id),
  source          TEXT NOT NULL DEFAULT 'manual',
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB
);

-- File Vault
CREATE TABLE platform.files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  storage_path    TEXT NOT NULL,
  mime_type       TEXT,
  size_bytes      BIGINT,
  uploaded_by     UUID REFERENCES auth.users(id),
  domain_slug     TEXT REFERENCES config.domains(slug),
  source          TEXT NOT NULL DEFAULT 'manual',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB
);

-- =============================================================
-- HOUSEHOLD TABLES
-- =============================================================

-- Shopping lists
CREATE TABLE household.shopping_lists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  store       TEXT,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_by  UUID REFERENCES auth.users(id),
  source      TEXT NOT NULL DEFAULT 'manual',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shopping items
CREATE TABLE household.shopping_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id       UUID NOT NULL REFERENCES household.shopping_lists(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  quantity      TEXT,
  category_id   UUID REFERENCES config.shopping_categories(id),
  checked       BOOLEAN NOT NULL DEFAULT false,
  checked_at    TIMESTAMPTZ,
  checked_by    UUID REFERENCES auth.users(id),
  is_staple     BOOLEAN NOT NULL DEFAULT false,
  added_by      UUID REFERENCES auth.users(id),
  source        TEXT NOT NULL DEFAULT 'manual',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- FINANCE TABLES
-- =============================================================

-- Financial Ledger
CREATE TABLE finance.transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount          NUMERIC(12,2) NOT NULL,
  description     TEXT,
  category_id     UUID REFERENCES config.expense_categories(id),
  transaction_date DATE NOT NULL,
  user_id         UUID REFERENCES auth.users(id),
  source          TEXT NOT NULL DEFAULT 'manual',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB
);

-- =============================================================
-- ROW LEVEL SECURITY
-- Applied to every table before any data is inserted
-- =============================================================

-- CONFIG TABLES: read by all authenticated users, write by admin only
ALTER TABLE config.task_priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE config.task_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE config.task_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE config.domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE config.domain_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE config.notification_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE config.shopping_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE config.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE config.recurrence_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE config.change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "config_read_authenticated" ON config.task_priorities FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_read_authenticated" ON config.task_statuses FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_read_authenticated" ON config.task_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_read_authenticated" ON config.domains FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_read_authenticated" ON config.domain_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_read_authenticated" ON config.notification_channels FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_read_authenticated" ON config.shopping_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_read_authenticated" ON config.expense_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_read_authenticated" ON config.recurrence_patterns FOR SELECT TO authenticated USING (true);

-- Admin write policies (enforced by platform.users.role = 'admin')
CREATE POLICY "config_write_admin" ON config.task_priorities FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "config_write_admin" ON config.task_statuses FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "config_write_admin" ON config.task_types FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "config_write_admin" ON config.domains FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "config_write_admin" ON config.domain_settings FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "config_write_admin" ON config.notification_channels FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "config_write_admin" ON config.shopping_categories FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "config_write_admin" ON config.expense_categories FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "config_write_admin" ON config.recurrence_patterns FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "config_change_log_admin" ON config.change_log FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');

-- PLATFORM TABLES
ALTER TABLE platform.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.task_domain_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.user_notification_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.files ENABLE ROW LEVEL SECURITY;

-- Users: each user sees all users (needed for assignment), only edits own profile
CREATE POLICY "users_read_all" ON platform.users FOR SELECT TO authenticated USING (true);
CREATE POLICY "users_write_own" ON platform.users FOR ALL TO authenticated USING (auth.uid() = id);

-- Tasks: all authenticated users see all tasks (household is shared)
CREATE POLICY "tasks_read_all" ON platform.tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "tasks_write_authenticated" ON platform.tasks FOR ALL TO authenticated USING (true);

CREATE POLICY "task_memberships_read_all" ON platform.task_domain_memberships FOR SELECT TO authenticated USING (true);
CREATE POLICY "task_memberships_write_authenticated" ON platform.task_domain_memberships FOR ALL TO authenticated USING (true);

-- Notifications: each user sees only their own
CREATE POLICY "notifications_own" ON platform.notifications FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notification_prefs_own" ON platform.user_notification_prefs FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Calendar: each user sees only their own events
CREATE POLICY "calendar_own" ON platform.calendar_events FOR ALL TO authenticated USING (auth.uid() = user_id);

-- People: all authenticated users can read/write (shared registry)
CREATE POLICY "people_read_all" ON platform.people FOR SELECT TO authenticated USING (true);
CREATE POLICY "people_write_authenticated" ON platform.people FOR ALL TO authenticated USING (true);

-- Files: all authenticated users can read/write
CREATE POLICY "files_read_all" ON platform.files FOR SELECT TO authenticated USING (true);
CREATE POLICY "files_write_authenticated" ON platform.files FOR ALL TO authenticated USING (true);

-- HOUSEHOLD TABLES
ALTER TABLE household.shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE household.shopping_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shopping_lists_read_all" ON household.shopping_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "shopping_lists_write_authenticated" ON household.shopping_lists FOR ALL TO authenticated USING (true);
CREATE POLICY "shopping_items_read_all" ON household.shopping_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "shopping_items_write_authenticated" ON household.shopping_items FOR ALL TO authenticated USING (true);

-- FINANCE TABLES
ALTER TABLE finance.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transactions_own" ON finance.transactions FOR ALL TO authenticated USING (auth.uid() = user_id);

-- =============================================================
-- AUTO-CREATE USER PROFILE ON SIGNUP
-- =============================================================
CREATE OR REPLACE FUNCTION platform.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO platform.users (id, email, full_name, avatar_url, role, source)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    'member',
    COALESCE(NEW.raw_app_meta_data->>'provider', 'google')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION platform.handle_new_user();
