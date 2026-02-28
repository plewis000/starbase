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

### F-014: TypeScript Enrichment Type Loss — 10 Files Broke Vercel Build
- **Date**: 2026-02-26
- **Session**: 4
- **Category**: `type-safety`, `build-failure`, `deployment`
- **Severity**: Critical
- **Symptom**: Two consecutive Vercel builds failed with TypeScript errors. Build #1: `Property 'parent_id' does not exist on type '{ author: ... }'` in comments route (line 108). Build #2: `Property 'id' does not exist on type '{ category: any; timeframe: any; owner: ... }'` in goals route (line 69).
- **Root Cause**: Every enrichment function (enrichGoals, enrichHabits, enrichCommentsWithAuthors) uses `.map()` to spread a `Record<string, unknown>` and add new fields. TypeScript infers the return type as only the explicitly added fields (e.g., `{ author, category, owner }`), losing access to all original columns (`id`, `parent_id`, `title`, etc.). This compiled locally (likely with less strict checks or cached builds) but failed in Vercel's clean `tsc` build.
- **Fix**: Added `as Record<string, unknown>[]` type assertion to all enrichment function call sites across 10 files:
  - `app/api/goals/route.ts` (2 assertions)
  - `app/api/habits/route.ts` (2 assertions)
  - `app/api/dashboard/route.ts` (3 assertions)
  - `app/api/comments/[entityType]/[entityId]/route.ts` (3 assertions)
  - `app/api/goals/[id]/route.ts`
  - `app/api/goals/[id]/habits/route.ts`
  - `app/api/goals/[id]/tasks/route.ts`
  - `app/api/goals/[id]/tags/route.ts`
  - `app/api/habits/[id]/tags/route.ts`
  - `app/api/tasks/[id]/route.ts`
- **Pattern**: **When `.map()` spreads `Record<string, unknown>` and adds new properties, TypeScript narrows the return type to only the new properties. All enrichment-pattern functions that add fields to opaque records need explicit type assertions.** This is a systematic pattern — if one enrichment function has the bug, ALL of them likely do.
- **QA Rule**: Add to deploy-preflight: run a full `tsc --noEmit` in a clean environment (no incremental cache) before any deploy. Also: any `.map()` that spreads a Supabase query result and adds new fields should have a type assertion. Search pattern: `.map((.*) => ({ ...` where the source is a Supabase query result.
- **Promoted to OS-level**: Yes — this is the same type-loss pattern that will appear in any TypeScript + Supabase project using enrichment functions.

---

### F-015: Meta-Failure — Not Auto-Logging Build Failures
- **Date**: 2026-02-26
- **Session**: 4
- **Category**: `process`, `sisyphus-core`
- **Severity**: Critical
- **Symptom**: After Vercel build failures, I fixed the code but did NOT automatically log the failures to FAILURE_LOG.md. The user had to explicitly say "log failure for iterative improvement. If you aren't doing it automatically that is also a failure."
- **Root Cause**: Failure logging was treated as a manual step rather than an automatic reflex. The improvement pipeline (DISCOVER → LOG → EXTRACT → AUTOMATE → VERIFY) was not being followed — steps were skipped when under time pressure to fix the build.
- **Fix**: Establishing as a hard rule: **Every build failure, runtime error, or bug fix MUST be accompanied by an immediate FAILURE_LOG.md entry BEFORE moving to the next task.** The fix-then-log sequence is: (1) identify error, (2) log to FAILURE_LOG immediately, (3) fix the code, (4) push fix, (5) verify build. Logging happens at step 2, not as an afterthought.
- **Pattern**: **The improvement pipeline is not optional and not deferrable. Logging IS part of the fix. If a failure happens and isn't logged, the system hasn't learned — which means the same class of failure can repeat. Auto-log everything.**
- **QA Rule**: At the end of every session, the scribe skill should verify that any errors encountered during the session have corresponding FAILURE_LOG entries. Missing entries should be flagged.
- **Promoted to OS-level**: Yes — this is a core Sisyphus principle. The boulder rolls back when you skip the logging.

---

