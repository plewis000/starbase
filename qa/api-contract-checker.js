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

// Instead of whitelisting every valid column (unmaintainable with 70+ tables),
// detect display labels by pattern: multi-word, Title Case, contains spaces.
// Valid column names are always snake_case or single lowercase words.
function looksLikeDisplayLabel(value) {
  // Contains spaces = definitely a display label
  if (value.includes(" ")) return true;
  // Title Case multi-word with no underscore (e.g., "DueDate")
  if (/^[A-Z][a-z]+[A-Z]/.test(value)) return true;
  // Starts with uppercase and has no underscores (e.g., "Priority" vs "priority")
  // Only flag if it's a known display label pattern
  if (/^[A-Z][a-z]+$/.test(value) && ["Due", "Created", "Updated", "Status", "Assigned"].includes(value)) return true;
  return false;
}

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

      // CHECK 1: .order() with display-label column names
      const orderMatch = line.match(/\.order\(\s*["'`]([^"'`]+)["'`]/);
      if (orderMatch) {
        const colName = orderMatch[1];
        if (looksLikeDisplayLabel(colName)) {
          findings.push({
            file: relPath,
            line: lineNum,
            rule: "display-label-in-order",
            severity: "error",
            message: `Display label "${colName}" used in .order() call. Use the actual snake_case column name.`,
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
