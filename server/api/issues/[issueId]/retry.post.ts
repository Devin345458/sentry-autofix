import { retryIssue } from '../../../utils/issue-handler'

export default defineEventHandler(async (event) => {
  const issueId = getRouterParam(event, 'issueId')
  if (!issueId) {
    throw createError({ statusCode: 400, message: 'Issue ID is required' })
  }

  try {
    await retryIssue(issueId)
    return { success: true, issueId }
  } catch (err: any) {
    throw createError({ statusCode: 400, message: err.message })
  }
})
