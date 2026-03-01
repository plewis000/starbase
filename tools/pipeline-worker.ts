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
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const PIPELINE_SECRET = process.env.PIPELINE_SECRET;
const PIPELINE_API_URL = process.env.PIPELINE_API_URL || "https://starbase-green.vercel.app";
const REPO_PATH = process.env.STARBASE_REPO_PATH || resolve(__dirname, "..");
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || "30000", 10);
const JOB_TIMEOUT = parseInt(process.env.JOB_TIMEOUT_MS || "600000", 10); // 10 min default
const CLAUDE_CMD = process.env.CLAUDE_CMD || "claude";
const GITHUB_REPO = process.env.GITHUB_REPO || "plewis000/starbase";

// Validate config
if (isNaN(POLL_INTERVAL) || POLL_INTERVAL < 5000) {
  console.error("POLL_INTERVAL_MS must be a number >= 5000");
  process.exit(1);
}
if (isNaN(JOB_TIMEOUT) || JOB_TIMEOUT < 30000) {
  console.error("JOB_TIMEOUT_MS must be a number >= 30000");
  process.exit(1);
}

// Forbidden file patterns — never commit these (match on filename component only)
const FORBIDDEN_PATTERNS = [
  /\.env($|\.)/,
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
  /\.pfx$/,
  /credentials\.json$/i,
  /service[_-]?account.*\.json$/i,
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

// ── Shutdown handling ────────────────────────────────────────────────

let shutdownRequested = false;
let currentJobId: string | null = null;

process.on("SIGINT", async () => {
  if (shutdownRequested) {
    console.log("\nForce shutdown.");
    process.exit(1);
  }
  shutdownRequested = true;
  if (currentJobId) {
    console.log(`\n⏳ Graceful shutdown — waiting for job ${currentJobId.slice(0, 8)} to finish...`);
    console.log("   Press Ctrl+C again to force quit.");
  } else {
    console.log("\n👋 Shutting down.");
    process.exit(0);
  }
});

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

const API_TIMEOUT = 15000; // 15 seconds

async function apiCall(path: string, method = "GET", body?: Record<string, unknown>, retries = 2): Promise<unknown> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${PIPELINE_API_URL}/api/pipeline${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${PIPELINE_SECRET}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(API_TIMEOUT),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`API ${method} ${path}: ${res.status} ${err}`);
      }

      if (res.status === 204) return {};
      return res.json();
    } catch (error) {
      if (attempt < retries) {
        const delay = 2000 * (attempt + 1);
        console.log(`   API retry ${attempt + 1}/${retries} in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Unreachable");
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
      signal: AbortSignal.timeout(API_TIMEOUT),
    });
  } catch { /* non-critical */ }
}

async function reportStatus(feedbackId: string, status: string, extra?: Record<string, unknown>) {
  return apiCall("/status", "POST", {
    feedback_id: feedbackId,
    pipeline_status: status,
    ...extra,
  }, 3); // 3 retries for status reports — critical path
}

// ── Forbidden file check ─────────────────────────────────────────────

function checkForbiddenFiles(): string[] {
  const stagedFiles = git("diff", "--cached", "--name-only").split("\n").filter(Boolean);
  const forbidden = stagedFiles.filter((f) => {
    const filename = f.split("/").pop() || f;
    return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(filename));
  });
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

// ── Job dedup ────────────────────────────────────────────────────────

const activeJobs = new Set<string>();

// ── Process a single job ─────────────────────────────────────────────

async function processJob(job: PipelineJob) {
  if (activeJobs.has(job.id)) {
    console.log(`   Skipping ${job.id.slice(0, 8)} — already in progress`);
    return;
  }

  activeJobs.add(job.id);
  currentJobId = job.id;

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
      shell: true, // Required on Windows for PATH resolution of npm .cmd shims (F-029)
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
      // Scope git add to safe directories only (not -A which stages everything)
      git("add", "--", "app/", "lib/", "components/", "src/", "public/", "styles/");

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
      `> ${job.body.slice(0, 500)}`,
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
      shell: true, // Required on Windows for PATH resolution
    }).trim();

    // Extract PR number from URL (gh pr create outputs the URL)
    const prMatch = prOutput.match(/\/pull\/(\d+)/);
    const prNumber = prMatch ? parseInt(prMatch[1], 10) : null;

    // Construct preview URL from branch name
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
  } finally {
    activeJobs.delete(job.id);
    currentJobId = null;
  }
}

// ── Stale job recovery ───────────────────────────────────────────────

async function recoverStaleJobs() {
  console.log("🔍 Checking for stale jobs...");

  // Ensure we're on main first before cleaning branches
  try {
    git("checkout", "main");
  } catch {
    // If checkout fails, try harder
    try { git("stash"); git("checkout", "main"); } catch { /* truly stuck */ }
  }

  // Check for any local feedback branches that might be leftover
  try {
    const branches = git("branch", "--list", "feedback/*");
    if (branches) {
      const branchList = branches.split("\n").map((b) => b.trim().replace("* ", ""));
      for (const branch of branchList) {
        if (branch) {
          console.log(`   Cleaning up stale branch: ${branch}`);
          try { git("branch", "-D", branch); } catch { /* best effort */ }
        }
      }
    }
  } catch {
    // No branches to clean up
  }

  // Pull latest main
  try {
    git("pull", "origin", "main");
  } catch (e) {
    console.error("Failed to pull main:", e);
  }
}

// ── Main loop (await-based — no overlapping polls) ──────────────────

async function poll() {
  try {
    const response = await apiCall("/queue") as { jobs?: PipelineJob[] };
    const jobs: PipelineJob[] = response.jobs || [];

    if (jobs.length > 0) {
      console.log(`📋 ${jobs.length} job(s) in queue`);
      // Process one at a time
      await processJob(jobs[0]);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Don't spam on expected errors (server down, network issues)
    if (!msg.includes("fetch failed") && !msg.includes("ECONNREFUSED") && !msg.includes("TimeoutError")) {
      console.error("Poll error:", msg);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log("🚀 Pipeline Worker Starting");
  console.log(`   API: ${PIPELINE_API_URL}`);
  console.log(`   Repo: ${REPO_PATH}`);
  console.log(`   Poll interval: ${POLL_INTERVAL}ms`);
  console.log(`   Job timeout: ${JOB_TIMEOUT}ms`);
  console.log(`   GitHub repo: ${GITHUB_REPO}`);
  console.log("");

  // Recovery on startup
  await recoverStaleJobs();

  console.log("👂 Listening for jobs... (Ctrl+C to stop)");

  // Await-based loop — no overlapping polls (fixes race condition)
  while (!shutdownRequested) {
    await poll();
    // Sleep in small increments to respond to shutdown quickly
    const sleepEnd = Date.now() + POLL_INTERVAL;
    while (Date.now() < sleepEnd && !shutdownRequested) {
      await sleep(Math.min(1000, sleepEnd - Date.now()));
    }
  }

  console.log("👋 Worker stopped.");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
