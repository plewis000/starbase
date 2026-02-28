-- =============================================================
-- DESPERADO CLUB — Agentic Infrastructure Seed Data
-- Onboarding questions + default responsibility categories
-- =============================================================

-- =============================================================
-- ONBOARDING INTERVIEW QUESTIONS (Phase 1)
-- Zev asks these in order during the initial conversational interview
-- =============================================================

INSERT INTO config.onboarding_questions (question_key, question_text, category, phase, sort_order, extraction_schema) VALUES

-- Routine & Schedule
('daily_routine', 'Walk me through a typical day for you. What time do you wake up, what does your morning look like, and when do you usually wind down?', 'routine', 'interview', 1,
 '{"fields": [{"name": "wake_time", "type": "time"}, {"name": "sleep_time", "type": "time"}, {"name": "morning_routine", "type": "text"}, {"name": "evening_routine", "type": "text"}, {"name": "productivity_peak", "type": "time_range"}]}'::jsonb),

('work_schedule', 'What does your work situation look like? Regular hours, remote, hybrid? When are you fully "off" and available for household stuff?', 'routine', 'interview', 2,
 '{"fields": [{"name": "work_type", "type": "enum", "values": ["office", "remote", "hybrid", "flexible", "not_working"]}, {"name": "work_hours", "type": "time_range"}, {"name": "availability_windows", "type": "time_range[]"}]}'::jsonb),

-- Household Dynamics
('household_split', 'How do you and your partner currently split household responsibilities? Who handles what? Be honest — there are no wrong answers here.', 'household', 'interview', 3,
 '{"fields": [{"name": "user_responsibilities", "type": "text[]"}, {"name": "partner_responsibilities", "type": "text[]"}, {"name": "shared_responsibilities", "type": "text[]"}, {"name": "pain_points", "type": "text[]"}, {"name": "satisfaction_level", "type": "enum", "values": ["happy", "mostly_fair", "somewhat_unbalanced", "needs_work"]}]}'::jsonb),

('household_friction', 'What household tasks cause the most friction or stress between you two? Or just for you personally?', 'household', 'interview', 4,
 '{"fields": [{"name": "friction_tasks", "type": "text[]"}, {"name": "friction_source", "type": "enum", "values": ["forgetting", "uneven_split", "timing", "standards_differ", "nobody_wants_to"]}, {"name": "desired_improvement", "type": "text"}]}'::jsonb),

-- Goals & Aspirations
('current_goals', 'What are the 2-3 things you most want to improve or accomplish in the next few months? Personal, professional, health — anything.', 'goals', 'interview', 5,
 '{"fields": [{"name": "goals", "type": "object[]", "schema": {"title": "text", "category": "enum", "why": "text", "timeline": "text"}}]}'::jsonb),

('pain_points', 'What''s the one thing that always falls through the cracks? The thing you keep meaning to do but never quite get to?', 'goals', 'interview', 6,
 '{"fields": [{"name": "recurring_failure", "type": "text"}, {"name": "failure_reason", "type": "text"}, {"name": "attempted_solutions", "type": "text[]"}]}'::jsonb),

-- Motivation & Personality
('motivation_style', 'What motivates you more: competition with others, personal bests, rewards, or avoiding consequences? No wrong answer — this helps me know how to support you.', 'personality', 'interview', 7,
 '{"fields": [{"name": "primary_motivator", "type": "enum", "values": ["competition", "personal_growth", "rewards", "accountability", "recognition"]}, {"name": "secondary_motivator", "type": "enum"}, {"name": "demotivators", "type": "text[]"}]}'::jsonb),

('communication_pref', 'How do you prefer to be reminded or nudged? Gentle suggestions, direct callouts, humor, or just put it on my list and I''ll get to it?', 'preferences', 'interview', 8,
 '{"fields": [{"name": "nudge_style", "type": "enum", "values": ["gentle", "direct", "humorous", "minimal"]}, {"name": "nudge_frequency", "type": "enum", "values": ["frequent", "moderate", "minimal"]}, {"name": "preferred_channel", "type": "enum", "values": ["discord", "web", "both"]}]}'::jsonb),

-- Rewards & Gamification
('reward_preferences', 'If you could earn rewards for getting stuff done, what would you want? Think treats, experiences, free time — whatever would actually motivate you.', 'preferences', 'interview', 9,
 '{"fields": [{"name": "reward_ideas", "type": "object[]", "schema": {"name": "text", "tier": "enum", "category": "text"}}, {"name": "reward_style", "type": "enum", "values": ["small_frequent", "big_occasional", "mixed"]}]}'::jsonb),

