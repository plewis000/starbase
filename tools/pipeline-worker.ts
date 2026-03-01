// ============================================================
// FILE: tools/pipeline-worker.ts
// PURPOSE: Local pipeline worker — polls for approved feedback,
//          runs Claude Code CLI to fix/build, creates PR
// USAGE: npx tsx tools/pipeline-worker.ts
// SECURITY: execFileSync only (locked decision #29), PIPELINE_SECRET auth
// PART OF: Desperado Club
// ============================================================

import { execFileSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

// ── Config ───────────────────────────────────────────────────────────

// Load .env from tools/ directory if it exists
const envPath = join(__dirname, ".env");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

const PIPELINE_SECRET = process.env.PIPELINE_SECRET;
const PIPELINE_API_URL = process.env.PIPELINE_API_URL || "https://starbase-green.vercel.app";
const REPO_PATH = process.env.STARBASE_REPO_PATH || resolve(__dirname, "..");
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || "30000", 10);
const JOB_TIMEOUT = parseInt(process.env.JOB_TIMEOUT_MS || "300000", 10); // 5 min default
const CLAUDE_CMD = process.env.CLAUDE_CMD || "claude";

// Forbidden file patterns — never commit these
const FORBIDDEN_PATTERNS = [
  /\.env($|\.)/,
  /\.pem$/,
  /\.key$/,
  /credentials/i,
  /secret/i,
  /\.p12$/,
  /\.pfx$/,
];

if (!PIPELINE_SECRET) {
  console.error("PIPELINE_SECRET is required. Set it in tools/.env or environment.");
  process.exit(1);
}

// ── Types ────────────────────────────────────────────────────────────

interface PipelineJob {
  id: string;
  type: string;
  body: string;
  priority: number | null;
  tags: string[] | null;
  ai_classified_severity: string | null;
  ai_extracted_feature: string | null;
  created_at: string;
}

// ── Git helpers (execFileSync only — locked decision #29) ────────────

function git(...args: string[]): string {
  return execFileSync("git", args, {
    cwd: REPO_PATH,
    encoding: "utf-8",
    timeout: 30000,
  }).trim();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

// ── API helpers ──────────────────────────────────────────────────────

async function apiCall(path: string, method = "GET", body?: Record<string, unknown>) {
  const res = await fetch(`${PIPELINE_API_URL}/api/pipeline${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${PIPELINE_SECRET}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${method} ${path}: ${res.status} ${err}`);
  }

  return res.json();
}

async function postDiscord(message: string) {
  try {
    await fetch(`${PIPELINE_API_URL}/api/discord/admin`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PIPELINE_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "post_message", content: message }),
    });
  } catch { /* non-critical */ }
}

async function reportStatus(feedbackId: string, status: string, extra?: Record<string, unknown>) {
  return apiCall("/status", "POST", {
    feedback_id: feedbackId,
    pipeline_status: status,
    ...extra,
  });
}

// ── Forbidden file check ─────────────────────────────────────────────

function checkForbiddenFiles(): string[] {
  const stagedFiles = git("diff", "--cached", "--name-only").split("\n").filter(Boolean);
  const forbidden = stagedFiles.filter((f) =>
    FORBIDDEN_PATTERNS.some((pattern) => pattern.test(f))
  );
  return forbidden;
}

// ── Branch cleanup ───────────────────────────────────────────────────

function cleanupBranch(branchName: string) {
  try {
    git("checkout", "main");
    git("branch", "-D", branchName);
  } catch {
    // Best effort
  }
}

// ── Process a single job ─────────────────────────────────────────────

