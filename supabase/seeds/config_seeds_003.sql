-- =============================================================
-- STARBASE — Phase 2A: Goals & Habits Config Seeds
-- =============================================================

-- Goal Categories
INSERT INTO config.goal_categories (name, slug, description, display_color, icon, sort_order) VALUES
  ('Health & Fitness',    'health',        'Physical health, exercise, nutrition',           '#22C55E', '💪', 1),
  ('Career & Work',       'career',        'Professional development, skills, promotions',   '#3B82F6', '💼', 2),
  ('Financial',           'financial',     'Savings, debt, investments, income',             '#EAB308', '💰', 3),
  ('Personal Growth',     'personal',      'Learning, reading, skills, mindset',             '#A855F7', '🧠', 4),
  ('Relationships',       'relationships', 'Family, friends, community, marriage',           '#EC4899', '❤️', 5),
  ('Home & Living',       'home',          'Home improvement, organization, maintenance',    '#F97316', '🏠', 6),
  ('Creative',            'creative',      'Art, music, writing, side projects',             '#06B6D4', '🎨', 7),
  ('Spiritual & Mental',  'spiritual',     'Meditation, mindfulness, faith, therapy',        '#8B5CF6', '🧘', 8);

-- Goal Timeframes
INSERT INTO config.goal_timeframes (name, slug, typical_days, display_color, icon, sort_order) VALUES
  ('Annual',     'annual',     365, '#3B82F6', '📅', 1),
  ('Quarterly',  'quarterly',  90,  '#22C55E', '📊', 2),
  ('Monthly',    'monthly',    30,  '#EAB308', '🗓️', 3),
  ('Open-ended', 'open',       NULL, '#6B7280', '♾️', 4);

-- Habit Frequencies
INSERT INTO config.habit_frequencies (name, slug, description, target_type, default_target, display_color, icon, sort_order) VALUES
  ('Every day',        'daily',         'Do this every single day',         'daily',   1, '#22C55E', '☀️', 1),
  ('Weekdays',         'weekdays',      'Monday through Friday',            'weekly',  5, '#3B82F6', '💼', 2),
  ('3x per week',      '3x_weekly',     'Three times per week, any days',   'weekly',  3, '#A855F7', '🔄', 3),
  ('4x per week',      '4x_weekly',     'Four times per week, any days',    'weekly',  4, '#EC4899', '🔄', 4),
  ('5x per week',      '5x_weekly',     'Five times per week, any days',    'weekly',  5, '#F97316', '🔄', 5),
  ('Weekly',           'weekly',        'Once per week',                    'weekly',  1, '#06B6D4', '📆', 6),
  ('Biweekly',         'biweekly',      'Every two weeks',                  'monthly', 2, '#EAB308', '📆', 7),
  ('X times per month', 'monthly_custom', 'Custom monthly frequency',       'monthly', 1, '#6B7280', '📅', 8);

-- Habit Time Preferences
INSERT INTO config.habit_time_preferences (name, slug, display_color, icon, sort_order) VALUES
  ('Morning',    'morning',    '#F97316', '🌅', 1),
  ('Afternoon',  'afternoon',  '#EAB308', '☀️', 2),
  ('Evening',    'evening',    '#8B5CF6', '🌙', 3),
  ('Anytime',    'anytime',    '#6B7280', '⏰', 4);
