# Starbase Failure Log

Structured log of coding failures, bugs, and logic errors encountered during development. Each entry captures what went wrong, the root cause, how it was fixed, and — critically — the **pattern** so we can build QA rules and prevention standards over time.

---

## How to Read This Log

Each failure is tagged with:
- **Category** — the type of bug (e.g., `data-mapping`, `cross-schema`, `api-contract`)
- **Severity** — `critical` (blocks core feature), `moderate` (degraded UX), `minor` (cosmetic/edge case)
- **Session** — which build session it was discovered in
- **Pattern** — the generalizable anti-pattern so we can write lint rules / QA checks

---

## Failures

### F-001: PostgREST Cross-Schema FK Join Failure
- **Date**: 2026-02-25
- **Session**: 4
- **Category**: `cross-schema`, `orm-limitation`
- **Severity**: Critical
- **Symptom**: API routes returning 500 errors. PostgREST error: `"Could not find a relationship between 'tasks' and 'task_statuses'"`
- **Root Cause**: PostgREST cannot follow foreign key joins across different PostgreSQL schemas. Our `platform.tasks` table has FKs pointing to `config.task_statuses`, `config.task_priorities`, etc. — but PostgREST only resolves FK relationships within the same schema. The `.select("*, status:task_statuses(*)")` FK hint syntax silently assumes same-schema.
- **Fix**: Created `lib/task-enrichment.ts` — a helper that fetches all config lookup tables via `Promise.all()`, builds `Map<id, record>` for O(1) lookups, then enriches task objects after the main query. Removed all cross-schema FK hint joins from `.select()` strings.
- **Pattern**: **Never assume ORM/query-builder FK joins work across schema boundaries.** When using multi-schema Postgres with PostgREST/Supabase, always verify that FK relationships are resolvable within the exposed schema scope. If tables live in different schemas, use separate queries + application-level joins.
- **QA Rule**: Any `.select()` string containing a `!` FK hint (e.g., `status:table_name!fk_name(*)`) should be flagged if the referenced table is in a different schema than the source table.

---

### F-002: PostgREST Auth Schema FK Join Failure
- **Date**: 2026-02-25
- **Session**: 4
- **Category**: `cross-schema`, `auth-boundary`
- **Severity**: Critical
- **Symptom**: API routes returning 500 errors. PostgREST error: `"Could not find a relationship between 'tasks' and 'users'"`
- **Root Cause**: Task FKs (`created_by`, `assigned_to`) reference `auth.users`, not `platform.users`. The `auth` schema is not exposed in PostgREST (by design — it contains sensitive auth data). Even though `platform.users` is a mirror/profile table, the FK constraints point to `auth.users.id`. So `users!tasks_assigned_to_fkey(...)` tries to join through `auth.users` which PostgREST can't access.
- **Fix**: Added user lookup to `getConfigLookups()` — fetches `platform.users` separately and enriches tasks with resolved `creator` and `assignee` objects via Map lookups. Removed all `users!` FK hint joins.
- **Pattern**: **Never FK-hint join to `auth.users` in Supabase.** The `auth` schema is intentionally unexposed. Always use a profile/users table in your public/custom schema and join to that. Even if FKs point to `auth.users`, your PostgREST queries must resolve user data through the exposed schema.
- **QA Rule**: Any `.select()` containing `users!` as an FK hint should be flagged — it likely references `auth.users` which is inaccessible via PostgREST.

---

### F-003: FilterBar Sending Display Labels Instead of Column Names
- **Date**: 2026-02-25
- **Session**: 4.5
- **Category**: `data-mapping`, `frontend-api-contract`
- **Severity**: Critical
- **Symptom**: Task list showing "No tasks found" despite tasks existing. Console errors: `"Failed to fetch tasks"`. Network tab: `GET /api/tasks?sort=Due+Date&direction=asc` returning 500.
- **Root Cause**: The `FilterBar` component defined sort options as plain strings (`["Due Date", "Priority", "Created", "Title"]`) and passed them directly as query parameters. The API's `.order()` call expected actual Postgres column names (`due_date`, `priority_id`, `created_at`, `title`). Same issue with due date filter options — `"This Week"` sent instead of `"this_week"`, `"No Date"` instead of `"none"`.
- **Fix**: Changed `SORT_OPTIONS` and `DUE_DATE_OPTIONS` from string arrays to `{ label: string; value: string }[]` objects. Labels are what users see in the dropdown; values are what get sent to the API.
- **Pattern**: **Always separate display labels from API values in form controls.** Dropdowns, radio buttons, and filter controls should use `{ label, value }` pairs — never pass the display text directly to an API. This is a classic frontend-backend contract violation.
- **QA Rule**: Any `<select>` or filter component where `<option value={displayText}>` should be flagged. The `value` should always be a machine-readable identifier (column name, enum value, UUID), never a human-readable label.

