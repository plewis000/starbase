#!/usr/bin/env node
/**
 * QA Script: form-value-checker
 *
 * Scans all component files for form controls where display labels
 * are used as values instead of machine-readable identifiers.
 *
 * Checks:
 *   1. <option value={displayText}> where value matches the display text
 *   2. String arrays used as both labels AND values in dropdowns
 *   3. Filter params that send display labels to APIs
 *
 * References: F-003 in FAILURE_LOG.md
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = ["components", "app"];
const EXTENSIONS = [".tsx", ".ts"];

// Patterns that indicate display labels being used as API values
// These are multi-word strings with spaces or Title Case that shouldn't be API params
const SUSPICIOUS_VALUES = [
  /["'`](Due Date|This Week|No Date|In Progress|To Do|Someday)["'`]/,
];

// Pattern: string array used as option list (suggests label=value coupling)
// e.g., const OPTIONS = ["Due Date", "Priority", "Created"]
const STRING_ARRAY_OPTIONS =
  /const\s+\w*(OPTIONS|CHOICES|ITEMS|VALUES|FILTERS)\w*\s*=\s*\[\s*["']/i;

// Pattern: <option value={item}>{item}</option> — same variable for label and value
const OPTION_SAME_VALUE_LABEL =
  /<option\s+[^>]*value=\{(\w+)\}[^>]*>\s*\{?\s*\1\s*\}?\s*<\/option>/;

// Pattern: .map((item) => <option value={item}>{item}</option>)
const MAP_OPTION_PATTERN =
  /\.map\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*[\s\S]*?<option[^>]*value=\{\s*\1\s*\}/;

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

  // File-level check: string array used as options
  const fullContent = content;
  const stringArrayMatch = fullContent.match(STRING_ARRAY_OPTIONS);
  if (stringArrayMatch) {
    // Find the line number
    const matchIndex = fullContent.indexOf(stringArrayMatch[0]);
    const lineNum = fullContent.substring(0, matchIndex).split("\n").length;

    // Check if any entry in the array has spaces (indicating display labels)
    const arrayLine = lines[lineNum - 1];
    const hasSpacedEntries = /["'][A-Z][a-z]+\s[A-Z]/.test(arrayLine) ||
                             /["'][A-Z][a-z]+\s[a-z]/.test(arrayLine);

    if (hasSpacedEntries) {
      findings.push({
        file: relPath,
        line: lineNum,
        rule: "string-array-as-options",
        severity: "error",
        message: `String array with display labels used as options. Use { label, value } objects instead so API receives machine-readable values (column names, enums, UUIDs).`,
        code: arrayLine.trim(),
        ref: "F-003",
      });
    }
  }

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // CHECK 1: Suspicious display-label values in option elements
    for (const pattern of SUSPICIOUS_VALUES) {
      if (pattern.test(line) && /value=/.test(line)) {
        findings.push({
          file: relPath,
          line: lineNum,
          rule: "display-label-as-value",
          severity: "error",
          message: `Display label used as form value. API params should be machine-readable (e.g., "due_date" not "Due Date", "in_progress" not "In Progress").`,
          code: line.trim(),
          ref: "F-003",
        });
      }
    }

    // CHECK 2: Same variable used for both <option value> and display text
    if (OPTION_SAME_VALUE_LABEL.test(line)) {
      findings.push({
        file: relPath,
        line: lineNum,
        rule: "option-value-equals-label",
        severity: "warn",
        message: `<option> using same variable for value and label. If this is a string array (not objects), the display text gets sent to the API.`,
        code: line.trim(),
        ref: "F-003",
      });
    }

    // CHECK 3: params.append with Title Case or space-containing values
    const paramsAppend = line.match(
      /params\.append\(\s*["'](\w+)["']\s*,\s*["']([^"']+)["']\s*\)/
    );
    if (paramsAppend) {
      const [, , value] = paramsAppend;
      if (/^[A-Z][a-z]+\s/.test(value)) {
        findings.push({
          file: relPath,
          line: lineNum,
          rule: "display-label-in-params",
          severity: "error",
          message: `Title Case value "${value}" sent as URL param. API params should be snake_case or lowercase identifiers.`,
          code: line.trim(),
          ref: "F-003",
        });
      }
    }
  });

  // Multi-line check: .map pattern where same var is value and label
  const mapMatches = fullContent.match(
    /\.map\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*[^)]*<option[^>]*value=\{\s*\1\s*\}[^<]*>\s*\{?\s*\1\s*\}?\s*<\/option>/g
  );
  if (mapMatches) {
    for (const match of mapMatches) {
      const matchIndex = fullContent.indexOf(match);
      const lineNum = fullContent.substring(0, matchIndex).split("\n").length;
      findings.push({
        file: relPath,
        line: lineNum,
        rule: "map-option-same-value-label",
        severity: "warn",
        message: `Array.map() renders <option> with same variable for value and display. If the source array contains display labels, they'll be sent to the API as-is.`,
        code: match.substring(0, 100).trim() + (match.length > 100 ? "..." : ""),
        ref: "F-003",
      });
    }
  }
}

// Run
console.log("🔍 form-value-checker — Scanning form controls for display-label values...\n");

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
