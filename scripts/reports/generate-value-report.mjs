#!/usr/bin/env node
/**
 * Generate an AI value report (HTML/PDF) from GitHub project issue data.
 *
 * When to run: At epic close, sprint end, or stakeholder review.
 * Preconditions: GITHUB_TOKEN env var or gh CLI authenticated; .claude/task-tracker.json configured.
 * Side effects: Writes HTML (and optionally PDF) to the output path; no DB writes.
 * Safe to re-run: yes — output files are overwritten.
 *
 * Usage:
 *   node scripts/reports/generate-value-report.mjs
 *     [--title "Report Title"]     custom report heading
 *     [--issues 79,80,81]          filter to specific issue numbers
 *     [--role mid|senior|staff]    engineer level for cost table (default: mid)
 *     [--reading-wpm 180]          overrides config default WPM
 *     [--region national]          region ID from regional-rates.json
 *     [--output ./report]          output base path (no extension)
 *     [--html]                     skip PDF, emit HTML only
 *     [--chat-words N]             additional context words not yet in any issue's Context Length field
 *     [--from YYYY-MM-DD]          only issues closed on or after this date
 *     [--to   YYYY-MM-DD]          only issues closed on or before this date
 *     [--state open|closed|all]    filter by issue state (default: all)
 *     [--project-id PVT_...]       override GitHub Projects V2 node ID (default: from .claude/task-tracker.json)
 *
 * Project and owner are read from .claude/task-tracker.json (set by npx claude-gh-task-manager init).
 * Defaults are loaded from value-report-config.json next to this script.
 *
 * PDF output requires puppeteer: npm install --save-dev puppeteer
 * Without puppeteer, HTML is saved and you can print-to-PDF from Chrome.
 */
//
// Measured fields read from GitHub Projects:
//   "Actual Session Time"  — minutes of active AI-assisted session time
//   "Context Length"       — words of *reader-visible* chat context
//                            (text actually rendered in the chat window).
//                            EXCLUDES system-reminders, skill bodies,
//                            slash-command scaffolding, tool results, hook
//                            injections, and other non-rendered payload.
//
// Calculated:
//   Engaged Hours = (session_minutes / 60) + (context_words / reading_wpm / 60)
//   Estimated Acceleration = Estimate / Engaged Hours
//

import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const RATES = JSON.parse(readFileSync(path.join(__dir, 'regional-rates.json'), 'utf8'));

// Load value-report-config.json defaults
const CONFIG_PATH = path.join(__dir, 'value-report-config.json');
const fileCfg = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) : {};

// Load task-tracker project config to get projectId and repo
const projectRoot = process.env.CLAUDE_PROJECT_DIR
  ?? execSync('git rev-parse --show-toplevel 2>/dev/null || echo ""', { encoding: 'utf8' }).trim()
  ?? process.cwd();
const ttConfigPath = path.join(projectRoot, '.claude', 'task-tracker.json');
const ttCfg = existsSync(ttConfigPath) ? JSON.parse(readFileSync(ttConfigPath, 'utf8')) : {};

const [ttOwner] = (ttCfg.repo ?? '').split('/');

const argv = process.argv.slice(2);
const flag = (f, def = null) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : def; };
const has  = f => argv.includes(f);

const cfg = {
  projectId:     flag('--project-id', ttCfg.projectId ?? ''),
  owner:         ttOwner || null,
  repo:          ttCfg.repo ?? '',
  title:         flag('--title', 'AI Engineering Value Report'),
  output:        flag('--output') ?? path.join(fileCfg.outputDir ?? './reports', 'value-report'),
  issues:        flag('--issues')?.split(',').map(Number) ?? null,
  role:          flag('--role')         ?? fileCfg.role                   ?? 'mid',
  soloRole:      flag('--solo-role')    ?? fileCfg.soloRole               ?? 'senior',
  seniorFactor:  +(flag('--senior-factor') ?? fileCfg.seniorEfficiencyFactor ?? 0.70),
  region:        flag('--region')       ?? fileCfg.region                 ?? 'national',
  focusHours:    +(flag('--focus-hours') ?? fileCfg.focusHoursPerDay ?? RATES.workday?.focusedCodingHoursPerDay ?? 5),
  readingWpm:    +(flag('--reading-wpm') ?? fileCfg.readingWpm ?? 180),
  chatWords:     +(flag('--chat-words') ?? 0),
  fromDate:      flag('--from') ? new Date(flag('--from') + 'T00:00:00') : null,
  toDate:        flag('--to')   ? new Date(flag('--to')   + 'T23:59:59.999') : null,
  state:         (flag('--state') ?? 'all').toLowerCase(),
  htmlOnly:      has('--html'),
};

