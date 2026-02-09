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

  // Verify Ollama connection and model availability
  const ollamaBaseUrl = process.env.ANTHROPIC_BASE_URL
  if (ollamaBaseUrl) {
    fetch(`${ollamaBaseUrl}/api/tags`)
      .then(res => res.json())
      .then((data: any) => {
        const modelNames = (data.models || []).map((m: any) => m.name)
        if (modelNames.includes(claudeModel)) {
          console.log(`[sentry-autofix] Ollama connected — model "${claudeModel}" available`)
        } else {
          console.warn(`[sentry-autofix] Ollama connected but model "${claudeModel}" not found. Available: ${modelNames.join(', ') || 'none'}`)
        }
      })
      .catch((err: any) => {
        console.error(`[sentry-autofix] Ollama connection failed (${ollamaBaseUrl}): ${err.message}`)
      })
  }

  // Recover any issues left stuck from a previous run
  recoverStuckIssues().catch((err: any) => {
    console.error('[recovery] Failed to recover stuck issues:', err.message)
  })
})
