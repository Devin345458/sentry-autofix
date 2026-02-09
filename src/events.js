/**
 * Simple in-memory event bus for SSE broadcasting.
 * Tracks connected clients in a Map<issueId, Set<res>>.
 * Use "*" as issueId for dashboard-level (all issues) subscriptions.
 */

const clients = new Map();

export function subscribe(issueId, res) {
  if (!clients.has(issueId)) {
    clients.set(issueId, new Set());
  }
  clients.get(issueId).add(res);
}

export function unsubscribe(issueId, res) {
  const set = clients.get(issueId);
  if (set) {
    set.delete(res);
    if (set.size === 0) clients.delete(issueId);
  }
}

export function broadcast(issueId, event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;

  // Send to issue-specific subscribers
  const issueClients = clients.get(issueId);
  if (issueClients) {
    for (const res of issueClients) {
      res.write(data);
    }
  }

  // Send to wildcard subscribers (dashboard-level)
  if (issueId !== "*") {
    const allClients = clients.get("*");
    if (allClients) {
      for (const res of allClients) {
        res.write(data);
      }
    }
  }
}
