import express from "express";
import { verifySentrySignature } from "./verify.js";
import { parseEventAlert, parseIssueEvent } from "./parser.js";

export function createServer({ config, secret, onIssue }) {
  const app = express();

  // Sentry sends JSON; we need the raw body for signature verification
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf.toString("utf8");
      },
    })
  );

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Sentry webhook endpoint
  app.post("/webhook/sentry", (req, res) => {
    const signature = req.headers["sentry-hook-signature"];
    const resource = req.headers["sentry-hook-resource"];

    // Verify signature
    if (!signature || !verifySentrySignature(req.rawBody, signature, secret)) {
      console.warn("[webhook] Invalid or missing signature");
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Handle installation verification (Sentry sends this when you first set up)
    if (resource === "installation") {
      console.log("[webhook] Installation event:", req.body.action);
      return res.status(200).json({ ok: true });
    }

    let parsed = null;

    if (resource === "event_alert") {
      parsed = parseEventAlert(req.body);
    } else if (resource === "issue") {
      parsed = parseIssueEvent(req.body);
    }

    if (!parsed) {
      console.log(`[webhook] Ignoring ${resource} event (action: ${req.body.action})`);
      return res.status(200).json({ ok: true, ignored: true });
    }

    // Check if we have a project mapping for this
    const projectConfig = config.projects[parsed.projectSlug];
    if (!projectConfig) {
      console.log(`[webhook] No config for project "${parsed.projectSlug}", skipping`);
      return res.status(200).json({ ok: true, ignored: true, reason: "unmapped project" });
    }

    // Respond immediately, process async
    res.status(202).json({ ok: true, issueId: parsed.issueId });

    // Queue the fix
    onIssue(parsed, projectConfig).catch((err) => {
      console.error(`[webhook] Error processing issue ${parsed.issueId}:`, err.message);
    });
  });

  return app;
}
