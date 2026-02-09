import { mkdirSync } from 'fs'
import { resolve } from 'path'
import { initIssueHandler, recoverStuckIssues } from '../utils/issue-handler'
import { getAllProjects } from '../utils/db'

export default defineNitroPlugin(() => {
  const {
    reposDir,
    claudeModel,
    claudeCodePath,
    sentryAuthToken,
    sentryOrgSlug,
    sentryBaseUrl,
    maxAttemptsPerIssue,
    maxConcurrentFixes,
  } = useRuntimeConfig()

  // Ensure repos directory exists
  const resolvedReposDir = resolve(reposDir)
  mkdirSync(resolvedReposDir, { recursive: true })

  // Initialize issue handler
  initIssueHandler({
    reposDir: resolvedReposDir,
    maxAttempts: Number(maxAttemptsPerIssue),
    maxConcurrent: Number(maxConcurrentFixes),
    claudeCodePath,
    claudeModel,
    sentryAuthToken,
    sentryOrgSlug,
    sentryBaseUrl,
  })

  const projectSlugs = Object.keys(getAllProjects())
  console.log(`[sentry-autofix] Mapped projects (${projectSlugs.length}): ${projectSlugs.join(', ') || 'none'}`)
  console.log(`[sentry-autofix] Repos dir: ${resolvedReposDir}`)
  console.log(`[sentry-autofix] Claude model: ${claudeModel}`)
  console.log(`[sentry-autofix] Max concurrent fixes: ${maxConcurrentFixes}`)
  console.log(`[sentry-autofix] Max attempts per issue: ${maxAttemptsPerIssue}`)

  // Recover any issues left stuck from a previous run
  recoverStuckIssues().catch((err: any) => {
    console.error('[recovery] Failed to recover stuck issues:', err.message)
  })
})
