#!/usr/bin/env node
/**
 * Generate an AI value report (HTML/PDF) from GitHub project issue data.
 *
 * When to run: At epic close, sprint end, or stakeholder review.
 * Preconditions: GITHUB_TOKEN env var or gh CLI authenticated; .ai-task-manager/task-tracker.json configured.
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
 *     [--chat-words N]             reader-visible chat context words feeding the reading-time / leverage aggregate
 *     [--from YYYY-MM-DD]          only issues closed on or after this date
 *     [--to   YYYY-MM-DD]          only issues closed on or before this date
 *     [--state open|closed|all]    filter by GitHub issue state (default: all)
 *     [--status Done|Backlog|...]  filter by Kanban board status (case-insensitive)
 *     [--project-id PVT_...]       override GitHub Projects V2 node ID (default: from .ai-task-manager/task-tracker.json)
 *
 * Project and owner are read from .ai-task-manager/task-tracker.json (set by npx ai-task-manager init).
 * Defaults are loaded from value-report-config.json next to this script.
 *
 * PDF output requires puppeteer: npm install --save-dev puppeteer
 * Without puppeteer, HTML is saved and you can print-to-PDF from Chrome.
 */
//
// Measured fields read from GitHub Projects:
//   "Session"             — a Text duration string (`DDd HHh MMm SSs`, integer
//                           seconds) since #398/#399, renamed from the legacy
//                           "Session Time" in #786. Resolved (with the
//                           "Session Time" / "Actual Session Time" fallbacks)
//                           and converted to minutes by `readSessionMinutes`
//                           (`./lib/session-field.mjs`).
//
// Context words (words of *reader-visible* chat context — text actually
// rendered in the chat window, EXCLUDING system-reminders, skill bodies,
// slash-command scaffolding, tool results, and hook injections) are no longer
// read from a board field. The "Context Length" board field was retired (#260);
// supply context words via the --chat-words flag instead.
//
// Calculated:
//   Engaged Hours = (session_minutes / 60) + (context_words / reading_wpm / 60)
//   Estimated Acceleration = Estimate / Engaged Hours
//

import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../task-tracker/config.mjs';
import { GH_API_TIMEOUT_MS, GIT_TIMEOUT_MS } from '../task-tracker/lib/process-timeouts.mjs';
import { readSessionMinutes } from './lib/session-field.mjs';
import { readEngagedMinutes, readDurationMinutes, readStartedAt } from './lib/board-fields.mjs';
import {
  buildEstimationReportModel,
  loadEstimationRecordsFromComments,
} from './lib/estimation-records.mjs';
import { wantsHelp, emitSelfDoc, isDirectInvocation } from '../lib/self-doc.mjs';
import { reportAttribution } from './lib/attribution-resolver.mjs';
import { loadTrunkSignals } from './lib/trunk-signals.mjs';
import { bucketRowsByDay, renderDailyChart, extractTimingBody } from './lib/daily-activity.mjs';

const argv = process.argv.slice(2);
if (isDirectInvocation(import.meta.url) && wantsHelp(argv)) {
  emitSelfDoc('value-report');
  process.exit(0);
}

const __dir = path.dirname(fileURLToPath(import.meta.url));
const RATES = JSON.parse(readFileSync(path.join(__dir, 'regional-rates.json'), 'utf8'));

// Load value-report-config.json defaults
const CONFIG_PATH = path.join(__dir, 'value-report-config.json');
const fileCfg = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) : {};

// Load task-tracker project config to get projectId and repo
const projectRoot = process.env.AI_TASK_MANAGER_PROJECT_DIR ?? process.env.CLAUDE_PROJECT_DIR
  ?? execSync('git rev-parse --show-toplevel 2>/dev/null || echo ""', { encoding: 'utf8', timeout: GIT_TIMEOUT_MS }).trim()
  ?? process.cwd();
const ttCfg = loadConfig({
  projectPath: path.join(projectRoot, '.ai-task-manager', 'task-tracker.json'),
  legacyProjectPath: path.join(projectRoot, '.claude', 'task-tracker.json'),
});

const flag = (f, def = null) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : def; };
const has  = f => argv.includes(f);

const repoFlag = flag('--repo');
const resolvedRepo = repoFlag ?? ttCfg.repo ?? '';
const [resolvedOwner] = resolvedRepo.split('/');

const cfg = {
  projectId:     flag('--project-id') ?? ttCfg.projectId ?? '',
  owner:         resolvedOwner || null,
  repo:          resolvedRepo,
  title:         flag('--title', 'AI Engineering Value Report'),
  output:        flag('--output') ?? path.join(fileCfg.outputDir ?? './reports', 'value-report'),
  issues:        flag('--issues')?.split(',').map(Number) ?? null,
  role:          flag('--role')         ?? fileCfg.role                   ?? 'mid',
  soloRole:      flag('--solo-role')    ?? fileCfg.soloRole               ?? 'senior',
  seniorFactor:  +(flag('--senior-factor') ?? fileCfg.seniorEfficiencyFactor ?? 0.60),
  region:        flag('--region')       ?? fileCfg.region                 ?? 'national',
  focusHours:    +(flag('--focus-hours') ?? fileCfg.focusHoursPerDay ?? RATES.workday?.focusedCodingHoursPerDay ?? 5),
  readingWpm:    +(flag('--reading-wpm') ?? fileCfg.readingWpm ?? 180),
  readingOverlap: +(flag('--reading-overlap') ?? fileCfg.readingOverlapFactor ?? 0.50),
  chatWords:     +(flag('--chat-words') ?? 0),
  fromDate:      flag('--from') ? new Date(flag('--from') + 'T00:00:00') : null,
  toDate:        flag('--to')   ? new Date(flag('--to')   + 'T23:59:59.999') : null,
  state:         (flag('--state') ?? 'all').toLowerCase(),
  status:        flag('--status') ? flag('--status').toLowerCase() : null,
  trunk:         flag('--trunk') ?? ttCfg.trunkBranch ?? ttCfg.trunk ?? 'trunk',
  htmlOnly:      has('--html'),
};

