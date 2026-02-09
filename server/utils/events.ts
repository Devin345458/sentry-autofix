/**
 * Simple in-memory event bus for SSE broadcasting.
 * Adapted for H3/Nitro: instead of storing Express response objects,
 * we store callbacks that push data to H3 event streams.
 *
 * Use "*" as issueId for dashboard-level (all issues) subscriptions.
 */

type EventCallback = (data: string) => void

const clients = new Map<string, Set<EventCallback>>()

export function subscribe(issueId: string, callback: EventCallback): void {
  if (!clients.has(issueId)) {
    clients.set(issueId, new Set())
  }
  clients.get(issueId)!.add(callback)
}

export function unsubscribe(issueId: string, callback: EventCallback): void {
  const set = clients.get(issueId)
  if (set) {
    set.delete(callback)
    if (set.size === 0) clients.delete(issueId)
  }
}

export function broadcast(issueId: string, event: any): void {
  const data = `data: ${JSON.stringify(event)}\n\n`

  // Send to issue-specific subscribers
  const issueClients = clients.get(issueId)
  if (issueClients) {
    for (const callback of issueClients) {
      callback(data)
    }
  }

  // Send to wildcard subscribers (dashboard-level)
  if (issueId !== '*') {
    const allClients = clients.get('*')
    if (allClients) {
      for (const callback of allClients) {
        callback(data)
      }
    }
  }
}