---

### F-004: TaskForm Using Hardcoded Slug IDs Instead of Real UUIDs
- **Date**: 2026-02-25
- **Session**: 4.5
- **Category**: `data-mapping`, `frontend-api-contract`
- **Severity**: Moderate (task creation works via API defaults, but selecting specific status/priority would fail)
- **Symptom**: Not yet triggered in production — discovered during code review. The `TaskForm` component hardcodes status options as `{ id: "to-do", name: "To Do" }` and sends `status_id: "to-do"` to the API. The database expects a UUID for `status_id`.
- **Root Cause**: During autonomous frontend build, status/priority options were hardcoded for speed rather than fetched from the config API. The slug IDs don't match the actual UUID primary keys in `config.task_statuses`.
- **Fix**: Pending — TaskForm needs to fetch real options from `/api/config/statuses` and `/api/config/priorities` (or a combined config endpoint) on mount, then use actual UUIDs as values.
- **Pattern**: **Never hardcode IDs for database-managed lookup tables.** Config/enum values (statuses, priorities, types) should always be fetched from the API at runtime. Hardcoding creates a coupling that breaks when IDs change or differ between environments.
- **QA Rule**: Any component that renders a `<select>` for a database-backed field should fetch its options from an API, not from a hardcoded array. Search for `const.*OPTIONS.*=.*\[.*\{.*id:` patterns in components.

---

### F-005: Double-Select Bug (`"*, *"`) from Find-and-Replace
- **Date**: 2026-02-25
- **Session**: 4
- **Category**: `refactoring-error`, `string-manipulation`
- **Severity**: Critical
- **Symptom**: API route returning malformed query error after replacing FK join strings.
- **Root Cause**: When doing a bulk replace of `author:users!task_comments_user_id_fkey(id, full_name, email, avatar_url)` with `*`, the existing `.select("*, author:users!...")` became `.select("*, *")` — a double-select that Supabase/PostgREST rejects.
- **Fix**: Rewrote the entire comments route instead of doing string replacement. Removed the FK join and replaced with post-query enrichment.
- **Pattern**: **When removing a field from a `.select()` string, don't blindly replace the field with `*` — consider what's already in the select.** If the select already starts with `*`, removing a named field means deleting it (and its comma), not replacing it.
- **QA Rule**: Any `.select()` call containing `*, *` or `*,*` should be flagged as invalid.

---

### F-006: OAuth Redirect URL Mismatch on Vercel Preview Deployments
- **Date**: 2026-02-25
- **Session**: 4
- **Category**: `deployment`, `auth-config`
- **Severity**: Critical
- **Symptom**: After clicking "Continue with Google", the OAuth flow redirected to the old deployment URL instead of the current one. User landed on a different hostname where their auth cookies didn't exist.
- **Root Cause**: Supabase's auth redirect URL allowlist only contained the previous deployment URL. Each Vercel preview deployment gets a unique URL (e.g., `atlas-abc123-plewis000s-projects.vercel.app`), so every new push creates a new hostname.
- **Fix**: Added wildcard pattern `https://*-plewis000s-projects.vercel.app/**` to Supabase auth redirect allowlist.
- **Pattern**: **When using preview deployments with OAuth, always configure wildcard redirect URLs.** Static redirect URLs break on every new deployment. For production, pin a stable custom domain.
- **QA Rule**: Before any deployment that involves auth, verify the redirect URL allowlist supports the target hostname. For Vercel preview deployments, ensure a wildcard pattern is configured.

---

