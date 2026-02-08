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
