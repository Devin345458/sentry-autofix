import "dotenv/config";
import { readFileSync } from "fs";
import { resolve } from "path";
import { mkdirSync } from "fs";
import { createServer } from "./server.js";
import { initDb, upsertIssue, shouldAttempt, incrementAttempts, markStatus, seedProjectsFromConfig, getAllProjects, insertLog } from "./db.js";
import { fixIssue } from "./fixer.js";
import { createPullRequest, ensureLabel } from "./github.js";
import { broadcast } from "./events.js";

// --- Config ---
const configPath = resolve(process.env.CONFIG_PATH || "./config.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));

const SECRET = process.env.SENTRY_CLIENT_SECRET;
if (!SECRET) {
  console.error("SENTRY_CLIENT_SECRET is required");
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || "3000", 10);
const REPOS_DIR = resolve(process.env.REPOS_DIR || "/tmp/sentry-autofix-repos");
const DB_PATH = resolve(process.env.DB_PATH || "./data/sentry-autofix.db");
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_FIXES || "1", 10);
const MAX_ATTEMPTS = parseInt(process.env.MAX_ATTEMPTS_PER_ISSUE || "2", 10);
// MAX_FILES_CHANGED no longer needed - Claude Code manages edits directly

// --- Init ---
mkdirSync(REPOS_DIR, { recursive: true });
initDb(DB_PATH);

// Seed projects from config.json into DB (idempotent - only inserts new ones)
if (config.projects && Object.keys(config.projects).length > 0) {
  const seeded = seedProjectsFromConfig(config.projects);
  if (seeded > 0) {
    console.log(`[sentry-autofix] Seeded ${seeded} project(s) from config.json into database`);
  }
}

// Simple concurrency limiter
let activeJobs = 0;

async function handleIssue(parsed, projectConfig) {
  // Check if we should attempt this
  if (!shouldAttempt(parsed.issueId, MAX_ATTEMPTS)) {
    console.log(`[main] Skipping issue ${parsed.issueId} (already attempted or fixed)`);
    return;
  }

  // Check concurrency
  if (activeJobs >= MAX_CONCURRENT) {
    console.log(`[main] Queue full (${activeJobs}/${MAX_CONCURRENT}), skipping issue ${parsed.issueId}`);
    return;
  }

  activeJobs++;
  console.log(`[main] Processing issue ${parsed.issueId}: ${parsed.title}`);

  const onLog = (source, message) => {
    insertLog(parsed.issueId, source, message);
    broadcast(parsed.issueId, { type: "log", issueId: parsed.issueId, source, message, timestamp: new Date().toISOString() });
  };

  const emitStatus = (status, extra = {}) => {
    broadcast(parsed.issueId, { type: "status", issueId: parsed.issueId, status, ...extra, timestamp: new Date().toISOString() });
  };

  try {
    // Track the issue
    upsertIssue({
      sentryIssueId: parsed.issueId,
      sentryProject: parsed.projectSlug,
      repo: projectConfig.repo,
      title: parsed.title,
      level: parsed.level,
      errorMessage: parsed.message,
    });

    incrementAttempts(parsed.issueId);
    markStatus(parsed.issueId, "in_progress");
    emitStatus("in_progress");
    onLog("system", `Processing issue: ${parsed.title}`);

    // Attempt the fix
    const result = await fixIssue({
      parsed,
      projectConfig,
      reposDir: REPOS_DIR,
      onLog,
    });

    if (!result.success) {
      console.log(`[main] Fix failed for issue ${parsed.issueId}: ${result.reason}`);
      markStatus(parsed.issueId, "failed");
      emitStatus("failed");
      onLog("system", `Fix failed: ${result.reason}`);
      return;
    }

    // Create the PR
    onLog("github", "Creating pull request...");
    await ensureLabel(projectConfig.repo);
    const prUrl = await createPullRequest({
      repo: projectConfig.repo,
      branch: result.branch,
      baseBranch: projectConfig.branch,
      parsed,
      changedFiles: result.changedFiles,
    });

    markStatus(parsed.issueId, "pr_open", prUrl);
    emitStatus("pr_open", { prUrl });
    onLog("github", `Pull request created: ${prUrl}`);
    console.log(`[main] Successfully created PR for issue ${parsed.issueId}: ${prUrl}`);
  } catch (err) {
    console.error(`[main] Error fixing issue ${parsed.issueId}:`, err.message);
    markStatus(parsed.issueId, "error");
    emitStatus("error");
    onLog("error", err.message);
  } finally {
    activeJobs--;
  }
}

// --- Start Server ---
const app = createServer({ secret: SECRET, onIssue: handleIssue });

app.listen(PORT, () => {
  console.log(`[sentry-autofix] Listening on port ${PORT}`);
  const projectSlugs = Object.keys(getAllProjects());
  console.log(`[sentry-autofix] Mapped projects (${projectSlugs.length}): ${projectSlugs.join(", ") || "none"}`);
  console.log(`[sentry-autofix] Repos dir: ${REPOS_DIR}`);
  console.log(`[sentry-autofix] Max concurrent fixes: ${MAX_CONCURRENT}`);
  console.log(`[sentry-autofix] Max attempts per issue: ${MAX_ATTEMPTS}`);
});
