import { getWebhookLogs } from '../utils/db'

export default defineEventHandler(() => {
  return getWebhookLogs(200)
})