if (!cfg.projectId) {
  console.error('No projectId found. Run: npx ai-task-manager init');
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

// Resolved lazily so importing this module (e.g. from tests that only exercise
// buildHtml) does not shell out to `gh auth token`, which is unavailable in CI.
let _ghToken = null;
function ghToken() {
  if (_ghToken == null) {
    _ghToken = execSync('gh auth token', { encoding: 'utf8', timeout: GH_API_TIMEOUT_MS }).trim();
  }
  return _ghToken;
}

async function gql(query) {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ghToken()}`, 'Content-Type': 'application/json' },
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
                  number title state stateReason url body
                  createdAt closedAt
                  parent { number }
                  comments(first: 100) {
                    nodes {
                      __typename
                      id
                      body
                      updatedAt
                      issue { number repository { nameWithOwner } }
                    }
                    pageInfo { hasNextPage }
                  }
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
                  ... on ProjectV2ItemFieldTextValue {
                    text
                    field { ... on ProjectV2Field { name } }
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
    else if (fv.text   != null) out[fv.field.name] = fv.text;
  }
  return out;
}

function parseStartInfo(comments) {
  for (const c of (comments ?? [])) {
    if (!c.body?.includes('⏱ Timing Log')) continue;
    for (const line of c.body.split('\n')) {
      const cols = line.split('|').map(s => s.trim()).filter(Boolean);
      if (cols.length < 2) continue;
      const [ts, event, , , , , desc] = cols;
      if (event === 'start' && /^\d{4}-\d{2}-\d{2}/.test(ts)) {
        const role = ['agent', 'orchestrator', 'solo'].find(r => (desc ?? '').toLowerCase().includes(r)) ?? 'solo';
        return { startedAt: new Date(ts), role };
      }
    }
  }
  return { startedAt: null, role: 'solo' };
}

// `attribution` (optional) = { trunkTokens, trunkShas } from loadTrunkSignals().
// When supplied, the include-filter consumes the three-signal resolver (#782):
// an issue that the resolver marks `attributed` is admitted even if it carries
// no board data field, and an issue the resolver marks `dead` is dropped.
function processItems(raw, attribution = null) {
  return raw
    .filter(n => n.content?.number)
    .map(n => {
      const f = fields(n);
      return {
        number:       n.content.number,
        title:        n.content.title,
        state:        n.content.state,
        stateReason:  n.content.stateReason ?? null,
        url:          n.content.url,
        body:         n.content.body ?? '',
        createdAt:    n.content.createdAt ? new Date(n.content.createdAt) : null,
        closedAt:     n.content.closedAt  ? new Date(n.content.closedAt)  : null,
        // #789 — start DATE comes from the board `Started` field, not the timing
        // log. Role still derives from the timing-log description. An absent
        // `Started` degrades to null (renders `—`); it never throws.
        startedAt:    readStartedAt(f),
        role:         parseStartInfo(n.content.comments?.nodes).role,
        timingBody:   extractTimingBody(n.content.comments?.nodes),
        comments:     n.content.comments?.nodes ?? [],
        commentsComplete: n.content.comments?.pageInfo?.hasNextPage !== true,
        estimate:     f['Estimate']            ?? null,
        sessionMin:   readSessionMinutes(f),
        // #789 — Engaged/Review/Plan read straight from the board's Text-duration
        // fields (minutes). Review/Plan are best-effort: null when the field is
        // absent, 0 when present-but-zero.
        engagedMin:   readEngagedMinutes(f),
        reviewMin:    readDurationMinutes(f, 'Review'),
        planMin:      readDurationMinutes(f, 'Plan'),
        // The board "Context Length" field was retired (#260). Per-item context
        // words are no longer sourced from the board; the report's reading-time /
        // leverage aggregate is fed by the --chat-words flag instead.
        contextWords: null,
        status:       f['Status']              ?? null,
        parentNumber: n.content.parent?.number ?? null,
      };
    })
    .filter(i => {
      // --issues overrides all other filters
      if (cfg.issues) return cfg.issues.includes(i.number);
      // Three-signal attribution (#782): drop dead issues outright; admit
      // attributed issues even when they lack a board data field.
      const attr = attribution ? reportAttribution(i, attribution) : null;
      if (attr?.dead) return false;
      // must have at least one data field (unless attribution vouches for it)
      const hasEstimationEvidence = i.comments.some((comment) =>
        /<!--\s*aitm-record/i.test(comment?.body ?? '')
      );
      if (
        i.estimate == null &&
        i.sessionMin == null &&
        i.contextWords == null &&
        !attr?.attributed &&
        !hasEstimationEvidence
      ) return false;
      // --state filter (GitHub issue state: open/closed)
      if (cfg.state === 'closed' && i.state !== 'CLOSED') return false;
      if (cfg.state === 'open'   && i.state !== 'OPEN')   return false;
      // --status filter (Kanban board status: Done, Backlog, In Progress, etc.)
      if (cfg.status && (i.status ?? '').toLowerCase() !== cfg.status) return false;
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

function buildHierarchy(items) {
  const byNumber = new Map(items.map(i => [i.number, i]));
  const childrenMap = new Map();
  for (const item of items) {
    if (item.parentNumber != null && byNumber.has(item.parentNumber)) {
      if (!childrenMap.has(item.parentNumber)) childrenMap.set(item.parentNumber, []);
      childrenMap.get(item.parentNumber).push(item);
    }
  }
  const childNumbers = new Set([...childrenMap.values()].flat().map(c => c.number));
  return items
    .filter(i => !childNumbers.has(i.number))
    .map(i => ({ item: i, children: (childrenMap.get(i.number) ?? []).sort((a, b) => a.number - b.number) }));
}

function rollupVal(own, children, key) {
  const vals = [own, ...children.map(c => c[key])].filter(v => v != null);
  return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) : null;
}

function engagedHours(sessionMin, contextWords) {
  const sessionH  = (sessionMin   ?? 0) / 60;
  const readingH  = (contextWords ?? 0) / cfg.readingWpm / 60;
  // reading time partially overlaps active session (waiting for AI, reading while working)
  return sessionH + readingH * cfg.readingOverlap;
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
  // Human cost = orchestrator + solo sessions only (agent session times are parallel AI work)
  const humanItems        = items.filter(i => i.role === 'orchestrator' || i.role === 'solo');
  const humanSessionMin   = humanItems.reduce((s, i) => s + (i.sessionMin   ?? 0), 0);
  const humanContextWords = humanItems.reduce((s, i) => s + (i.contextWords ?? 0), 0);
  const humanEngaged      = engagedHours(humanSessionMin, humanContextWords);
  const humanLeverage     = totalEst > 0 && humanEngaged > 0
    ? (totalEst / humanEngaged).toFixed(1)
    : null;
  return {
    totalEst, totalSessionMin, totalContextWords, totalEngaged,
    withEst, withSession, withContext, accel,
    humanSessionMin, humanContextWords, humanEngaged, humanLeverage,
  };
}

const $   = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const n   = v => Math.round(v).toLocaleString('en-US');
const wd  = h => h > 0 ? (h / 8).toFixed(1) : '—';
const fmtMin = h => {
  const m = Math.round(h * 60);
  const hh = Math.floor(m / 60), mm = m % 60;
  return hh > 0 && mm > 0 ? `${hh}h ${mm}min` : hh > 0 ? `${hh}h` : `${m} min`;
};
const fmtMinLong = (h, dayHours = 8) => {
  const m      = Math.round(h * 60);
  const dayMin = dayHours * 60;
  const d      = Math.floor(m / dayMin), rem = m % dayMin;
  const hh     = Math.floor(rem / 60), mm = rem % 60;
  const parts  = [];
  if (d  > 0) parts.push(`${d}d`);
  if (hh > 0) parts.push(`${hh}h`);
  if (mm > 0) parts.push(`${mm}min`);
  return parts.length ? parts.join(' ') : '0 min';
};

export function buildHtml(project, items, s, estimationModel = null) {
  const now        = new Date().toLocaleDateString('en-US', { dateStyle: 'long' });
  const filterParts = [];
  if (cfg.state !== 'all') filterParts.push(`State: ${cfg.state}`);
  if (cfg.status)          filterParts.push(`Status: ${cfg.status}`);
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

  const fmtDuration = w => w <= 0 ? '—' : Math.ceil(w) + ' wks';
  const estDuration  = fmtDuration(s.totalEst / focusPerWeek);
  const humanWeeks   = s.totalEst / focusPerWeek;
  const aiWeeks      = s.totalEngaged / 30;
  const calAccel     = s.totalEngaged > 0 && aiWeeks > 0 ? Math.round(humanWeeks / aiWeeks) : null;
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

  const escAttr = s => s.replace(/"/g, '&quot;');
  const escHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmtEst  = h => h == null ? '—' : h < 1 ? Math.round(h * 60) + ' min' : Number.isInteger(h) ? h + 'h' : h + 'h';
  const fmtSigned = h => h == null ? '—' : `${h >= 0 ? '+' : ''}${Number(h.toFixed(2))}h`;
  const fmtPct = value => value == null ? '—' : `${Math.round(value * 100)}%`;

  function renderRow(i, ru, cls) {
    const estimation = estimationModel?.rowsByIssue?.get(i.number) ?? null;
    const ratioNum   = estimation?.acceleration ?? null;
    const ratioClass = ratioNum == null ? '' : ratioNum >= 1.5 ? 'good' : ratioNum < 1 ? 'over' : 'warn';
    const prefix     = cls === 'child-row' ? '<span class="child-indent">↳</span> ' : cls === 'epic-row' ? '▶ ' : '';
    const gap = estimation?.evidenceGaps?.length > 0
      ? ` title="Evidence gaps: ${escAttr(estimation.evidenceGaps.join(', '))}"`
      : '';
    return `<tr class="${cls}">
      <td><a href="${i.url}" target="_blank">#${i.number}</a></td>
      <td class="title-cell" title="${escAttr(i.title)}">${prefix}${escHtml(i.title)}</td>
      <td class="num"${gap}>${fmtEst(estimation?.humanPlanHours)}</td>
      <td class="num">${fmtEst(estimation?.aiP50Hours)}</td>
      <td class="num">${fmtEst(estimation?.aiP80Hours)}</td>
      <td class="num">${fmtEst(estimation?.actualEngagedHours)}</td>
      <td class="num">${fmtSigned(estimation?.varianceVsAiP50Hours)}</td>
      <td class="num">${fmtPct(estimation?.refineAccuracy)}</td>
      <td class="num">${fmtPct(estimation?.aiP50Accuracy)}</td>
      <td class="num">${fmtEst(estimation?.avoidableWasteHours)}</td>
      <td class="num ${ratioClass}">${estimation?.accelerationLabel ?? '—'}</td>
      <td class="${(i.status ?? '').toLowerCase() === 'done' ? 'closed' : 'open'}">${i.status ?? '—'}</td>
    </tr>`;
  }

  const hierarchy = buildHierarchy(items);
  const issueRows = hierarchy.map(({ item: i, children }) => {
    const isEpic = children.length > 0;
    const ru = isEpic
      ? {
          estimate:   rollupVal(i.estimate,   children, 'estimate'),
          sessionMin: rollupVal(i.sessionMin, children, 'sessionMin'),
          engagedMin: rollupVal(i.engagedMin, children, 'engagedMin'),
          planMin:    rollupVal(i.planMin,    children, 'planMin'),
          reviewMin:  rollupVal(i.reviewMin,  children, 'reviewMin'),
        }
      : i;
    const epicRow  = renderRow(i, ru, isEpic ? 'epic-row' : '');
    const kidRows  = children.map(c => renderRow(c, c, 'child-row')).join('\n');
    return epicRow + (isEpic ? '\n' + kidRows : '');
  }).join('\n');

  const totalEh = s.totalEngaged > 0 ? fmtMin(s.totalEngaged) : '—';

  const topLevelEstimationRows = items
    .filter((item) => item.parentNumber == null || !items.some((other) => other.number === item.parentNumber))
    .map((item) => estimationModel?.rowsByIssue?.get(item.number))
    .filter(Boolean);
  const sumKnown = key =>
    topLevelEstimationRows.length > 0 && topLevelEstimationRows.every((row) => row[key] != null)
      ? topLevelEstimationRows.reduce((total, row) => total + row[key], 0)
      : null;
  const tableHumanPlan = sumKnown('humanPlanHours');
  const tableAiP50 = sumKnown('aiP50Hours');
  const tableAiP80 = sumKnown('aiP80Hours');
  const tableActual = sumKnown('actualEngagedHours');
  const tableWaste = sumKnown('avoidableWasteHours');
  const tableAccel = tableHumanPlan > 0 && tableActual > 0 ? tableHumanPlan / tableActual : null;
  const reportMethodology = estimationModel?.methodology ?? {};
  const methodologyText = reportMethodology.rubricVersion == null
    ? 'Rubric evidence unavailable; estimation metrics show evidence gaps rather than zeroes.'
    : `Rubric v${reportMethodology.rubricVersion}; cohort ${reportMethodology.cohortSize}; confidence ${fmtPct(reportMethodology.confidence)}; P80 coverage ${fmtPct(reportMethodology.p80Coverage)}.`;

  // #788 — Daily Work Activity chart is rendered near the top of the report
  // (just above the Product Backlog appendix) rather than buried at the bottom
  // of Timeline Analysis. Pre-compute it here so the return template can place
  // it up front. The leading rule the chart emits is dropped so the pulled-up
  // section starts cleanly on its own heading.
  const dailyWorkActivityHtml = (() => {
    const buckets = bucketRowsByDay(
      items.map((i) => ({ number: i.number, body: i.timingBody ?? '' })),
      {
        fromMs: cfg.fromDate ? cfg.fromDate.getTime() : null,
        toMs: cfg.toDate ? cfg.toDate.getTime() : null,
      },
    );
    return renderDailyChart(buckets).replace(/^<hr class="tl-rule">/, '');
  })();

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
.rh-top{display:flex;justify-content:space-between;align-items:stretch;padding-bottom:.75rem;margin-bottom:.625rem;border-bottom:1px solid #1e293b}
.rh h1{font-size:1.875rem;font-weight:700;line-height:1.15;align-self:center}
.rh-right{display:flex;flex-direction:column;justify-content:center;align-items:flex-end;flex-shrink:0;margin-left:1.5rem;text-align:right;gap:.2rem}
.rh-date{font-size:.6875rem;color:#fff;white-space:nowrap}
.rh-region{font-size:.6875rem;color:#fff;white-space:nowrap}
.rh-meta{color:rgba(255,255,255,.75);font-size:.75rem;display:flex;flex-wrap:wrap;gap:.2rem 1.5rem;margin-bottom:.375rem}
.rh-meta strong{color:#e2e8f0;font-weight:600}
.rh-filter{color:#fbbf24 !important;font-weight:600 !important;margin-left:auto}
.exec-summary{background:#fff;border-radius:.5rem;border:1px solid #e2e8f0;margin-bottom:1.25rem;overflow:hidden}
.exec-summary-header{background:#1e293b;color:#fff;padding:.75rem 1.25rem;font-size:.9375rem;font-weight:600}
.exec-summary-body{padding:1.25rem;font-size:.8125rem;color:#1e293b;line-height:1.65}
.exec-summary-body p{margin-bottom:.875rem}
.exec-summary-body p:last-child{margin-bottom:0}
.exec-summary-body strong{color:#0f172a}
.exec-sections{display:grid;grid-template-columns:1fr 1fr;gap:.5rem 1.5rem;margin:.625rem 0 .875rem;padding:.875rem 1rem;background:#f8fafc;border-radius:.375rem;border:1px solid #e2e8f0}
.esi .esi-label{font-size:.6875rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#475569;margin-bottom:.2rem}
.esi .esi-desc{font-size:.75rem;color:#334155;line-height:1.5}
.exec-method{font-size:.6875rem;color:#64748b;border-top:1px solid #e2e8f0;padding-top:.75rem;margin-top:.875rem;line-height:1.5}
.crows-wrap{display:flex;flex-direction:column;gap:.3rem;margin-bottom:1rem}
.crow-group{border-radius:.375rem;overflow:hidden;border:1px solid #e2e8f0}
.crow-label{font-size:.625rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:.3rem .875rem;display:flex;align-items:baseline;gap:.5rem}
.crow-label span{font-weight:400;text-transform:none;letter-spacing:0;color:rgba(255,255,255,.65);font-size:.625rem}
.crow-group.baseline .crow-label{background:#1e293b;color:#e2e8f0}
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
.issue-table .col-title{width:25%}
.issue-table .col-est{width:7%}
.issue-table .col-metric{width:7%}
.issue-table .col-accel{width:12%}
.issue-table .col-status{width:8%}
.issue-table td.title-cell{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
tr:last-child td{border-bottom:none}
tr:hover td{background:#f8fafc}
tr.epic-row td{background:#64748b;color:#fff;font-weight:600;border-bottom:1px solid #94a3b8}
tr.epic-row td a{color:#e0e7ff}
tr.epic-row:hover td{background:#475569}
tr.child-row td{background:#f8fafc;color:#475569;font-size:.7rem}
tr.child-row td.closed{color:#16a34a}
tr.child-row td.open{color:#d97706}
tr.child-row:hover td{background:#f1f5f9}
.child-indent{color:#94a3b8;margin-right:.2rem}
tfoot td{background:#f1f5f9;font-weight:700;border-top:2px solid #e2e8f0}
.num{text-align:right;font-variant-numeric:tabular-nums}
td a{color:#6366f1;text-decoration:none;font-weight:600}
td a:hover{text-decoration:underline}
.good{color:#16a34a;font-weight:600}.warn{color:#d97706;font-weight:600}.over{color:#dc2626;font-weight:600}
.closed{color:#16a34a}.open{color:#d97706}
.two{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem}
.three{display:grid;grid-template-columns:1fr 9rem 1fr;gap:2.5rem;align-items:start}
.col h3{font-size:.8125rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:.875rem;padding-bottom:.5rem;border-bottom:2px solid #e2e8f0}
.col.human h3{color:#9f1239}.col.ai h3{color:#6366f1}.col.accel h3{color:#16a34a;text-align:center}
.col.ai .crow{flex-direction:row-reverse}
.col.ai .crow .cl-wrap{text-align:right}
.col.ai .crow .cl-wrap .cl-sub{text-align:right}
.col.accel .crow{justify-content:center;flex-direction:column;align-items:center;text-align:center}
.ac-num{font-size:1.125rem;font-weight:800;color:#16a34a;line-height:1.2}
.ac-lbl{font-size:.5rem;color:#166534;text-transform:uppercase;letter-spacing:.04em;margin-top:.125rem}
.crow .cl-wrap{color:#64748b;display:flex;flex-direction:column;gap:.1rem}
.crow .cl-wrap .cl-sub{font-size:.7906rem;color:#94a3b8}
.crow{display:flex;justify-content:space-between;align-items:center;min-height:2.25rem;padding:.125rem 0;font-size:.8125rem;border-bottom:1px solid #f8fafc}
.crow .cl{color:#64748b;font-size:.9375rem}.crow .cv{font-weight:700;font-size:1.125rem;line-height:1.2}
.vr-row{display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem;margin-top:1.25rem}
.vr{background:#f0fdf4;border:2px solid #16a34a;border-radius:.5rem;padding:1rem 1.5rem;text-align:center}
.vr-num{font-size:2.5rem;font-weight:800;color:#16a34a;line-height:1}
.vr-lbl{font-size:.75rem;color:#166534;margin-top:.25rem}
.vr-na{background:#f8fafc;border-color:#e2e8f0;margin-top:1.25rem}
.vr-na .vr-lbl{color:#94a3b8}
.tg{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem}
.tc h3{font-size:.8125rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin-bottom:.875rem}
.ts{margin-bottom:.75rem}
.ts .tn{font-size:1.125rem;font-weight:700;color:#0f172a}
.ts .tl{font-size:.6875rem;color:#64748b}
.disclaimer{font-size:.625rem;color:#94a3b8;background:#f8fafc;border:1px solid #e2e8f0;border-radius:.375rem;padding:.375rem .75rem;margin-bottom:.75rem;line-height:1.4}
.tl-rule{border:none;border-top:1px solid #e2e8f0;margin:1.5rem 0 0}
.tl-heading{font-size:.8125rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#475569;background:#f1f5f9;padding:.5rem .875rem;margin:0;border-radius:.25rem .25rem 0 0}
.tl-meta{font-size:.6875rem;color:#64748b;margin:.375rem 0 .625rem;padding:0 .25rem}
.tl-footnote{font-size:.75rem;color:#94a3b8;margin:1.25rem 0 .375rem;font-style:italic;padding:0 .25rem}
.tl-note{font-size:.6875rem;color:#475569;line-height:1.6;margin-bottom:.5rem;padding:.625rem .875rem;background:#f8fafc;border-left:3px solid #cbd5e1;border-radius:0 .25rem .25rem 0}
.tl-note strong{color:#0f172a}
.tl-note code{font-family:monospace;font-size:.625rem;background:#e2e8f0;padding:.1em .3em;border-radius:.2em}
.footer{text-align:center;color:#94a3b8;font-size:.6875rem;margin-top:1.5rem;padding-top:1rem;border-top:1px solid #e2e8f0}
@page{
  @bottom-right{
    content:"Page " counter(page) " of " counter(pages);
    font-size:.65rem;
    color:#64748b;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  }
}
@media print{
  body{background:#fff}
  .page{padding:.25in .35in;max-width:100%}
  .sec,.crow-group{break-inside:avoid}
  .crows-wrap,.two,.tg,.vr-row{break-inside:avoid}
  -webkit-print-color-adjust:exact;print-color-adjust:exact;

  /* Report header: keep dark bg but force white on all text */
  .rh{background:#0f172a}
  .rh h1{color:#fff}
  .rh-date{color:rgba(255,255,255,.7)}
  .rh-region{color:rgba(255,255,255,.7)}
  .rh-meta{color:#fff}
  .rh-meta strong{color:#fff}
  /* Exec summary: already light-bg, just ensure body text is dark */
  .exec-summary-body{color:#1e293b}
  .exec-summary-header{background:#1e293b;color:#fff}
  .exec-sections{background:#f1f5f9;border-color:#cbd5e1}
  .esi .esi-label{color:#1e293b}
  .esi .esi-desc{color:#334155}
  .exec-method{color:#334155}

  /* Dark crow-label stripes → light tinted bg + dark text */
  .crow-group.baseline .crow-label{background:#e2e8f0;color:#1e293b}
  .crow-group.baseline .crow-label span{color:#334155}
  .crow-group.solo .crow-label{background:#dbeafe;color:#1e3a5f}
  .crow-group.solo .crow-label span{color:#1e40af}
  .crow-group.enterprise .crow-label{background:#fee2e2;color:#7f1d1d}
  .crow-group.enterprise .crow-label span{color:#991b1b}
  .crow-group.ai .crow-label{background:#e0e7ff;color:#3730a3}
  .crow-group.ai .crow-label span{color:#4338ca}
  .crow-group.value .crow-label{background:#dcfce7;color:#14532d}
  .crow-group.value .crow-label span{color:#166534}

  /* Card label/sub text: darken from light gray */
  .card .lbl{color:#334155;font-size:.7rem}
  .card .sub{color:#475569;font-size:.7rem}

  /* Section headers keep dark bg */
  .sec h2{background:#1e293b;color:#fff}

  /* Epic rows: medium grey saves ink vs near-black */
  tr.epic-row td{background:#64748b;color:#fff}
  tr.epic-row td a{color:#e0e7ff}

  /* Child rows: ensure readable contrast */
  tr.child-row td{color:#1e293b}
  tr.child-row td.closed{color:#15803d}
  tr.child-row td.open{color:#b45309}
  .child-indent{color:#475569}

  /* Small muted text: all darkened for print legibility */
  .note{color:#334155;font-size:.75rem}
  .disclaimer{color:#334155;font-size:.7rem}
  .tl-meta{color:#334155;font-size:.75rem}
  .tl-footnote{color:#475569;font-size:.75rem}
  .tl-note{color:#1e293b;font-size:.75rem;border-left-color:#94a3b8}
  .tl-note strong{color:#0f172a}
  .footer{color:#334155;break-before:avoid;margin-top:.5rem;padding-top:.5rem}

  /* Crow layout text */
  .crow .cl-wrap{color:#334155}
  .crow .cl-wrap .cl-sub{color:#475569}
  .crow .cl{color:#334155}
  .ac-lbl{color:#14532d}

  /* Timeline heading */
  .tl-heading{background:#e2e8f0;color:#1e293b}

  /* ── Page compaction: crow groups + issue breakdown on one page ────── */
  /* Allow crows-wrap to flow with the preceding section, not force a new page */
  .crows-wrap{break-inside:auto;break-before:avoid;gap:0;margin-bottom:.75rem}
  .crow-group{break-inside:avoid;margin-bottom:.5rem}
  .crow-group:last-child{margin-bottom:0}
  /* Tighten crow-label strip */
  .crow-label{padding:.2rem .625rem;font-size:.5625rem}
  /* Shrink card padding and value sizes */
  .card{padding:.4rem .625rem}
  .card .val{font-size:.8125rem}
  .card .val.sm{font-size:.75rem}
  .card .lbl{font-size:.6rem;margin-bottom:0}
  .card .sub{font-size:.6rem;margin-top:.0625rem}
  .vr-card .val{font-size:.875rem}
  /* Tighten crow-cards grid rows */
  .crow-cards{gap:0}
  /* Compact the three-column accelerator layout */
  .sec-body{padding:.75rem 1rem}
  .sec{margin-bottom:.75rem}
  .three{gap:1.5rem}
  .crow{min-height:1.75rem;padding:.0625rem 0}
  .crow .cv{font-size:.8125rem}
  .crow .cl{font-size:.75rem}
  .ac-num{font-size:.8125rem}
  /* Tighten issue table rows */
  th{padding:.3rem .5rem}
  td{padding:.25rem .5rem}
}
</style>
</head>
<body>
<div class="page">

<div class="rh">
  <div class="rh-top">
    <h1>${cfg.title}</h1>
    <div class="rh-right">
      <span class="rh-date">Generated ${now}</span>
      <span class="rh-region">Region: ${reg.label}</span>
    </div>
  </div>
  <div class="rh-meta">
    <span>Project: <strong>${project.title}</strong></span>
    <span>Repo: <strong>${cfg.repo || 'unknown'}</strong></span>
    <span>Issues: <strong>${items.length}</strong></span>
    ${filterLabel ? `<span class="rh-filter">Filters: ${filterLabel}</span>` : ''}
  </div>
</div>

<div class="exec-summary">
  <div class="exec-summary-header">Executive Summary</div>
  <div class="exec-summary-body">
    <p>This report measures the engineering value delivered through AI-assisted development by comparing pre-execution time estimates — scoped in GitHub issues before work began — against measured engaged time: active AI session minutes plus estimated human reading time. The result is a concrete, auditable acceleration multiple that translates directly into cost and calendar savings relative to equivalent human engineering spend.</p>
    <div class="exec-sections">
      <div class="esi"><div class="esi-label">Agentic AI Accelerator</div><div class="esi-desc">Side-by-side cost comparison: what this scope would have cost with a human-only team (baseline mid-level, solo senior, enterprise) versus actual AI-assisted spend. Acceleration multiples reflect cost efficiency; calendar columns reflect delivery speed.</div></div>
      <div class="esi"><div class="esi-label">Product Backlog</div><div class="esi-desc">Per-issue detail — estimate, session time, context words, derived engaged time, and acceleration ratio. Use this to spot outliers: high ratios indicate well-scoped work in familiar domains; low ratios point to underestimated scope or novel problem areas.</div></div>
      <div class="esi"><div class="esi-label">Engineering Cost by US Region</div><div class="esi-desc">The same acceleration math applied to fully-burdened regional engineering rates. Translates efficiency gains into dollar figures meaningful to your organization's geography and hiring profile.</div></div>
      <div class="esi"><div class="esi-label">Timeline Analysis</div><div class="esi-desc">Calendar view of backlog entry, work start, and close date per issue. Pre-work lag surfaces scheduling friction; in-flight duration shows how long work occupied the team once started. Epic rows show the full orchestration window, including gaps between agent batches.</div></div>
    </div>
    <div class="exec-method"><strong>Adaptive estimation methodology:</strong> ${methodologyText} Human Plan is the frozen Plan-stage engineer-hours forecast; AI P50/P80 and actual engaged time come from validated immutable forecast/outcome records. Acceleration is Human Plan ÷ actual engaged hours, and values below 1× are explicitly slower than Plan. Missing or malformed records are evidence gaps, never zeroes.</div>
  </div>
</div>

<div class="sec">
  <h2>Agentic AI Accelerator</h2>
  <div class="sec-body">
    <div class="three">
      <div class="col human">
        <h3>Human Engineering Cost (estimated)</h3>
        <div class="crow">
          <span class="cl-wrap"><span class="cl">Budget baseline — 1 ${cfg.role} engineer</span><span class="cl-sub">${n(s.totalEst)}h @ ${$(natMid)}/hr · ${reg.label}</span></span>
          <span class="cv">${$(baselineCost)}</span>
        </div>
        <div class="crow" style="margin-top:.625rem"><span class="cl">Calendar duration (1 engineer)</span><span class="cv">${estDuration}</span></div>
      </div>
      <div class="col accel">
        <h3>Acceleration</h3>
        ${s.totalEngaged > 0 ? `
        <div class="crow"><div class="ac-num">${Math.round(baselineCost / (s.totalEngaged * natMid))}×</div></div>
        <div class="crow" style="margin-top:.625rem"><div class="ac-num">${calAccel != null ? calAccel + '×' : '—'}</div></div>
        ` : '<div class="crow" style="justify-content:center;color:#94a3b8">—</div>'}
      </div>
      <div class="col ai">
        <h3>AI-Assisted Cost (measured)</h3>
        <div class="crow">
          <span class="cl-wrap"><span class="cl">Budget baseline</span><span class="cl-sub">engaged ${totalEh} @ ${$(natMid)}/hr ${cfg.role}</span></span>
          <span class="cv">${s.totalEngaged > 0 ? $(s.totalEngaged * natMid) : '—'}</span>
        </div>
        <div class="crow" style="margin-top:.625rem"><span class="cl">Calendar duration (agentic dev)</span><span class="cv">${s.totalEngaged > 0 ? (aiWeeks < 1 ? Math.ceil(s.totalEngaged / 6) + ' days' : Math.ceil(aiWeeks) + ' wks') : '—'}</span></div>
      </div>
    </div>
    ${s.totalEngaged > 0 ? `
    <div style="margin-top:.875rem;padding:.5rem .75rem;background:#f8fafc;border-radius:.375rem;border:1px solid #e2e8f0;font-size:.75rem;color:#64748b;line-height:1.6">
      <strong style="color:#475569">Measurement basis:</strong>
      ${totalEh} engaged
      (${readingH > 0 ? fmtMin(readingH) + ' reading' : '—'} &nbsp;·&nbsp; ${s.totalSessionMin > 0 ? fmtMin(s.totalSessionMin / 60) + ' active session' : '—'})
      &nbsp;·&nbsp;
      <strong style="color:#475569">Rate:</strong> ${$(natMid)}/hr ${cfg.role}-level · ${reg.label}
    </div>
    ` : `<div class="vr vr-na" style="margin-top:1.25rem;padding:1rem;text-align:center"><div class="vr-lbl">No engaged time data yet — set Session Time fields on issues to calculate.</div></div>`}
  </div>
</div>


<div class="crows-wrap">

  <div class="crow-group baseline">
    <div class="crow-label">Budget Baseline <span>Single ${cfg.role}-level engineer · ${reg.label} rate · estimates expressed in ${cfg.role}-level hours</span></div>
    <div class="crow-cards">
      <div class="card"><div class="lbl">Estimated Hours</div><div class="val">${n(s.totalEst)}h</div><div class="sub">${s.withEst} issues scoped</div></div>
      <div class="card"><div class="lbl">Working Days</div><div class="val">${wd(s.totalEst)}</div><div class="sub">8 hrs/day</div></div>
      <div class="card"><div class="lbl">Calendar Weeks</div><div class="val sm">${estDuration}</div><div class="sub">${cfg.focusHours} focused hrs/day · ${focusPerWeek} hrs/wk</div></div>
      <div class="card"><div class="lbl">Estimated Cost</div><div class="val sm">${$(baselineCost)}</div><div class="sub">@ ${$(natMid)}/hr ${cfg.role}-level · ${reg.label}</div></div>
    </div>
  </div>

  <div class="crow-group solo">
    <div class="crow-label">Solo ${cfg.soloRole.charAt(0).toUpperCase() + cfg.soloRole.slice(1)} Engineer <span>${Math.round(cfg.seniorFactor * 100)}% efficiency factor applied to ${cfg.role}-level estimate · ${reg.label} rate</span></div>
    <div class="crow-cards">
      <div class="card"><div class="lbl">Adjusted Hours</div><div class="val">${n(soloHours)}h</div><div class="sub">${n(s.totalEst)}h × ${cfg.seniorFactor} efficiency factor</div></div>
      <div class="card"><div class="lbl">Working Days</div><div class="val">${wd(soloHours)}</div><div class="sub">8 hrs/day</div></div>
      <div class="card"><div class="lbl">Calendar Weeks</div><div class="val sm">${fmtDuration(soloHours / focusPerWeek)}</div><div class="sub">${cfg.focusHours} focused hrs/day · ${focusPerWeek} hrs/wk</div></div>
      <div class="card"><div class="lbl">Cost</div><div class="val sm">${$(soloCost)}</div><div class="sub">@ ${$(natSr)}/hr ${cfg.soloRole} · ${reg.label}</div></div>
    </div>
  </div>

  <div class="crow-group enterprise">
    <div class="crow-label">Enterprise Team <span>Large team — same delivery timeline (Brook's Law), paying for coordination overhead + efficiency losses</span></div>
    <div class="crow-cards">
      <div class="card"><div class="lbl">Billed Hours</div><div class="val">${n(entHours)}h</div><div class="sub">50% efficiency → 2× hours paid</div></div>
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
      <div class="card"><div class="lbl">AI Acceleration</div><div class="val${s.accel == null ? '' : ' good'}">${s.accel == null ? '—' : s.accel + '×'}</div><div class="sub">estimate ÷ total agent session time</div></div>
    </div>
  </div>

  <div class="crow-group ai">
    <div class="crow-label">Agentic AI Accelerator <span>Human Leverage — estimated effort vs. human engagement time only (orchestrator + solo sessions)</span></div>
    <div class="crow-cards">
      <div class="card"><div class="lbl">Human Session Time</div><div class="val accent">${s.humanSessionMin > 0 ? fmtMin(s.humanSessionMin / 60) : '—'}</div><div class="sub">orchestrator + solo sessions · agent time excluded</div></div>
      <div class="card"><div class="lbl">Human Engaged</div><div class="val">${s.humanEngaged > 0 ? fmtMin(s.humanEngaged) : '—'}</div><div class="sub">human session + reading time</div></div>
      <div class="card"><div class="lbl">Human Leverage</div><div class="val${s.humanLeverage == null ? '' : ' good'}">${s.humanLeverage == null ? '—' : s.humanLeverage + '×'}</div><div class="sub">estimate ÷ human engagement time</div></div>
    </div>
  </div>

  <div class="crow-group value">
    <div class="crow-label">AI Leverage <span>Cost and calendar efficiency vs. equivalent human engineering spend</span></div>
    <div class="crow-cards">
      <div class="card vr-card"><div class="lbl">vs Budget Baseline</div><div class="val good">${s.totalEngaged > 0 ? Math.round(baselineCost / (s.totalEngaged * natMid)) + '×' : '—'}</div><div class="sub">${$(baselineCost)} scoped ÷ ${$(s.totalEngaged * natMid)} engaged cost</div></div>
      <div class="card vr-card"><div class="lbl">vs Solo ${cfg.soloRole.charAt(0).toUpperCase() + cfg.soloRole.slice(1)} Engineer</div><div class="val good">${s.totalEngaged > 0 ? Math.round(soloCost / (s.totalEngaged * natSr)) + '×' : '—'}</div><div class="sub">${$(soloCost)} solo ÷ ${$(s.totalEngaged * natSr)} engaged cost</div></div>
      <div class="card vr-card"><div class="lbl">vs Enterprise Team</div><div class="val good">${s.totalEngaged > 0 ? Math.round(enterpriseCost / (s.totalEngaged * natSr)) + '×' : '—'}</div><div class="sub">${$(enterpriseCost)} enterprise ÷ ${$(s.totalEngaged * natSr)} engaged cost</div></div>
    </div>
  </div>

</div>

<div class="sec">
  <div class="sec-body">${dailyWorkActivityHtml}</div>
</div>

<div class="sec">
  <h2>Timeline Analysis</h2>
  <div class="sec-body">
    <div class="tg">
      <div class="tc">
        <h3>Estimated Effort</h3>
        <div class="ts"><div class="tn">${fmtMinLong(s.totalEst, cfg.focusHours)}</div><div class="tl">total estimated effort (mid-level baseline · 1 day = ${cfg.focusHours} focused hrs)</div></div>
        <div class="ts"><div class="tn">${estDuration}</div><div class="tl">calendar weeks @ ${cfg.focusHours} focused hrs/day, ${focusPerWeek} hrs/wk</div></div>
        <div class="ts"><div class="tn">${wd(s.totalEst)} days</div><div class="tl">raw working days (8 hrs/day, no overhead)</div></div>
      </div>
      <div class="tc">
        <h3>Measured / Engaged</h3>
        <div class="ts"><div class="tn">${s.totalSessionMin > 0 ? fmtMinLong(s.totalSessionMin / 60, cfg.focusHours) : '—'}</div><div class="tl">active session time (measured · 1 day = ${cfg.focusHours} focused hrs)</div></div>
        <div class="ts"><div class="tn">${s.totalContextWords > 0 ? s.totalContextWords.toLocaleString() + ' words' : '—'}</div><div class="tl">context length (measured) · ${readingH > 0 ? fmtMin(readingH) + ' reading' : '—'}</div></div>
        <div class="ts"><div class="tn">${totalEh}</div><div class="tl">total engaged time (session + reading)</div></div>
      </div>
    </div>
  </div>
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
          <th class="num">Cost @ Est Hours (${n(s.totalEst)}h)</th>
          <th class="num">Cost @ Engaged Hours (${totalEh})</th>
          <th class="num">Savings vs Estimate</th>
        </tr>
      </thead>
      <tbody>${costRows}</tbody>
    </table>
  </div>
</div>

<div class="sec">
  <h2>Appendix A — Product Backlog</h2>
  <p class="tl-footnote" style="padding:.5rem 1.25rem 0">&#9432; See notes below for column definitions and interpretation guidance.</p>
  <table class="issue-table">
    <colgroup>
      <col class="col-num"><col class="col-title"><col class="col-est">
      <col class="col-metric"><col class="col-metric"><col class="col-metric">
      <col class="col-metric"><col class="col-metric"><col class="col-metric">
      <col class="col-metric"><col class="col-accel"><col class="col-status">
    </colgroup>
    <thead>
      <tr>
        <th>#</th><th>Title</th>
        <th class="num">Human Plan</th>
        <th class="num">AI P50</th>
        <th class="num">AI P80</th>
        <th class="num">Actual</th>
        <th class="num">Δ P50</th>
        <th class="num">Refine Acc.</th>
        <th class="num">AI Acc.</th>
        <th class="num">Avoid. Waste</th>
        <th class="num">Accel.</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${issueRows}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2">Total (${items.length} issues · ${hierarchy.filter(r => r.children.length > 0).length} epics)</td>
        <td class="num">${tableHumanPlan > 0 ? fmtEst(tableHumanPlan) : '—'}</td>
        <td class="num">${tableAiP50 > 0 ? fmtEst(tableAiP50) : '—'}</td>
        <td class="num">${tableAiP80 > 0 ? fmtEst(tableAiP80) : '—'}</td>
        <td class="num">${tableActual > 0 ? fmtEst(tableActual) : '—'}</td>
        <td class="num">${tableActual > 0 && tableAiP50 > 0 ? fmtSigned(tableActual - tableAiP50) : '—'}</td>
        <td class="num">—</td>
        <td class="num">${tableActual > 0 && tableAiP50 > 0 ? fmtPct(Math.max(0, 1 - Math.abs(tableAiP50 - tableActual) / tableActual)) : '—'}</td>
        <td class="num">${tableWaste > 0 ? fmtEst(tableWaste) : '—'}</td>
        <td class="num ${tableAccel != null && tableAccel < 1 ? 'over' : 'good'}">${tableAccel != null ? (tableAccel < 1 ? `${tableAccel.toFixed(2)}× (slower than Plan)` : `${tableAccel.toFixed(2)}×`) : '—'}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>
  <div class="sec-body" style="padding-top:2rem">
    <p class="tl-note">
      <strong>Column definitions.</strong>
      <em>#</em> — GitHub issue number, linked to the issue.
      <em>Human Plan</em> — frozen Plan-stage engineer-hours from the validated forecast record.
      <em>AI P50/P80</em> — learned engaged-time percentiles; <em>Actual</em> is measured engaged time from the immutable outcome.
      <em>Δ P50</em> — actual minus AI P50. <em>Refine Acc.</em> and <em>AI Acc.</em> show normalized forecast accuracy.
      <em>Avoid. Waste</em> is classified AI/workflow waste only. <em>Accel.</em> is Human Plan ÷ actual engaged time; below 1× is slower than Plan.
    </p>
    <p class="tl-note">
      <strong>Epics and sub-issues.</strong>
      Epic rows (dark background, ▶ prefix) sum child Human Plan estimates and child actual engaged time, then add only the parent's classified orchestration outcome. The parent board Estimate is never added to child estimates, and parent engaged time is not treated as child implementation. Sub-issues are indented below their parent; do not add epic and sub-issue rows together.
    </p>
    <p class="tl-note">
      <strong>Missing values (—).</strong>
      A dash means validated forecast or outcome evidence is absent or malformed. Such values remain evidence gaps and never become zero; hover the Human Plan cell for the gap category.
    </p>
  </div>
</div>

<div class="sec">
  <h2>Appendix B — Backlog Engagement Timeline</h2>
  <div class="sec-body">
    ${(() => {
      const fmtDate = d => d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
      const diffDays = (a, b) => a && b ? Math.round(Math.abs(b - a) / 86400000) : null;
      const hierarchy = buildHierarchy(items);
      const rows = hierarchy.flatMap(({ item: epic, children }) => {
        const epicStart = children.length > 0
          ? children.reduce((min, c) => c.startedAt && (!min || c.startedAt < min) ? c.startedAt : min, epic.startedAt)
          : epic.startedAt;
        const ROLE_BADGE = { agent: '🤖', orchestrator: '🎯', solo: '👤' };
        const makeRow = (i, sa, cls, prefix, sessionMinOverride) => {
          const lag        = diffDays(i.createdAt, sa);
          const flight     = diffDays(sa, i.closedAt);
          const sessionMin = sessionMinOverride ?? i.sessionMin;
          let flightVal;
          if (flight == null)                        flightVal = '—';
          else if (flight === 0 && sessionMin != null) flightVal = fmtMin(sessionMin / 60);
          else if (flight === 0)                     flightVal = '< 1d';
          else                                       flightVal = flight + 'd';
          const roleBadge = i.role && i.role !== 'solo' ? ` <span title="${i.role}" style="font-size:.7em;opacity:.7">${ROLE_BADGE[i.role] ?? ''}</span>` : '';
          return `<tr class="${cls}">
            <td><a href="${i.url}" target="_blank">#${i.number}</a></td>
            <td class="title-cell" title="${escAttr(i.title)}">${prefix}${escHtml(i.title)}${roleBadge}</td>
            <td>${fmtDate(i.createdAt)}</td>
            <td>${fmtDate(sa)}</td>
            <td>${fmtDate(i.closedAt)}</td>
            <td class="num">${lag == null ? '—' : lag + 'd'}</td>
            <td class="num">${flightVal}</td>
          </tr>`;
        };
        const epicSessionMin = rollupVal(epic.sessionMin, children, 'sessionMin');
        const epicRow = makeRow(epic, epicStart, children.length > 0 ? 'epic-row' : '', children.length > 0 ? '▶ ' : '', children.length > 0 ? epicSessionMin : null);
        const kidRows = children.map(c => makeRow(c, c.startedAt, 'child-row', '<span class="child-indent">↳</span> ')).join('\n');
        return [epicRow, kidRows];
      }).join('\n');
      return `
      <p class="tl-meta">${(() => {
        const fmtD = d => d ? d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'any';
        let scopeLabel;
        if (cfg.status)            scopeLabel = `Kanban status: ${cfg.status}`;
        else if (cfg.state === 'all') scopeLabel = 'All issues (open + closed)';
        else                       scopeLabel = `GitHub state: ${cfg.state}`;
        const dateRange = (cfg.fromDate || cfg.toDate)
          ? `Closed: ${fmtD(cfg.fromDate)} → ${fmtD(cfg.toDate)}`
          : null;
        const issueCount = items.length === 1 ? '1 issue' : `${items.length} issues`;
        return [
          cfg.issues ? `Issues: #${cfg.issues.join(', #')}` : null,
          scopeLabel,
          dateRange,
          issueCount,
        ].filter(Boolean).join('&ensp;·&ensp;');
      })()}</p>
      <p class="tl-footnote">&#9432; See notes below the table for column definitions and interpretation guidance.</p>
      <table class="issue-table tl-table" style="margin-top:0.5rem">
        <colgroup>
          <col style="width:4%"><col style="width:32%">
          <col style="width:13%"><col style="width:13%"><col style="width:13%">
          <col style="width:10%"><col style="width:10%">
        </colgroup>
        <thead><tr>
          <th>#</th><th>Title</th>
          <th>Created</th><th>Started</th><th>Closed</th>
          <th class="num">Pre-work lag</th><th class="num">In-flight</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="tl-note" style="margin-top:1rem">
        <strong>How to read this table.</strong>
        <em>Pre-work lag</em> is the calendar days between issue creation and the first recorded
        <code>start</code> event in the timing log — the time an issue sat in backlog before anyone
        picked it up. <em>In-flight</em> is the span from first start to close; for issues completed
        within a single day it shows the measured active session time instead of a calendar count.
        <em>Started</em> requires a timing log written by the task tracker. Issues worked by
        sub-agents on an older version of the tool, or implemented without the task skill active,
        will show <strong>—</strong> for Started and derived columns.
      </p>
      <p class="tl-note">
        <strong>Epic vs. sub-issue in-flight time.</strong>
        An epic's in-flight span will typically exceed the sum of its sub-issues. The epic clock
        starts with the orchestrator's first planning pass and runs through final review and close —
        capturing scheduling overhead, sequencing decisions, and the gaps between agent batches that
        sub-issue clocks never see. This is expected and is not double-counting: it reflects the
        real calendar cost of coordinating parallel work.
      </p>
      <p class="tl-note">
        <strong>Parallel fan-out and human cost.</strong>
        When an engineer directs the AI to fan out an epic, their personal engagement — reading results,
        answering questions, approving actions — runs as a single orchestration session. That session time
        is the human's true cost, and it stays roughly constant regardless of how many agents run in parallel.
        Meanwhile each agent logs its own session time. At the end of an orchestration window the aggregate
        session time across all agents is typically a multiple of the human's investment: a two-hour
        orchestration session directing several agents may accumulate four or more hours of total agent work.
        This creates two compounding effects relative to solo human development: <strong>(1) per-task
        acceleration</strong> — each agent completes its scope faster than the human baseline estimate; and
        <strong>(2) parallel leverage</strong> — multiple tasks complete within a single human engagement
        window, so the human's cost stays flat while the work multiplies. The <strong>Human Leverage</strong>
        figure captures the product of both effects: the total multiplier from the engineer's perspective.
        Issues in this table are labelled by role (🎯 orchestrator / 🤖 agent / 👤 solo) based on the
        timing log entry written when work began. Issues without a role entry default to solo.
      </p>
      <p class="tl-footnote">Per-issue Session Time is sourced from the board field, which equals the timing-log active-second sum as of the last <code>log-issue-time</code> run — current for closed issues, potentially stale for in-flight ones. The Daily Work Activity chart reads timing-log rows directly and is unaffected.</p>`;
    })()}
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

  // Build the trunk attribution signal maps once (#782). A git failure (e.g.
  // shallow clone, missing trunk ref) degrades gracefully to the legacy
  // board-data-only filter rather than aborting the report.
  let attribution = null;
  try {
    attribution = loadTrunkSignals({ trunk: cfg.trunk });
  } catch (err) {
    console.warn(`Attribution signals unavailable (${err.message}); using board data only.`);
  }

  const baseline = processItems(raw).length;
  const items = processItems(raw, attribution);
  if (attribution) {
    const delta = items.length - baseline;
    console.log(
      `Attribution filter: ${baseline} → ${items.length} issues ` +
        `(${delta >= 0 ? '+' : ''}${delta} vs board-data-only).`,
    );
  }

  if (items.length === 0) {
    console.error('No items found with Estimate or Session Time set on the board.');
    process.exit(1);
  }

  console.log(`${items.length} issues found.`);
  const loadedEstimation = loadEstimationRecordsFromComments({
    issues: raw
      .filter((node) => node.content?.number)
      .map((node) => ({
        number: node.content.number,
        comments: node.content.comments?.nodes ?? [],
        commentsComplete: node.content.comments?.pageInfo?.hasNextPage !== true,
      })),
    repository: cfg.repo,
  });
  const estimationModel = buildEstimationReportModel({
    items,
    recordsByIssue: loadedEstimation.recordsByIssue,
  });
  for (const gap of loadedEstimation.evidenceGaps) {
    const row = estimationModel.rowsByIssue.get(gap.issue);
    if (row !== undefined && !row.evidenceGaps.includes(gap.reason)) {
      row.evidenceGaps.push(gap.reason);
    }
  }
  if (loadedEstimation.evidenceGaps.length > 0) {
    console.warn(
      `Adaptive estimation evidence gaps: ${loadedEstimation.evidenceGaps.length} malformed issue corpus entries.`,
    );
  }
  const s    = summary(items);
  const html = buildHtml({ title }, items, s, estimationModel);

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

// Only run the CLI pipeline when invoked directly, not when imported (tests
// import buildHtml to assert the rendered section order).
const invokedDirectly = isDirectInvocation(import.meta.url);
if (invokedDirectly) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