if (!cfg.projectId) {
  console.error('No projectId found. Run: npx claude-gh-task-manager init');
  process.exit(1);
}
if (cfg.fromDate && isNaN(cfg.fromDate)) {
  console.error('Invalid --from date. Expected YYYY-MM-DD.'); process.exit(1);
}
if (cfg.toDate && isNaN(cfg.toDate)) {
  console.error('Invalid --to date. Expected YYYY-MM-DD.'); process.exit(1);
}
if (cfg.state === 'open' && (cfg.fromDate || cfg.toDate)) {
  console.warn('Warning: --from/--to filter on closedAt has no effect when --state open is set (open issues have no closedAt). Ignoring date filters.');
  cfg.fromDate = null;
  cfg.toDate   = null;
}

const GH_TOKEN = execSync('gh auth token', { encoding: 'utf8' }).trim();

async function gql(query) {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(j.errors.map(e => e.message).join('; '));
  return j.data;
}

async function fetchProject() {
  let allItems = [];
  let cursor = null;
  let projectTitle = '';

  for (let page = 0; page < 10; page++) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const data = await gql(`{
      node(id: "${cfg.projectId}") {
        ... on ProjectV2 {
          title
          items(first: 100${after}) {
            pageInfo { hasNextPage endCursor }
            nodes {
              content {
                ... on Issue {
                  number title state url body
                  createdAt closedAt
                }
              }
              fieldValues(first: 20) {
                nodes {
                  ... on ProjectV2ItemFieldNumberValue {
                    number
                    field { ... on ProjectV2Field { name } }
                  }
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field { ... on ProjectV2SingleSelectField { name } }
                  }
                }
              }
            }
          }
        }
      }
    }`);
    const pv2 = data.node;
    if (!pv2) throw new Error(`Project not found: ${cfg.projectId}`);
    projectTitle = pv2.title;
    allItems = allItems.concat(pv2.items.nodes);
    if (!pv2.items.pageInfo.hasNextPage) break;
    cursor = pv2.items.pageInfo.endCursor;
  }

  return { title: projectTitle, items: allItems };
}

function fields(item) {
  const out = {};
  for (const fv of item.fieldValues.nodes) {
    if (!fv.field?.name) continue;
    if (fv.number != null) out[fv.field.name] = fv.number;
    else if (fv.name   != null) out[fv.field.name] = fv.name;
  }
  return out;
}

function processItems(raw) {
  return raw
    .filter(n => n.content?.number)
    .map(n => {
      const f = fields(n);
      return {
        number:       n.content.number,
        title:        n.content.title,
        state:        n.content.state,
        url:          n.content.url,
        body:         n.content.body ?? '',
        createdAt:    n.content.createdAt ? new Date(n.content.createdAt) : null,
        closedAt:     n.content.closedAt  ? new Date(n.content.closedAt)  : null,
        estimate:     f['Estimate']            ?? null,
        sessionMin:   f['Actual Session Time'] ?? null,
        contextWords: f['Context Length']      ?? null,
        status:       f['Status']              ?? null,
      };
    })
    .filter(i => {
      // --issues overrides all other filters
      if (cfg.issues) return cfg.issues.includes(i.number);
      // must have at least one data field
      if (i.estimate == null && i.sessionMin == null && i.contextWords == null) return false;
      // --state filter
      if (cfg.state === 'closed' && i.state !== 'CLOSED') return false;
      if (cfg.state === 'open'   && i.state !== 'OPEN')   return false;
      // --from / --to filter: applies to closedAt; open issues have no closedAt
      if (cfg.fromDate || cfg.toDate) {
        if (i.closedAt == null) return false;
        if (cfg.fromDate && i.closedAt < cfg.fromDate) return false;
        if (cfg.toDate   && i.closedAt > cfg.toDate)   return false;
      }
      return true;
    })
    .sort((a, b) => a.number - b.number);
}

function engagedHours(sessionMin, contextWords) {
  const sessionH  = (sessionMin   ?? 0) / 60;
  const readingH  = (contextWords ?? 0) / cfg.readingWpm / 60;
  return sessionH + readingH;
}

