-- =============================================================
-- STARBASE — Phase 1A: Extended Task Engine
-- Dependencies, checklists, tags, activity log, automation rules,
-- saved filters, templates, effort/context fields
-- =============================================================

-- =============================================================
-- NEW CONFIG TABLES
-- =============================================================

-- Location contexts (at_home, at_store, at_computer, etc.)
CREATE TABLE config.location_contexts (
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

-- Effort levels (quick, medium, heavy — or minute-based)
CREATE TABLE config.effort_levels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  estimated_minutes INTEGER,
  display_color TEXT,
  icon          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB
);

-- Tags (user-created, freeform, many-to-many with tasks)
CREATE TABLE config.tags (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  display_color TEXT,
  icon          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB
);

-- Automation trigger types
CREATE TABLE config.automation_trigger_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  description   TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB
);

-- Automation action types
CREATE TABLE config.automation_action_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  description   TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB
);

-- =============================================================
-- ALTER EXISTING TABLES — Add new fields to tasks
-- =============================================================

-- Effort tracking
ALTER TABLE platform.tasks ADD COLUMN effort_level_id UUID REFERENCES config.effort_levels(id);
ALTER TABLE platform.tasks ADD COLUMN estimated_minutes INTEGER;
ALTER TABLE platform.tasks ADD COLUMN actual_minutes INTEGER;

-- Location context
ALTER TABLE platform.tasks ADD COLUMN location_context_id UUID REFERENCES config.location_contexts(id);

-- Richer recurrence — RRULE string replaces simple pattern FK
-- Keep recurrence_id for backward compat; rrule takes precedence when present
ALTER TABLE platform.tasks ADD COLUMN recurrence_rule TEXT; -- iCal RRULE format
ALTER TABLE platform.tasks ADD COLUMN recurrence_source_id UUID REFERENCES platform.tasks(id); -- points to original recurring task

-- Workflow support
ALTER TABLE platform.tasks ADD COLUMN workflow_phase INTEGER; -- phase number within a template
ALTER TABLE platform.tasks ADD COLUMN template_id UUID; -- FK added after template table created

-- Attention decay
ALTER TABLE platform.tasks ADD COLUMN last_touched_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE platform.tasks ADD COLUMN snoozed_until DATE;

-- Add attention_decay_days to domain settings
ALTER TABLE config.domain_settings ADD COLUMN attention_decay_days INTEGER DEFAULT 14;
ALTER TABLE config.domain_settings ADD COLUMN auto_escalate_enabled BOOLEAN NOT NULL DEFAULT false;

-- =============================================================
-- TASK DEPENDENCIES
-- =============================================================

CREATE TABLE platform.task_dependencies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           UUID NOT NULL REFERENCES platform.tasks(id) ON DELETE CASCADE,
  depends_on_id     UUID NOT NULL REFERENCES platform.tasks(id) ON DELETE CASCADE,
  dependency_type   TEXT NOT NULL DEFAULT 'blocks' CHECK (dependency_type IN ('blocks', 'related', 'wait_for')),
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, depends_on_id)
);

-- Prevent self-dependency
ALTER TABLE platform.task_dependencies
  ADD CONSTRAINT no_self_dependency CHECK (task_id != depends_on_id);

-- =============================================================
-- TASK CHECKLIST ITEMS (lightweight, not full tasks)
-- =============================================================

CREATE TABLE platform.task_checklist_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES platform.tasks(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  checked       BOOLEAN NOT NULL DEFAULT false,
  checked_at    TIMESTAMPTZ,
  checked_by    UUID REFERENCES auth.users(id),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- TASK TAGS (many-to-many join)
-- =============================================================

CREATE TABLE platform.task_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES platform.tasks(id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES config.tags(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, tag_id)
);

-- =============================================================
-- ACTIVITY LOG (all changes on all entities)
-- =============================================================

CREATE TABLE platform.activity_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   TEXT NOT NULL, -- 'task', 'shopping_item', 'checklist_item', etc.
  entity_id     UUID NOT NULL,
  action        TEXT NOT NULL, -- 'created', 'updated', 'completed', 'assigned', 'handed_off', 'commented', 'archived'
  field_name    TEXT,          -- which field changed (null for create/delete)
  old_value     TEXT,
  new_value     TEXT,
  performed_by  UUID REFERENCES auth.users(id),
  performed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB          -- extra context (e.g., handoff note)
);

-- =============================================================
-- TASK COMMENTS
-- =============================================================

