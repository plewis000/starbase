# Task Engine API Specification
*Phase 1A — Backend Routes*
*Session 3, 2026-02-25*

---

## Architecture

All API routes are Next.js App Router route handlers (`app/api/...`).
All routes require authentication (middleware enforces this).
All database calls go through Supabase server client.
All mutations log to `platform.activity_log`.

---

## Core Task CRUD

### `GET /api/tasks`
List tasks with filtering, sorting, pagination.

**Query params:**
- `status` — comma-separated status slugs (e.g., `todo,in_progress`)
- `priority` — comma-separated priority slugs
- `domain` — domain slug filter
- `assigned_to` — user ID or `me`
- `due` — `today`, `this_week`, `overdue`, `upcoming`, `none`
- `tag` — tag slug
- `location` — location context slug
- `effort` — effort level slug
- `search` — full-text search on title/description
- `parent_id` — get sub-tasks of a specific task
- `template_id` — get tasks from a template instantiation
- `include_someday` — boolean, default false
- `sort` — `due_date`, `priority`, `created_at`, `updated_at` (default: `due_date`)
- `direction` — `asc`, `desc` (default: `asc`)
- `limit` — default 50
- `offset` — default 0

**Response:** `{ tasks: Task[], total: number }`

### `POST /api/tasks`
Create a task.

**Body:**
```json
{
  "title": "string (required)",
  "description": "string",
  "status_id": "uuid",
  "priority_id": "uuid",
  "task_type_id": "uuid",
  "assigned_to": "uuid",
  "due_date": "date",
  "schedule_date": "date",
  "effort_level_id": "uuid",
  "location_context_id": "uuid",
  "recurrence_rule": "RRULE string",
  "parent_task_id": "uuid",
  "domain_slugs": ["household", "personal"],
  "tag_ids": ["uuid", "uuid"],
  "checklist_items": ["string", "string"]
}
```

**Logic:**
1. Insert task
2. Insert domain memberships
3. Insert tag associations
4. Insert checklist items
5. Log to activity_log (action: "created")
6. If assigned_to != created_by, send notification
7. Return created task with all relations

### `GET /api/tasks/:id`
Get single task with all relations (sub-tasks, checklist, tags, dependencies, comments, activity).

### `PATCH /api/tasks/:id`
Update task fields. Partial update.

**Logic:**
1. Update task
2. For each changed field, log to activity_log with old/new values
3. If status changed to "Done", set completed_at = now()
4. If status changed to "Done" and task has recurrence_rule, create next instance
5. If assigned_to changed, send notification to new assignee
6. Update last_touched_at
7. Fire any automation rules matching `task_status_change` trigger

### `DELETE /api/tasks/:id`
Soft delete (set status to Archived) or hard delete.

---

## Sub-tasks

### `GET /api/tasks/:id/subtasks`
List sub-tasks of a parent task.

### `POST /api/tasks/:id/subtasks`
Create sub-task (sets parent_task_id automatically).

---

## Checklist Items

### `GET /api/tasks/:id/checklist`
List checklist items for a task, ordered by sort_order.

### `POST /api/tasks/:id/checklist`
Add checklist item. Body: `{ title, sort_order }`

### `PATCH /api/tasks/:taskId/checklist/:itemId`
Toggle checked, update title. If all items now checked, fire `checklist_complete` trigger.

### `DELETE /api/tasks/:taskId/checklist/:itemId`
Remove checklist item.

---

## Dependencies

### `GET /api/tasks/:id/dependencies`
List tasks this task depends on, and tasks that depend on this task.

**Response:**
```json
{
  "blocks": [{ "task": Task, "type": "blocks" }],
  "blocked_by": [{ "task": Task, "type": "blocks" }],
  "related": [{ "task": Task, "type": "related" }]
}
```

### `POST /api/tasks/:id/dependencies`
Add dependency. Body: `{ depends_on_id, dependency_type }`

**Validation:** Circular dependency check — walk the graph before inserting.

### `DELETE /api/tasks/:taskId/dependencies/:depId`
Remove dependency.

---

## Comments