async function processJob(job: PipelineJob) {
  const branchName = `feedback/${job.id.slice(0, 8)}-${slugify(job.body)}`;
  const typeLabel: Record<string, string> = {
    bug: "Fix this bug",
    wish: "Implement this feature request",
    feedback: "Address this feedback",
    question: "Investigate this question and make any needed changes",
  };

  const bodyPreview = job.body.slice(0, 80);
  console.log(`\n🔧 Processing: ${bodyPreview}...`);
  console.log(`   Branch: ${branchName}`);

  // Report working
  await reportStatus(job.id, "working");

  try {
    // Ensure clean state on main
    await postDiscord(`🔄 **Preparing:** ${bodyPreview}...\nSetting up branch, estimated 3-8 min total.`);
    git("checkout", "main");
    git("pull", "origin", "main");

    // Clean up any existing local/remote branch with this name
    try { git("branch", "-D", branchName); } catch { /* doesn't exist locally */ }
    try { git("push", "origin", "--delete", branchName); } catch { /* doesn't exist remotely */ }

    // Create fresh feature branch
    git("checkout", "-b", branchName);

    // Build prompt for Claude Code
    const prompt = [
      `You are working on a Next.js app (Desperado Club / Starbase).`,
      `This is a ${job.type} from a user. Your job: implement the changes needed.`,
      "",
      `## ${typeLabel[job.type] || "Task"}`,
      "",
      job.body,
      "",
      job.ai_classified_severity ? `Severity: ${job.ai_classified_severity}` : "",
      job.ai_extracted_feature ? `Feature area: ${job.ai_extracted_feature}` : "",
      "",
      "## Instructions",
      "1. Read the relevant files to understand the current codebase",
      "2. Make the minimal changes needed to address this feedback",
      "3. Run `npm run build` to verify your changes compile",
      "4. Do NOT modify .env files, credentials, or secrets",
      "5. Do NOT create or modify database migrations (supabase/migrations/)",
      "6. Do NOT modify tools/pipeline-worker.ts",
      "7. If the request is too vague to implement, make your best judgment on what to change",
      "8. Focus on the app/ and lib/ directories",
    ].filter(Boolean).join("\n");

    // Run Claude Code CLI with full tool access, prompt via stdin
    console.log("   Running Claude Code...");
    await postDiscord(`🧠 **Claude is coding...** This usually takes 2-5 min.\n> ${bodyPreview}`);
    const startTime = Date.now();
    const result = execFileSync(CLAUDE_CMD, [
      "--print",
      "--permission-mode", "bypassPermissions",
      "--max-budget-usd", "5",
    ], {
      cwd: REPO_PATH,
      timeout: JOB_TIMEOUT,
      encoding: "utf-8",
      input: prompt,
      env: { ...process.env },
    });

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log("   Claude Code output:", result.slice(0, 200));
    await postDiscord(`✅ **Claude finished coding** (${elapsed}s). Checking changes...`);

    // Check if Claude made any changes — it may have committed directly or left unstaged changes
    const diffStat = git("diff", "--stat");
    const diffStaged = git("diff", "--cached", "--stat");
    const newCommits = git("log", "main..HEAD", "--oneline");

    if (!diffStat && !diffStaged && !newCommits) {
      console.log("   No changes made by Claude Code.");
      await reportStatus(job.id, "failed", {
        worker_log: "Claude Code made no changes. May need manual intervention.",
      });
      cleanupBranch(branchName);
      return;
    }

    // If there are unstaged or staged changes, commit them
    if (diffStat || diffStaged) {
      git("add", "-A");

      // Check for forbidden files
      const forbidden = checkForbiddenFiles();
      if (forbidden.length > 0) {
        console.error("   BLOCKED: Forbidden files staged:", forbidden);
        await reportStatus(job.id, "failed", {
          worker_log: `Forbidden files detected: ${forbidden.join(", ")}. Aborting.`,
        });
        git("reset", "HEAD");
        cleanupBranch(branchName);
        return;
      }

      const commitMessage = `${job.type}: ${job.body.slice(0, 72)}\n\nFeedback ID: ${job.id}\nCo-Authored-By: Claude Code <noreply@anthropic.com>`;
      git("commit", "-m", commitMessage);
    } else {
      console.log("   Claude Code already committed changes directly.");
    }

    // Push branch
    console.log("   Pushing branch...");
    await postDiscord(`📤 **Pushing branch** and creating PR...`);
    git("push", "-u", "origin", branchName);

    // Create PR
    console.log("   Creating PR...");
    const prBody = [
      `## Feedback`,
      `> ${job.body}`,
      "",
      `**Type:** ${job.type}`,
      job.ai_classified_severity ? `**Severity:** ${job.ai_classified_severity}` : "",
      job.ai_extracted_feature ? `**Feature:** ${job.ai_extracted_feature}` : "",
      "",
      `Feedback ID: \`${job.id}\``,
      "",
      "---",
      `🤖 Generated by pipeline worker`,
    ].filter(Boolean).join("\n");

    const prOutput = execFileSync("gh", [
      "pr", "create",
      "--title", `${job.type}: ${job.body.slice(0, 72)}`,
      "--body", prBody,
      "--base", "main",
      "--head", branchName,
    ], {
      cwd: REPO_PATH,
      encoding: "utf-8",
      timeout: 30000,
    }).trim();

    // Extract PR number from URL (gh pr create outputs the URL)
    const prMatch = prOutput.match(/\/pull\/(\d+)/);
    const prNumber = prMatch ? parseInt(prMatch[1], 10) : null;

    // Construct preview URL from branch name
    // Vercel preview URL pattern: <project>-<hash>-<team>.vercel.app
    // We'll let the pipeline status endpoint fill this in, or use the branch-based alias
    const previewUrl = `https://desparado-club-git-${branchName.replace(/\//g, "-")}-plewis000s-projects.vercel.app`;

    console.log(`   ✅ PR created: #${prNumber}`);
    console.log(`   Preview URL: ${previewUrl}`);

    // Report preview ready
    await reportStatus(job.id, "preview_ready", {
      branch_name: branchName,
      preview_url: previewUrl,
      pr_number: prNumber,
    });

    // Go back to main
    git("checkout", "main");

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`   ❌ Failed: ${errorMessage.slice(0, 200)}`);

    await reportStatus(job.id, "failed", {
      worker_log: errorMessage.slice(0, 2000),
    });

    // Clean up
    cleanupBranch(branchName);
  }
}