CREATE TABLE platform.task_comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES platform.tasks(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id),
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- TASK TEMPLATES
-- =============================================================

CREATE TABLE platform.task_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  domain_slug   TEXT REFERENCES config.domains(slug),
  total_phases  INTEGER NOT NULL DEFAULT 1,
  created_by    UUID REFERENCES auth.users(id),
  source        TEXT NOT NULL DEFAULT 'manual',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB
);

CREATE TABLE platform.task_template_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         UUID NOT NULL REFERENCES platform.task_templates(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  description         TEXT,
  phase               INTEGER NOT NULL DEFAULT 1,
  relative_due_days   INTEGER, -- days relative to template instantiation (negative = before, positive = after)
  priority_id         UUID REFERENCES config.task_priorities(id),
  task_type_id        UUID REFERENCES config.task_types(id),
  effort_level_id     UUID REFERENCES config.effort_levels(id),
  assign_to_role      TEXT, -- 'creator', 'partner', 'rotate', or a specific user id
  sort_order          INTEGER NOT NULL DEFAULT 0,
  checklist_items     JSONB, -- array of checklist item titles to create
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata            JSONB
);

-- Now add the FK from tasks back to templates
ALTER TABLE platform.tasks
  ADD CONSTRAINT tasks_template_id_fk FOREIGN KEY (template_id) REFERENCES platform.task_templates(id);

-- =============================================================
-- AUTOMATION RULES ENGINE
-- =============================================================

CREATE TABLE platform.automation_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  domain_slug     TEXT REFERENCES config.domains(slug),

  -- Trigger: what fires this rule
  trigger_type    TEXT NOT NULL, -- 'schedule', 'task_status_change', 'task_created', 'task_overdue', 'checklist_complete', 'task_assigned'
  trigger_config  JSONB NOT NULL, -- e.g. {"cron": "0 8 * * 6"} or {"from_status": "in_progress", "to_status": "done"} or {"overdue_hours": 24}

  -- Condition: optional filter (only fire if this is true)
  condition_config JSONB, -- e.g. {"domain_slug": "household", "priority": "high"} or null for "always"

  -- Action: what to do
  action_type     TEXT NOT NULL, -- 'create_task', 'update_task', 'send_notification', 'assign_task', 'create_from_template', 'escalate_priority'
  action_config   JSONB NOT NULL, -- e.g. {"title": "Clean bathrooms", "assigned_to": "rotate", "priority": "medium"} or {"template_id": "uuid", "assign_to": "creator"}

  -- Execution tracking
  active          BOOLEAN NOT NULL DEFAULT true,
  last_run_at     TIMESTAMPTZ,
  run_count       INTEGER NOT NULL DEFAULT 0,

  created_by      UUID REFERENCES auth.users(id),
  source          TEXT NOT NULL DEFAULT 'manual',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB
);

-- Automation execution log (what the rule did, when, outcome)
CREATE TABLE platform.automation_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id         UUID NOT NULL REFERENCES platform.automation_rules(id) ON DELETE CASCADE,
  trigger_event   JSONB, -- what triggered it
  action_taken    JSONB, -- what it did
  result          TEXT NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'failure', 'skipped')),
  error_message   TEXT,
  executed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- SAVED FILTERS / SMART VIEWS
-- =============================================================

