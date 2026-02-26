-- =============================================================
-- STARBASE — Phase 1A Seed Data
-- New config tables for extended task engine
-- =============================================================

-- Location Contexts
INSERT INTO config.location_contexts (name, slug, display_color, icon, sort_order) VALUES
  ('At Home',       'at_home',       '#22c55e', '🏠', 1),
  ('At Store',      'at_store',      '#3b82f6', '🛒', 2),
  ('At Computer',   'at_computer',   '#8b5cf6', '💻', 3),
  ('Out & About',   'out_about',     '#f97316', '🚗', 4),
  ('At Work',       'at_work',       '#64748b', '💼', 5),
  ('Phone Call',    'phone_call',    '#06b6d4', '📞', 6),
  ('Anywhere',      'anywhere',      '#94a3b8', '📍', 7);

-- Effort Levels
INSERT INTO config.effort_levels (name, estimated_minutes, display_color, icon, sort_order) VALUES
  ('Quick',    5,   '#22c55e', '⚡', 1),
  ('Light',    15,  '#3b82f6', '🟢', 2),
  ('Medium',   30,  '#eab308', '🟡', 3),
  ('Heavy',    60,  '#f97316', '🟠', 4),
  ('Major',    120, '#ef4444', '🔴', 5);

-- Default Tags
INSERT INTO config.tags (name, slug, display_color, icon, sort_order) VALUES
  ('Quick Win',     'quick-win',     '#22c55e', '⚡', 1),
  ('Evening',       'evening',       '#6366f1', '🌙', 2),
  ('Weekend',       'weekend',       '#f59e0b', '☀️',  3),
  ('Waiting On',    'waiting-on',    '#94a3b8', '⏳', 4),
  ('Recurring',     'recurring',     '#06b6d4', '🔄', 5),
  ('Urgent',        'urgent',        '#ef4444', '🚨', 6),
  ('Lenale',        'lenale',        '#ec4899', '👩', 7),
  ('Parker',        'parker',        '#3b82f6', '👨', 8);

-- Automation Trigger Types
INSERT INTO config.automation_trigger_types (name, slug, description, sort_order) VALUES
  ('Scheduled (Cron)',       'schedule',             'Fires on a time-based schedule (cron expression)', 1),
  ('Task Status Changed',   'task_status_change',   'Fires when a task moves to a specific status', 2),
  ('Task Created',          'task_created',         'Fires when a new task is created', 3),
  ('Task Overdue',          'task_overdue',         'Fires when a task passes its due date', 4),
  ('Checklist Complete',    'checklist_complete',   'Fires when all checklist items on a task are checked', 5),
  ('Task Assigned',         'task_assigned',        'Fires when a task is assigned or reassigned', 6),
  ('Attention Decay',       'attention_decay',      'Fires when a task has not been touched for X days', 7);

-- Automation Action Types
INSERT INTO config.automation_action_types (name, slug, description, sort_order) VALUES
  ('Create Task',           'create_task',          'Creates a new task with specified fields', 1),
  ('Update Task',           'update_task',          'Updates fields on the triggering task', 2),
  ('Send Notification',     'send_notification',    'Sends a notification via configured channel', 3),
  ('Assign Task',           'assign_task',          'Assigns or reassigns the task', 4),
  ('Create from Template',  'create_from_template', 'Instantiates all tasks from a template', 5),
  ('Escalate Priority',     'escalate_priority',    'Bumps the task priority up one level', 6),
  ('Archive Task',          'archive_task',         'Moves task to archived/cancelled status', 7);

-- Add a Someday status to task_statuses (GTD-style parking)
INSERT INTO config.task_statuses (name, display_color, icon, sort_order, metadata) VALUES
  ('Someday', '#a78bfa', '💭', 6, '{"hidden_from_daily_views": true}');

-- Add an Archived status
INSERT INTO config.task_statuses (name, display_color, icon, sort_order, metadata) VALUES
  ('Archived', '#475569', '📦', 7, '{"hidden_from_daily_views": true}');
