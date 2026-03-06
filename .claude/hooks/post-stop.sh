#!/bin/bash
# Post-Stop hook: lint → build → QA → commit → push
# Exit 2 = feed errors back to Claude for inline fix
# Exit 0 = success or no-op

set -euo pipefail

STARBASE_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
MAX_RETRIES=3

cd "$STARBASE_DIR"

# 1. Dirty check — skip if no changes
if git diff --quiet HEAD 2>/dev/null && git diff --cached --quiet 2>/dev/null; then
  # Also check untracked files in the project
  UNTRACKED=$(git ls-files --others --exclude-standard -- . | head -1)
  if [ -z "$UNTRACKED" ]; then
    exit 0  # Nothing to do
  fi
fi

# 2. Retry cap
RETRIES=0
if [ -f /tmp/claude-qa-retries ]; then
  RETRIES=$(cat /tmp/claude-qa-retries)
fi

if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
  echo "QA failed $MAX_RETRIES times. Stopping auto-fix loop. Please review manually." >&2
  rm -f /tmp/claude-qa-retries
  exit 0  # Don't block forever
fi

# 3. Run checks, collect errors
ERRORS=""

# Lint
if ! LINT_OUT=$(npm run lint 2>&1); then
  ERRORS="${ERRORS}\n=== LINT ERRORS ===\n${LINT_OUT}\n"
fi

# Build
if ! BUILD_OUT=$(npm run build 2>&1); then
  ERRORS="${ERRORS}\n=== BUILD ERRORS ===\n${BUILD_OUT}\n"
fi

# QA suite
if ! QA_OUT=$(npm run qa 2>&1); then
  ERRORS="${ERRORS}\n=== QA ERRORS ===\n${QA_OUT}\n"
fi

# 4. If errors, feed back to Claude
if [ -n "$ERRORS" ]; then
  echo $((RETRIES + 1)) > /tmp/claude-qa-retries
  printf "Auto-QA found issues. Fix these and I'll retry:\n%b" "$ERRORS" >&2
  exit 2
fi

# 5. All passed — commit and push
rm -f /tmp/claude-qa-retries

# Stage all changes in starbase
git add -A .

# Generate commit message from diff stat
STAT=$(git diff --cached --stat | tail -1)
FILES=$(git diff --cached --name-only | head -5 | xargs -I{} basename {} | paste -sd ", " -)
MSG="auto: update ${FILES} (${STAT})"

git commit -m "$MSG

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

# Push to current branch
BRANCH=$(git branch --show-current)
git push origin "$BRANCH" 2>&1 || echo "Push failed — may need manual push" >&2

exit 0
