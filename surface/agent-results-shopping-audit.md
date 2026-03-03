# Shopping List Audit — 2026-03-02

## Current State: PRODUCTION-GRADE

### Features
- Multiple named lists with optional store association
- Default list designation
- Add items with name + quantity + category
- 10 pre-configured categories with emojis (Produce, Meat, Dairy, Bakery, Frozen, Pantry, Beverages, Cleaning, Personal Care, Other)
- Check-off with optimistic UI, tracks who/when
- Items grouped by category, unchecked first
- Staple items (★ badge), linked items (⚡ badge)
- Entity linking: shopping item → task (bidirectional sync)
- Clear checked items, delete list
- Tabs showing all lists with progress badges (X/Y)
- Gamification: "Shopping list cleared" (25 XP), "This Little Piggy" badge (50 XP at 10 clears)
- AI agent tools: list_shopping, get_shopping_list, add_shopping_items
- Discord bot integration (/shopping add)

### UI Components
- Main page: app/(protected)/shopping/page.tsx
- API: app/api/shopping/* (4 route files)
- Categories from config.shopping_categories table
- New list modal (name + store)
- Add item form (name + qty + Add button)
- Hover actions: track (+), delete (×)

## Gaps to Address

### UX Polish
1. **Empty state is cold** — "No shopping lists yet" with just 🛒, needs onboarding warmth
2. **No quick-add NLP** — Tasks have "buy milk tomorrow" parsing, shopping doesn't
3. **No completion celebration** — Tasks get confetti, shopping clear gets nothing
4. **Add item form is basic** — No category selector inline, have to hope auto-categorization works
5. **No "frequently bought" suggestions** — No learning from past items

### Missing Features
6. **No recurring/template lists** — "Weekly groceries" should auto-repopulate
7. **No bulk import** — Can't paste a list of items
8. **No price tracking** — No budget awareness
9. **Categories are admin-only** — Users can't customize

### Cross-Module Overlap
10. **"Buy milk weekly" = task or shopping?** — No guidance on when to use which
11. **No shopping section on dashboard** — Have to navigate to /shopping
12. **No unified "today" view** — Shopping, tasks, habits all separate
