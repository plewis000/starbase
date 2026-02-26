-- =============================================================
-- STARBASE — Config Seed Data
-- All config tables seeded with defaults before first data record
-- =============================================================

-- Task Priorities
INSERT INTO config.task_priorities (name, display_color, icon, sort_order) VALUES
  ('Urgent',  '#ef4444', '🔴', 1),
  ('High',    '#f97316', '🟠', 2),
  ('Medium',  '#eab308', '🟡', 3),
  ('Low',     '#22c55e', '🟢', 4);

-- Task Statuses
INSERT INTO config.task_statuses (name, display_color, icon, sort_order) VALUES
  ('To Do',       '#94a3b8', '⬜', 1),
  ('In Progress', '#3b82f6', '🔵', 2),
  ('Blocked',     '#ef4444', '🚫', 3),
  ('Done',        '#22c55e', '✅', 4),
  ('Cancelled',   '#6b7280', '❌', 5);

-- Task Types
INSERT INTO config.task_types (name, display_color, icon, sort_order) VALUES
  ('Chore',       '#8b5cf6', '🧹', 1),
  ('Errand',      '#06b6d4', '🚗', 2),
  ('Project',     '#f59e0b', '📁', 3),
  ('Appointment', '#ec4899', '📅', 4),
  ('Reminder',    '#64748b', '🔔', 5);

-- Domains
INSERT INTO config.domains (name, slug, display_color, icon, sort_order) VALUES
  ('Household',    'household',    '#06b6d4', '🏠', 1),
  ('Finance',      'finance',      '#22c55e', '💰', 2),
  ('Health',       'health',       '#ef4444', '❤️',  3),
  ('Personal',     'personal',     '#8b5cf6', '👤', 4),
  ('Learning',     'learning',     '#f59e0b', '📚', 5),
  ('Travel',       'travel',       '#3b82f6', '✈️',  6);

-- Domain Settings (one row per domain)
INSERT INTO config.domain_settings (domain_slug, show_kanban, default_view, shared_between_users) VALUES
  ('household', true,  'list', true),
  ('finance',   false, 'list', false),
  ('health',    false, 'list', false),
  ('personal',  false, 'list', false),
  ('learning',  true,  'list', false),
  ('travel',    false, 'list', true);

-- Notification Channels
INSERT INTO config.notification_channels (name, slug, display_color, icon, sort_order) VALUES
  ('Discord',       'discord',       '#5865f2', '💬', 1),
  ('SMS',           'sms',           '#22c55e', '📱', 2),
  ('Email',         'email',         '#3b82f6', '📧', 3),
  ('Browser Push',  'browser_push',  '#f59e0b', '🔔', 4);

-- Shopping Categories
INSERT INTO config.shopping_categories (name, display_color, icon, sort_order) VALUES
  ('Produce',      '#22c55e', '🥦', 1),
  ('Meat',         '#ef4444', '🥩', 2),
  ('Dairy',        '#fbbf24', '🥛', 3),
  ('Bakery',       '#d97706', '🍞', 4),
  ('Frozen',       '#60a5fa', '🧊', 5),
  ('Pantry',       '#a78bfa', '🥫', 6),
  ('Beverages',    '#34d399', '🥤', 7),
  ('Cleaning',     '#38bdf8', '🧹', 8),
  ('Personal Care','#f472b6', '🧴', 9),
  ('Other',        '#94a3b8', '📦', 10);

-- Expense Categories
INSERT INTO config.expense_categories (name, display_color, icon, sort_order) VALUES
  ('Groceries',     '#22c55e', '🛒', 1),
  ('Dining Out',    '#f97316', '🍽️',  2),
  ('Transport',     '#3b82f6', '🚗', 3),
  ('Utilities',     '#eab308', '⚡', 4),
  ('Entertainment', '#8b5cf6', '🎬', 5),
  ('Health',        '#ef4444', '❤️',  6),
  ('Clothing',      '#ec4899', '👕', 7),
  ('Home',          '#06b6d4', '🏠', 8),
  ('Subscriptions', '#6366f1', '📱', 9),
  ('Other',         '#94a3b8', '📦', 10);

-- Recurrence Patterns
INSERT INTO config.recurrence_patterns (name, slug, sort_order) VALUES
  ('Daily',       'daily',       1),
  ('Weekdays',    'weekdays',    2),
  ('Weekly',      'weekly',      3),
  ('Biweekly',    'biweekly',    4),
  ('Monthly',     'monthly',     5),
  ('Quarterly',   'quarterly',   6),
  ('Yearly',      'yearly',      7);