### F-007: Unvalidated Dynamic Sort Column (SQL Injection Risk)
- **Date**: 2026-02-25
- **Session**: 5
- **Category**: `security`, `api-contract`
- **Severity**: Moderate
- **Symptom**: Discovered by `api-contract-checker` QA script. The tasks GET route passed `params.get("sort")` directly to Supabase's `.order()` without validating against a whitelist of allowed column names.
- **Root Cause**: The sort parameter from the URL was trusted as-is and passed to the database query. While Supabase's PostgREST does sanitize against SQL injection, passing arbitrary column names could cause 500 errors (invalid column) or expose schema information.
- **Fix**: Added `VALID_SORT_COLUMNS` whitelist in the tasks route. Invalid sort values now fall back to `"due_date"`.
- **Pattern**: **Always validate user-supplied query params against a whitelist before passing to database queries.** Even with ORM/PostgREST sanitization, invalid values cause 500s and leak schema info.
- **QA Rule**: Any `.order(variable)` where the variable comes from `searchParams` or user input should have a visible whitelist check. The `api-contract-checker` flags this.

---

### F-008: Git Index Lock File Blocking All Git Operations
- **Date**: 2026-02-26
- **Session**: 3
- **Category**: `deployment`, `environment`, `git`
- **Severity**: Critical
- **Symptom**: `git add` fails with `fatal: Unable to create '.git/index.lock': File exists.` No git operations possible — can't stage, commit, or push.
- **Root Cause**: A stale `.git/index.lock` file was left behind from a previous git operation that was interrupted (likely during the project-import copy from `starbase/` to `projects/starbase/`). The sandbox file system mount prevents deleting files inside `.git/`, so the lock cannot be cleared.
- **Fix**: Copied project to a clean directory outside the mounted filesystem, initialized a fresh git repo there.
- **Pattern**: **When working in mounted/shared filesystems, git lock files may become unremovable. Always verify git operations work before committing to a git-based deployment strategy.**
- **QA Rule**: Add to deploy-preflight: check `git status` returns 0 exit code before attempting any git-based deployment.

---

### F-009: NPM Registry Blocked in Sandbox Environment
- **Date**: 2026-02-26
- **Session**: 3
- **Category**: `deployment`, `environment`
- **Severity**: Critical
- **Symptom**: `npm install -g vercel` fails with `403 Forbidden`. Cannot install Vercel CLI. Same block on `npm install typescript`.
- **Root Cause**: The Cowork sandbox VM blocks outbound connections to `registry.npmjs.org`. This means no CLI tools can be installed, no `npm install` for missing deps, no `npx` for anything not already cached.
- **Fix**: Must deploy from user's local machine where npm works, or use pre-existing Git integration.
- **Pattern**: **Never assume a build/deploy environment has unrestricted internet access. Always check network connectivity to package registries before planning a deployment strategy that depends on package installation.**
- **QA Rule**: deploy-preflight should verify: (1) `npm --version` works, (2) a test `npm ping` succeeds, (3) `git push` can reach the remote. If any fail, output manual deploy instructions instead of attempting automated deploy.

---

### F-010: GitHub Push Blocked from Sandbox (403 Proxy Error)
- **Date**: 2026-02-26
- **Session**: 3
- **Category**: `deployment`, `environment`, `network`
- **Severity**: Critical
- **Symptom**: `git push` fails with `fatal: unable to access 'https://github.com/...': Received HTTP code 403 from proxy after CONNECT`
- **Root Cause**: The sandbox VM routes outbound HTTPS through a proxy that blocks GitHub. Combined with F-009 (npm blocked) and F-008 (git lock), this means the sandbox cannot deploy code to any external service.
- **Fix**: All deploy steps must be executed on the user's local machine. Provide copy-pasteable commands per user preferences.
- **Pattern**: **Sandboxed environments that restrict outbound network should never be the deployment origin. Treat the sandbox as a code authoring environment only — deployment must happen from an unrestricted environment.**
- **QA Rule**: Add a `deploy-readiness` check: before any deploy attempt, verify (1) git push works, (2) npm registry reachable, (3) target platform CLI available. If any fail, immediately switch to manual deploy instructions.

---

