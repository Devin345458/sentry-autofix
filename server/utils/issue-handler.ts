import type { ParsedEvent } from './parser'
import type { ProjectConfig } from './db'
import {
  upsertIssue,
  incrementAttempts,
  markStatus,
  shouldAttempt,
  insertLog,
  getStuckIssues,
  resetStuckIssue,
  getProject,
  getIssue,
} from './db'
import { broadcast } from './events'
import { fixIssue } from './fixer'
import { createPullRequest, ensureLabel } from './github'
import { fetchLatestEvent } from './sentry-api'

interface HandleIssueConfig {
  reposDir: string
  maxAttempts: number
  maxConcurrent: number
  claudeCodePath: string
  claudeModel: string
  sentryAuthToken: string
  sentryOrgSlug: string
}

// Concurrency-limited queue
let activeJobs = 0
let config: HandleIssueConfig | null = null

interface QueueEntry {
  parsed: ParsedEvent
  projectConfig: ProjectConfig
}
const queue: QueueEntry[] = []

export function initIssueHandler(cfg: HandleIssueConfig): void {
  config = cfg
}

function drainQueue(): void {
  if (!config) return
  while (queue.length > 0 && activeJobs < config.maxConcurrent) {
    const entry = queue.shift()!
    processIssue(entry.parsed, entry.projectConfig)
  }
}

export async function handleIssue(parsed: ParsedEvent, projectConfig: ProjectConfig): Promise<void> {
  if (!config) {
    throw new Error('Issue handler not initialized')
  }

  // Check if we should attempt this
  if (!shouldAttempt(parsed.issueId, config.maxAttempts)) {
    console.log(`[issue-handler] Skipping issue ${parsed.issueId} (already attempted or fixed)`)
    return
  }

  // If at capacity, queue it
  if (activeJobs >= config.maxConcurrent) {
    console.log(`[issue-handler] Queuing issue ${parsed.issueId} (${activeJobs}/${config.maxConcurrent} active, ${queue.length} queued)`)
    queue.push({ parsed, projectConfig })
    return
  }

  processIssue(parsed, projectConfig)
}

async function processIssue(parsed: ParsedEvent, projectConfig: ProjectConfig): Promise<void> {
  if (!config) return

  activeJobs++
  console.log(`[issue-handler] Processing issue ${parsed.issueId}: ${parsed.title}`)

  const onLog = (source: string, message: string) => {
    insertLog(parsed.issueId, source, message)
    broadcast(parsed.issueId, { type: 'log', issueId: parsed.issueId, source, message, timestamp: new Date().toISOString() })
  }

  const emitStatus = (status: string, extra: any = {}) => {
    broadcast(parsed.issueId, { type: 'status', issueId: parsed.issueId, status, ...extra, timestamp: new Date().toISOString() })
  }

  try {
    // Track the issue
    upsertIssue({
      sentryIssueId: parsed.issueId,
      sentryProject: parsed.projectSlug,
      repo: projectConfig.repo,
      title: parsed.title,
      level: parsed.level,
      errorMessage: parsed.message,
    })

    incrementAttempts(parsed.issueId)
    markStatus(parsed.issueId, 'in_progress')
    emitStatus('in_progress')
    onLog('system', `Processing issue: ${parsed.title}`)

    // Attempt the fix
    const result = await fixIssue({
      parsed,
      projectConfig,
      reposDir: config.reposDir,
      claudeCodePath: config.claudeCodePath,
      claudeModel: config.claudeModel,
      onLog,
    })

    if (!result.success) {
      console.log(`[issue-handler] Fix failed for issue ${parsed.issueId}: ${result.reason}`)
      markStatus(parsed.issueId, 'failed')
      emitStatus('failed')
      onLog('system', `Fix failed: ${result.reason}`)
      return
    }

    // Create the PR
    onLog('github', 'Creating pull request...')
    await ensureLabel(projectConfig.repo)
    const prUrl = await createPullRequest({
      repo: projectConfig.repo,
      branch: result.branch!,
      baseBranch: projectConfig.branch,
      parsed,
      changedFiles: result.changedFiles!,
    })

    markStatus(parsed.issueId, 'pr_open', prUrl)
    emitStatus('pr_open', { prUrl })
    onLog('github', `Pull request created: ${prUrl}`)
    console.log(`[issue-handler] Successfully created PR for issue ${parsed.issueId}: ${prUrl}`)
  } catch (err: any) {
    console.error(`[issue-handler] Error fixing issue ${parsed.issueId}:`, err.message)
    markStatus(parsed.issueId, 'error')
    emitStatus('error')
    onLog('error', err.message)
  } finally {
    activeJobs--
    drainQueue()
  }
}

