import { verifySentrySignature } from '../../utils/verify'
import { parseEventAlert, parseIssueEvent } from '../../utils/parser'
import { insertWebhookLog, getProject } from '../../utils/db'
import { handleIssue } from '../../utils/issue-handler'
import { fetchLatestEvent } from '../../utils/sentry-api'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // Read raw body for HMAC verification
  const rawBody = await readRawBody(event, 'utf8')
  if (!rawBody) {
    throw createError({ statusCode: 400, message: 'Empty body' })
  }

  // Verify signature
  const signature = getHeader(event, 'sentry-hook-signature')
  if (!signature) {
    console.warn('[webhook] Missing sentry-hook-signature header')
    throw createError({ statusCode: 401, message: 'Missing signature' })
  }

  if (!verifySentrySignature(rawBody, signature, config.sentryWebhookSecret)) {
    console.warn('[webhook] Invalid signature')
    throw createError({ statusCode: 401, message: 'Invalid signature' })
  }

  // Parse JSON payload
  const payload = JSON.parse(rawBody)
  const resource = getHeader(event, 'sentry-hook-resource') || 'unknown'
  const action = payload.action || 'unknown'

  console.log(`[webhook] Received ${resource} webhook with action: ${action}`)

  // Try to parse the payload
  let parsed = null
  if (resource === 'event_alert') {
    parsed = parseEventAlert(payload)
  } else if (resource === 'issue') {
    parsed = parseIssueEvent(payload)

    // For issue webhooks, we need to enrich with the latest event
    if (parsed && config.sentryAuthToken) {
      const orgSlug = process.env.SENTRY_ORG_SLUG
      if (orgSlug) {
        const enrichment = await fetchLatestEvent(config.sentryAuthToken, orgSlug, parsed.issueId)
        if (enrichment) {
          Object.assign(parsed, enrichment)
        }
      }
    }
  }

  // Log the webhook
  if (!parsed) {
    insertWebhookLog({
      resource,
      action,
      issueId: null,
      issueTitle: null,
      projectSlug: null,
      decision: 'ignored',
      reason: `Unparseable or non-triggered ${resource} webhook`,
    })
    return { received: true, action: 'ignored' }
  }

  // Check if we have a project mapping
  const projectConfig = getProject(parsed.projectSlug)
  if (!projectConfig) {
    insertWebhookLog({
      resource,
      action,
      issueId: parsed.issueId,
      issueTitle: parsed.title,
      projectSlug: parsed.projectSlug,
      decision: 'ignored',
      reason: `No project mapping found for "${parsed.projectSlug}"`,
    })
    return { received: true, action: 'ignored', reason: 'no_project_mapping' }
  }

  // Accept and process
  insertWebhookLog({
    resource,
    action,
    issueId: parsed.issueId,
    issueTitle: parsed.title,
    projectSlug: parsed.projectSlug,
    decision: 'accepted',
    reason: null,
  })

  // Queue the fix (non-blocking)
  handleIssue(parsed, projectConfig).catch((err: any) => {
    console.error('[webhook] Error handling issue:', err.message)
  })

  return { received: true, action: 'accepted', issueId: parsed.issueId }
})
