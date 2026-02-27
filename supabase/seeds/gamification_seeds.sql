-- =============================================================
-- DESPERADO CLUB — Gamification Seed Data
-- Floors, Achievements, XP Actions, Loot Box Tiers
-- =============================================================

-- =============================================================
-- FLOORS (Every 10 levels = 1 floor, themed after DCC)
-- =============================================================

INSERT INTO config.floors (floor_number, name, description, min_level, max_level, icon, color, unlock_message) VALUES
(1, 'The Stairwell', 'Every crawler starts here. The only way is down.', 1, 10, '🚪', '#6B7280',
  'Welcome to the Desperado Club, Crawler. You have entered The Stairwell. The only way out is through. Have a great day.'),
(2, 'The Over City', 'A sprawling maze of obligations and ambitions. At least you''re not alone.', 11, 20, '🏙️', '#8B5CF6',
  'Crawler has descended to Floor 2: The Over City. The view is better from here. The stakes are higher. You''ve been warned.'),
(3, 'The Iron Tangle', 'Everything is connected. Every task feeds another. Welcome to the machine.', 21, 30, '⚙️', '#EF4444',
  'Floor 3: The Iron Tangle. At this point, The System is mildly impressed. Don''t let it go to your head.'),
(4, 'The Hunting Grounds', 'You''re not just surviving anymore. You''re hunting.', 31, 40, '🎯', '#F59E0B',
  'Floor 4: The Hunting Grounds. Crawler has demonstrated a concerning level of productivity. The System is watching.'),
(5, 'The Butcher''s Masquerade', 'Behind every completed task is a graveyard of procrastination. Dance with it.', 41, 50, '🎭', '#DC2626',
  'Floor 5: The Butcher''s Masquerade. At this level, most crawlers have either ascended or burned out. You''re still here. Noted.'),
(6, 'The Eye of the Bedlam Bride', 'Chaos is no longer your enemy. It''s your medium.', 51, 60, '👁️', '#7C3AED',
  'Floor 6: The Eye of the Bedlam Bride. The System has run out of clever things to say. You''ve outlasted the script. Congratulations, you absolute psychopath.'),
(7, 'The Parade of Horribles', 'They said adulting gets easier. They lied. But you''re still marching.', 61, 70, '🎪', '#BE123C',
  'Floor 7: The Parade of Horribles. At this point, even The System respects you. Don''t tell anyone we said that.'),
(8, 'This Inevitable Ruin', 'Everything falls apart eventually. You just keep rebuilding. That''s the whole point.', 71, 80, '🏚️', '#991B1B',
  'Floor 8: This Inevitable Ruin. You''ve pushed the boulder up the hill more times than we can count. Sisyphus would be proud. Have a great day.'),
(9, 'Larracos, City of Dreams', 'You''ve built something real. The capital of your own making.', 81, 90, '🏰', '#D4AF37',
  'Floor 9: Larracos, City of Dreams. Crawler has reached the disputed lands. Everything you see is yours. Defend it.'),
(10, 'The Primal Engine', 'You''ve become the system. The dungeon runs on your terms now.', 91, 100, '🔥', '#FFD700',
  'Floor 10: The Primal Engine. You have broken the game. The System would like to congratulate you but frankly finds it suspicious. Investigation pending. Have a great day.');

-- =============================================================
-- LOOT BOX TIERS
-- =============================================================

INSERT INTO config.loot_box_tiers (slug, name, description, color, icon, sort_order) VALUES
('bronze', 'Bronze Box', 'A modest reward for modest accomplishments. Don''t spend it all in one place.', '#CD7F32', '📦', 1),
('silver', 'Silver Box', 'Not bad. Not great. But certainly not bad. The System is tepidly impressed.', '#C0C0C0', '🎁', 2),
('gold', 'Gold Box', 'Now we''re talking. This box contains something actually worth having. Probably.', '#FFD700', '✨', 3),
('platinum', 'Platinum Box', 'Holy crap. You''ve earned the good stuff. The System grudgingly acknowledges your excellence.', '#E5E4E2', '💎', 4);

-- =============================================================
-- XP ACTIONS (base values for each action type)
-- =============================================================

