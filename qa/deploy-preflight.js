#!/usr/bin/env node
/**
 * QA Script: deploy-preflight
 *
 * Pre-deployment checks to catch environment and configuration issues
 * before pushing to Vercel.
 *
 * Checks:
 *   1. Required environment variables are referenced consistently
 *   2. No .env files staged for commit
 *   3. TypeScript compilation passes (0 errors)
 *   4. No console.log() left in API routes (only console.error)
 *   5. All API routes export valid HTTP methods
 *   6. No hardcoded deployment URLs
 *   7. ENV PLACEHOLDER DETECTION — scan .env* for placeholder values (OS-P001)
 *   8. GIT HEALTH — check for stale lock files or dirty state (F-008)
 *   9. CONNECTIVITY PRE-CHECK — verify network access to deploy targets (OS-P002)
 *
 * References: F-006, F-008, F-009, F-010, F-012, OS-P001, OS-P002
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const EXTENSIONS = [".ts", ".tsx"];

let findings = [];
let filesScanned = 0;

function getAllFiles(dir, exts) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".next") {
      results = results.concat(getAllFiles(fullPath, exts));
    } else if (entry.isFile() && exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

// CHECK 1: Required env vars
function checkEnvVars() {
  console.log("  Checking environment variable references...");

  const requiredEnvVars = new Set();
  const allFiles = getAllFiles(ROOT, EXTENSIONS);

  for (const filePath of allFiles) {
    const content = fs.readFileSync(filePath, "utf-8");
    const matches = content.matchAll(/process\.env\.(\w+)/g);
    for (const match of matches) {
      requiredEnvVars.add(match[1]);
    }
  }

  // Check .env.local exists
  const envLocal = path.join(ROOT, ".env.local");
  if (fs.existsSync(envLocal)) {
    const envContent = fs.readFileSync(envLocal, "utf-8");
    for (const envVar of requiredEnvVars) {
      if (!envContent.includes(envVar) && envVar !== "NODE_ENV") {
        findings.push({
          file: ".env.local",
          line: 0,
          rule: "missing-env-var",
          severity: "warn",
          message: `Environment variable "${envVar}" is referenced in code but not found in .env.local. Verify it's set in Vercel project settings.`,
          code: `process.env.${envVar}`,
          ref: "F-006",
        });
      }
    }
  } else {
    findings.push({
      file: ".env.local",
      line: 0,
      rule: "no-env-file",
      severity: "warn",
      message: `No .env.local file found. Ensure all required environment variables are set in Vercel project settings.`,
      code: `Required: ${[...requiredEnvVars].join(", ")}`,
      ref: "F-006",
    });
  }
}

// CHECK 2: No .env files staged
function checkNoEnvStaged() {
  console.log("  Checking for staged .env files...");
  try {
    const staged = execSync("git diff --cached --name-only 2>/dev/null", {
      cwd: ROOT,
      encoding: "utf-8",
    });
    const envFiles = staged.split("\n").filter((f) => f.match(/\.env/));
    for (const envFile of envFiles) {
      if (envFile.trim()) {
        findings.push({
          file: envFile.trim(),
          line: 0,
          rule: "env-file-staged",
          severity: "error",
          message: `Environment file "${envFile.trim()}" is staged for commit. Never commit .env files — they may contain secrets.`,
          code: `git reset HEAD ${envFile.trim()}`,
          ref: "F-006",
        });
      }
    }
  } catch {
    // Not in a git repo or git not available
  }
}

// CHECK 3: console.log in API routes
function checkConsoleLogInApi() {
  console.log("  Checking for console.log() in API routes...");
  const apiDir = path.join(ROOT, "app/api");
  const files = getAllFiles(apiDir, EXTENSIONS);

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const relPath = path.relative(ROOT, filePath);

    filesScanned++;

    lines.forEach((line, idx) => {
      if (/console\.log\(/.test(line) && !line.trim().startsWith("//")) {
        findings.push({
          file: relPath,
          line: idx + 1,
          rule: "console-log-in-api",
          severity: "warn",
          message: `console.log() in API route. Use console.error() for error logging or remove debug logs before deploy.`,
          code: line.trim(),
          ref: "deploy-hygiene",
        });
      }
    });
  }
}

// CHECK 4: Hardcoded deployment URLs
function checkHardcodedUrls() {
  console.log("  Checking for hardcoded deployment URLs...");
  const allFiles = getAllFiles(ROOT, EXTENSIONS);

  for (const filePath of allFiles) {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const relPath = path.relative(ROOT, filePath);

    filesScanned++;

    lines.forEach((line, idx) => {
      // Vercel preview URLs
      if (/https:\/\/atlas-\w+-plewis000s-projects\.vercel\.app/.test(line)) {
        findings.push({
          file: relPath,
          line: idx + 1,
          rule: "hardcoded-deploy-url",
          severity: "error",
          message: `Hardcoded Vercel preview URL. Use environment variables or relative URLs instead. Preview URLs change on every deployment.`,
          code: line.trim(),
          ref: "F-006",
        });
      }

      // Any hardcoded vercel.app URL (not in comments)
      if (/["'`]https:\/\/[^"'`]*\.vercel\.app/.test(line) && !line.trim().startsWith("//")) {
        findings.push({
          file: relPath,
          line: idx + 1,
          rule: "hardcoded-vercel-url",
          severity: "warn",
          message: `Hardcoded Vercel URL found. Consider using NEXT_PUBLIC_SITE_URL or relative paths.`,
          code: line.trim(),
          ref: "F-006",
        });
      }
    });
  }
}

// CHECK 5: Valid HTTP method exports in API routes
function checkApiExports() {
  console.log("  Checking API route exports...");
  const apiDir = path.join(ROOT, "app/api");
  const files = getAllFiles(apiDir, EXTENSIONS);
  const validMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

  for (const filePath of files) {
    if (!filePath.endsWith("route.ts")) continue;

    const content = fs.readFileSync(filePath, "utf-8");
    const relPath = path.relative(ROOT, filePath);

    const exports = content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g);
    let hasValidExport = false;

    for (const match of exports) {
      if (validMethods.includes(match[1])) {
        hasValidExport = true;
      }
    }

    if (!hasValidExport) {
      findings.push({
        file: relPath,
        line: 1,
        rule: "no-http-method-export",
        severity: "error",
        message: `API route file has no valid HTTP method export (GET, POST, PUT, PATCH, DELETE). Next.js will return 405.`,
        code: `Expected: export async function GET|POST|...`,
        ref: "deploy-hygiene",
      });
    }
  }
}

// CHECK 6: Placeholder values in env files (OS-P001, F-012)
function checkEnvPlaceholders() {
  console.log("  Checking for placeholder values in .env files...");

  const PLACEHOLDER_PATTERNS = [
    /your[-_].*[-_]here/i,
    /paste[-_].*[-_]here/i,
    /replace[-_].*[-_]here/i,
    /\bTODO\b/,
    /\bXXX\b/i,
    /\bexample\b/i,
    /\bplaceholder\b/i,
    /\bchange[-_]me\b/i,
    /\binsert[-_].*[-_]here\b/i,
    /^sk[-_]test[-_]/,  // common test API key prefix
  ];

  const envFiles = fs.readdirSync(ROOT).filter((f) => f.startsWith(".env") && !f.endsWith(".example"));

  for (const envFile of envFiles) {
    const filePath = path.join(ROOT, envFile);
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    lines.forEach((line, idx) => {
      if (line.trim().startsWith("#") || !line.includes("=")) return;

      const eqIdx = line.indexOf("=");
      const key = line.substring(0, eqIdx).trim();
      const value = line.substring(eqIdx + 1).trim();

      // Skip empty values (caught by CHECK 1)
      if (!value) return;

      for (const pattern of PLACEHOLDER_PATTERNS) {
        if (pattern.test(value)) {
          findings.push({
            file: envFile,
            line: idx + 1,
            rule: "env-placeholder-value",
            severity: "error",
            message: `Environment variable "${key}" contains a placeholder value. Replace with the real value before deploying.`,
            code: `${key}=${value}`,
            ref: "OS-P001, F-012",
          });
          break;
        }
      }
    });
  }
}

// CHECK 7: Git health (F-008)
function checkGitHealth() {
  console.log("  Checking git repository health...");

  // Check for stale lock files
  const lockFile = path.join(ROOT, ".git", "index.lock");
  if (fs.existsSync(lockFile)) {
    findings.push({
      file: ".git/index.lock",
      line: 0,
      rule: "git-stale-lock",
      severity: "error",
      message: `Stale git lock file found. A previous git operation may have been interrupted. Remove it with: rm .git/index.lock`,
      code: `rm ${lockFile}`,
      ref: "F-008",
    });
  }

  // Check for uncommitted changes
  try {
    const status = execSync("git status --porcelain 2>/dev/null", {
      cwd: ROOT,
      encoding: "utf-8",
    });
    const changed = status.trim().split("\n").filter(Boolean);
    if (changed.length > 0) {
      findings.push({
        file: "working tree",
        line: 0,
        rule: "uncommitted-changes",
        severity: "warn",
        message: `${changed.length} uncommitted change(s) in working tree. Commit or stash before deploying to ensure deploy matches repo state.`,
        code: changed.slice(0, 5).join(", ") + (changed.length > 5 ? ` (+${changed.length - 5} more)` : ""),
        ref: "F-008",
      });
    }
  } catch {
    // Not in a git repo
  }
}

// CHECK 8: Connectivity pre-check (OS-P002)
function checkConnectivity() {
  console.log("  Checking deployment infrastructure access...");

  const targets = [
    { name: "npm registry", url: "https://registry.npmjs.org", ref: "F-009" },
    { name: "GitHub", url: "https://github.com", ref: "F-010" },
    { name: "Vercel API", url: "https://api.vercel.com", ref: "OS-P002" },
  ];

  for (const target of targets) {
    try {
      execSync(`curl -s --max-time 5 -o /dev/null -w "%{http_code}" ${target.url}`, {
        cwd: ROOT,
        encoding: "utf-8",
        timeout: 10000,
      });
    } catch {
      findings.push({
        file: "network",
        line: 0,
        rule: "connectivity-blocked",
        severity: "warn",
        message: `Cannot reach ${target.name} (${target.url}). Automated deployment will fail. Use manual deploy instructions instead.`,
        code: `curl -s --max-time 5 ${target.url}`,
        ref: target.ref,
      });
    }
  }
}

// CHECK 9: TypeScript compilation
function checkTypeScript() {
  console.log("  Running TypeScript check...");
  try {
    execSync("npx tsc --noEmit 2>&1", { cwd: ROOT, encoding: "utf-8", timeout: 60000 });
    console.log("    ✅ TypeScript: 0 errors\n");
  } catch (err) {
    const output = err.stdout || err.stderr || "Unknown error";
    const errorCount = (output.match(/error TS/g) || []).length;
    findings.push({
      file: "tsconfig.json",
      line: 0,
      rule: "typescript-errors",
      severity: "error",
      message: `TypeScript compilation failed with ${errorCount} error(s). Fix all type errors before deploying.`,
      code: output.split("\n").slice(0, 5).join("\n"),
      ref: "deploy-hygiene",
    });
  }
}

// Run
console.log("🔍 deploy-preflight — Running pre-deployment checks...\n");

checkEnvVars();
checkEnvPlaceholders();
checkNoEnvStaged();
checkGitHealth();
checkConsoleLogInApi();
checkHardcodedUrls();
checkApiExports();
checkConnectivity();
checkTypeScript();

// Report
const errors = findings.filter((f) => f.severity === "error");
const warns = findings.filter((f) => f.severity === "warn");

console.log(`\nScanned ${filesScanned} files.\n`);

if (findings.length === 0) {
  console.log("✅ All preflight checks passed. Ready to deploy.\n");
} else {
  for (const f of findings) {
    const icon = f.severity === "error" ? "❌" : "⚠️";
    console.log(`${icon} [${f.rule}] ${f.file}${f.line ? `:${f.line}` : ""}`);
    console.log(`   ${f.message}`);
    console.log(`   ${f.code}\n`);
  }

  console.log("---");
  console.log(`${errors.length} error(s), ${warns.length} warning(s)`);
  if (errors.length > 0) {
    console.log("❌ Preflight FAILED. Fix errors before deploying.\n");
  } else {
    console.log("⚠️ Preflight passed with warnings. Review before deploying.\n");
  }
}

process.exit(errors.length > 0 ? 1 : 0);
