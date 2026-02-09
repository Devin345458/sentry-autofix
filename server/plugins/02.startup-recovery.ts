import { mkdirSync } from 'fs'
import { resolve } from 'path'
import { initIssueHandler, recoverStuckIssues } from '../utils/issue-handler'
import { getAllProjects } from '../utils/db'

export default defineNitroPlugin(() => {
  // Ensure repos directory exists
  const reposDir = resolve(process.env.REPOS_DIR || '/tmp/sentry-autofix-repos')
  mkdirSync(reposDir, { recursive: true })

  const claudeModel = process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || 'sonnet-4-5'
  const claudeCodePath = process.env.CLAUDE_CODE_PATH || ''
  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN || ''

  // Initialize issue handler
  initIssueHandler({
    reposDir,
    maxAttempts: parseInt(process.env.MAX_ATTEMPTS_PER_ISSUE || '2', 10),
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_FIXES || '1', 10),
    claudeCodePath,
    claudeModel,
    sentryAuthToken,
    sentryOrgSlug: process.env.SENTRY_ORG_SLUG || '',
  })

  const projectSlugs = Object.keys(getAllProjects())
  console.log(`[sentry-autofix] Mapped projects (${projectSlugs.length}): ${projectSlugs.join(', ') || 'none'}`)
  console.log(`[sentry-autofix] Repos dir: ${reposDir}`)
  console.log(`[sentry-autofix] Claude model: ${claudeModel}`)
  console.log(`[sentry-autofix] Max concurrent fixes: ${parseInt(process.env.MAX_CONCURRENT_FIXES || '1', 10)}`)
  console.log(`[sentry-autofix] Max attempts per issue: ${parseInt(process.env.MAX_ATTEMPTS_PER_ISSUE || '2', 10)}`)

  // Recover any issues left stuck from a previous run
  recoverStuckIssues().catch((err: any) => {
    console.error('[recovery] Failed to recover stuck issues:', err.message)
  })
})
