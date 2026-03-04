# Habits & Goals Audit — 2026-03-02

## Current State: COMPREHENSIVE

### Habits
- Create with full form (title, category, frequency, target, time pref, specific days, link to goals)
- Quick add input
- One-click check-in with mood/value/note tracking
- Streak tracking (current, longest, total) with 🔥 badge
- 7-day completion heatmap
- Pause/Resume/Retire lifecycle
- Linked to goals (habit-driven progress)
- XP awards (15 base + streak bonuses at 7/30/90d)
- Comments thread
- Entity links to tasks

### Goals
- Create with full form (title, category, timeframe, progress type, milestones, habit links)
- 4 progress types: Manual %, Milestones, Habit-driven, Task-driven
- Milestone sub-goals with target dates
- Status lifecycle: Active → Completed/Paused/Abandoned
- Goal-Habit linking with weights
- Goal-Task linking
- Sub-goal hierarchy (parent_goal_id)
- Quick add, filtering by status, search

## Gaps to Address

### Habits
1. **Empty state is cold** — "No habits found" needs onboarding nudge, pre-populated suggestions
2. **No "today's habits" summary on dashboard** — Habits section missing from dashboard
3. **Check-in feels mechanical** — No celebration animation like task completion
4. **No habit reminders/nudges** — No "you haven't checked in today" notification
5. **Streak break handling** — No compassionate messaging when streak breaks

### Goals
1. **Empty state needs warmth** — Same cold "No goals found" pattern
2. **No goal templates** — Common household goals should be pre-populated
3. **Progress visualization is basic** — Just a bar, could show trend/history
4. **No "focus goal" concept** — All goals equal weight, no featured goal

### Cross-module Overlap
5. **Recurring tasks ARE habits functionally** — No clear guidance on when to use tasks vs habits
6. **Shopping recurring items overlap** — "Buy milk weekly" = task or shopping?
7. **No unified "today" view** — Tasks, habits, shopping all separate

### UX Polish
8. **Both use same two-column layout** — Consistent but could differentiate
9. **No quick habit check-in from dashboard** — Have to navigate to habits page
10. **Goal progress updates not visible on dashboard** — Only OutcomesPanel