### F-011: Vercel Project Root Directory Not Configured for Monorepo
- **Date**: 2026-02-26
- **Session**: 3
- **Category**: `deployment`, `configuration`
- **Severity**: Moderate
- **Symptom**: The existing Vercel project `atlas-os` is connected to the `plewis000/atlas-os` GitHub repo, which is the full Sisyphus OS monorepo. Starbase lives at `projects/starbase/` — a subdirectory. Vercel would try to build from the repo root and fail because `package.json` isn't at root.
- **Root Cause**: During the project-import phase, Starbase was moved from a standalone repo root into `projects/starbase/` without updating the Vercel configuration to set the root directory.
- **Fix**: When creating the Vercel project, set Root Directory to `projects/starbase` (if using the monorepo), or create a dedicated `starbase` repo (cleaner approach).
- **Pattern**: **When moving a deployable project into a monorepo subdirectory, immediately update the CI/CD root directory configuration. Don't defer this — it blocks the first deploy attempt.**
- **QA Rule**: deploy-preflight should check: if `.vercel/project.json` exists, verify the configured root directory contains a `package.json`. If no `.vercel/project.json`, warn that the project is not linked to Vercel.

---

### F-012: Supabase Anon Key Left as Placeholder in .env.local
- **Date**: 2026-02-26
- **Session**: 3
- **Category**: `configuration`, `deployment`
- **Severity**: Moderate
- **Symptom**: `.env.local` contained `NEXT_PUBLIC_SUPABASE_ANON_KEY=paste-your-anon-key-here` — a placeholder that would cause all Supabase queries to fail with 401 Unauthorized.
- **Root Cause**: During initial project setup, `.env.local` was created from `.env.local.example` but the anon key was never populated with the real value. The app would build successfully but every API call would fail at runtime.
- **Fix**: Fetched the real anon key from the Supabase project and wrote it to `.env.local`.
- **Pattern**: **Placeholder values in env files are silent deployment killers. The app builds fine but fails at runtime. Always validate env vars contain real values before deploy, not just that the file exists.**
- **QA Rule**: deploy-preflight should: (1) verify `.env.local` exists, (2) check that no values contain common placeholder strings like `your-`, `paste-`, `replace-`, `TODO`, `xxx`.

---

### F-013: Preferences File Not Found — Wrong Path Assumed from Context Summary
- **Date**: 2026-02-26
- **Session**: 4
- **Category**: `context-management`, `file-resolution`
- **Severity**: Minor
- **Symptom**: Attempted to read `projects/starbase/context/my_preferences.md` — file doesn't exist. Wasted a tool call and had to search for the real location.
- **Root Cause**: The context summary from the previous session stated the file was at the project level. In reality, `my_preferences.md` lives at the OS level (`sisyphus-os/context/my_preferences.md`), not inside any project. The session summary was inaccurate about the file path.
- **Fix**: Found the correct file at `/sisyphus-os/context/my_preferences.md` and updated it successfully.
- **Pattern**: **OS-level files (preferences, patterns, standards) live in `sisyphus-os/` root directories — never inside `projects/`. Context summaries can contain inaccurate paths. When a file isn't found, check the OS-level equivalent before searching blindly.**
- **QA Rule**: Boot sequence should verify that all OS-level config files (`my_preferences.md`, `PATTERN_LIBRARY.md`, `CURRENT_STATE.md`) exist at their expected paths and cache the resolved paths for the session.

---

## Trend Summary

| Pattern | Count | Categories |
|---------|-------|------------|
| Sandbox/environment deployment assumptions | 4 | F-008, F-009, F-010, F-011 |
| Display labels used where machine values needed | 2 | F-003, F-004 |
| Cross-schema assumptions in ORM/query builder | 2 | F-001, F-002 |
| Configuration placeholders not validated | 2 | F-006, F-012 |
| Context summary path inaccuracy | 1 | F-013 |
| Unvalidated user input to database | 1 | F-007 |
| String manipulation during refactoring | 1 | F-005 |

---

## QA Standards (Implemented)

All 5 scripts live in `qa/` and run via `npm run qa`. They catch the patterns above automatically.

| Script | What It Catches | Refs |
|--------|----------------|------|
| `select-string-linter` | Cross-schema FK hints, double wildcards, auth.users joins | F-001, F-002, F-005 |
| `form-value-checker` | Display labels used as API values, string arrays as options | F-003 |
| `config-hardcode-detector` | Hardcoded status/priority/type IDs in components | F-004 |
| `api-contract-checker` | Invalid .order() columns, unvalidated sort params, broken fetch URLs | F-003, F-007 |
| `deploy-preflight` | Missing env vars, console.log in API routes, hardcoded URLs, TypeScript errors | F-006 |

**Run `npm run qa` before every deployment.** Zero errors required to ship.