### F-016: Wrong Fix for F-014 — `as Record<string, unknown>[]` Broke Property Access
- **Date**: 2026-02-27
- **Session**: 4
- **Category**: `type-safety`, `build-failure`, `fix-regression`
- **Severity**: Critical
- **Symptom**: Vercel build #3 failed: `Type error: 'g.progress_value' is of type 'unknown'` at `dashboard/route.ts:149`. The fix for F-014 (`as Record<string, unknown>[]`) made ALL property values `unknown`, breaking arithmetic operations like `sum + g.progress_value`.
- **Root Cause**: Two separate issues were conflated. (A) Enrichment functions like `enrichGoals()` lose TypeScript's index signature when spreading `Record<string, unknown>` in `.map()` return — TypeScript infers only the explicit new fields. (B) Dashboard route builds fresh objects with explicit type casts (`as number`, `as string`). Adding `as Record<string, unknown>[]` to both cases was wrong — for (A) it partially fixed property *existence* but made values `unknown`; for (B) it UNDID the explicit casts.
- **Fix**: Two-part fix: (1) Added explicit return types to all enrichment functions: `enrichGoal(): Record<string, unknown>`, `enrichGoals(): Record<string, unknown>[]`, etc. This preserves the index signature without caller-side assertions. (2) Removed ALL `as Record<string, unknown>[]` assertions from call sites — they're now unnecessary because the function signatures guarantee the type.
- **Pattern**: **When TypeScript loses type information from spread operations, fix it at the SOURCE (the function return type) not the CONSUMER (caller-side assertions). Caller-side type assertions are fragile — they can be correct at one call site but harmful at another. Source-level return types are authoritative.**
- **QA Rule**: Enrichment functions must always have explicit return types. Never rely on TypeScript inference for functions that spread `Record<string, unknown>`.
- **Promoted to OS-level**: Yes — extends F-014 pattern. This is the second iteration of the same bug class, proving the "fix at source, not consumer" principle.

---

### F-017: `.catch()` Chained on Supabase Query Builder (Not a Promise)
- **Date**: 2026-02-27
- **Session**: 4
- **Category**: `type-safety`, `build-failure`, `api-misuse`
- **Severity**: Critical
- **Symptom**: Vercel build #4 failed: `Property 'catch' does not exist on type 'PostgrestFilterBuilder<...>'. Did you mean 'match'?` at `habits/route.ts:180`.
- **Root Cause**: `platform(supabase).from("goal_habits").insert(goalLinks).catch(console.error)` — Supabase's `PostgrestFilterBuilder` is thenable (has `.then()`) but does NOT have `.catch()`. Chaining `.catch()` directly on the builder is a type error. This passed locally because of cached/incremental builds but fails on Vercel's clean `tsc`.
- **Fix**: Replaced with destructured error handling: `const { error: linkError } = await platform(supabase).from("goal_habits").insert(goalLinks); if (linkError) console.error(...)`. Scanned all other `.catch()` usages — the rest are on async functions (logActivity, recalculateAndUpdateGoalProgress, etc.) which return real Promises, so they're fine.
- **Pattern**: **Never chain `.catch()` directly on Supabase query builders. Use `const { error } = await query` + conditional error handling instead.** The builder is thenable but not a full Promise — it lacks `.catch()` and `.finally()`.
- **QA Rule**: Add to linter: any `.from(...)...insert|update|delete|upsert(...).catch(` pattern should be flagged. Only async function calls should use `.catch()`.
- **Trend Note**: This is build failure #4 from TypeScript strictness differences between local (incremental) and Vercel (clean) builds. Pattern: **always validate with clean `tsc --noEmit` before deploy.**

---

### F-018: FK Join Result Cast as Object Instead of Array
- **Date**: 2026-02-27
- **Session**: 4
- **Category**: `type-safety`, `build-failure`, `supabase-types`
- **Severity**: Critical
- **Symptom**: Vercel build #5 failed: `Conversion of type '{ slug: any; }[]' to type '{ slug: string; }' may be a mistake` at `notify-v2.ts:291`.
- **Root Cause**: Supabase FK joins (`.select("channel:notification_channels!fk(slug)")`) return an **array** `{ slug: any }[]`, not a single object `{ slug: string }`. Casting directly from array to object fails strict TypeScript overlap checking. Same bug existed in `notify.ts:69`.
- **Fix**: Cast through `unknown` first, then handle both array and object cases: `const data = pref.channel as unknown as { slug: string } | { slug: string }[] | null; const slug = Array.isArray(data) ? data[0]?.slug : data?.slug;`
- **Pattern**: **Supabase FK join results are always arrays, even for 1:1 relationships.** Never cast a FK join result directly to a single object type. Always handle the array case.
- **QA Rule**: Any `as { ... }` cast on a Supabase FK join field (identifiable by `table!fk_name(columns)` in the select string) should be flagged.

---

### F-019: Auth Callback 504 Timeout on Vercel
- **Date**: 2026-02-27
- **Session**: 5
- **Category**: `deployment`, `auth`, `performance`
- **Severity**: Critical
- **Symptom**: User couldn't log in. Clicking "Continue with Google" appeared to do nothing. Supabase auth logs showed successful token exchanges (200 status), but Vercel runtime logs showed `/auth/callback` returning 504 repeatedly.
- **Root Cause**: The auth callback route was sequentially `await`ing `ensureProfile()` → `updateLoginStreak()` → `awardXp()`. Each makes multiple Supabase queries. On Vercel Hobby plan cold starts, this chain exceeded the 10-second timeout.
- **Fix**: Stripped auth callback to just exchange code + redirect (2 operations). Moved gamification init to `/api/user` as fire-and-forget (`import().then().catch()`). Dashboard calls `/api/user` on load, so gamification happens post-login without blocking the callback.
- **Pattern**: **Auth callbacks must be fast — exchange token, redirect, done. Never put non-essential work (profile creation, streak tracking, XP awards) in the auth callback path. Defer to a subsequent API call or background job.**
- **QA Rule**: Auth callback routes should contain only: (1) token exchange, (2) redirect. Any `await` call beyond those two should be flagged.