INSERT INTO config.xp_actions (slug, name, base_xp, description) VALUES
-- Tasks
('task_complete_low', 'Complete task (low priority)', 10, 'It needed doing. You did it. +10 XP.'),
('task_complete_medium', 'Complete task (medium priority)', 25, 'A responsible contribution to society. +25 XP.'),
('task_complete_high', 'Complete task (high priority)', 50, 'Important things got done. The System approves. +50 XP.'),
('task_complete_critical', 'Complete task (critical)', 100, 'Crisis averted. Barely. +100 XP.'),
-- Habits
('habit_checkin', 'Habit check-in', 15, 'You showed up. That''s more than most. +15 XP.'),
('habit_streak_7', '7-day streak bonus', 50, 'A full week of consistency. The bar was low and you cleared it. +50 XP.'),
('habit_streak_30', '30-day streak bonus', 200, 'A month of showing up. This is getting serious. +200 XP.'),
('habit_streak_90', '90-day streak bonus', 500, 'Ninety days. The habit owns you now. +500 XP.'),
-- Goals
('goal_milestone', 'Goal milestone reached', 100, 'Progress was made. Measurable progress. +100 XP.'),
('goal_completed', 'Goal completed', 500, 'A goal, fully achieved. The System is... satisfied. +500 XP.'),
-- Finance
('budget_under_monthly', 'Budget category under limit', 200, 'You didn''t overspend. In this economy. +200 XP.'),
-- Shopping
('shopping_cleared', 'Shopping list cleared', 25, 'Provisions acquired. The dungeon is stocked. +25 XP.'),
-- Meta
('daily_login', 'Daily login', 5, 'You showed up. Bare minimum. +5 XP.'),
-- Multipliers (not direct XP, but tracked)
('party_bonus', 'Party task bonus (1.5x)', 0, 'Shared tasks earn 1.5x XP. Teamwork makes the dream work.'),
('streak_break', 'Streak broken', -15, 'A streak has fallen. The silence is deafening. -15 XP.');

-- =============================================================
-- ACHIEVEMENTS — Starter Set (30 achievements)
-- =============================================================

INSERT INTO config.achievements (slug, name, description, category, tier, xp_reward, icon, loot_box_tier, trigger_type, trigger_config, is_hidden, is_party, is_repeatable) VALUES

-- PRODUCTIVITY
('first_blood', 'First Blood', 'You''ve completed your first task. Everybody has to start somewhere. Even you.', 'productivity', 'common', 25, '🗡️', NULL,
  'task_count', '{"threshold": 1}', false, false, false),

('ten_down', 'Ten Down', 'Ten tasks completed. You''re like a machine. A slow, occasionally distracted machine, but a machine nonetheless.', 'productivity', 'common', 50, '🔟', 'bronze',
  'task_count', '{"threshold": 10}', false, false, false),

('centurion', 'Centurion', 'One hundred tasks. The System has officially stopped counting on its fingers for you. Reward: A grudging nod of respect.', 'productivity', 'rare', 300, '💯', 'gold',
  'task_count', '{"threshold": 100}', false, false, false),

('domestic_warlord', 'Domestic Warlord', 'You''ve completed every task on your list for an entire week. Holy crap. That''s kinda fucked up how productive that is.', 'productivity', 'epic', 300, '⚔️', 'gold',
  'task_streak', '{"threshold": 7, "scope": "all_cleared"}', false, false, true),

('speed_runner', 'Speed Runner', 'You completed a task within 1 hour of creation. Either it was easy or you''re terrifyingly efficient. The System chooses not to investigate.', 'productivity', 'common', 25, '⚡', NULL,
  'speed_complete', '{"max_minutes": 60}', false, false, true),

('the_floor_is_lava', 'The Floor Is Lava', 'Zero overdue tasks for 30 consecutive days. What are you, some kind of adult? Disgusting.', 'productivity', 'epic', 500, '🌋', 'platinum',
  'zero_overdue', '{"threshold": 30}', false, false, false),

('procrastinator_redeemed', 'Procrastinator Redeemed', 'You completed a task you snoozed 5 or more times. Better late than never. Actually, no — it would have been better on time. But here we are.', 'productivity', 'uncommon', 50, '😴', 'bronze',
  'custom', '{"type": "snoozed_then_completed", "snooze_count": 5}', true, false, true),

('its_not_my_fault', 'It''s Not My Fault', 'You reassigned a task to the other crawler. Delegation or cowardice? The System doesn''t judge. (The System absolutely judges.)', 'social', 'common', 10, '🫵', NULL,
  'custom', '{"type": "task_reassigned"}', true, false, true),

-- HEALTH / HABITS
('showing_up', 'Showing Up Is Half the Battle', 'You checked in to a habit for 7 consecutive days. The other half of the battle is continuing to show up. Good luck with that.', 'streak', 'uncommon', 75, '📅', 'bronze',
  'habit_streak', '{"threshold": 7}', false, false, true),

('streaker', 'Streaker', 'A 30-day habit streak. At this point the habit is less of a choice and more of a hostage situation. Stockholm syndrome has never been more productive.', 'streak', 'rare', 250, '🔥', 'silver',
  'habit_streak', '{"threshold": 30}', false, false, true),

('cuck_entropy', 'Cuck Entropy', 'You''ve maintained all active habits for 90 consecutive days. Entropy is the natural state of the universe. You have told the universe to go fuck itself. Legendary.', 'streak', 'legendary', 1000, '🌌', 'platinum',
  'combo_streak', '{"threshold": 90, "scope": "all_habits"}', false, false, false),

('touched_grass', 'Touched Grass', 'You completed an outdoor habit 7 days in a row. Fresh air. Sunlight. The things they say are good for you. They might be right. Don''t tell them we said that.', 'health', 'uncommon', 75, '🌿', 'bronze',
  'habit_streak', '{"threshold": 7, "tag": "outdoor"}', true, false, true),

('your_mom_would_be_proud', 'Your Mom Would Be Proud', 'Every single habit, completed, for an entire month. Question: What do you call someone who does everything they''re supposed to? Answer: Suspicious.', 'health', 'epic', 500, '👩', 'gold',
  'combo_streak', '{"threshold": 30, "scope": "all_habits"}', false, false, true),

