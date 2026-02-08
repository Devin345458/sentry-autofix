import express from "express";
import { verifySentrySignature } from "./verify.js";
import { parseEventAlert, parseIssueEvent } from "./parser.js";
import { fetchLatestEvent } from "./sentry-api.js";
import { getAllIssues, getStats, getAllProjects, getProject, createProject, updateProject, deleteProject } from "./db.js";

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

  // Status page
  app.get("/", (_req, res) => {
    const stats = getStats();
    const issues = getAllIssues(50);
    const projects = getAllProjects();
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

    let projectRows = "";
    const projectSlugs = Object.keys(projects);
    if (projectSlugs.length === 0) {
      projectRows = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#6b7280">No project mappings configured. Click "Add Project" to get started.</td></tr>`;
    } else {
      for (const slug of projectSlugs) {
        const p = projects[slug];
        projectRows += `<tr>
          <td>${esc(slug)}</td>
          <td>${esc(p.repo)}</td>
          <td>${esc(p.branch)}</td>
          <td>${esc(p.language)}</td>
          <td>${esc(p.framework)}</td>
          <td>
            <button onclick="showEditModal('${esc(slug)}')" style="background:#334155;color:#e2e8f0;border:1px solid #475569;padding:4px 10px;border-radius:4px;cursor:pointer;margin-right:4px;font-size:12px">Edit</button>
            <button onclick="confirmDelete('${esc(slug)}')" style="background:#7f1d1d;color:#fca5a5;border:1px solid #991b1b;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px">Delete</button>
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
  .section-header{display:flex;justify-content:space-between;align-items:center;margin:32px 0 12px}
  .section-header h2{font-size:18px;color:#f8fafc}
  .btn-add{background:#1d4ed8;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500}
  .btn-add:hover{background:#2563eb}
  .overlay{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:100;justify-content:center;align-items:center}
  .overlay.active{display:flex}
  .modal{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:24px;width:100%;max-width:480px}
  .modal h3{font-size:16px;margin-bottom:16px;color:#f8fafc}
  .modal label{display:block;font-size:12px;color:#94a3b8;margin-bottom:4px;margin-top:12px}
  .modal input{width:100%;padding:8px 12px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-size:14px}
  .modal input:disabled{opacity:.5;cursor:not-allowed}
  .modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}
  .modal-actions button{padding:8px 16px;border-radius:6px;border:none;cursor:pointer;font-size:13px;font-weight:500}
  .btn-cancel{background:#334155;color:#e2e8f0}
  .btn-save{background:#1d4ed8;color:#fff}
  .btn-save:hover{background:#2563eb}
  .toast{position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:8px;color:#fff;font-size:14px;z-index:200;opacity:0;transition:opacity .3s}
  .toast.show{opacity:1}
  .toast.success{background:#065f46}
  .toast.error{background:#991b1b}
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

  <div class="section-header">
    <h2>Project Mappings</h2>
    <button class="btn-add" onclick="showAddModal()">Add Project</button>
  </div>
  <table>
    <thead><tr><th>Sentry Project</th><th>Repository</th><th>Branch</th><th>Language</th><th>Framework</th><th>Actions</th></tr></thead>
    <tbody>${projectRows}</tbody>
  </table>

  <div class="footer">Auto-refreshes every 30s &middot; <a href="/api/status">JSON API</a> &middot; <a href="/api/projects">Projects API</a> &middot; <a href="/health">Health</a></div>
</div>

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
        <button type="button" class="btn-cancel" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn-save">Save</button>
      </div>
    </form>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
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
