#!/usr/bin/env node
/**
 * QA Script: select-string-linter
 *
 * Scans all .select() calls in Supabase queries for known anti-patterns:
 *   1. Cross-schema FK hint joins (e.g., status:task_statuses!fk_name(*))
 *   2. auth.users FK references (users!tasks_*_fkey)
 *   3. Double wildcard selects (*, *)
 *   4. Display-label column names in .order() calls
 *
 * References: F-001, F-002, F-005 in FAILURE_LOG.md
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = ["app/api", "lib", "components"];
const EXTENSIONS = [".ts", ".tsx"];

// Known cross-schema table mappings
// Tables in config schema that should NOT appear in FK hints from platform queries
const CONFIG_TABLES = [
  "task_statuses",
  "task_priorities",
  "task_types",
  "effort_levels",
  "location_contexts",
  "tags",
  "recurrence_patterns",
];

// Auth-boundary tables that are never accessible via PostgREST
const AUTH_TABLES = ["users"];

// Display labels that should never appear in .order() calls
const INVALID_ORDER_VALUES = [
  "Due Date",
  "Priority",
  "Created",
  "Title",
  "Status",
  "Assigned To",
  "Updated",
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

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const relPath = path.relative(ROOT, filePath);

  filesScanned++;

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // CHECK 1: Cross-schema FK hint joins in .select()
    // Pattern: table_name!fk_name(*) where table_name is in CONFIG_TABLES
    for (const table of CONFIG_TABLES) {
      const fkPattern = new RegExp(`${table}!\\w+\\(`, "g");
      if (fkPattern.test(line)) {
        findings.push({
          file: relPath,
          line: lineNum,
          rule: "cross-schema-fk-join",
          severity: "error",
          message: `Cross-schema FK hint join to config table "${table}". PostgREST cannot resolve FK joins across schemas. Use task-enrichment pattern instead.`,
          code: line.trim(),
          ref: "F-001",
        });
      }
    }

    // CHECK 2: auth.users FK references
    // Pattern: users!tasks_*_fkey or users!task_comments_*_fkey
    const authFkPattern = /users!\w+_fkey\(/g;
    if (authFkPattern.test(line)) {
      findings.push({
        file: relPath,
        line: lineNum,
        rule: "auth-schema-fk-join",
        severity: "error",
        message: `FK hint join to "users" table via auth schema. The auth schema is not exposed in PostgREST. Use platform.users lookup in enrichment helper.`,
        code: line.trim(),
        ref: "F-002",
      });
    }

    // CHECK 3: Double wildcard in .select()
    // Pattern: .select("*, *") or .select("*,*") or .select(`*, *`)
    const doubleWildcard = /\.select\(\s*["'`][^"'`]*\*\s*,\s*\*[^"'`]*["'`]\s*\)/;
    if (doubleWildcard.test(line)) {
      findings.push({
        file: relPath,
        line: lineNum,
        rule: "double-wildcard-select",
        severity: "error",
        message: `Double wildcard in .select() call. This causes a PostgREST query error. Remove the duplicate "*".`,
        code: line.trim(),
        ref: "F-005",
      });
    }

    // CHECK 4: Display labels in .order() calls
    for (const label of INVALID_ORDER_VALUES) {
      const orderPattern = new RegExp(`\\.order\\(\\s*["'\`]${label}["'\`]`, "i");
      if (orderPattern.test(line)) {
        findings.push({
          file: relPath,
          line: lineNum,
          rule: "display-label-in-order",
          severity: "error",
          message: `Display label "${label}" used in .order() call. Use the actual column name (e.g., "due_date", "priority_id", "created_at", "title").`,
          code: line.trim(),
          ref: "F-003",
        });
      }
    }

    // CHECK 5: Bare FK hint that might be cross-schema (general catch)
    // Warn on any FK hint join pattern so devs verify schema boundaries
    const anyFkHint = /\.select\([^)]*\w+!\w+_fkey\([^)]*\)/;
    if (anyFkHint.test(line)) {
      // Don't double-report if already caught above
      const alreadyCaught = findings.some(
        (f) => f.file === relPath && f.line === lineNum &&
        (f.rule === "cross-schema-fk-join" || f.rule === "auth-schema-fk-join")
      );
      if (!alreadyCaught) {
        findings.push({
          file: relPath,
          line: lineNum,
          rule: "fk-hint-review",
          severity: "warn",
          message: `FK hint join detected in .select(). Verify that the referenced table is in the same schema as the source table.`,
          code: line.trim(),
          ref: "F-001",
        });
      }
    }
  });
}

// Run
console.log("🔍 select-string-linter — Scanning Supabase .select() calls...\n");

for (const dir of SCAN_DIRS) {
  const fullDir = path.join(ROOT, dir);
  const files = getAllFiles(fullDir, EXTENSIONS);
  files.forEach(scanFile);
}

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