/**
 * Manually retry an issue from the dashboard.
 * Resets status to pending, reconstructs parsed data, and re-queues.
 */
export async function retryIssue(issueId: string): Promise<void> {
  if (!config) {
    throw new Error('Issue handler not initialized')
  }

  const issue = getIssue(issueId)
  if (!issue) {
    throw new Error(`Issue ${issueId} not found`)
  }

  const projectConfig = getProject(issue.sentry_project)
  if (!projectConfig) {
    throw new Error(`No project mapping for "${issue.sentry_project}"`)
  }

  // Reset status so it can be reprocessed
  resetStuckIssue(issueId)
  insertLog(issueId, 'system', 'Manual retry requested.')

  const parsed: ParsedEvent = {
    issueId: issue.sentry_issue_id,
    projectSlug: issue.sentry_project,
    title: issue.title,
    level: issue.level || 'error',
    message: issue.error_message || issue.title,
    stacktrace: null,
  }

  // Enrich with Sentry API if possible
  if (config.sentryOrgSlug && config.sentryAuthToken) {
    try {
      const enrichment = await fetchLatestEvent(config.sentryAuthToken, config.sentryOrgSlug, parsed.issueId)
      if (enrichment) {
        Object.assign(parsed, enrichment)
      }
    } catch (err: any) {
      console.warn(`[retry] Failed to enrich issue ${parsed.issueId}:`, err.message)
    }
  }

  console.log(`[retry] Re-queuing issue ${parsed.issueId}: ${parsed.title}`)
  handleIssue(parsed, projectConfig)
}

/**
 * Recover stuck issues on startup
 */
export async function recoverStuckIssues(): Promise<void> {
  if (!config) {
    throw new Error('Issue handler not initialized')
  }

  const stuck = getStuckIssues()
  if (stuck.length === 0) return

  console.log(`[recovery] Found ${stuck.length} stuck issue(s), reprocessing...`)

  for (const issue of stuck) {
    // Reset status and don't count the interrupted attempt
    resetStuckIssue(issue.sentry_issue_id)
    insertLog(issue.sentry_issue_id, 'system', 'Issue was stuck in_progress after restart — retrying.')

    const projectConfig = getProject(issue.sentry_project)
    if (!projectConfig) {
      console.warn(`[recovery] No project config for ${issue.sentry_project}, skipping issue ${issue.sentry_issue_id}`)
      markStatus(issue.sentry_issue_id, 'error')
      insertLog(issue.sentry_issue_id, 'error', `No project mapping found for "${issue.sentry_project}"`)
      continue
    }

    // Reconstruct a parsed object from DB fields
    const parsed: ParsedEvent = {
      issueId: issue.sentry_issue_id,
      projectSlug: issue.sentry_project,
      title: issue.title,
      level: issue.level || 'error',
      message: issue.error_message || issue.title,
      stacktrace: null,
    }

    // Enrich with Sentry API if possible
    if (config.sentryOrgSlug && config.sentryAuthToken) {
      try {
        const enrichment = await fetchLatestEvent(config.sentryAuthToken, config.sentryOrgSlug, parsed.issueId)
        if (enrichment) {
          Object.assign(parsed, enrichment)
        }
      } catch (err: any) {
        console.warn(`[recovery] Failed to enrich issue ${parsed.issueId}:`, err.message)
      }
    }

    console.log(`[recovery] Re-queuing issue ${parsed.issueId}: ${parsed.title}`)
    handleIssue(parsed, projectConfig)
  }
}
