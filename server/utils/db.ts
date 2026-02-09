import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

export interface Issue {
  sentry_issue_id: string
  sentry_project: string
  repo: string
  title: string
  level: string | null
  first_seen_at: string | null
  attempts: number
  status: string
  pr_url: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface IssueLog {
  id: number
  sentry_issue_id: string
  timestamp: string
  source: string
  message: string
}

export interface WebhookLog {
  id: number
  timestamp: string
  resource: string
  action: string | null
  issue_id: string | null
  issue_title: string | null
  project_slug: string | null
  decision: string
  reason: string | null
}

export interface ProjectRow {
  sentry_project_slug: string
  repo: string
  branch: string
  language: string
  framework: string
  created_at: string
  updated_at: string
}

export interface ProjectConfig {
  repo: string
  branch: string
  language: string
  framework: string
}

export interface Stats {
  total: number
  byStatus: { status: string; count: number }[]
}

let db: Database.Database

export function initDb(dbPath: string) {
  mkdirSync(dirname(dbPath), { recursive: true })
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

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
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS issue_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sentry_issue_id TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now')),
      source TEXT NOT NULL,
      message TEXT NOT NULL
    )
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_logs_issue ON issue_logs(sentry_issue_id)`)

  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT (datetime('now')),
      resource TEXT NOT NULL,
      action TEXT,
      issue_id TEXT,
      issue_title TEXT,
      project_slug TEXT,
      decision TEXT NOT NULL,
      reason TEXT
    )
  `)

  // Migration: add issue_title column if missing
  try {
    db.exec(`ALTER TABLE webhook_log ADD COLUMN issue_title TEXT`)
  } catch {
    // Column already exists
  }

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
  `)

  return db
}

export function getIssue(sentryIssueId: string): Issue | undefined {
  return db.prepare('SELECT * FROM issues WHERE sentry_issue_id = ?').get(sentryIssueId) as Issue | undefined
}

export function upsertIssue(params: {
  sentryIssueId: string
  sentryProject: string
  repo: string
  title: string
  level: string
  errorMessage: string | null
}): Issue {
  const existing = getIssue(params.sentryIssueId)
  if (existing) return existing

  db.prepare(`
    INSERT INTO issues (sentry_issue_id, sentry_project, repo, title, level, error_message)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(params.sentryIssueId, params.sentryProject, params.repo, params.title, params.level, params.errorMessage)

  return getIssue(params.sentryIssueId)!
}

export function incrementAttempts(sentryIssueId: string): void {
  db.prepare(`
    UPDATE issues SET attempts = attempts + 1, updated_at = datetime('now')
    WHERE sentry_issue_id = ?
  `).run(sentryIssueId)
}

export function markStatus(sentryIssueId: string, status: string, prUrl: string | null = null): void {
  db.prepare(`
    UPDATE issues SET status = ?, pr_url = COALESCE(?, pr_url), updated_at = datetime('now')
    WHERE sentry_issue_id = ?
  `).run(status, prUrl, sentryIssueId)
}

export function getAllIssues(limit: number = 50): Issue[] {
  return db.prepare('SELECT * FROM issues ORDER BY updated_at DESC LIMIT ?').all(limit) as Issue[]
}

export function getStats(): Stats {
  const total = (db.prepare('SELECT COUNT(*) as count FROM issues').get() as { count: number }).count
  const byStatus = db.prepare('SELECT status, COUNT(*) as count FROM issues GROUP BY status').all() as { status: string; count: number }[]
  return { total, byStatus }
}

export function shouldAttempt(sentryIssueId: string, maxAttempts: number): boolean {
  const issue = getIssue(sentryIssueId)
  if (!issue) return true
  if (issue.status === 'fixed' || issue.status === 'pr_open') return false
  return issue.attempts < maxAttempts
}

// --- Project CRUD ---

export function getAllProjects(): Record<string, ProjectConfig> {
  const rows = db.prepare('SELECT * FROM projects ORDER BY sentry_project_slug').all() as ProjectRow[]
  const result: Record<string, ProjectConfig> = {}
  for (const row of rows) {
    result[row.sentry_project_slug] = {
      repo: row.repo,
      branch: row.branch,
      language: row.language,
      framework: row.framework,
    }
  }
  return result
}

export function getProject(slug: string): ProjectConfig | null {
  const row = db.prepare('SELECT * FROM projects WHERE sentry_project_slug = ?').get(slug) as ProjectRow | undefined
  if (!row) return null
  return { repo: row.repo, branch: row.branch, language: row.language, framework: row.framework }
}

export function createProject(params: {
  slug: string
  repo: string
  branch: string
  language: string
  framework: string
}): ProjectConfig | null {
  db.prepare(`
    INSERT INTO projects (sentry_project_slug, repo, branch, language, framework)
    VALUES (?, ?, ?, ?, ?)
  `).run(params.slug, params.repo, params.branch, params.language, params.framework)
  return getProject(params.slug)
}

export function updateProject(slug: string, params: {
  repo: string
  branch: string
  language: string
  framework: string
}): ProjectConfig | null {
  db.prepare(`
    UPDATE projects SET repo = ?, branch = ?, language = ?, framework = ?, updated_at = datetime('now')
    WHERE sentry_project_slug = ?
  `).run(params.repo, params.branch, params.language, params.framework, slug)
  return getProject(slug)
}

export function deleteProject(slug: string): void {
  db.prepare('DELETE FROM projects WHERE sentry_project_slug = ?').run(slug)
}

export function seedProjectsFromConfig(configProjects: Record<string, ProjectConfig>): number {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO projects (sentry_project_slug, repo, branch, language, framework)
    VALUES (?, ?, ?, ?, ?)
  `)
  let seeded = 0
  for (const [slug, proj] of Object.entries(configProjects)) {
    const result = insert.run(slug, proj.repo, proj.branch, proj.language, proj.framework)
    if (result.changes > 0) seeded++
  }
  return seeded
}

export function getStuckIssues(): Issue[] {
  return db.prepare("SELECT * FROM issues WHERE status = 'in_progress'").all() as Issue[]
}

export function resetStuckIssue(sentryIssueId: string): void {
  db.prepare(`
    UPDATE issues SET status = 'pending', attempts = MAX(attempts - 1, 0), updated_at = datetime('now')
    WHERE sentry_issue_id = ?
  `).run(sentryIssueId)
}

// --- Issue Logs ---

export function insertLog(sentryIssueId: string, source: string, message: string): void {
  db.prepare(`
    INSERT INTO issue_logs (sentry_issue_id, source, message)
    VALUES (?, ?, ?)
  `).run(sentryIssueId, source, message)
}

export function getLogsForIssue(sentryIssueId: string, sinceId: number = 0): IssueLog[] {
  return db.prepare(`
    SELECT * FROM issue_logs
    WHERE sentry_issue_id = ? AND id > ?
    ORDER BY id ASC
  `).all(sentryIssueId, sinceId) as IssueLog[]
}

// --- Webhook Log ---

export function insertWebhookLog(params: {
  resource: string
  action: string | null
  issueId: string | null
  issueTitle: string | null
  projectSlug: string | null
  decision: string
  reason: string | null
}): void {
  db.prepare(`
    INSERT INTO webhook_log (resource, action, issue_id, issue_title, project_slug, decision, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(params.resource, params.action, params.issueId, params.issueTitle, params.projectSlug, params.decision, params.reason)
}

export function getWebhookLogs(limit: number = 200): WebhookLog[] {
  return db.prepare('SELECT * FROM webhook_log ORDER BY id DESC LIMIT ?').all(limit) as WebhookLog[]
}
