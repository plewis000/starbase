# Starbase — Standards Audit

Performed during Sisyphus import (Session 3, 2026-02-26)

---

## Standards Compliance

| Standard | Status | Gaps Found | Severity | Remediation |
|----------|--------|------------|----------|-------------|
| CODE_QUALITY.md | ⚠️ | 2 gaps | Low | See below |
| SECURITY_STANDARDS.md | ✅ | 0 gaps | — | Compliant |
| CONFIGURABILITY_STANDARDS.md | ⚠️ | 1 gap | Medium | See below |
| QA_STANDARDS.md | ⚠️ | 1 gap | Low | See below |

---

### CODE_QUALITY.md Gaps

**Gap 1: No file headers**
- Standard requires: comment block with FILE, PURPOSE, PART OF, CREATED, LAST MODIFIED, CONFIDENCE
- Project does: no file headers on any source file
- Severity: Low — doesn't affect functionality, purely documentation
- Remediation: Add headers to key files during next DEVELOPER sprint. Not a blocker.

**Gap 2: No section break comments**
- Standard requires: `// ---- SECTION NAME ----` grouping in files
- Project does: some files are well-organized but lack explicit section breaks
- Severity: Low — code is readable without them
- Remediation: Add during refactoring passes. Not a blocker.

### SECURITY_STANDARDS.md — Compliant

- No secrets in source code ✅
- .env in .gitignore ✅
- Auth via Supabase OAuth (Google) ✅
- HTTPS only (Vercel enforces) ✅
- Sort column whitelist prevents injection ✅
- RLS enabled on all tables ✅
- Env vars documented in deploy-preflight QA ✅

### CONFIGURABILITY_STANDARDS.md Gap

**Gap 1: No admin panel**
- Standard requires: Admin panel at `/admin` for config management
- Project does: config tables exist but no UI for managing them
- Severity: Medium — config changes currently require direct DB access
- Remediation: Build admin panel in Phase 3. Config tables follow the correct pattern; they just need a management UI.

### QA_STANDARDS.md Gap

**Gap 1: No unit/integration tests**
- Standard requires: build passes, TypeScript strict, no vulnerabilities
- Project does: QA suite covers lint-level checks, but no runtime testing
- Severity: Low — QA suite compensates for known patterns. Runtime bugs will be caught during real-world use.
- Remediation: Add critical-path tests (task CRUD, recurrence) when velocity allows. Not a blocker.

---

## Pattern Library Cross-Check

OS-level PATTERN_LIBRARY is currently empty (no promoted patterns yet). The project's FAILURE_LOG contains 7 entries with well-documented patterns. Two patterns are candidates for OS-level promotion:

| Pattern | Source | Promotion Candidate? | Reason |
|---------|--------|---------------------|--------|
| Cross-schema FK joins fail in PostgREST | F-001, F-002 | ✅ Yes | Applies to ANY Supabase project using custom schemas |
| Display labels vs machine values in forms | F-003, F-004 | ✅ Yes | Applies to ANY project with forms + APIs |
| Double-select from find-and-replace | F-005 | ❌ No | Too project-specific (Supabase .select() syntax) |
| OAuth wildcard for preview deploys | F-006 | ✅ Yes | Applies to ANY Vercel + OAuth project |
| Unvalidated sort params | F-007 | ✅ Yes | Applies to ANY project with user-supplied query params |

**Recommendation:** Promote 4 patterns to OS-level PATTERN_LIBRARY after import is complete.