-- Boundaries & Dealbreakers
('boundaries', 'Last one: is there anything you absolutely do NOT want the system to do? Topics to avoid, comparisons you hate, times you don''t want to be bothered?', 'boundaries', 'interview', 10,
 '{"fields": [{"name": "off_limits_topics", "type": "text[]"}, {"name": "off_limits_comparisons", "type": "text[]"}, {"name": "quiet_times", "type": "time_range[]"}, {"name": "hard_boundaries", "type": "text[]"}]}'::jsonb);


-- =============================================================
-- DEFAULT RESPONSIBILITY TEMPLATES
-- These are common household responsibilities that Zev can suggest
-- during onboarding or that users can pick from
-- =============================================================

-- Note: These are NOT inserted into platform.responsibilities directly
-- because that requires a household_id. The onboarding flow will
-- create responsibilities from this template when setting up a household.
-- Storing them here as a reference for the AI.

-- For now, we'll add a config table for responsibility templates:
CREATE TABLE IF NOT EXISTS config.responsibility_templates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  description           TEXT,
  category              TEXT NOT NULL,
  default_effort_weight INTEGER NOT NULL DEFAULT 5,
  default_recurrence    TEXT,
  icon                  TEXT,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE config.responsibility_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resp_templates_read" ON config.responsibility_templates
  FOR SELECT TO authenticated USING (true);

INSERT INTO config.responsibility_templates (name, description, category, default_effort_weight, default_recurrence, icon, sort_order) VALUES
-- Chores
('Dishes', 'Loading/unloading dishwasher, hand-washing', 'chores', 4, 'daily', '🍽️', 1),
('Laundry', 'Washing, drying, folding, putting away', 'chores', 6, 'weekly', '👕', 2),
('Vacuuming', 'Vacuuming all rooms', 'chores', 5, 'weekly', '🧹', 3),
('Bathroom Cleaning', 'Toilets, sinks, showers, mirrors', 'chores', 6, 'weekly', '🚿', 4),
('Kitchen Cleaning', 'Counters, stovetop, microwave, deep clean', 'chores', 5, 'weekly', '🧽', 5),
('Trash & Recycling', 'Taking out trash and recycling bins', 'chores', 2, 'weekly', '🗑️', 6),
('Bed Making', 'Making the bed daily', 'chores', 1, 'daily', '🛏️', 7),
('Dusting', 'Dusting surfaces and shelves', 'chores', 4, 'biweekly', '✨', 8),
('Mopping', 'Mopping hard floors', 'chores', 5, 'biweekly', '🧹', 9),

-- Errands
('Grocery Shopping', 'Weekly grocery run and list management', 'errands', 6, 'weekly', '🛒', 10),
('Meal Planning', 'Planning the weekly menu', 'cooking', 4, 'weekly', '📝', 11),
('Cooking Dinner', 'Preparing the evening meal', 'cooking', 6, 'daily', '👨‍🍳', 12),
('Meal Prep', 'Batch cooking and prep for the week', 'cooking', 7, 'weekly', '🥘', 13),

-- Finance
('Bills & Payments', 'Paying bills, managing subscriptions', 'finance', 5, 'monthly', '💳', 14),
('Budget Review', 'Reviewing spending against budget', 'finance', 4, 'monthly', '📊', 15),

-- Maintenance
('Yard Work', 'Mowing, trimming, garden maintenance', 'maintenance', 7, 'weekly', '🌿', 16),
('Home Repairs', 'Fixing things that break, maintenance tasks', 'maintenance', 6, 'as_needed', '🔧', 17),
('Car Maintenance', 'Oil changes, tire rotation, registration', 'maintenance', 5, 'as_needed', '🚗', 18),

-- Admin
('Scheduling', 'Making appointments, managing the family calendar', 'admin', 3, 'as_needed', '📅', 19),
('Mail & Packages', 'Checking mail, handling packages, returns', 'admin', 2, 'daily', '📬', 20),

-- Pets
('Pet Feeding', 'Morning and evening pet meals', 'pets', 3, 'daily', '🐕', 21),
('Pet Walking', 'Daily walks', 'pets', 4, 'daily', '🦮', 22),
('Vet & Grooming', 'Vet appointments, grooming schedule', 'pets', 3, 'as_needed', '🏥', 23),

-- Health
('Workout Planning', 'Planning exercise routines', 'health', 3, 'weekly', '💪', 24),
('Medication Management', 'Tracking prescriptions, refills', 'health', 2, 'as_needed', '💊', 25);


-- =============================================================
-- INITIAL SEASON (launch season)
-- =============================================================

INSERT INTO config.seasons (slug, name, description, theme, starts_at, ends_at, xp_multiplier_category, xp_multiplier) VALUES
('launch_season', 'The Descent Begins', 'Your first month in the dungeon. The System is watching. Prove you belong.', 'The tutorial floor. Everything is new and slightly terrifying. The System has reduced gravity to give you a fighting chance. Enjoy it. It won''t last.', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', NULL, 1.5);
