#!/usr/bin/env node
/**
 * QA Script: config-hardcode-detector
 *
 * Detects hardcoded IDs, slugs, or option arrays for database-managed
 * lookup tables (statuses, priorities, types, etc.).
 *
 * These should be fetched from the API at runtime, not baked into components.
 *
 * References: F-004 in FAILURE_LOG.md
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = ["components", "app"];
const EXTENSIONS = [".tsx", ".ts"];

// Known config-managed entity names that should NOT be hardcoded
// If a component defines its own array of these, it's a red flag
const CONFIG_ENTITIES = {
  statuses: {
    slugs: ["to-do", "to_do", "in-progress", "in_progress", "blocked", "done", "someday", "cancelled"],
    names: ["To Do", "In Progress", "Blocked", "Done", "Someday", "Cancelled"],
  },
  priorities: {
    slugs: ["critical", "high", "medium", "low", "none"],
    names: ["Critical", "High", "Medium", "Low", "None"],
  },
  types: {
    slugs: ["task", "project", "habit", "errand", "event"],
    names: ["Task", "Project", "Habit", "Errand", "Event"],
  },
  efforts: {
    slugs: ["trivial", "small", "medium", "large", "epic"],
    names: ["Trivial", "Small", "Medium", "Large", "Epic"],
  },
};

// Pattern: hardcoded option arrays that match config entities
// e.g., const STATUS_OPTIONS = [{ id: "to-do", name: "To Do" }, ...]
const HARDCODED_ARRAY_PATTERN =
  /const\s+\w*(STATUS|PRIORITY|TYPE|EFFORT|CATEGORY)\w*\s*=\s*\[/i;

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

  // Skip lib/ files (enrichment helpers are allowed to reference config)
  if (relPath.startsWith("lib/")) return;
  // Skip QA scripts
  if (relPath.startsWith("qa/")) return;
  // Skip UI primitives that use names for display mapping (StatusBadge, PriorityBadge)
  // These map names to colors — that's acceptable as display logic
  const basename = path.basename(filePath);
  if (basename === "StatusBadge.tsx" || basename === "PriorityBadge.tsx") return;

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // CHECK 1: Hardcoded option arrays for config entities
    if (HARDCODED_ARRAY_PATTERN.test(line)) {
      // Look ahead to see if it contains slug or name matches
      const blockEnd = Math.min(idx + 20, lines.length);
      const block = lines.slice(idx, blockEnd).join("\n");

      for (const [entity, values] of Object.entries(CONFIG_ENTITIES)) {
        const matchedSlugs = values.slugs.filter((s) => block.includes(`"${s}"`));
        const matchedNames = values.names.filter((n) => block.includes(`"${n}"`));

        if (matchedSlugs.length >= 3 || matchedNames.length >= 3) {
          findings.push({
            file: relPath,
            line: lineNum,
            rule: "hardcoded-config-options",
            severity: "error",
            message: `Hardcoded ${entity} options array with ${matchedSlugs.length + matchedNames.length} matches. These should be fetched from the config API at runtime, not hardcoded. Matched: ${[...matchedSlugs, ...matchedNames].join(", ")}`,
            code: line.trim(),
            ref: "F-004",
          });
          break; // One finding per array
        }
      }
    }

    // CHECK 2: Hardcoded UUID-like strings for status/priority/type IDs
    // Pattern: status_id: "some-slug" or priority_id: "some-slug"
    const slugAssignment = line.match(
      /(status_id|priority_id|type_id|effort_id)\s*:\s*["']([a-z-]+)["']/
    );
    if (slugAssignment) {
      const [, field, value] = slugAssignment;
      // Check if it's a known slug (not a UUID)
      const allSlugs = Object.values(CONFIG_ENTITIES).flatMap((e) => e.slugs);
      if (allSlugs.includes(value)) {
        findings.push({
          file: relPath,
          line: lineNum,
          rule: "hardcoded-slug-id",
          severity: "error",
          message: `Hardcoded slug "${value}" assigned to ${field}. Database expects a UUID, not a slug. Fetch the actual ID from the config API.`,
          code: line.trim(),
          ref: "F-004",
        });
      }
    }
  });
}

// Run
console.log("🔍 config-hardcode-detector — Scanning for hardcoded config values...\n");

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
