export const useLogSSE = () => {
  const logs = ref<any[]>([])
  let eventSource: EventSource | null = null

  const connect = (issueId: string) => {
    if (eventSource) {
      eventSource.close()
    }

    logs.value = []
    eventSource = new EventSource(`/api/issues/${issueId}/logs`)

    eventSource.addEventListener('message', (e) => {
      try {
        const event = JSON.parse(e.data)
        if (event.type === 'log') {
          logs.value.push({
            source: event.source,
            message: event.message,
            timestamp: event.timestamp,
          })
        }
      } catch (err) {
        console.error('Failed to parse log SSE event:', err)
      }
    })

    eventSource.addEventListener('error', (err) => {
      console.error('Log SSE connection error:', err)
    })
  }

  const disconnect = () => {
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    logs.value = []
  }

  return {
    logs,
    connect,
    disconnect,
  }
}
