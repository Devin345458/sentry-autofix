export const useDashboardSSE = () => {
  const issues = useState<any[]>('dashboard-issues', () => [])
  const stats = useState<any>('dashboard-stats', () => ({ total: 0, byStatus: [] }))

  let eventSource: EventSource | null = null

  const connect = () => {
    if (eventSource) return

    eventSource = new EventSource('/api/events')

    eventSource.addEventListener('message', (e) => {
      try {
        const event = JSON.parse(e.data)
        handleEvent(event)
      } catch (err) {
        console.error('Failed to parse SSE event:', err)
      }
    })

    eventSource.addEventListener('error', () => {
      console.error('SSE connection error, reconnecting...')
      disconnect()
      setTimeout(connect, 5000)
    })
  }

  const disconnect = () => {
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
  }

  const handleEvent = (event: any) => {
    if (event.type === 'connected') {
      console.log('Dashboard SSE connected')
      return
    }

    if (event.type === 'status') {
      // Update issue status in the list
      const index = issues.value.findIndex((i) => i.sentry_issue_id === event.issueId)
      if (index !== -1) {
        issues.value[index].status = event.status
        if (event.prUrl) {
          issues.value[index].pr_url = event.prUrl
        }
      }
      // Recalculate stats
      updateStats()
    }
  }

  const updateStats = () => {
    const total = issues.value.length
    const byStatus: Record<string, number> = {}
    for (const issue of issues.value) {
      byStatus[issue.status] = (byStatus[issue.status] || 0) + 1
    }
    stats.value = {
      total,
      byStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
    }
  }

  return {
    issues,
    stats,
    connect,
    disconnect,
    updateStats,
  }
}
