import "dotenv/config";
import { readFileSync } from "fs";
import { resolve } from "path";
import { mkdirSync } from "fs";
import { createServer } from "./server.js";
import { initDb, upsertIssue, shouldAttempt, incrementAttempts, markStatus, seedProjectsFromConfig, getAllProjects } from "./db.js";
import { fixIssue } from "./fixer.js";
import { createPullRequest, ensureLabel } from "./github.js";

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

    // Attempt the fix
    const result = await fixIssue({
      parsed,
      projectConfig,
      reposDir: REPOS_DIR,
    });

    if (!result.success) {
      console.log(`[main] Fix failed for issue ${parsed.issueId}: ${result.reason}`);
      markStatus(parsed.issueId, "failed");
      return;
    }

    // Create the PR
    await ensureLabel(projectConfig.repo);
    const prUrl = await createPullRequest({
      repo: projectConfig.repo,
      branch: result.branch,
      baseBranch: projectConfig.branch,
      parsed,
      changedFiles: result.changedFiles,
    });

    markStatus(parsed.issueId, "pr_open", prUrl);
    console.log(`[main] Successfully created PR for issue ${parsed.issueId}: ${prUrl}`);
  } catch (err) {
    console.error(`[main] Error fixing issue ${parsed.issueId}:`, err.message);
    markStatus(parsed.issueId, "error");
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