('streak_funeral', 'Requiem for a Streak', 'A streak of 14+ days has fallen. The System observes a moment of silence. ...Moment over. Get back to work.', 'streak', 'common', 0, '⚰️', NULL,
  'custom', '{"type": "streak_broken", "min_length": 14}', false, false, true),

-- FINANCE
('barely_functional_adult', 'Barely Functional Adult', 'You''ve kept all budget categories under their limits for 3 consecutive months. Question: What''s the baseline for being a functioning member of society? Answer: This. This is the baseline. You just hit it.', 'finance', 'rare', 300, '💳', 'gold',
  'budget_under', '{"threshold": 3, "scope": "all_categories"}', false, false, false),

('war_chest', 'War Chest', 'Your emergency fund goal has hit $1,000. That''s enough to survive approximately 4 days in this economy. But sure, celebrate.', 'finance', 'rare', 250, '💰', 'silver',
  'custom', '{"type": "savings_milestone", "amount": 1000}', false, false, false),

('budget_necromancer', 'Budget Necromancer', 'You brought an over-budget category back under its limit before month-end. The dead walk again. Your wallet breathes.', 'finance', 'uncommon', 100, '💀', 'bronze',
  'custom', '{"type": "budget_recovered"}', true, false, true),

('this_little_piggy', 'This Little Piggy Went to Market', 'You''ve cleared 10 shopping lists. Provisions have been acquired. The dungeon is stocked. The System acknowledges your service to the supply chain.', 'productivity', 'common', 50, '🐷', 'bronze',
  'shopping_count', '{"threshold": 10}', false, false, false),

-- META
('have_a_great_day', 'Have a Great Day', 'You''ve opened the app 30 days in a row. At this point you either love it or you can''t stop. Both are acceptable to The System.', 'meta', 'rare', 200, '🌅', 'silver',
  'login_streak', '{"threshold": 30}', false, false, false),

('achievement_hunter', 'Achievement Hunter', 'You''ve unlocked 10 achievements. You''re collecting these on purpose now, aren''t you? The System sees you.', 'meta', 'uncommon', 100, '🏆', 'bronze',
  'custom', '{"type": "achievement_count", "threshold": 10}', false, false, false),

('floor_two', 'Elevator Pitch', 'You''ve reached Level 11 and descended to Floor 2: The Over City. The view is better from here. The stakes are higher.', 'meta', 'uncommon', 100, '🏙️', 'bronze',
  'level_reached', '{"threshold": 11}', false, false, false),

-- PARTY (requires both crawlers)
('party_first', 'Stronger Together (Debatable)', 'Both crawlers completed a shared task. The Lewis Party has demonstrated basic cooperation. The bar is on the floor and you still only barely cleared it.', 'party', 'common', 50, '🤝', NULL,
  'custom', '{"type": "party_task_completed"}', false, true, true),

('party_week', 'The Lewis Party Clears the Floor', 'Both crawlers completed all shared tasks for a full week. The System didn''t think you had it in you. The System was almost wrong.', 'party', 'epic', 400, '🎉', 'gold',
  'party_task_streak', '{"threshold": 7}', false, true, true),

('sync_streak', 'Synchronized Suffering', 'Both crawlers maintained the same habit for 14 consecutive days. Misery loves company. So does discipline, apparently.', 'party', 'rare', 200, '🔗', 'silver',
  'party_habit_sync', '{"threshold": 14}', false, true, true),

('household_centurion', 'Household Centurion', 'The Lewis Party has completed 100 shared tasks total. The household is functioning. The System is mildly alarmed.', 'party', 'rare', 300, '🏠', 'gold',
  'custom', '{"type": "party_task_total", "threshold": 100}', false, true, false),

-- SEASONAL / SPECIAL
('new_year_new_me', 'New Year, New Me (Same You)', 'You created a goal in January. Statistics suggest you''ll abandon it by February. The System will be watching.', 'seasonal', 'common', 25, '🎆', NULL,
  'custom', '{"type": "january_goal"}', true, false, false),

('tax_boss', 'Tax Season Survivor', 'You completed all tax-related tasks before April 15. B-B-B-Boss Battle: IRS — DEFEATED. The System finds the IRS unreasonable, which is saying something.', 'seasonal', 'epic', 300, '📋', 'gold',
  'custom', '{"type": "tax_tasks_complete", "deadline": "04-15"}', true, false, false),

('friday_warrior', 'Friday Warrior', 'You completed all your tasks on a Friday. Most people phone it in. You went to war. The System respects the hustle.', 'productivity', 'uncommon', 50, '🗓️', NULL,
  'custom', '{"type": "all_tasks_friday"}', true, false, true),

('midnight_oil', 'Burning the Midnight Oil', 'You completed a task between midnight and 4am. Either you''re dedicated or unhinged. The System does not distinguish between the two.', 'meta', 'uncommon', 25, '🌙', NULL,
  'custom', '{"type": "late_night_complete"}', true, false, true);
