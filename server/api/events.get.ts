import { subscribe, unsubscribe } from '../utils/events'

export default defineEventHandler(async (event) => {
  const eventStream = createEventStream(event)

  // Register callback
  const callback = (data: string) => {
    eventStream.push(data)
  }

  subscribe('*', callback)

  // Send initial connection message
  eventStream.push(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }))

  // Clean up on close
  eventStream.onClosed(() => {
    unsubscribe('*', callback)
  })

  return eventStream.send()
})
