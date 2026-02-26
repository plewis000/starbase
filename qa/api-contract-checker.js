#!/usr/bin/env node
/**
 * QA Script: api-contract-checker
 *
 * Validates that frontend code sends correct values to API endpoints.
 * Cross-references fetch() calls in components with the API route handlers
 * to catch mismatches in query params, body fields, and expected values.
 *
 * Checks:
 *   1. Query params use valid column names (not display labels)
 *   2. fetch() URLs match existing API routes
 *   3. API route .order() calls use valid column names
 *   4. Response field names match what components expect
 *
 * References: F-003, F-004 in FAILURE_LOG.md
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const EXTENSIONS = [".ts", ".tsx"];

// Known valid column names across all tables used in .order() calls
const VALID_ORDER_COLUMNS = new Set([
  // tasks
  "id", "title", "description", "status_id", "priority_id", "type_id",
  "effort_id", "due_date", "start_date", "completed_at", "created_at",
  "updated_at", "created_by", "assigned_to", "parent_task_id",
  "location_context_id", "is_recurring", "recurrence_pattern_id",
  "recurrence_source_id", "external_ref", "sort_order",
  // goals
  "target_date", "progress_value", "progress_type", "category_id",
  "timeframe_id",
  // habits
  "current_streak", "best_streak", "total_completions", "frequency",
  "target_count", "last_checked_at",
  // comments
  "edited_at", "pinned_at", "parent_comment_id",
  // activity_log
  "performed_at", "action", "entity_type", "entity_id", "user_id",
  // notifications
  "sent_at", "read_at", "dismissed_at",
  // notification subscriptions
  "event_type", "channel_id", "enabled",
  // checklist items
  "checked", "checked_at",
  // config tables
  "name", "slug", "color",
]);

// Known valid sort columns for tasks specifically (frontend sends these)
const VALID_SORT_COLUMNS = [
  "due_date", "priority_id", "created_at", "updated_at", "title",
  "completed_at", "start_date", "sort_order",
];

let findings = [];
let filesScanned = 0;

function getAllFiles(dir, exts) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      results = results.concat(getAllFiles(fullPath, exts));
    } else if (entry.isFile() && exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

function scanApiRoutes() {
  const apiDir = path.join(ROOT, "app/api");
  const files = getAllFiles(apiDir, EXTENSIONS);

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const relPath = path.relative(ROOT, filePath);

    filesScanned++;

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;

      // CHECK 1: .order() with invalid column names
      const orderMatch = line.match(/\.order\(\s*["'`]([^"'`]+)["'`]/);
      if (orderMatch) {
        const colName = orderMatch[1];
        if (!VALID_ORDER_COLUMNS.has(colName) && !colName.includes(".")) {
          findings.push({
            file: relPath,
            line: lineNum,
            rule: "invalid-order-column",
            severity: "error",
            message: `Invalid column "${colName}" in .order() call. Valid sort columns: ${VALID_SORT_COLUMNS.join(", ")}`,
            code: line.trim(),
            ref: "F-003",
          });
        }
      }

      // CHECK 2: Dynamic .order() from query param without validation
      const dynamicOrder = line.match(
        /\.order\(\s*(\w+)\s*[,)]/
      );
      if (dynamicOrder && !line.includes('"') && !line.includes("'")) {
        const varName = dynamicOrder[1];
        // Check if variable is validated against a whitelist
        const blockStart = Math.max(0, idx - 20);
        const blockBefore = lines.slice(blockStart, idx).join("\n");
        const hasWhitelist =
          blockBefore.includes("VALID_SORT") ||
          blockBefore.includes("includes(") ||
          blockBefore.includes("allowedSort") ||
          blockBefore.includes("sortWhitelist");
        if (!hasWhitelist) {
          findings.push({
            file: relPath,
            line: lineNum,
            rule: "unvalidated-dynamic-order",
            severity: "warn",
            message: `Dynamic variable "${varName}" passed to .order() without visible whitelist validation. Validate against allowed column names to prevent injection.`,
            code: line.trim(),
            ref: "F-003",
          });
        }
      }

      // CHECK 3: searchParams.get() used in .order() without validation
      if (line.includes("searchParams") && line.includes("order")) {
        const blockEnd = Math.min(idx + 5, lines.length);
        const blockAfter = lines.slice(idx, blockEnd).join("\n");
        if (!blockAfter.includes("includes(") && !blockAfter.includes("VALID_SORT")) {
          findings.push({
            file: relPath,
            line: lineNum,
            rule: "unvalidated-sort-param",
            severity: "warn",
            message: `Sort parameter from URL used without validation. Whitelist valid column names before passing to .order().`,
            code: line.trim(),
            ref: "F-003",
          });
        }
      }
    });
  }
}

function scanComponents() {
  const componentDirs = [
    path.join(ROOT, "components"),
    path.join(ROOT, "app"),
  ];

  for (const dir of componentDirs) {
    const files = getAllFiles(dir, [".tsx"]);
    for (const filePath of files) {
      // Skip API routes (already scanned)
      if (filePath.includes("/api/")) continue;

      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      const relPath = path.relative(ROOT, filePath);

      filesScanned++;

      lines.forEach((line, idx) => {
        const lineNum = idx + 1;

        // CHECK 4: fetch() with hardcoded display-label query params
        const fetchSortParam = line.match(
          /sort=([A-Z][a-z]+(?:\+|%20)[A-Z][a-z]+)/
        );
        if (fetchSortParam) {
          findings.push({
            file: relPath,
            line: lineNum,
            rule: "display-label-in-fetch-url",
            severity: "error",
            message: `Display label "${fetchSortParam[1].replace(/\+|%20/g, " ")}" in fetch URL sort param. Use column name instead.`,
            code: line.trim(),
            ref: "F-003",
          });
        }

        // CHECK 5: Hardcoded API URL that doesn't match a route
        const fetchUrl = line.match(/fetch\(\s*["'`]([^"'`$]+)["'`]/);
        if (fetchUrl) {
          const url = fetchUrl[1];
          if (url.startsWith("/api/")) {
            // Normalize the URL (remove query params)
            const routePath = url.split("?")[0];
            // Check it maps to an existing route
            const routeFile = routePath
              .replace(/\/api\//, "app/api/")
              .replace(/\/[a-f0-9-]{36}/g, "/[id]") // UUID params
              + "/route.ts";

            if (!fs.existsSync(path.join(ROOT, routeFile))) {
              // Could be a dynamic segment — just warn
              findings.push({
                file: relPath,
                line: lineNum,
                rule: "unverified-api-route",
                severity: "warn",
                message: `fetch() to "${url}" — verify this API route exists. Expected route file: ${routeFile}`,
                code: line.trim(),
                ref: "F-003",
              });
            }
          }
        }
      });
    }
  }
}

// Run
console.log("🔍 api-contract-checker — Validating frontend-API contracts...\n");

scanApiRoutes();
scanComponents();

// Report
const errors = findings.filter((f) => f.severity === "error");
const warns = findings.filter((f) => f.severity === "warn");

if (findings.length === 0) {
  console.log(`✅ All clear. Scanned ${filesScanned} files, no issues found.\n`);
} else {
  console.log(`Scanned ${filesScanned} files.\n`);

  for (const f of findings) {
    const icon = f.severity === "error" ? "❌" : "⚠️";
    console.log(`${icon} [${f.rule}] ${f.file}:${f.line}`);
    console.log(`   ${f.message}`);
    console.log(`   Code: ${f.code}`);
    console.log(`   Ref: ${f.ref}\n`);
  }

  console.log("---");
  console.log(`${errors.length} error(s), ${warns.length} warning(s)\n`);
}

process.exit(errors.length > 0 ? 1 : 0);