---

### F-020: Feedback API 500 — Silent Failure with No UI Feedback
- **Date**: 2026-02-28
- **Session**: 6
- **Category**: `api-contract`, `error-handling`, `ux`
- **Severity**: Critical
- **Symptom**: User submitted feedback 3 times. Text stayed in the textarea, no confirmation, no error. The submit appeared to do nothing. Vercel logs showed 500 errors on `/api/feedback`.
- **Root Cause (initial)**: The feedback route's `request.json()` call had no try/catch, and side effects (auto-upvote, notifications) were not wrapped — any failure in post-insert operations would crash the entire response. The UI's catch block was `// silently fail` — no error state shown to user.
- **Fix (partial)**: Added JSON parsing safety, try/catch around household context, moved side effects to fire-and-forget, added error banner in UI. This exposed the real root cause (F-021).
- **Pattern**: **Never silently swallow errors in UI.** A `catch { }` with no user feedback is worse than showing the error — the user doesn't know whether to retry, wait, or give up. Always show error state.
- **QA Rule**: Any `catch` block in a UI submit handler that doesn't set an error state or show feedback should be flagged.

---

### F-021: Infinite Recursion in `household_members` RLS Policy
- **Date**: 2026-02-28
- **Session**: 6
- **Category**: `database`, `rls`, `security`
- **Severity**: Critical
- **Symptom**: Feedback insert returned 500 with error: `infinite recursion detected in policy for relation "household_members"`. Every table with household-scoped RLS was affected (feedback, responsibilities, delegations, etc.).
- **Root Cause**: The `household_members` SELECT policy was self-referential: `USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()))`. Postgres evaluates RLS policies on every table access — so querying `household_members` triggers its own SELECT policy, which queries `household_members` again, infinitely.
- **Fix**: Created `SECURITY DEFINER` functions (`get_user_household_ids()`, `is_household_admin()`) owned by `postgres` that bypass RLS. Replaced the recursive policies with calls to these functions. Granted EXECUTE to the `authenticated` role.
- **Pattern**: **RLS policies must never query the table they protect.** Self-referential RLS causes infinite recursion. Use `SECURITY DEFINER` functions to break the cycle — they execute as the function owner (bypassing RLS) and return the result to the policy.
- **QA Rule**: Any RLS policy where the `USING` or `WITH CHECK` clause contains `SELECT ... FROM [same_table]` should be flagged as a recursion risk. This applies to any table with membership/role-based access patterns.
- **Promoted to OS-level**: Yes — this will affect any project using Supabase with household/team/org membership patterns. The self-referential RLS trap is well-documented but easy to miss.

---

### F-022: SECURITY DEFINER Functions Missing GRANT EXECUTE
- **Date**: 2026-02-28
- **Session**: 6
- **Category**: `database`, `permissions`, `rls`
- **Severity**: Critical
- **Symptom**: After fixing F-021, feedback still failed with `permission denied for table household_members`. The SECURITY DEFINER functions existed but couldn't be called by the `authenticated` role.
- **Root Cause**: PostgreSQL functions created by `postgres` are only executable by `postgres` by default. The `authenticated` role (used by Supabase PostgREST) needs an explicit `GRANT EXECUTE ON FUNCTION ... TO authenticated` to call them. This was missed in the initial fix.
- **Fix**: Added `GRANT EXECUTE` for both functions and `GRANT USAGE ON SCHEMA platform TO authenticated`.
- **Pattern**: **When creating SECURITY DEFINER functions for RLS, always include GRANT EXECUTE to the roles that will trigger the policies.** The function must be callable by every role that accesses the protected table.
- **QA Rule**: Every `CREATE FUNCTION ... SECURITY DEFINER` should be followed by a `GRANT EXECUTE ON FUNCTION ... TO authenticated` in the same migration. Missing grants should be flagged.

---

## Trend Summary

| Pattern | Count | Categories |
|---------|-------|------------|
| Sandbox/environment deployment assumptions | 4 | F-008, F-009, F-010, F-011 |
| RLS self-referencing / permission issues | 2 | F-021, F-022 |
| TypeScript type loss in enrichment patterns | 2 | F-014, F-016 |
| Silent error handling (no user feedback) | 1 | F-020 |
| Auth callback bloat / timeout | 1 | F-019 |
| Supabase FK join type miscast | 1 | F-018 |
| Supabase API misuse (non-Promise chaining) | 1 | F-017 |
| Display labels used where machine values needed | 2 | F-003, F-004 |
| Cross-schema assumptions in ORM/query builder | 2 | F-001, F-002 |
| Configuration placeholders not validated | 2 | F-006, F-012 |
| Process/pipeline discipline failures | 1 | F-015 |
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