CREATE TABLE platform.saved_filters (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  icon          TEXT,
  user_id       UUID REFERENCES auth.users(id), -- null = shared/system filter
  filter_config JSONB NOT NULL, -- e.g. {"status": ["todo","in_progress"], "priority": ["urgent","high"], "domain": "household", "assigned_to": "me", "due": "this_week"}
  sort_config   JSONB, -- e.g. {"field": "due_date", "direction": "asc"}
  is_default    BOOLEAN NOT NULL DEFAULT false,
  is_pinned     BOOLEAN NOT NULL DEFAULT false,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- ASSIGNMENT ROTATION
-- =============================================================

CREATE TABLE platform.assignment_rotations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL, -- e.g. "Bathroom cleaning rotation"
  domain_slug     TEXT REFERENCES config.domains(slug),
  user_ids        UUID[] NOT NULL, -- ordered list of user IDs in rotation
  current_index   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- ROW LEVEL SECURITY — new tables
-- =============================================================

-- Config tables: same pattern as existing config (read all, write admin)
ALTER TABLE config.location_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE config.effort_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE config.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE config.automation_trigger_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE config.automation_action_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "config_read_authenticated" ON config.location_contexts FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_read_authenticated" ON config.effort_levels FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_read_authenticated" ON config.tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_read_authenticated" ON config.automation_trigger_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_read_authenticated" ON config.automation_action_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "config_write_admin" ON config.location_contexts FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "config_write_admin" ON config.effort_levels FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');
-- Tags: any authenticated user can create (not admin-only)
CREATE POLICY "tags_write_authenticated" ON config.tags FOR ALL TO authenticated USING (true);
CREATE POLICY "config_write_admin" ON config.automation_trigger_types FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "config_write_admin" ON config.automation_action_types FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');

-- Platform tables: shared household data (all authenticated)
ALTER TABLE platform.task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.task_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.task_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.task_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.automation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.saved_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.assignment_rotations ENABLE ROW LEVEL SECURITY;

-- All shared household data: any authenticated user can read and write
CREATE POLICY "shared_read" ON platform.task_dependencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "shared_write" ON platform.task_dependencies FOR ALL TO authenticated USING (true);
CREATE POLICY "shared_read" ON platform.task_checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "shared_write" ON platform.task_checklist_items FOR ALL TO authenticated USING (true);
CREATE POLICY "shared_read" ON platform.task_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "shared_write" ON platform.task_tags FOR ALL TO authenticated USING (true);
CREATE POLICY "shared_read" ON platform.activity_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "shared_write" ON platform.activity_log FOR ALL TO authenticated USING (true);
CREATE POLICY "shared_read" ON platform.task_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "shared_write" ON platform.task_comments FOR ALL TO authenticated USING (true);
CREATE POLICY "shared_read" ON platform.task_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "shared_write" ON platform.task_templates FOR ALL TO authenticated USING (true);
CREATE POLICY "shared_read" ON platform.task_template_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "shared_write" ON platform.task_template_items FOR ALL TO authenticated USING (true);
CREATE POLICY "shared_read" ON platform.automation_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "shared_write" ON platform.automation_log FOR ALL TO authenticated USING (true);
CREATE POLICY "shared_read" ON platform.assignment_rotations FOR SELECT TO authenticated USING (true);
CREATE POLICY "shared_write" ON platform.assignment_rotations FOR ALL TO authenticated USING (true);

-- Automation rules: admin only for write, all can read
CREATE POLICY "rules_read_all" ON platform.automation_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "rules_write_admin" ON platform.automation_rules FOR ALL TO authenticated
  USING ((SELECT role FROM platform.users WHERE id = auth.uid()) = 'admin');

-- Saved filters: user sees own + shared (user_id IS NULL)
CREATE POLICY "filters_read" ON platform.saved_filters FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "filters_write_own" ON platform.saved_filters FOR ALL TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);

-- =============================================================
-- INDEXES for performance
-- =============================================================

CREATE INDEX idx_tasks_status ON platform.tasks(status_id);
CREATE INDEX idx_tasks_assigned ON platform.tasks(assigned_to);
CREATE INDEX idx_tasks_due ON platform.tasks(due_date);
CREATE INDEX idx_tasks_schedule ON platform.tasks(schedule_date);
CREATE INDEX idx_tasks_parent ON platform.tasks(parent_task_id);
CREATE INDEX idx_tasks_template ON platform.tasks(template_id);
CREATE INDEX idx_tasks_recurrence_source ON platform.tasks(recurrence_source_id);
CREATE INDEX idx_tasks_last_touched ON platform.tasks(last_touched_at);
CREATE INDEX idx_task_deps_task ON platform.task_dependencies(task_id);
CREATE INDEX idx_task_deps_depends ON platform.task_dependencies(depends_on_id);
CREATE INDEX idx_task_checklist_task ON platform.task_checklist_items(task_id);
CREATE INDEX idx_task_tags_task ON platform.task_tags(task_id);
CREATE INDEX idx_task_tags_tag ON platform.task_tags(tag_id);
CREATE INDEX idx_activity_entity ON platform.activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_performed ON platform.activity_log(performed_at);
CREATE INDEX idx_task_comments_task ON platform.task_comments(task_id);
CREATE INDEX idx_automation_rules_trigger ON platform.automation_rules(trigger_type);
CREATE INDEX idx_automation_log_rule ON platform.automation_log(rule_id);
CREATE INDEX idx_domain_memberships_task ON platform.task_domain_memberships(task_id);
CREATE INDEX idx_domain_memberships_domain ON platform.task_domain_memberships(domain_slug);
