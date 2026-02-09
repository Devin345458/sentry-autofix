import { getAllIssues, getStats } from '../utils/db'

export default defineEventHandler(() => {
  const issues = getAllIssues(50)
  const stats = getStats()

  return {
    issues,
    stats,
  }
})