### `GET /api/tasks/:id/comments`
List comments on a task, chronological.

### `POST /api/tasks/:id/comments`
Add comment. Body: `{ body }`. Notify other participants.

---

## Tags

### `GET /api/tags`
List all active tags.

### `POST /api/tags`
Create a new tag. Body: `{ name, display_color, icon }`

### `POST /api/tasks/:id/tags`
Add tags to a task. Body: `{ tag_ids: [] }`

### `DELETE /api/tasks/:taskId/tags/:tagId`
Remove tag from task.

---

## Saved Filters

### `GET /api/filters`
List user's saved filters + system filters.

### `POST /api/filters`
Create saved filter. Body: `{ name, filter_config, sort_config, icon }`

### `PATCH /api/filters/:id`
Update filter.

### `DELETE /api/filters/:id`
Delete filter (own only).

---

## Templates

### `GET /api/templates`
List all task templates.

### `GET /api/templates/:id`
Get template with all items.

### `POST /api/templates`
Create template. Body includes template_items array.

### `POST /api/templates/:id/instantiate`
Create all tasks from template.

**Logic:**
1. For each template item, create a task
2. Set due dates relative to instantiation date using `relative_due_days`
3. Handle assignment: "creator" = current user, "partner" = the other user, "rotate" = use rotation table
4. Set phase numbers on tasks
5. Create checklist items from template item's checklist_items JSONB
6. Log to activity_log
7. Return all created tasks

---

## Automation Rules

### `GET /api/automation/rules`
List all rules (admin only for write, all can read).

### `POST /api/automation/rules`
Create rule. Admin only.

### `PATCH /api/automation/rules/:id`
Update rule. Admin only.

### `DELETE /api/automation/rules/:id`
Delete rule. Admin only.

### `POST /api/automation/rules/:id/test`
Dry-run a rule — show what it would do without executing.

### `GET /api/automation/log`
View execution history.

---

## Automation Execution Engine

Not an API route — this is internal logic.

### Schedule-based triggers
- Supabase Edge Function runs on cron
- Queries all active rules where trigger_type = 'schedule'
- Evaluates cron expression against current time
- Executes matching rules

### Event-based triggers
- After any task mutation (create, update, status change):
  1. Query active rules matching the trigger type
  2. Evaluate condition_config against the task
  3. Execute action if condition matches
  4. Log to automation_log

### Attention Decay
- Daily cron job (Edge Function)
- For each domain with auto_escalate_enabled:
  1. Find tasks where last_touched_at < now() - attention_decay_days
  2. Escalate priority one level
  3. Send notification: "Task X hasn't been touched in Y days"
- For tasks escalated and still untouched for another decay period:
  1. Surface "still relevant?" prompt (notification with reply context)

### Recurrence Engine
- When a recurring task is completed:
  1. Parse recurrence_rule (RRULE)
  2. Calculate next occurrence
  3. Create new task with same fields, new dates
  4. Set recurrence_source_id to original task
  5. Log to activity_log

### Assignment Rotation
- When a rule's action_config has `"assign_to": "rotate"`:
  1. Look up the rotation for that domain
  2. Get user at current_index
  3. Assign task to that user
  4. Increment current_index (wrap around)

---

## Fairness Dashboard (Read-only analytics)

### `GET /api/analytics/fairness`
**Query params:** `period` (this_week, this_month, all_time)

**Response:**
```json
{
  "period": "this_week",
  "users": [
    {
      "user_id": "uuid",
      "name": "Parker",
      "tasks_completed": 12,
      "total_effort_minutes": 240,
      "tasks_by_type": { "Chore": 5, "Errand": 3, "Project": 4 },
      "streak_days": 5
    },
    {
      "user_id": "uuid",
      "name": "Lenale",
      "tasks_completed": 14,
      "total_effort_minutes": 280,
      "tasks_by_type": { "Chore": 8, "Errand": 4, "Project": 2 },
      "streak_days": 7
    }
  ]
}
```

### `GET /api/analytics/productivity`
Personal stats: completion rate, average tasks/day, most productive day of week, estimation accuracy.