// ── Stale job recovery ───────────────────────────────────────────────

async function recoverStaleJobs() {
  console.log("🔍 Checking for stale jobs...");

  // Check for any local feedback branches that might be leftover
  try {
    const branches = git("branch", "--list", "feedback/*");
    if (branches) {
      const branchList = branches.split("\n").map((b) => b.trim().replace("* ", ""));
      for (const branch of branchList) {
        if (branch) {
          console.log(`   Cleaning up stale branch: ${branch}`);
          cleanupBranch(branch);
        }
      }
    }
  } catch {
    // No branches to clean up
  }

  // Ensure we're on main
  try {
    git("checkout", "main");
    git("pull", "origin", "main");
  } catch (e) {
    console.error("Failed to reset to main:", e);
  }
}

// ── Main loop ────────────────────────────────────────────────────────

async function poll() {
  try {
    const response = await apiCall("/queue");
    const jobs: PipelineJob[] = response.jobs || [];

    if (jobs.length > 0) {
      console.log(`📋 ${jobs.length} job(s) in queue`);
      // Process one at a time
      await processJob(jobs[0]);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Don't spam on expected errors (server down, network issues)
    if (!msg.includes("fetch failed") && !msg.includes("ECONNREFUSED")) {
      console.error("Poll error:", msg);
    }
  }
}

async function main() {
  console.log("🚀 Pipeline Worker Starting");
  console.log(`   API: ${PIPELINE_API_URL}`);
  console.log(`   Repo: ${REPO_PATH}`);
  console.log(`   Poll interval: ${POLL_INTERVAL}ms`);
  console.log(`   Job timeout: ${JOB_TIMEOUT}ms`);
  console.log("");

  // Recovery on startup
  await recoverStaleJobs();

  // Initial poll
  await poll();

  // Continue polling
  setInterval(poll, POLL_INTERVAL);

  console.log("👂 Listening for jobs... (Ctrl+C to stop)");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