function summary(items) {
  const totalEst          = items.reduce((s, i) => s + (i.estimate     ?? 0), 0);
  const totalSessionMin   = items.reduce((s, i) => s + (i.sessionMin   ?? 0), 0);
  const totalContextWords = items.reduce((s, i) => s + (i.contextWords ?? 0) , 0) + cfg.chatWords;
  const totalEngaged      = engagedHours(totalSessionMin, totalContextWords);
  const withEst           = items.filter(i => i.estimate     != null).length;
  const withSession       = items.filter(i => i.sessionMin   != null).length;
  const withContext       = items.filter(i => i.contextWords != null).length;
  const accel             = totalEst > 0 && totalEngaged > 0
    ? (totalEst / totalEngaged).toFixed(1)
    : null;
  return {
    totalEst, totalSessionMin, totalContextWords, totalEngaged,
    withEst, withSession, withContext, accel,
  };
}

const $   = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const wd  = h => h > 0 ? (h / 8).toFixed(1) : '—';
const fmtMin = h => {
  const m = Math.round(h * 60);
  const hh = Math.floor(m / 60), mm = m % 60;
  return hh > 0 && mm > 0 ? `${hh}h ${mm}min` : hh > 0 ? `${hh}h` : `${m} min`;
};

function buildHtml(project, items, s) {
  const now        = new Date().toLocaleDateString('en-US', { dateStyle: 'long' });
  const filterParts = [];
  if (cfg.state !== 'all') filterParts.push(`State: ${cfg.state}`);
  if (cfg.fromDate) filterParts.push(`From: ${cfg.fromDate.toLocaleDateString('en-US', { dateStyle: 'medium' })}`);
  if (cfg.toDate)   filterParts.push(`To: ${cfg.toDate.toLocaleDateString('en-US', { dateStyle: 'medium' })}`);
  const filterLabel = filterParts.length ? filterParts.join(' · ') : null;
  const reg        = RATES.regions.find(r => r.id === cfg.region)
                     ?? RATES.regions.find(r => r.id === 'national')
                     ?? RATES.regions.at(-1);
  const natMid     = reg.mid;
  const natSr      = reg[cfg.soloRole] ?? reg.senior;
  const focusPerWeek = cfg.focusHours * 5;

  const baselineCost   = s.totalEst * natMid;
  const soloHours      = s.totalEst * cfg.seniorFactor;
  const soloCost       = soloHours * natSr;
  const enterpriseCost = (s.totalEst / 0.50) * natSr * 1.30;

  const fmtDuration = w => w <= 0 ? '—' : w.toFixed(1) + ' wks';
  const estDuration  = fmtDuration(s.totalEst / focusPerWeek);
  const entHours     = s.totalEst / 0.50;

  const readingH    = s.totalContextWords / cfg.readingWpm / 60;
  const readingCost = readingH * natMid;

  const costRows = RATES.regions.map(r => {
    const rate    = r[cfg.role] ?? r.mid;
    const cEst    = s.totalEst * rate;
    const cEng    = s.totalEngaged > 0 ? s.totalEngaged * rate : null;
    const savings = cEng != null ? cEst - cEng : null;
    return `<tr>
      <td>${r.label}</td>
      <td class="num">${$(rate)}/hr</td>
      <td class="num">${$(cEst)}</td>
      <td class="num">${cEng != null ? $(cEng) : '—'}</td>
      <td class="num ${savings == null ? '' : savings > 0 ? 'good' : savings < 0 ? 'over' : ''}">${savings != null ? $(savings) : '—'}</td>
    </tr>`;
  }).join('\n');

  const issueRows = items.map(i => {
    const eh         = engagedHours(i.sessionMin, i.contextWords);
    const ratio      = i.estimate != null && eh > 0 ? (i.estimate / eh).toFixed(1) : null;
    const ratioClass = ratio == null ? '' : +ratio >= 1.5 ? 'good' : +ratio < 0.8 ? 'over' : 'warn';
    return `<tr>
      <td><a href="${i.url}" target="_blank">#${i.number}</a></td>
      <td class="title-cell" title="${i.title.replace(/"/g, '&quot;')}">${i.title}</td>
      <td class="num">${i.estimate ?? '—'}</td>
      <td class="num">${i.sessionMin != null ? i.sessionMin + ' min' : '—'}</td>
      <td class="num">${i.contextWords != null ? i.contextWords.toLocaleString() : '—'}</td>
      <td class="num">${eh > 0 ? fmtMin(eh) : '—'}</td>
      <td class="num ${ratioClass}">${ratio != null ? ratio + '×' : '—'}</td>
      <td class="${i.state === 'CLOSED' ? 'closed' : 'open'}">${i.status ?? (i.state === 'CLOSED' ? 'Done' : 'Open')}</td>
    </tr>`;
  }).join('\n');

  const totalEh = s.totalEngaged > 0 ? fmtMin(s.totalEngaged) : '—';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${cfg.title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:.875rem;color:#0f172a;background:#f8fafc}
.page{max-width:1300px;margin:0 auto;padding:1.25rem 1.5rem}
.rh{background:#0f172a;color:#fff;padding:1rem 1.5rem;border-radius:.5rem;margin-bottom:1rem}
.rh h1{font-size:1.25rem;font-weight:700;margin-bottom:.25rem}
.rh .meta{color:#94a3b8;font-size:.75rem}
.rh .meta span{margin-right:1.25rem}
.crows-wrap{display:flex;flex-direction:column;gap:.3rem;margin-bottom:1rem}
.crow-group{border-radius:.375rem;overflow:hidden;border:1px solid #e2e8f0}
.crow-label{font-size:.625rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:.3rem .875rem;display:flex;align-items:baseline;gap:.5rem}
.crow-label span{font-weight:400;text-transform:none;letter-spacing:0;color:#94a3b8;font-size:.625rem}
.crow-group.baseline .crow-label{background:#1e293b;color:#94a3b8}
.crow-group.solo .crow-label{background:#1e3a5f;color:#93c5fd}
.crow-group.enterprise .crow-label{background:#3b1515;color:#fca5a5}
.crow-group.ai .crow-label{background:#1a1a3e;color:#a5b4fc}
.crow-group.value .crow-label{background:#052e16;color:#86efac}
.crow-cards{display:grid;grid-template-columns:repeat(4,1fr);background:#fff}
.crow-group.value .crow-cards{grid-template-columns:repeat(3,1fr)}
.crow-cards.ai5{grid-template-columns:repeat(5,1fr)}
.card{padding:.5rem .875rem;border-right:1px solid #f1f5f9}
.card:last-child{border-right:none}
.card .lbl{font-size:.625rem;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.125rem}
.card .val{font-size:1.25rem;font-weight:700;color:#0f172a;line-height:1.1}
.card .val.good{color:#16a34a}.card .val.accent{color:#6366f1}.card .val.sm{font-size:1rem}
.card .sub{font-size:.625rem;color:#94a3b8;margin-top:.125rem}
.vr-card .val{font-size:1.5rem}
.sec{background:#fff;border-radius:.5rem;border:1px solid #e2e8f0;margin-bottom:1.25rem;overflow:hidden}
.sec h2{background:#1e293b;color:#fff;padding:.75rem 1.25rem;font-size:.9375rem;font-weight:600}
.sec-body{padding:1.25rem}
.note{font-size:.6875rem;color:#64748b;margin-bottom:.875rem}
table{width:100%;border-collapse:collapse;font-size:.75rem}
th{background:#f1f5f9;color:#475569;font-weight:600;text-align:left;padding:.4rem .625rem;border-bottom:2px solid #e2e8f0;white-space:nowrap}
td{padding:.35rem .625rem;border-bottom:1px solid #f1f5f9;vertical-align:middle}
.issue-table{table-layout:fixed}
.issue-table .col-num{width:4%}
.issue-table .col-title{width:34%}
.issue-table .col-est{width:7%}
.issue-table .col-session{width:10%}
.issue-table .col-context{width:11%}
.issue-table .col-engaged{width:10%}
.issue-table .col-accel{width:8%}
.issue-table .col-status{width:11%}
.issue-table td.title-cell{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
tr:last-child td{border-bottom:none}
tr:hover td{background:#f8fafc}
tfoot td{background:#f1f5f9;font-weight:700;border-top:2px solid #e2e8f0}
.num{text-align:right;font-variant-numeric:tabular-nums}
td a{color:#6366f1;text-decoration:none;font-weight:600}
td a:hover{text-decoration:underline}
.good{color:#16a34a;font-weight:600}.warn{color:#d97706;font-weight:600}.over{color:#dc2626;font-weight:600}
.closed{color:#16a34a}.open{color:#d97706}
.two{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem}
.col h3{font-size:.8125rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:.875rem;padding-bottom:.5rem;border-bottom:2px solid #e2e8f0}
.col.human h3{color:#ef4444}.col.ai h3{color:#6366f1}
.crow{display:flex;justify-content:space-between;align-items:baseline;padding:.3125rem 0;font-size:.8125rem;border-bottom:1px solid #f8fafc}
.crow .cl{color:#64748b}.crow .cv{font-weight:600}
.vr-row{display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem;margin-top:1.25rem}
.vr{background:#f0fdf4;border:2px solid #16a34a;border-radius:.5rem;padding:1rem 1.5rem;text-align:center}
.vr-num{font-size:2.5rem;font-weight:800;color:#16a34a;line-height:1}
.vr-lbl{font-size:.75rem;color:#166534;margin-top:.25rem}
.vr-na{background:#f8fafc;border-color:#e2e8f0;margin-top:1.25rem}
.vr-na .vr-lbl{color:#94a3b8}
.tg{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem}
.tc h3{font-size:.8125rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin-bottom:.875rem}
.ts{margin-bottom:.75rem}
.ts .tn{font-size:1.875rem;font-weight:700;color:#0f172a}
.ts .tl{font-size:.6875rem;color:#64748b}
.disclaimer{font-size:.625rem;color:#94a3b8;background:#f8fafc;border:1px solid #e2e8f0;border-radius:.375rem;padding:.375rem .75rem;margin-bottom:.75rem;line-height:1.4}
.footer{text-align:center;color:#94a3b8;font-size:.6875rem;margin-top:1.5rem;padding-top:1rem;border-top:1px solid #e2e8f0}
@media print{
  body{background:#fff}
  .page{padding:.25in .35in;max-width:100%}
  .sec,.crow-group{break-inside:avoid}
  .crows-wrap,.two,.tg,.vr-row{break-inside:avoid}
  -webkit-print-color-adjust:exact;print-color-adjust:exact
}
</style>
</head>
<body>
<div class="page">

<div class="rh">
  <h1>${cfg.title}</h1>
  <div class="meta">
    <span>Project: ${project.title}</span>
    <span>Generated: ${now}</span>
    <span>Issues: ${items.length}</span>
    <span>Repo: ${cfg.repo || 'unknown'}</span>
    <span>Role baseline: ${cfg.role}</span>
    <span>Region: ${reg.label}</span>
    ${filterLabel ? `<span style="color:#fbbf24;font-weight:600">Filters: ${filterLabel}</span>` : ''}
  </div>
</div>

<div class="disclaimer">
  <strong>Methodology note:</strong> Estimated acceleration compares pre-execution estimates (mid-level engineer hours) against measured engaged time (session minutes + reading time).
  This is an estimate-based comparison — estimates represent the best guess at the time of planning and may not reflect what a human engineer would have actually taken.
  The comparison is only as accurate as the original estimates. Reading WPM: ${cfg.readingWpm}.
</div>

<div class="crows-wrap">

  <div class="crow-group baseline">
    <div class="crow-label">Budget Baseline <span>Single ${cfg.role}-level engineer · ${reg.label} rate · estimates expressed in ${cfg.role}-level hours</span></div>
    <div class="crow-cards">
      <div class="card"><div class="lbl">Estimated Hours</div><div class="val">${s.totalEst}h</div><div class="sub">${s.withEst} issues scoped</div></div>
      <div class="card"><div class="lbl">Working Days</div><div class="val">${wd(s.totalEst)}</div><div class="sub">8 hrs/day</div></div>
      <div class="card"><div class="lbl">Calendar Weeks</div><div class="val sm">${estDuration}</div><div class="sub">${cfg.focusHours} focused hrs/day · ${focusPerWeek} hrs/wk</div></div>
      <div class="card"><div class="lbl">Estimated Cost</div><div class="val sm">${$(baselineCost)}</div><div class="sub">@ ${$(natMid)}/hr ${cfg.role}-level · ${reg.label}</div></div>
    </div>
  </div>

  <div class="crow-group solo">
    <div class="crow-label">Solo ${cfg.soloRole.charAt(0).toUpperCase() + cfg.soloRole.slice(1)} Engineer <span>${Math.round(cfg.seniorFactor * 100)}% efficiency factor applied to ${cfg.role}-level estimate · ${reg.label} rate</span></div>
    <div class="crow-cards">
      <div class="card"><div class="lbl">Adjusted Hours</div><div class="val">${Math.round(soloHours)}h</div><div class="sub">${s.totalEst}h × ${cfg.seniorFactor} efficiency factor</div></div>
      <div class="card"><div class="lbl">Working Days</div><div class="val">${wd(soloHours)}</div><div class="sub">8 hrs/day</div></div>
      <div class="card"><div class="lbl">Calendar Weeks</div><div class="val sm">${fmtDuration(soloHours / focusPerWeek)}</div><div class="sub">${cfg.focusHours} focused hrs/day · ${focusPerWeek} hrs/wk</div></div>
      <div class="card"><div class="lbl">Cost</div><div class="val sm">${$(soloCost)}</div><div class="sub">@ ${$(natSr)}/hr ${cfg.soloRole} · ${reg.label}</div></div>
    </div>
  </div>

  <div class="crow-group enterprise">
    <div class="crow-label">Enterprise Team <span>Large team — same delivery timeline (Brook's Law), paying for coordination overhead + efficiency losses</span></div>
    <div class="crow-cards">
      <div class="card"><div class="lbl">Billed Hours</div><div class="val">${Math.round(entHours)}h</div><div class="sub">50% efficiency → 2× hours paid</div></div>
      <div class="card"><div class="lbl">Working Days</div><div class="val">${wd(entHours)}</div><div class="sub">billed, not delivered</div></div>
      <div class="card"><div class="lbl">Calendar Weeks</div><div class="val sm">${estDuration}</div><div class="sub">more people ≠ faster</div></div>
      <div class="card"><div class="lbl">Cost</div><div class="val sm over">${$(enterpriseCost)}</div><div class="sub">+ 30% coordination overhead</div></div>
    </div>
  </div>

  <div class="crow-group ai">
    <div class="crow-label">AI-Assisted Actual <span>Measured: session time + human reading time. Acceleration vs. pre-execution estimate.</span></div>
    <div class="crow-cards ai5">
      <div class="card"><div class="lbl">Session Time</div><div class="val accent">${s.totalSessionMin > 0 ? fmtMin(s.totalSessionMin / 60) : '—'}</div><div class="sub">${s.totalSessionMin > 0 ? s.totalSessionMin + ' min measured' : s.withSession + ' issues logged'}</div></div>
      <div class="card"><div class="lbl">Context Length</div><div class="val">${s.totalContextWords > 0 ? s.totalContextWords.toLocaleString() : '—'}</div><div class="sub">reader-visible chat words (excludes injections)</div></div>
      <div class="card"><div class="lbl">Human Reading Time</div><div class="val">${readingH > 0 ? fmtMin(readingH) : '—'}</div><div class="sub">${s.totalContextWords.toLocaleString()} words @ ${cfg.readingWpm} wpm · ${$(readingCost)} @ ${$(natMid)}/hr</div></div>
      <div class="card"><div class="lbl">Total Engaged</div><div class="val">${totalEh}</div><div class="sub">session + reading time</div></div>
      <div class="card"><div class="lbl">Est. Acceleration</div><div class="val${s.accel != null ? ' good' : ''}">${s.accel != null ? s.accel + '×' : '—'}</div><div class="sub">estimate ÷ engaged · vs mid-level baseline</div></div>
    </div>
  </div>

  <div class="crow-group value">
    <div class="crow-label">Value Delivered <span>Human-equivalent cost of the scoped work vs. cost of human reading time — the measurable AI-assisted overhead</span></div>
    <div class="crow-cards">
      <div class="card vr-card"><div class="lbl">vs Budget Baseline</div><div class="val good">${readingCost > 0 ? Math.round(baselineCost / readingCost) + '×' : '—'}</div><div class="sub">${$(baselineCost)} scoped ÷ ${$(readingCost)} reading cost</div></div>
      <div class="card vr-card"><div class="lbl">vs Solo ${cfg.soloRole.charAt(0).toUpperCase() + cfg.soloRole.slice(1)} Engineer</div><div class="val good">${readingCost > 0 ? Math.round(soloCost / readingCost) + '×' : '—'}</div><div class="sub">${$(soloCost)} solo ÷ ${$(readingCost)} reading cost</div></div>
      <div class="card vr-card"><div class="lbl">vs Enterprise Team</div><div class="val good">${readingCost > 0 ? Math.round(enterpriseCost / readingCost) + '×' : '—'}</div><div class="sub">${$(enterpriseCost)} enterprise ÷ ${$(readingCost)} reading cost</div></div>
    </div>
  </div>

</div>

<div class="sec">
  <h2>Issue Breakdown</h2>
  <table class="issue-table">
    <colgroup>
      <col class="col-num"><col class="col-title"><col class="col-est">
      <col class="col-session"><col class="col-context"><col class="col-engaged">
      <col class="col-accel"><col class="col-status">
    </colgroup>
    <thead>
      <tr>
        <th>#</th><th>Title</th>
        <th class="num">Est hrs</th>
        <th class="num">Session min</th>
        <th class="num">Context words</th>
        <th class="num">Engaged</th>
        <th class="num">Accel.</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${issueRows}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2">Total (${items.length} issues)</td>
        <td class="num">${s.totalEst}h</td>
        <td class="num">${s.totalSessionMin > 0 ? s.totalSessionMin + ' min' : '—'}</td>
        <td class="num">${s.totalContextWords > 0 ? s.totalContextWords.toLocaleString() : '—'}</td>
        <td class="num">${totalEh}</td>
        <td class="num good">${s.accel != null ? s.accel + '×' : '—'}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>
</div>

<div class="sec">
  <h2>Engineering Cost by US Region</h2>
  <div class="sec-body">
    <p class="note">All rates fully-burdened (salary + benefits + equity + tooling + management overhead). Role: <strong>${cfg.role}</strong>. Adjust with <code>--role senior</code>. "Engaged hours" cost uses total session + reading time as the comparable AI time investment.</p>
    <table>
      <thead>
        <tr>
          <th>Region</th>
          <th class="num">Rate (${cfg.role})</th>
          <th class="num">Cost @ Est Hours (${s.totalEst}h)</th>
          <th class="num">Cost @ Engaged Hours (${totalEh})</th>
          <th class="num">Savings vs Estimate</th>
        </tr>
      </thead>
      <tbody>${costRows}</tbody>
    </table>
  </div>
</div>

<div class="sec">
  <h2>Timeline Analysis</h2>
  <div class="sec-body">
    <div class="tg">
      <div class="tc">
        <h3>Estimated Effort</h3>
        <div class="ts"><div class="tn">${s.totalEst}h</div><div class="tl">total estimated hours (mid-level baseline)</div></div>
        <div class="ts"><div class="tn">${estDuration}</div><div class="tl">calendar weeks @ ${cfg.focusHours} focused hrs/day, ${focusPerWeek} hrs/wk</div></div>
        <div class="ts"><div class="tn">${wd(s.totalEst)} days</div><div class="tl">raw working days (8 hrs/day, no overhead)</div></div>
      </div>
      <div class="tc">
        <h3>Measured / Engaged</h3>
        <div class="ts"><div class="tn">${s.totalSessionMin > 0 ? s.totalSessionMin + ' min' : '—'}</div><div class="tl">active session time (measured)</div></div>
        <div class="ts"><div class="tn">${s.totalContextWords > 0 ? s.totalContextWords.toLocaleString() + ' words' : '—'}</div><div class="tl">context length (measured) · ${readingH > 0 ? fmtMin(readingH) + ' reading' : '—'}</div></div>
        <div class="ts"><div class="tn">${totalEh}</div><div class="tl">total engaged time (session + reading)</div></div>
      </div>
    </div>
  </div>
</div>

<div class="sec">
  <h2>AI vs Human Value Comparison</h2>
  <div class="sec-body">
    <div class="two">
      <div class="col human">
        <h3>Human Engineering Cost (estimated)</h3>
        <div class="crow"><span class="cl">Budget baseline — 1 ${cfg.role} engineer (${s.totalEst}h @ ${$(natMid)}/hr · ${reg.label})</span><span class="cv">${$(baselineCost)}</span></div>
        <div class="crow"><span class="cl">Solo ${cfg.soloRole} engineer (${Math.round(soloHours)}h @ ${$(natSr)}/hr · ${Math.round(cfg.seniorFactor * 100)}% of ${cfg.role}-level estimate)</span><span class="cv">${$(soloCost)}</span></div>
        <div class="crow"><span class="cl">Enterprise team — 50% efficiency + 30% coordination overhead</span><span class="cv over">${$(enterpriseCost)}</span></div>
        <div class="crow" style="margin-top:.625rem"><span class="cl">Calendar weeks (1 engineer)</span><span class="cv">${estDuration}</span></div>
      </div>
      <div class="col ai">
        <h3>AI-Assisted Cost (measured)</h3>
        <div class="crow"><span class="cl">Claude subscription</span><span class="cv">flat rate (not metered)</span></div>
        <div class="crow"><span class="cl">Human reading time (${s.totalContextWords.toLocaleString()} words @ ${cfg.readingWpm} wpm)</span><span class="cv">${$(readingCost)}</span></div>
        <div class="crow" style="font-weight:700"><span class="cl">Measurable human cost</span><span class="cv good">${$(readingCost)}</span></div>
        <div class="crow" style="margin-top:.625rem"><span class="cl">Total session time</span><span class="cv">${s.totalSessionMin > 0 ? fmtMin(s.totalSessionMin / 60) : '—'}</span></div>
        <div class="crow"><span class="cl">Total engaged time</span><span class="cv">${totalEh}</span></div>
        <div class="crow"><span class="cl">Estimated acceleration</span><span class="cv good">${s.accel != null ? s.accel + '×' : '—'}</span></div>
      </div>
    </div>
    ${readingCost > 0 ? `
    <div class="vr-row">
      <div class="vr"><div class="vr-num">${Math.round(baselineCost / readingCost)}×</div><div class="vr-lbl">vs Budget Baseline</div></div>
      <div class="vr"><div class="vr-num">${Math.round(soloCost / readingCost)}×</div><div class="vr-lbl">vs Solo ${cfg.soloRole.charAt(0).toUpperCase() + cfg.soloRole.slice(1)} Engineer</div></div>
      <div class="vr"><div class="vr-num">${Math.round(enterpriseCost / readingCost)}×</div><div class="vr-lbl">vs Enterprise Team</div></div>
    </div>
    <div style="text-align:center;font-size:.6875rem;color:#64748b;margin-top:.5rem">scoped human cost ÷ measurable reading-time cost &nbsp;·&nbsp; acceleration assumes estimates were accurate</div>
    ` : `<div class="vr vr-na" style="margin-top:1.25rem;padding:1rem;text-align:center"><div class="vr-lbl">No context length data yet — set Context Length fields on issues to calculate.</div></div>`}
  </div>
</div>

<div class="footer">
  Generated by generate-value-report.mjs &nbsp;·&nbsp; ${now}
  &nbsp;·&nbsp; Repo: ${cfg.repo || 'unknown'}
  &nbsp;·&nbsp; Region: ${reg.label} &nbsp;·&nbsp; Reading WPM: ${cfg.readingWpm}
</div>

</div>
</body>
</html>`;
}

async function main() {
  console.log(`Fetching project ${cfg.projectId}...`);
  const { title, items: raw } = await fetchProject();
  const items = processItems(raw);

  if (items.length === 0) {
    console.error('No items found with Estimate, Actual Session Time, or Context Length set on the board.');
    process.exit(1);
  }

  console.log(`${items.length} issues found.`);
  const s    = summary(items);
  const html = buildHtml({ title }, items, s);

  const base    = cfg.output.replace(/\.(html?|pdf)$/i, '');
  mkdirSync(path.dirname(base), { recursive: true });
  const htmlOut = base + '.html';
  writeFileSync(htmlOut, html, 'utf8');
  console.log(`HTML → ${htmlOut}`);

  if (cfg.htmlOnly) return;

  let puppeteer;
  try { puppeteer = (await import('puppeteer')).default; } catch {
    console.log('puppeteer not installed — HTML saved. Open in Chrome → File → Print → Save as PDF.');
    return;
  }

  const pdfOut  = base + '.pdf';
  const browser = await puppeteer.launch({ headless: true });
  const page    = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: pdfOut,
    format: 'Letter',
    landscape: true,
    printBackground: true,
    margin: { top: '0.35in', right: '0.4in', bottom: '0.35in', left: '0.4in' },
  });
  await browser.close();
  console.log(`PDF  → ${pdfOut}`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
