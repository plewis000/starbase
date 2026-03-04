# Task Management Audit — 2026-03-02

## Current State: STRONG foundation

Tasks have: create, edit, complete, delete, assign, co-owners, subtasks, checklists, comments w/ @mentions, filters, sort, search, recurrence, tags, activity log, entity links, gamification (XP), Zev AI chat.

## Key Gaps Identified

### UX Gaps (Lenale will notice)
1. **No swipe actions on mobile** — can't swipe to complete/delete
2. **Empty state after onboarding is cold** — no pre-seeded tasks, just "No tasks found"
3. **Quick-add is title-only** — no way to set due date or priority inline
4. **No "My Tasks" default filter** — lands on all tasks, not personal view
5. **Completion feels flat** — no celebration, no XP feedback visible
6. **No onboarding tour** — new user lands in the app with no guidance

### Feature Gaps
7. **Task dependencies UI missing** — API exists, no frontend
8. **No kanban/board view** — list only
9. **No calendar view** — can't see tasks on a timeline
10. **No batch operations** — can't select multiple and complete/delete
11. **No duplicate task** — common action, not available
12. **Recurring task editing** — can't edit all occurrences

### Overlap with Habits/Shopping
13. **Habits and tasks are separate systems** — recurring tasks ARE habits functionally
14. **Shopping list is a task list** — separate but same UX pattern
15. **No unified "what do I need to do today" view** — tasks, habits, shopping all separate

### Polish Gaps
16. **Loading states could be better** — spinner only, no skeleton
17. **Error states are generic** — "Something went wrong"
18. **No offline/optimistic for task creation** — only checklist has optimistic updates
