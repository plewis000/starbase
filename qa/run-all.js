#!/usr/bin/env node
/**
 * QA Master Runner
 *
 * Runs all QA checks in sequence and provides a unified report.
 * Exit code is non-zero if any check has errors.
 *
 * Usage:
 *   node qa/run-all.js           # Run all checks
 *   node qa/run-all.js --fix     # Future: auto-fix mode
 *   npm run qa                   # Via package.json script
 */

const { execSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const CHECKS = [
  {
    name: "select-string-linter",
    description: "Supabase .select() anti-patterns",
    script: "qa/select-string-linter.js",
  },
  {
    name: "form-value-checker",
    description: "Form controls using display labels as values",
    script: "qa/form-value-checker.js",
  },
  {
    name: "config-hardcode-detector",
    description: "Hardcoded config/lookup table values",
    script: "qa/config-hardcode-detector.js",
  },
  {
    name: "api-contract-checker",
    description: "Frontend-API parameter contract validation",
    script: "qa/api-contract-checker.js",
  },
  {
    name: "deploy-preflight",
    description: "Pre-deployment environment & build checks",
    script: "qa/deploy-preflight.js",
  },
  {
    name: "migration-linter",
    description: "SQL migration permission anti-patterns (OS-P006/P007)",
    script: "qa/migration-linter.js",
  },
];

console.log("╔════════════════════════════════════════════════════╗");
console.log("║          STARBASE QA SUITE — Full Run             ║");
console.log("╚════════════════════════════════════════════════════╝\n");

let totalErrors = 0;
let totalWarns = 0;
const results = [];

for (const check of CHECKS) {
  console.log(`\n${"═".repeat(56)}`);
  console.log(`▶ ${check.name}: ${check.description}`);
  console.log(`${"─".repeat(56)}\n`);

  try {
    const output = execSync(`node ${check.script}`, {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 120000,
      stdio: "pipe",
    });
    console.log(output);
    results.push({ name: check.name, status: "pass", errors: 0, warns: 0 });
  } catch (err) {
    const output = err.stdout || "";
    console.log(output);

    // Parse error/warning counts from output
    const countLine = output.match(/(\d+)\s+error\(s\),\s+(\d+)\s+warning\(s\)/);
    const errors = countLine ? parseInt(countLine[1]) : 1;
    const warns = countLine ? parseInt(countLine[2]) : 0;

    totalErrors += errors;
    totalWarns += warns;
    results.push({ name: check.name, status: "fail", errors, warns });
  }
}

// Summary
console.log(`\n${"═".repeat(56)}`);
console.log("                    SUMMARY");
console.log(`${"═".repeat(56)}\n`);

const nameWidth = 28;
const statusWidth = 10;
const errWidth = 8;
const warnWidth = 8;

console.log(
  `${"Check".padEnd(nameWidth)} ${"Status".padEnd(statusWidth)} ${"Errors".padEnd(errWidth)} ${"Warns".padEnd(warnWidth)}`
);
console.log(`${"─".repeat(nameWidth)} ${"─".repeat(statusWidth)} ${"─".repeat(errWidth)} ${"─".repeat(warnWidth)}`);

for (const r of results) {
  const status = r.status === "pass" ? "✅ PASS" : "❌ FAIL";
  console.log(
    `${r.name.padEnd(nameWidth)} ${status.padEnd(statusWidth)} ${String(r.errors).padEnd(errWidth)} ${String(r.warns).padEnd(warnWidth)}`
  );
}

console.log(`${"─".repeat(nameWidth)} ${"─".repeat(statusWidth)} ${"─".repeat(errWidth)} ${"─".repeat(warnWidth)}`);
console.log(
  `${"TOTAL".padEnd(nameWidth)} ${(totalErrors > 0 ? "❌ FAIL" : "✅ PASS").padEnd(statusWidth)} ${String(totalErrors).padEnd(errWidth)} ${String(totalWarns).padEnd(warnWidth)}`
);

console.log("");

if (totalErrors > 0) {
  console.log(`❌ QA suite FAILED with ${totalErrors} error(s) and ${totalWarns} warning(s).`);
  console.log("   Fix all errors before deploying.\n");
} else if (totalWarns > 0) {
  console.log(`⚠️ QA suite PASSED with ${totalWarns} warning(s). Review before deploying.\n`);
} else {
  console.log("✅ QA suite PASSED. All checks clean.\n");
}

process.exit(totalErrors > 0 ? 1 : 0);
