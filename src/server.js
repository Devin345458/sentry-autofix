import express from "express";
import { verifySentrySignature } from "./verify.js";
import { parseEventAlert, parseIssueEvent } from "./parser.js";
import { fetchLatestEvent } from "./sentry-api.js";
import { getAllIssues, getStats, getAllProjects, getProject, createProject, updateProject, deleteProject, getLogsForIssue } from "./db.js";
import { subscribe, unsubscribe } from "./events.js";

export function createServer({ secret, onIssue }) {
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

  // --- Project CRUD API ---
  app.get("/api/projects", (_req, res) => {
    res.json({ projects: getAllProjects() });
  });

  app.post("/api/projects", (req, res) => {
    const { sentryProjectSlug, repo, branch, language, framework } = req.body;
    if (!sentryProjectSlug || !repo || !branch || !language || !framework) {
      return res.status(400).json({ error: "All fields are required: sentryProjectSlug, repo, branch, language, framework" });
    }
    if (getProject(sentryProjectSlug)) {
      return res.status(409).json({ error: `Project "${sentryProjectSlug}" already exists` });
    }
    const project = createProject({ slug: sentryProjectSlug, repo, branch, language, framework });
    res.status(201).json(project);
  });

  app.put("/api/projects/:slug", (req, res) => {
    const { slug } = req.params;
    if (!getProject(slug)) {
      return res.status(404).json({ error: `Project "${slug}" not found` });
    }
    const { repo, branch, language, framework } = req.body;
    if (!repo || !branch || !language || !framework) {
      return res.status(400).json({ error: "All fields are required: repo, branch, language, framework" });
    }
    const project = updateProject(slug, { repo, branch, language, framework });
    res.json(project);
  });

  app.delete("/api/projects/:slug", (req, res) => {
    const { slug } = req.params;
    if (!getProject(slug)) {
      return res.status(404).json({ error: `Project "${slug}" not found` });
    }
    deleteProject(slug);
    res.json({ ok: true });
  });

  // --- SSE Endpoints ---

  // Dashboard-level events (new issues, status changes)
  app.get("/api/events", (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("data: {\"type\":\"connected\"}\n\n");
    subscribe("*", res);
    _req.on("close", () => unsubscribe("*", res));
  });

  // Per-issue log stream: sends existing logs as initial burst, then streams new ones
  app.get("/api/issues/:issueId/logs", (req, res) => {
    const { issueId } = req.params;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Send existing logs as initial burst
    const existing = getLogsForIssue(issueId);
    for (const log of existing) {
      res.write(`data: ${JSON.stringify({ type: "log", issueId, source: log.source, message: log.message, timestamp: log.timestamp })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ type: "history_end", count: existing.length })}\n\n`);

    subscribe(issueId, res);
    req.on("close", () => unsubscribe(issueId, res));
  });

  // Status page
  app.get("/", (_req, res) => {
    const stats = getStats();
    const issues = getAllIssues(50);
    const projects = getAllProjects();
    const uptime = formatUptime(process.uptime());

    let issueRows = "";
    if (issues.length === 0) {
      issueRows = `<tr class="empty-row"><td colspan="7">No issues processed yet. Waiting for Sentry webhooks...</td></tr>`;
    } else {
      for (const issue of issues) {
        const statusClass = `s-${issue.status}`;
        const statusLabel = issue.status.replace(/_/g, " ");
        const prLink = issue.pr_url ? `<a href="${esc(issue.pr_url)}" target="_blank">View PR</a>` : '<span style="color:var(--text-muted)">-</span>';
        issueRows += `<tr data-issue-id="${esc(issue.sentry_issue_id)}">
          <td><span class="status-badge ${statusClass}">${esc(statusLabel)}</span></td>
          <td class="td-title" title="${esc(issue.title)}">${esc(truncate(issue.title, 55))}</td>
          <td class="td-mono">${esc(issue.sentry_project)}</td>
          <td class="td-mono">${esc(issue.repo)}</td>
          <td class="td-mono" style="text-align:center">${issue.attempts}</td>
          <td class="pr-cell">${prLink}</td>
          <td><button class="btn-logs-cell" onclick="openLogs('${esc(issue.sentry_issue_id)}','${esc(truncate(issue.title, 50))}')">logs</button></td>
        </tr>`;
      }
    }

    let projectRows = "";
    const projectSlugs = Object.keys(projects);
    if (projectSlugs.length === 0) {
      projectRows = `<tr class="empty-row"><td colspan="6">No project mappings configured yet.</td></tr>`;
    } else {
      for (const slug of projectSlugs) {
        const p = projects[slug];
        projectRows += `<tr>
          <td class="td-mono">${esc(slug)}</td>
          <td class="td-mono">${esc(p.repo)}</td>
          <td class="td-mono">${esc(p.branch)}</td>
          <td>${esc(p.language)}</td>
          <td>${esc(p.framework)}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-ghost" onclick="showEditModal('${esc(slug)}')" style="padding:4px 10px;font-size:11px">Edit</button>
            <button class="btn btn-danger" onclick="confirmDelete('${esc(slug)}')" style="padding:4px 10px;font-size:11px;margin-left:4px">Delete</button>
          </td>
        </tr>`;
      }
    }

    const statusCounts = {};
    for (const s of stats.byStatus) statusCounts[s.status] = s.count;

    res.send(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sentry Autofix</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg-deep: #06080d;
    --bg-base: #0c1017;
    --bg-surface: #131922;
    --bg-raised: #1a2233;
    --bg-hover: #1f2b3d;
    --border: #1e293b;
    --border-subtle: #162032;
    --text-primary: #e8ecf2;
    --text-secondary: #7a8ba4;
    --text-muted: #4a5a72;
    --accent: #d4943a;
    --accent-dim: rgba(212,148,58,.12);
    --accent-glow: rgba(212,148,58,.25);
    --green: #22c55e;
    --green-dim: rgba(34,197,94,.1);
    --yellow: #eab308;
    --yellow-dim: rgba(234,179,8,.1);
    --red: #ef4444;
    --red-dim: rgba(239,68,68,.1);
    --blue: #3b82f6;
    --mono: 'JetBrains Mono', monospace;
    --sans: 'Outfit', sans-serif;
  }

  *{margin:0;padding:0;box-sizing:border-box}

  body {
    font-family: var(--sans);
    background: var(--bg-deep);
    color: var(--text-primary);
    min-height: 100vh;
    background-image:
      radial-gradient(circle at 1px 1px, rgba(212,148,58,.04) 1px, transparent 0);
    background-size: 32px 32px;
  }

  /* --- Header bar --- */
  .header-bar {
    background: var(--bg-base);
    border-bottom: 1px solid var(--border);
    padding: 0 24px;
    position: sticky;
    top: 0;
    z-index: 50;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    background: rgba(12,16,23,.85);
  }
  .header-inner {
    max-width: 1080px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 56px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .brand-icon {
    width: 28px;
    height: 28px;
    background: var(--accent);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    box-shadow: 0 0 16px var(--accent-glow);
  }
  .brand-icon svg { width: 16px; height: 16px; }
  .brand-name {
    font-family: var(--mono);
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.3px;
  }
  .header-meta {
    display: flex;
    align-items: center;
    gap: 20px;
    font-size: 12px;
    color: var(--text-muted);
    font-family: var(--mono);
  }
  .header-meta span { display: flex; align-items: center; gap: 6px; }
  .live-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 8px rgba(34,197,94,.5);
    animation: live-pulse 2.5s ease-in-out infinite;
  }
  .live-dot.off { background: var(--red); box-shadow: 0 0 8px rgba(239,68,68,.4); animation: none; }
  @keyframes live-pulse {
    0%,100% { opacity:1; box-shadow: 0 0 8px rgba(34,197,94,.5); }
    50% { opacity:.5; box-shadow: 0 0 4px rgba(34,197,94,.2); }
  }

  /* --- Container --- */
  .container { max-width: 1080px; margin: 0 auto; padding: 28px 24px 48px; }

  /* --- Stat cards --- */
  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    margin-bottom: 32px;
  }
  .stat {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    padding: 20px;
    position: relative;
    overflow: hidden;
    opacity: 0;
    animation: stat-in .5s ease forwards;
  }
  .stat:nth-child(1){animation-delay:0s}
  .stat:nth-child(2){animation-delay:.08s}
  .stat:nth-child(3){animation-delay:.16s}
  .stat:nth-child(4){animation-delay:.24s}
  @keyframes stat-in {
    from { opacity:0; transform: translateY(10px); }
    to { opacity:1; transform: translateY(0); }
  }
  .stat::before {
    content: '';
    position: absolute;
    top: 0; left: 0;
    width: 3px; height: 100%;
    border-radius: 3px 0 0 3px;
  }
  .stat.s-total::before { background: var(--accent); }
  .stat.s-ok::before { background: var(--green); }
  .stat.s-warn::before { background: var(--yellow); }
  .stat.s-err::before { background: var(--red); }
  .stat .stat-label {
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-muted);
    margin-bottom: 8px;
    font-family: var(--mono);
  }
  .stat .stat-num {
    font-size: 32px;
    font-weight: 700;
    font-family: var(--mono);
    line-height: 1;
    color: var(--text-primary);
  }
  .stat.s-ok .stat-num { color: var(--green); }
  .stat.s-warn .stat-num { color: var(--yellow); }
  .stat.s-err .stat-num { color: var(--red); }

  /* --- Section headers --- */
  .section-hdr {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }
  .section-hdr:not(:first-child) { margin-top: 36px; }
  .section-hdr h2 {
    font-family: var(--sans);
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .section-hdr h2 .count {
    font-family: var(--mono);
    font-size: 11px;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    padding: 2px 8px;
    border-radius: 10px;
    color: var(--text-secondary);
  }

  /* --- Tables --- */
  .tbl-wrap {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    overflow: hidden;
  }
  table { width: 100%; border-collapse: collapse; }
  thead th {
    text-align: left;
    padding: 10px 16px;
    background: var(--bg-raised);
    border-bottom: 1px solid var(--border);
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    color: var(--text-muted);
  }
  tbody td {
    padding: 12px 16px;
    border-top: 1px solid var(--border-subtle);
    font-size: 13px;
    color: var(--text-secondary);
  }
  tbody tr { transition: background .15s; }
  tbody tr:first-child td { border-top: none; }
  tbody tr:hover { background: var(--bg-hover); }
  .td-title {
    color: var(--text-primary);
    font-weight: 500;
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .td-mono { font-family: var(--mono); font-size: 12px; }
  .empty-row td {
    text-align: center;
    padding: 40px 16px;
    color: var(--text-muted);
    font-size: 13px;
  }

  /* --- Status badge --- */
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 500;
    padding: 3px 10px;
    border-radius: 100px;
    white-space: nowrap;
  }
  .status-badge.s-pending { color: #7a8ba4; background: rgba(122,139,164,.1); }
  .status-badge.s-in_progress { color: var(--yellow); background: var(--yellow-dim); }
  .status-badge.s-in_progress::before {
    content: '';
    width: 5px; height: 5px;
    border-radius: 50%;
    background: var(--yellow);
    animation: live-pulse 2s ease-in-out infinite;
  }
  .status-badge.s-pr_open { color: var(--green); background: var(--green-dim); }
  .status-badge.s-fixed { color: var(--green); background: var(--green-dim); }
  .status-badge.s-failed { color: var(--red); background: var(--red-dim); }
  .status-badge.s-error { color: var(--red); background: var(--red-dim); }

  /* --- Buttons --- */
  .btn {
    font-family: var(--sans);
    font-size: 12px;
    font-weight: 500;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    padding: 6px 14px;
    transition: all .15s;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .btn-primary {
    background: var(--accent);
    color: #0c1017;
  }
  .btn-primary:hover {
    background: #e0a544;
    box-shadow: 0 0 20px var(--accent-glow);
  }
  .btn-ghost {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }
  .btn-ghost:hover { background: var(--bg-hover); color: var(--text-primary); border-color: #2a3a52; }
  .btn-danger {
    background: transparent;
    color: var(--red);
    border: 1px solid rgba(239,68,68,.2);
  }
  .btn-danger:hover { background: var(--red-dim); }
  .btn-logs-cell {
    font-family: var(--mono);
    font-size: 11px;
    padding: 4px 10px;
    background: var(--bg-raised);
    color: var(--text-secondary);
    border: 1px solid var(--border);
    border-radius: 5px;
    cursor: pointer;
    transition: all .15s;
  }
  .btn-logs-cell:hover { background: var(--accent-dim); color: var(--accent); border-color: rgba(212,148,58,.3); }

  /* --- Links --- */
  a { color: var(--blue); text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* --- Overlay / Modal --- */
  .overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(6,8,13,.75);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    z-index: 100;
    justify-content: center;
    align-items: center;
  }
  .overlay.active { display: flex; }

  .modal {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 28px;
    width: 100%;
    max-width: 460px;
    box-shadow: 0 24px 80px rgba(0,0,0,.5);
    animation: modal-in .2s ease;
  }
  @keyframes modal-in {
    from { opacity:0; transform: translateY(12px) scale(.97); }
    to { opacity:1; transform: translateY(0) scale(1); }
  }
  .modal h3 {
    font-family: var(--sans);
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 20px;
  }
  .modal label {
    display: block;
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-muted);
    margin-bottom: 5px;
    margin-top: 14px;
  }
  .modal label:first-of-type { margin-top: 0; }
  .modal input {
    width: 100%;
    padding: 9px 12px;
    background: var(--bg-deep);
    border: 1px solid var(--border);
    border-radius: 7px;
    color: var(--text-primary);
    font-family: var(--mono);
    font-size: 13px;
    transition: border-color .15s;
    outline: none;
  }
  .modal input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-dim); }
  .modal input:disabled { opacity: .4; cursor: not-allowed; }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 24px;
  }

  /* --- Log modal --- */
  .log-modal {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 0;
    width: 100%;
    max-width: 780px;
    max-height: 82vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 24px 80px rgba(0,0,0,.6);
    animation: modal-in .2s ease;
    overflow: hidden;
  }
  .log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-raised);
  }
  .log-header h3 {
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  .log-header .close-x {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 18px;
    padding: 4px 8px;
    border-radius: 4px;
    transition: all .15s;
    flex-shrink: 0;
  }
  .log-header .close-x:hover { color: var(--text-primary); background: var(--bg-hover); }

  .log-output {
    flex: 1;
    overflow-y: auto;
    background: var(--bg-deep);
    padding: 16px;
    font-family: var(--mono);
    font-size: 11.5px;
    line-height: 1.7;
    min-height: 180px;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }
  .log-output::-webkit-scrollbar { width: 6px; }
  .log-output::-webkit-scrollbar-track { background: transparent; }
  .log-output::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

  .log-line { white-space: pre-wrap; word-break: break-all; padding: 1px 0; }
  .log-line .ts { color: var(--text-muted); margin-right: 10px; opacity: .6; }
  .log-line .src {
    display: inline-block;
    min-width: 60px;
    margin-right: 10px;
    font-weight: 500;
  }
  .log-line .src.git { color: #60a5fa; }
  .log-line .src.claude { color: #34d399; }
  .log-line .src.claude-stderr { color: #fbbf24; }
  .log-line .src.error { color: #f87171; }
  .log-line .src.system { color: var(--accent); }
  .log-line .src.github { color: #a78bfa; }
  .log-line .src.result { color: #2dd4bf; }
  .log-line .msg { color: var(--text-secondary); }
  .log-empty {
    color: var(--text-muted);
    text-align: center;
    padding: 48px 16px;
    font-family: var(--mono);
    font-size: 12px;
  }

  /* --- Toast --- */
  .toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    padding: 10px 18px;
    border-radius: 8px;
    font-family: var(--mono);
    font-size: 12px;
    z-index: 200;
    opacity: 0;
    transform: translateY(8px);
    transition: all .25s ease;
    border: 1px solid transparent;
  }
  .toast.show { opacity: 1; transform: translateY(0); }
  .toast.success { background: rgba(34,197,94,.1); color: var(--green); border-color: rgba(34,197,94,.2); }
  .toast.error { background: rgba(239,68,68,.1); color: var(--red); border-color: rgba(239,68,68,.2); }

  /* --- Footer --- */
  .footer {
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid var(--border-subtle);
    text-align: center;
    color: var(--text-muted);
    font-size: 11px;
    font-family: var(--mono);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .footer a { color: var(--text-secondary); }
  .footer a:hover { color: var(--accent); text-decoration: none; }
  .footer .sep { color: var(--border); }
  .sse-indicator {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  /* --- Responsive --- */
  @media (max-width: 680px) {
    .stats { grid-template-columns: repeat(2, 1fr); }
    .header-meta .hide-mobile { display: none; }
    .container { padding: 20px 14px 40px; }
  }
</style>
</head><body>

<div class="header-bar">
  <div class="header-inner">
    <div class="brand">
      <div class="brand-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#0c1017" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></div>
      <span class="brand-name">sentry-autofix</span>
    </div>
    <div class="header-meta">
      <span class="hide-mobile">${esc(process.env.ANTHROPIC_MODEL || "qwen2.5-coder:14b")}</span>
      <span class="hide-mobile">up ${uptime}</span>
      <span><span class="live-dot off" id="sse-dot"></span> sse</span>
    </div>
  </div>
</div>

<div class="container">
  <div class="stats">
    <div class="stat s-total">
      <div class="stat-label">Total Issues</div>
      <div class="stat-num">${stats.total}</div>
    </div>
    <div class="stat s-ok">
      <div class="stat-label">PRs Opened</div>
      <div class="stat-num">${statusCounts.pr_open || 0}</div>
    </div>
    <div class="stat s-warn">
      <div class="stat-label">In Progress</div>
      <div class="stat-num">${statusCounts.in_progress || 0}</div>
    </div>
    <div class="stat s-err">
      <div class="stat-label">Failed</div>
      <div class="stat-num">${(statusCounts.failed || 0) + (statusCounts.error || 0)}</div>
    </div>
  </div>

  <div class="section-hdr">
    <h2>Issues <span class="count">${stats.total}</span></h2>
  </div>
  <div class="tbl-wrap">
  <table>
    <thead><tr><th>Status</th><th>Title</th><th>Project</th><th>Repo</th><th>Tries</th><th>PR</th><th></th></tr></thead>
    <tbody>${issueRows}</tbody>
  </table>
  </div>

  <div class="section-hdr">
    <h2>Projects <span class="count">${projectSlugs.length}</span></h2>
    <button class="btn btn-primary" onclick="showAddModal()">+ Add Project</button>
  </div>
  <div class="tbl-wrap">
  <table>
    <thead><tr><th>Sentry Slug</th><th>Repository</th><th>Branch</th><th>Language</th><th>Framework</th><th></th></tr></thead>
    <tbody>${projectRows}</tbody>
  </table>
  </div>

  <div class="footer">
    <span class="sse-indicator"><span class="live-dot off" id="sse-dot-footer"></span> live</span>
    <span class="sep">|</span>
    <a href="/api/status">api</a>
    <span class="sep">|</span>
    <a href="/api/projects">projects</a>
    <span class="sep">|</span>
    <a href="/health">health</a>
  </div>
</div>

<!-- Project Add/Edit Modal -->
<div class="overlay" id="modal-overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <h3 id="modal-title">Add Project</h3>
    <form id="project-form" onsubmit="submitProject(event)">
      <input type="hidden" id="form-mode" value="add">
      <label for="f-slug">Sentry Project Slug</label>
      <input type="text" id="f-slug" required placeholder="my-sentry-project">
      <label for="f-repo">Repository (org/repo)</label>
      <input type="text" id="f-repo" required placeholder="my-org/my-repo">
      <label for="f-branch">Branch</label>
      <input type="text" id="f-branch" required placeholder="main" value="main">
      <label for="f-lang">Language</label>
      <input type="text" id="f-lang" required placeholder="javascript">
      <label for="f-fw">Framework</label>
      <input type="text" id="f-fw" required placeholder="react">
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>
  </div>
</div>

<!-- Log Viewer Modal -->
<div class="overlay" id="log-overlay" onclick="if(event.target===this)closeLogs()">
  <div class="log-modal">
    <div class="log-header">
      <h3 id="log-title">Logs</h3>
      <button class="close-x" onclick="closeLogs()">&times;</button>
    </div>
    <div class="log-output" id="log-output"><div class="log-empty">Loading logs...</div></div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const STATUS_COLORS={pending:'s-pending',in_progress:'s-in_progress',pr_open:'s-pr_open',fixed:'s-fixed',failed:'s-failed',error:'s-error'};

// --- Dashboard SSE ---
let dashSSE;
function setSSE(on){
  document.getElementById('sse-dot').className='live-dot'+(on?'':' off');
  document.getElementById('sse-dot-footer').className='live-dot'+(on?'':' off');
}
function connectDashSSE(){
  dashSSE=new EventSource('/api/events');
  dashSSE.onopen=()=>setSSE(true);
  dashSSE.onerror=()=>setSSE(false);
  dashSSE.onmessage=(e)=>{
    try{
      const d=JSON.parse(e.data);
      if(d.type==='status'){
        const row=document.querySelector('tr[data-issue-id="'+d.issueId+'"]');
        if(row){
          const badge=row.querySelector('.status-badge');
          if(badge){
            badge.className='status-badge '+(STATUS_COLORS[d.status]||'s-pending');
            badge.textContent=d.status.replace('_',' ');
          }
          if(d.prUrl){
            const prCell=row.querySelector('.pr-cell');
            if(prCell)prCell.innerHTML='<a href="'+d.prUrl+'" target="_blank">View PR</a>';
          }
        }else{
          location.reload();
        }
      }
    }catch{}
  };
}
connectDashSSE();

// --- Log Viewer ---
let logSSE=null;
function openLogs(issueId,title){
  document.getElementById('log-title').textContent=title;
  document.getElementById('log-output').innerHTML='<div class="log-empty">Connecting...</div>';
  document.getElementById('log-overlay').classList.add('active');

  if(logSSE)logSSE.close();
  logSSE=new EventSource('/api/issues/'+encodeURIComponent(issueId)+'/logs');
  let hasLogs=false;

  logSSE.onmessage=(e)=>{
    try{
      const d=JSON.parse(e.data);
      if(d.type==='history_end'){
        if(!hasLogs)document.getElementById('log-output').innerHTML='<div class="log-empty">No logs recorded yet.</div>';
        return;
      }
      if(d.type!=='log')return;
      if(!hasLogs){document.getElementById('log-output').innerHTML='';hasLogs=true}
      const out=document.getElementById('log-output');
      const line=document.createElement('div');
      line.className='log-line';
      const ts=d.timestamp?d.timestamp.slice(11,19):'';
      line.innerHTML='<span class="ts">'+esc(ts)+'</span><span class="src '+esc(d.source)+'">'+esc(d.source)+'</span><span class="msg">'+esc(d.message)+'</span>';
      out.appendChild(line);
      out.scrollTop=out.scrollHeight;
    }catch{}
  };
  logSSE.onerror=()=>{};
}
function closeLogs(){
  document.getElementById('log-overlay').classList.remove('active');
  if(logSSE){logSSE.close();logSSE=null}
}

// --- Project CRUD ---
function showAddModal(){
  document.getElementById('modal-title').textContent='Add Project';
  document.getElementById('form-mode').value='add';
  document.getElementById('f-slug').value='';
  document.getElementById('f-slug').disabled=false;
  document.getElementById('f-repo').value='';
  document.getElementById('f-branch').value='main';
  document.getElementById('f-lang').value='';
  document.getElementById('f-fw').value='';
  document.getElementById('modal-overlay').classList.add('active');
}
function showEditModal(slug){
  fetch('/api/projects').then(r=>r.json()).then(data=>{
    const p=data.projects[slug];
    if(!p)return showToast('Project not found','error');
    document.getElementById('modal-title').textContent='Edit Project';
    document.getElementById('form-mode').value='edit';
    document.getElementById('f-slug').value=slug;
    document.getElementById('f-slug').disabled=true;
    document.getElementById('f-repo').value=p.repo;
    document.getElementById('f-branch').value=p.branch;
    document.getElementById('f-lang').value=p.language;
    document.getElementById('f-fw').value=p.framework;
    document.getElementById('modal-overlay').classList.add('active');
  });
}
function closeModal(){
  document.getElementById('modal-overlay').classList.remove('active');
}
function submitProject(e){
  e.preventDefault();
  const mode=document.getElementById('form-mode').value;
  const slug=document.getElementById('f-slug').value.trim();
  const body={repo:document.getElementById('f-repo').value.trim(),branch:document.getElementById('f-branch').value.trim(),language:document.getElementById('f-lang').value.trim(),framework:document.getElementById('f-fw').value.trim()};
  let url,method;
  if(mode==='add'){
    url='/api/projects';method='POST';body.sentryProjectSlug=slug;
  }else{
    url='/api/projects/'+encodeURIComponent(slug);method='PUT';
  }
  fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>{
    if(!r.ok)return r.json().then(d=>{throw new Error(d.error||'Request failed')});
    return r.json();
  }).then(()=>{
    closeModal();showToast(mode==='add'?'Project added':'Project updated','success');
    setTimeout(()=>location.reload(),600);
  }).catch(err=>showToast(err.message,'error'));
}
function confirmDelete(slug){
  if(!confirm('Delete project "'+slug+'"?'))return;
  fetch('/api/projects/'+encodeURIComponent(slug),{method:'DELETE'}).then(r=>{
    if(!r.ok)return r.json().then(d=>{throw new Error(d.error||'Delete failed')});
    showToast('Project deleted','success');
    setTimeout(()=>location.reload(),600);
  }).catch(err=>showToast(err.message,'error'));
}
function showToast(msg,type){
  const t=document.getElementById('toast');
  t.textContent=msg;t.className='toast show '+type;
  setTimeout(()=>t.classList.remove('show'),3000);
}
function esc(s){
  if(!s)return'';
  const d=document.createElement('div');d.textContent=s;return d.innerHTML;
}
</script>
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
    const projectConfig = getProject(parsed.projectSlug);
    if (!projectConfig) {
      console.log(`[webhook] No config for project "${parsed.projectSlug}", skipping`);
      return res.status(200).json({ ok: true, ignored: true, reason: "unmapped project" });
    }

    // Respond immediately, process async
    res.status(202).json({ ok: true, issueId: parsed.issueId });

    // Enrich issue webhooks with full event data from Sentry API, then process
    (async () => {
      if (resource === "issue" && !parsed.stacktrace) {
        const orgSlug = process.env.SENTRY_ORG_SLUG;
        if (orgSlug) {
          const enrichment = await fetchLatestEvent(orgSlug, parsed.issueId);
          if (enrichment) {
            Object.assign(parsed, enrichment);
            console.log(`[webhook] Enriched issue ${parsed.issueId} with event data (stacktrace: ${!!parsed.stacktrace})`);
          }
        } else {
          console.warn("[webhook] SENTRY_ORG_SLUG not set, cannot enrich issue with event data");
        }
      }
      await onIssue(parsed, projectConfig);
    })().catch((err) => {
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
