import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";

let db;

export function initDb(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS issues (
      sentry_issue_id TEXT PRIMARY KEY,
      sentry_project TEXT NOT NULL,
      repo TEXT NOT NULL,
      title TEXT NOT NULL,
      level TEXT,
      first_seen_at TEXT,
      attempts INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      pr_url TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      sentry_project_slug TEXT PRIMARY KEY,
      repo TEXT NOT NULL,
      branch TEXT NOT NULL,
      language TEXT NOT NULL,
      framework TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  return db;
}

export function getIssue(sentryIssueId) {
  return db.prepare("SELECT * FROM issues WHERE sentry_issue_id = ?").get(sentryIssueId);
}

export function upsertIssue({ sentryIssueId, sentryProject, repo, title, level, errorMessage }) {
  const existing = getIssue(sentryIssueId);
  if (existing) return existing;

  db.prepare(`
    INSERT INTO issues (sentry_issue_id, sentry_project, repo, title, level, error_message)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sentryIssueId, sentryProject, repo, title, level, errorMessage);

  return getIssue(sentryIssueId);
}

export function incrementAttempts(sentryIssueId) {
  db.prepare(`
    UPDATE issues SET attempts = attempts + 1, updated_at = datetime('now')
    WHERE sentry_issue_id = ?
  `).run(sentryIssueId);
}

export function markStatus(sentryIssueId, status, prUrl = null) {
  db.prepare(`
    UPDATE issues SET status = ?, pr_url = COALESCE(?, pr_url), updated_at = datetime('now')
    WHERE sentry_issue_id = ?
  `).run(status, prUrl, sentryIssueId);
}

export function getAllIssues(limit = 50) {
  return db.prepare("SELECT * FROM issues ORDER BY updated_at DESC LIMIT ?").all(limit);
}

export function getStats() {
  const total = db.prepare("SELECT COUNT(*) as count FROM issues").get().count;
  const byStatus = db.prepare("SELECT status, COUNT(*) as count FROM issues GROUP BY status").all();
  return { total, byStatus };
}

export function shouldAttempt(sentryIssueId, maxAttempts) {
  const issue = getIssue(sentryIssueId);
  if (!issue) return true;
  if (issue.status === "fixed" || issue.status === "pr_open") return false;
  return issue.attempts < maxAttempts;
}

// --- Project CRUD ---

export function getAllProjects() {
  const rows = db.prepare("SELECT * FROM projects ORDER BY sentry_project_slug").all();
  const result = {};
  for (const row of rows) {
    result[row.sentry_project_slug] = {
      repo: row.repo,
      branch: row.branch,
      language: row.language,
      framework: row.framework,
    };
  }
  return result;
}

export function getProject(slug) {
  const row = db.prepare("SELECT * FROM projects WHERE sentry_project_slug = ?").get(slug);
  if (!row) return null;
  return { repo: row.repo, branch: row.branch, language: row.language, framework: row.framework };
}

export function createProject({ slug, repo, branch, language, framework }) {
  db.prepare(`
    INSERT INTO projects (sentry_project_slug, repo, branch, language, framework)
    VALUES (?, ?, ?, ?, ?)
  `).run(slug, repo, branch, language, framework);
  return getProject(slug);
}

export function updateProject(slug, { repo, branch, language, framework }) {
  db.prepare(`
    UPDATE projects SET repo = ?, branch = ?, language = ?, framework = ?, updated_at = datetime('now')
    WHERE sentry_project_slug = ?
  `).run(repo, branch, language, framework, slug);
  return getProject(slug);
}

export function deleteProject(slug) {
  db.prepare("DELETE FROM projects WHERE sentry_project_slug = ?").run(slug);
}

export function seedProjectsFromConfig(configProjects) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO projects (sentry_project_slug, repo, branch, language, framework)
    VALUES (?, ?, ?, ?, ?)
  `);
  let seeded = 0;
  for (const [slug, proj] of Object.entries(configProjects)) {
    const result = insert.run(slug, proj.repo, proj.branch, proj.language, proj.framework);
    if (result.changes > 0) seeded++;
  }
  return seeded;
}
