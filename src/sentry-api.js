/**
 * Fetch full event data from the Sentry API to enrich issue webhooks
 * with stacktrace and other details.
 */

const SENTRY_BASE_URL = process.env.SENTRY_BASE_URL || "https://sentry.io/api/0";
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;

/**
 * Fetch the latest event for a Sentry issue and extract stacktrace info.
 * Returns enrichment data to merge into the parsed issue, or null on failure.
 */
export async function fetchLatestEvent(organizationSlug, issueId) {
  if (!SENTRY_AUTH_TOKEN) {
    console.warn("[sentry-api] SENTRY_AUTH_TOKEN not set, cannot fetch event details");
    return null;
  }

  try {
    // Get the latest event for this issue
    const url = `${SENTRY_BASE_URL}/issues/${issueId}/events/latest/`;
    console.log(`[sentry-api] Fetching latest event for issue ${issueId}...`);

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${SENTRY_AUTH_TOKEN}`,
      },
    });

    if (!res.ok) {
      console.warn(`[sentry-api] Failed to fetch event: ${res.status} ${res.statusText}`);
      return null;
    }

    const event = await res.json();
    return extractEnrichment(event);
  } catch (err) {
    console.error(`[sentry-api] Error fetching event for issue ${issueId}:`, err.message);
    return null;
  }
}

function extractEnrichment(event) {
  const enrichment = {
    eventId: event.eventID || event.id,
    stacktrace: extractStacktrace(event),
    tags: event.tags || [],
    request: event.request || null,
    user: event.user || null,
    contexts: event.contexts || null,
    platform: event.platform,
  };

  // Also grab the culprit if we don't have it
  if (event.culprit) {
    enrichment.culprit = event.culprit;
  }

  return enrichment;
}

function extractStacktrace(event) {
  const exceptions = event.entries
    ?.filter((e) => e.type === "exception")
    ?.flatMap((e) => e.data?.values || []);

  if (!exceptions || exceptions.length === 0) return null;

  return exceptions.map((ex) => ({
    type: ex.type,
    value: ex.value,
    module: ex.module,
    frames: (ex.stacktrace?.frames || []).map((frame) => ({
      filename: frame.filename,
      absPath: frame.absPath || frame.abs_path,
      function: frame.function,
      lineNo: frame.lineNo || frame.lineno,
      colNo: frame.colNo || frame.colno,
      context: frame.context_line || frame.contextLine,
      preContext: frame.preContext || frame.pre_context,
      postContext: frame.postContext || frame.post_context,
      inApp: frame.inApp ?? frame.in_app,
    })),
  }));
}
