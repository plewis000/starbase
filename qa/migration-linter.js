#!/usr/bin/env node
/**
 * QA Script: migration-linter
 *
 * Scans SQL migration files for common Supabase/Postgres anti-patterns:
 *   1. CREATE TABLE without corresponding GRANT statement (OS-P006)
 *   2. RLS policies that reference their own table (OS-P007)
 *   3. SECURITY DEFINER functions without GRANT EXECUTE (OS-P006 addendum)
 *   4. RLS enabled without any policies defined
 *
 * References: F-021, F-022, F-023, OS-P006, OS-P007 in FAILURE_LOG.md / PATTERN_LIBRARY.md
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MIGRATION_DIR = path.join(ROOT, "supabase/migrations");

// Migrations before this file are retroactively fixed by the catchall grants migration (011).
// Only scan newer migrations for missing-grant errors to avoid false positives on historical files.
// Self-referencing RLS and other checks still apply to all files.
const GRANTS_FIXED_AFTER = "011_grant_table_permissions.sql";

let findings = [];
let filesScanned = 0;

function scanMigration(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const relPath = path.relative(ROOT, filePath);
  const fileName = path.basename(filePath);

  // Skip missing-grant checks for migrations before the catchall grants fix
  const isPreGrantsFix = fileName.localeCompare(GRANTS_FIXED_AFTER) < 0;

  filesScanned++;

  // Extract all CREATE TABLE statements
  const tablePattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+\.\w+)/gi;
  const createdTables = [];
  let match;
  while ((match = tablePattern.exec(content)) !== null) {
    createdTables.push(match[1].toLowerCase());
  }

  // CHECK 1: CREATE TABLE without GRANT (skip pre-fix migrations)
  for (const table of createdTables) {
    if (isPreGrantsFix) continue; // Retroactively fixed by 011_grant_table_permissions.sql
    const tableName = table.split(".")[1];
    const grantPattern = new RegExp(
      `GRANT\\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)\\s+ON\\s+(?:TABLE\\s+)?(?:${table}|ALL\\s+TABLES\\s+IN\\s+SCHEMA\\s+${table.split(".")[0]})\\s+TO\\s+authenticated`,
      "i"
    );
    if (!grantPattern.test(content)) {
      // Check if there's a schema-wide grant
      const schemaGrant = new RegExp(
        `GRANT\\s+ALL\\s+ON\\s+ALL\\s+TABLES\\s+IN\\s+SCHEMA\\s+${table.split(".")[0]}\\s+TO\\s+authenticated`,
        "i"
      );
      if (!schemaGrant.test(content)) {
        findings.push({
          file: relPath,
          rule: "missing-grant",
          severity: "error",
          message: `Table "${table}" created without GRANT to authenticated role. Add: GRANT ALL ON ${table} TO authenticated;`,
          ref: "OS-P006, F-023",
        });
      }
    }
  }

  // CHECK 2: Self-referencing RLS policies
  const policyPattern = /CREATE\s+POLICY\s+"?(\w+)"?\s+ON\s+(\w+\.\w+)[\s\S]*?(?:USING|WITH\s+CHECK)\s*\(([\s\S]*?)\);/gi;
  while ((match = policyPattern.exec(content)) !== null) {
    const policyName = match[1];
    const tableName = match[2].toLowerCase();
    const policyBody = match[3].toLowerCase();
    const shortName = tableName.split(".")[1];

    // Check if policy body references the same table
    if (
      policyBody.includes(`from ${tableName}`) ||
      policyBody.includes(`from ${shortName}`)
    ) {
      // Exclude if it uses a SECURITY DEFINER function call
      if (!policyBody.includes("(") || policyBody.includes(`select`) && policyBody.includes(`from ${shortName}`)) {
        // Check it's not calling a function
        const funcCallPattern = /\w+\.\w+\(/;
        const isFuncCall = funcCallPattern.test(policyBody) &&
          !policyBody.includes(`select`) ;

        if (!isFuncCall) {
          findings.push({
            file: relPath,
            rule: "self-referencing-rls",
            severity: "error",
            message: `Policy "${policyName}" on "${tableName}" references its own table. This causes infinite recursion. Use a SECURITY DEFINER function instead.`,
            ref: "OS-P007, F-021",
          });
        }
      }
    }
  }

  // CHECK 3: SECURITY DEFINER without GRANT EXECUTE
  const funcPattern = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(\w+\.\w+)\([^)]*\)[\s\S]*?SECURITY\s+DEFINER/gi;
  while ((match = funcPattern.exec(content)) !== null) {
    const funcName = match[1];
    const grantExec = new RegExp(
      `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+${funcName.replace(".", "\\.")}`,
      "i"
    );
    if (!grantExec.test(content)) {
      findings.push({
        file: relPath,
        rule: "missing-grant-execute",
        severity: "warn",
        message: `SECURITY DEFINER function "${funcName}" created without GRANT EXECUTE TO authenticated. RLS policies calling this function will fail.`,
        ref: "OS-P006, F-022",
      });
    }
  }

  // CHECK 4: ENABLE ROW LEVEL SECURITY without any CREATE POLICY
  const rlsPattern = /ALTER\s+TABLE\s+(\w+\.\w+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
  while ((match = rlsPattern.exec(content)) !== null) {
    const table = match[1].toLowerCase();
    const hasPolicies = new RegExp(
      `CREATE\\s+POLICY\\s+.*?ON\\s+${table.replace(".", "\\.")}`,
      "i"
    ).test(content);
    if (!hasPolicies) {
      findings.push({
        file: relPath,
        rule: "rls-without-policies",
        severity: "warn",
        message: `RLS enabled on "${table}" but no policies defined in this migration. Table will be inaccessible to all roles.`,
        ref: "OS-P006",
      });
    }
  }
}

// Run
console.log("🔍 migration-linter — Scanning SQL migrations for permission anti-patterns...\n");

if (!fs.existsSync(MIGRATION_DIR)) {
  console.log("⚠️ No migrations directory found. Skipping.\n");
  process.exit(0);
}

const files = fs.readdirSync(MIGRATION_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => path.join(MIGRATION_DIR, f));

for (const file of files) {
  scanMigration(file);
}

// Report
const errors = findings.filter((f) => f.severity === "error");
const warns = findings.filter((f) => f.severity === "warn");

if (findings.length === 0) {
  console.log(`✅ All clear. Scanned ${filesScanned} migration files, no issues found.\n`);
} else {
  console.log(`Scanned ${filesScanned} migration files.\n`);

  for (const f of findings) {
    const icon = f.severity === "error" ? "❌" : "⚠️";
    console.log(`${icon} [${f.rule}] ${f.file}`);
    console.log(`   ${f.message}`);
    console.log(`   Ref: ${f.ref}\n`);
  }

  console.log("---");
  console.log(`${errors.length} error(s), ${warns.length} warning(s)\n`);
}

process.exit(errors.length > 0 ? 1 : 0);
