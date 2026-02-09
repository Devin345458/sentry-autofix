import { subscribe, unsubscribe } from '../../../utils/events'
import { getLogsForIssue } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const issueId = getRouterParam(event, 'issueId')
  if (!issueId) {
    throw createError({ statusCode: 400, message: 'Issue ID is required' })
  }

  const eventStream = createEventStream(event)

  // Send existing logs first
  const existingLogs = getLogsForIssue(issueId)
  for (const log of existingLogs) {
    eventStream.push(`data: ${JSON.stringify({
      type: 'log',
      issueId: log.sentry_issue_id,
      source: log.source,
      message: log.message,
      timestamp: log.timestamp,
    })}\n\n`)
  }

  // Register callback for new logs
  const callback = (data: string) => {
    eventStream.push(data)
  }

  subscribe(issueId, callback)

  // Send initial connection message
  eventStream.push(`data: ${JSON.stringify({ type: 'connected', issueId, timestamp: new Date().toISOString() })}\n\n`)

  // Clean up on close
  eventStream.onClosed(() => {
    unsubscribe(issueId, callback)
  })

  return eventStream.send()
})
