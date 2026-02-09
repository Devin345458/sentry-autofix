export interface ParsedEvent {
  issueId: string
  eventId?: string
  title: string
  level: string
  platform?: string
  projectSlug: string
  culprit?: string
  message: string
  timestamp?: string
  firstSeen?: string
  issueUrl?: string
  webUrl?: string
  stacktrace: Stacktrace[] | null
  tags?: any[]
  request?: any
  user?: any
  triggeredRule?: string
  action?: string
  count?: number
  userCount?: number
  priority?: string
}

export interface Stacktrace {
  type: string
  value: string
  module?: string
  frames: StackFrame[]
}

export interface StackFrame {
  filename: string
  absPath?: string
  function?: string
  lineNo?: number
  colNo?: number
  context?: string
  preContext?: string[]
  postContext?: string[]
  inApp?: boolean
}

/**
 * Parse a Sentry event_alert webhook payload into a structured format
 * for the fix engine.
 */
export function parseEventAlert(payload: any): ParsedEvent | null {
  const { data, action } = payload

  if (action !== 'triggered') return null

  const event = data?.event
  if (!event) return null

  const projectSlug = event.project_slug || data.issue_alert?.project_slug || extractProjectSlug(event)

  return {
    issueId: String(event.issue_id),
    eventId: event.event_id,
    title: event.title,
    level: event.level || 'error',
    platform: event.platform,
    projectSlug,
    culprit: event.culprit,
    message: event.message || event.title,
    timestamp: event.timestamp,
    issueUrl: event.issue_url,
    webUrl: event.web_url,
    stacktrace: extractStacktrace(event),
    tags: event.tags || [],
    request: event.request || null,
    user: event.user || null,
    triggeredRule: data.triggered_rule,
  }
}

/**
 * Parse a Sentry issue webhook payload.
 */
export function parseIssueEvent(payload: any): ParsedEvent | null {
  const { data, action } = payload

  const issue = data?.issue
  if (!issue) return null

  return {
    issueId: String(issue.id),
    action,
    title: issue.title,
    level: issue.level || 'error',
    platform: issue.platform,
    projectSlug: issue.project?.slug,
    culprit: issue.culprit,
    message: issue.metadata?.value || issue.title,
    firstSeen: issue.firstSeen,
    issueUrl: issue.url,
    webUrl: issue.web_url,
    count: issue.count,
    userCount: issue.userCount,
    priority: issue.priority,
    stacktrace: null, // issue webhooks don't include full stacktraces
  }
}

function extractProjectSlug(event: any): string {
  // Try to extract from tags
  const projectTag = (event.tags || []).find((t: any) => t[0] === 'project' || t.key === 'project')
  return projectTag ? projectTag[1] || projectTag.value : 'unknown'
}

function extractStacktrace(event: any): Stacktrace[] | null {
  const exceptions = event.exception?.values || []
  if (exceptions.length === 0) return null

  return exceptions.map((ex: any) => ({
    type: ex.type,
    value: ex.value,
    module: ex.module,
    frames: (ex.stacktrace?.frames || []).map((frame: any) => ({
      filename: frame.filename,
      absPath: frame.abs_path,
      function: frame.function,
      lineNo: frame.lineno,
      colNo: frame.colno,
      context: frame.context_line,
      preContext: frame.pre_context,
      postContext: frame.post_context,
      inApp: frame.in_app,
    })),
  }))
}
