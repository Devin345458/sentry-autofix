import express from "express";
import { verifySentrySignature } from "./verify.js";
import { parseEventAlert, parseIssueEvent } from "./parser.js";
import { getAllIssues, getStats } from "./db.js";

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

  // JSON API for status
  app.get("/api/status", (_req, res) => {
    const stats = getStats();
    const issues = getAllIssues(50);
    res.json({ stats, issues, uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  // Status page
  app.get("/", (_req, res) => {
    const stats = getStats();
    const issues = getAllIssues(50);
    const uptime = formatUptime(process.uptime());
    const statusMap = { pending: "#6b7280", in_progress: "#f59e0b", pr_open: "#10b981", fixed: "#10b981", failed: "#ef4444", error: "#ef4444" };

    let issueRows = "";
    if (issues.length === 0) {
      issueRows = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#6b7280">No issues processed yet. Waiting for Sentry webhooks...</td></tr>`;
    } else {
      for (const issue of issues) {
        const color = statusMap[issue.status] || "#6b7280";
        const prLink = issue.pr_url ? `<a href="${esc(issue.pr_url)}" target="_blank">View PR</a>` : "-";
        issueRows += `<tr>
          <td><span style="background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px">${esc(issue.status)}</span></td>
          <td title="${esc(issue.title)}">${esc(truncate(issue.title, 50))}</td>
          <td>${esc(issue.sentry_project)}</td>
          <td>${esc(issue.repo)}</td>
          <td>${issue.attempts}</td>
          <td>${prLink}</td>
        </tr>`;
      }
    }

    const statusCounts = {};
    for (const s of stats.byStatus) statusCounts[s.status] = s.count;

    res.send(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sentry Autofix</title>
<meta http-equiv="refresh" content="30">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}
  .container{max-width:960px;margin:0 auto;padding:24px 16px}
  h1{font-size:24px;margin-bottom:4px}
  .subtitle{color:#94a3b8;margin-bottom:24px;font-size:14px}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:24px}
  .card{background:#1e293b;border-radius:8px;padding:16px;text-align:center}
  .card .num{font-size:28px;font-weight:700;color:#f8fafc}
  .card .label{font-size:12px;color:#94a3b8;margin-top:4px}
  .card.ok .num{color:#10b981}
  .card.warn .num{color:#f59e0b}
  .card.err .num{color:#ef4444}
  table{width:100%;border-collapse:collapse;background:#1e293b;border-radius:8px;overflow:hidden}
  th{text-align:left;padding:10px 12px;background:#334155;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.5px}
  td{padding:10px 12px;border-top:1px solid #334155;font-size:14px}
  a{color:#38bdf8;text-decoration:none}
  a:hover{text-decoration:underline}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981;margin-right:6px;animation:pulse 2s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  .footer{margin-top:24px;text-align:center;color:#475569;font-size:12px}
</style>
</head><body>
<div class="container">
  <h1><span class="dot"></span>Sentry Autofix</h1>
  <div class="subtitle">Uptime: ${uptime} &middot; Model: ${esc(process.env.ANTHROPIC_MODEL || "qwen2.5-coder:14b")}</div>
  <div class="cards">
    <div class="card"><div class="num">${stats.total}</div><div class="label">Total Issues</div></div>
    <div class="card ok"><div class="num">${statusCounts.pr_open || 0}</div><div class="label">PRs Opened</div></div>
    <div class="card warn"><div class="num">${statusCounts.in_progress || 0}</div><div class="label">In Progress</div></div>
    <div class="card err"><div class="num">${(statusCounts.failed || 0) + (statusCounts.error || 0)}</div><div class="label">Failed</div></div>
  </div>
  <table>
    <thead><tr><th>Status</th><th>Title</th><th>Project</th><th>Repo</th><th>Attempts</th><th>PR</th></tr></thead>
    <tbody>${issueRows}</tbody>
  </table>
  <div class="footer">Auto-refreshes every 30s &middot; <a href="/api/status">JSON API</a> &middot; <a href="/health">Health</a></div>
</div>
</body></html>`);
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

function esc(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max - 3) + "..." : str;
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
