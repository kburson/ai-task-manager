#!/usr/bin/env node
// Backlog healer — normalize body encodings, reconcile aitm-fields against the
// `⏱ Timing Log`, and validate the project's custom-field schema in one pass.
//
// CLI:
//   node scripts/task-tracker/heal-backlog.mjs [--state open|closed|all]
//                                              [--apply]
//                                              [--scope 87,88,...]
//                                              [--no-schema-check]
//                                              [--ignore-schema-drift]
//
// Default: --state all, dry-run (no writes). `--apply` is the only switch that
// performs writes. Exit code is non-zero if schema drift is found (so the
// script can be wired into CI later) unless `--ignore-schema-drift` is set.

import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from './config.mjs';
import { getProjectDir, projectTmpDir } from './paths.mjs';
import { parseIssueFieldDb, stripIssueFieldDb, formatIssueFieldDb } from './issue-field-db.mjs';
import { loadProjectFieldDefs } from './project-fields.mjs';
import { parseTimingRows, rollupTotals } from './timing-rollup.mjs';
import { migratePlanApprovedBody } from './migrate-plan-approved.mjs';
import {
  hasPlanApprovedMarker,
  hasDeepDiveCompleteMarker,
  hasDeepDiveHeading,
  insertDeepDiveCompleteMarker,
} from './lib/markers.mjs';
import { gh, gql, splitRepo } from '../gh/lib/github-projects.mjs';

// Vestigial visible AC bullets that are now driven by hidden markers. Stripped
// only when the corresponding marker is present; otherwise left alone to
// preserve historical readability for pre-marker issues.
const VESTIGIAL_AC_PATTERNS = [
  { re: /^[ \t]*- \[[ x]\] approved by Human\s*\r?\n?/gim, requires: hasPlanApprovedMarker },
  { re: /^[ \t]*- \[[ x]\] Deep dive complete\s*\r?\n?/gim, requires: hasDeepDiveCompleteMarker },
];

export function stripVestigialAcBullets(body) {
  let out = String(body || '');
  for (const { re, requires } of VESTIGIAL_AC_PATTERNS) {
    if (!requires(out)) continue;
    out = out.replace(re, '');
  }
  return out.replace(/\n{3,}/g, '\n\n');
}

const HEAL_COMMENT_HEADER = '### 🛠 Backlog heal';
const HEAL_COMMENT_MARKER_PREFIX = '<!-- aitm-heal:';
const HEAL_COMMENT_MARKER_RE = /<!--\s*aitm-heal:\s*[^>]+-->/i;
const RECONCILE_KEYS = ['engagedTime', 'sessionTime', 'reviewTime', 'startTime'];
const STATIC_KEYS = ['priority', 'size', 'estimate', 'sequence'];
const CANONICAL_STATUS_OPTIONS = [
  'Backlog',
  'Groom',
  'Analyze',
  'Development',
  'Validate',
  'Review',
  'Done',
];

// ----- Pure helpers (unit-tested) -----

export function healIssue({
  body,
  timingCommentBody,
  fieldDefs,
  now = () => new Date().toISOString(),
  thresholdMin = 5,
  deepDiveBackfillTs = null,
}) {
  const result = { changedBody: false, deltas: [], skipped: false, skipReason: null, action: [] };

  // 1. Plan-approved migration
  const migrated = migratePlanApprovedBody(body, { now });
  if (migrated.changed) result.action.push(migrated.action);
  let workingBody = migrated.body;

  // 1a. Deep-dive marker backfill — legacy issues with a `## Deep-Dive
  // Analysis` heading but no `aitm-deep-dive-complete` marker get the marker
  // inserted using the issue's closedAt/createdAt timestamp. Keeps pickup
  // logic from re-authoring the section on these issues.
  if (
    deepDiveBackfillTs &&
    hasDeepDiveHeading(workingBody) &&
    !hasDeepDiveCompleteMarker(workingBody)
  ) {
    workingBody = insertDeepDiveCompleteMarker(workingBody, deepDiveBackfillTs);
    result.action.push('backfill-deep-dive-marker');
  }

  // 1b. Vestigial AC bullet strip (marker-gated; never strips without a marker).
  const afterStrip = stripVestigialAcBullets(workingBody);
  if (afterStrip !== workingBody) {
    result.action.push('strip-vestigial-ac');
    workingBody = afterStrip;
  }

  // 2. Parse existing fields-DB (if any)
  const parsed = parseIssueFieldDb(workingBody);
  const existingValues = parsed.ok ? parsed.values : {};

  // 3. Compute timing values from timing log (if log present)
  let recomputedTiming = null;
  if (timingCommentBody) {
    const rows = parseTimingRows(timingCommentBody);
    if (rows.length > 0) {
      const totals = rollupTotals(rows, thresholdMin);
      // startTime: earliest row's timestamp formatted as the canonical text.
      const firstWithTs = rows.find((r) => r.tsMs != null);
      const startTimeText = firstWithTs ? formatStartTime(firstWithTs.tsMs) : null;
      recomputedTiming = {
        engagedTime: totals.engagedMin,
        sessionTime: totals.totalActiveMin,
        reviewTime: totals.reviewMin,
        startTime: startTimeText,
      };
    } else {
      result.skipped = true;
      result.skipReason = 'no-timing-rows';
    }
  } else {
    result.skipped = true;
    result.skipReason = 'no-timing-log';
  }

  // 4. Build new values: static keys from existing, timing keys from recomputed.
  //    Default any missing key to null (so the schema stays consistent).
  const nextValues = {};
  for (const def of fieldDefs) {
    if (RECONCILE_KEYS.includes(def.key)) {
      if (recomputedTiming) {
        nextValues[def.key] = recomputedTiming[def.key] ?? null;
      } else {
        // Skip: keep existing value verbatim.
        nextValues[def.key] = existingValues[def.key] ?? null;
      }
    } else if (STATIC_KEYS.includes(def.key)) {
      nextValues[def.key] = existingValues[def.key] ?? null;
    } else {
      // Any non-canonical key: preserve.
      nextValues[def.key] = existingValues[def.key] ?? null;
    }
  }

  // 5. Compute deltas (only for reconcile keys; static keys are never mutated).
  if (recomputedTiming) {
    for (const key of RECONCILE_KEYS) {
      const before = existingValues[key] ?? null;
      const after = nextValues[key];
      if (!sameValue(before, after)) {
        result.deltas.push({ key, before, after });
      }
    }
  }

  // 6. Reassemble body: strip all field-DB blocks, then append the formatted block.
  const stripped = stripIssueFieldDb(workingBody);
  const nextBody = `${stripped}\n\n${formatIssueFieldDb(nextValues)}\n`;
  result.body = nextBody;
  result.changedBody = nextBody !== body;
  result.values = nextValues;
  result.previousValues = existingValues;
  return result;
}

function sameValue(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  return String(a) === String(b);
}

// Normalize a GitHub ISO timestamp to the marker's canonical form (no ms).
export function normalizeMarkerTs(iso) {
  if (!iso) return null;
  return String(iso).replace(/\.\d+Z$/, 'Z');
}

function formatStartTime(tsMs) {
  // Mirrors the format used by task-tracker.mjs: "YYYY-MM-DD HH:MM ±HH:MM".
  const d = new Date(tsMs);
  const pad = (n) => String(n).padStart(2, '0');
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? '+' : '-';
  const oh = pad(Math.floor(Math.abs(offMin) / 60));
  const om = pad(Math.abs(offMin) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} ${sign}${oh}:${om}`;
}

export function diffSchema(projectFields, fieldDefs, statusOptions = CANONICAL_STATUS_OPTIONS) {
  const drift = {
    missing: [],
    extra: [],
    typeMismatch: [],
    optionDrift: [],
    statusOptionDrift: [],
  };
  const byName = new Map(projectFields.map((f) => [f.name, f]));
  const canonicalNames = new Set();

  for (const def of fieldDefs) {
    const names = [def.name, ...(def.aliases || [])];
    canonicalNames.add(def.name);
    const found = names.map((n) => byName.get(n)).find(Boolean);
    if (!found) {
      drift.missing.push({ key: def.key, name: def.name });
      continue;
    }
    canonicalNames.add(found.name);
    if (def.type === 'single_select') {
      const projectOpts = new Set((found.options || []).map((o) => o.name));
      const expectedOpts = new Set((def.options || []).map((o) => o.name));
      const missingOpts = [...expectedOpts].filter((o) => !projectOpts.has(o));
      const extraOpts = [...projectOpts].filter((o) => !expectedOpts.has(o));
      if (missingOpts.length || extraOpts.length) {
        drift.optionDrift.push({
          key: def.key,
          name: def.name,
          missing: missingOpts,
          extra: extraOpts,
        });
      }
    }
  }

  // Status options drift (Status is a project field but not in fieldDefs).
  const statusField = byName.get('Status');
  if (statusField) {
    canonicalNames.add('Status');
    const projectOpts = new Set((statusField.options || []).map((o) => o.name.toLowerCase()));
    const expectedOpts = new Set(statusOptions.map((o) => o.toLowerCase()));
    const missing = [...expectedOpts].filter((o) => !projectOpts.has(o));
    const extra = [...projectOpts].filter((o) => !expectedOpts.has(o));
    if (missing.length || extra.length) {
      drift.statusOptionDrift.push({ missing, extra });
    }
  } else {
    drift.missing.push({ key: 'status', name: 'Status' });
  }

  // Always-present GitHub built-ins that aren't drift.
  const builtIns = new Set([
    'Title',
    'Assignees',
    'Labels',
    'Linked pull requests',
    'Reviewers',
    'Repository',
    'Milestone',
    'Tracks',
    'Tracked by',
    'Sub-issues progress',
    'Parent issue',
  ]);
  for (const f of projectFields) {
    if (canonicalNames.has(f.name)) continue;
    if (builtIns.has(f.name)) continue;
    drift.extra.push({ name: f.name });
  }

  drift.hasDrift =
    drift.missing.length > 0 ||
    drift.extra.length > 0 ||
    drift.typeMismatch.length > 0 ||
    drift.optionDrift.length > 0 ||
    drift.statusOptionDrift.length > 0;
  return drift;
}

export function renderHealComment({ deltas, now = new Date().toISOString() }) {
  const lines = [];
  lines.push(HEAL_COMMENT_HEADER);
  lines.push('');
  lines.push(`${HEAL_COMMENT_MARKER_PREFIX} ${now} -->`);
  lines.push('');
  lines.push('| Field | Before | After |');
  lines.push('|---|---|---|');
  for (const d of deltas) {
    lines.push(`| \`${d.key}\` | ${formatCell(d.before)} | ${formatCell(d.after)} |`);
  }
  return lines.join('\n');
}

function formatCell(v) {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  return String(v);
}

export function isHealComment(commentBody) {
  return typeof commentBody === 'string' && HEAL_COMMENT_MARKER_RE.test(commentBody);
}

// ----- Orchestrator (CLI entry) -----

function parseArgs(argv) {
  const args = {
    state: 'all',
    apply: false,
    scope: null,
    schemaCheck: true,
    ignoreSchemaDrift: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--no-schema-check') args.schemaCheck = false;
    else if (a === '--ignore-schema-drift') args.ignoreSchemaDrift = true;
    else if (a === '--state') args.state = argv[++i];
    else if (a === '--scope')
      args.scope = argv[++i]
        .split(',')
        .map((s) => Number(s.replace(/^#/, '')))
        .filter(Number.isFinite);
    else if (a.startsWith('--state=')) args.state = a.slice('--state='.length);
    else if (a.startsWith('--scope='))
      args.scope = a
        .slice('--scope='.length)
        .split(',')
        .map((s) => Number(s.replace(/^#/, '')))
        .filter(Number.isFinite);
    else if (a === '--help' || a === '-h') {
      printUsage();
      process.exit(0);
    }
  }
  if (!['open', 'closed', 'all'].includes(args.state)) {
    process.stderr.write(`heal-backlog: invalid --state ${args.state}\n`);
    process.exit(2);
  }
  return args;
}

function printUsage() {
  process.stdout.write(
    'Usage: heal-backlog.mjs [--state open|closed|all] [--apply] [--scope N,N,...] [--no-schema-check] [--ignore-schema-drift]\n'
  );
}

async function fetchProjectFields(projectId) {
  const data = await gql(
    `
    query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          fields(first: 50) {
            nodes {
              __typename
              ... on ProjectV2FieldCommon { id name dataType }
              ... on ProjectV2SingleSelectField { options { id name } }
            }
          }
        }
      }
    }
  `,
    { projectId }
  );
  return data.node?.fields?.nodes ?? [];
}

async function fetchAllIssueNumbers({ repo, state, projectId }) {
  // Pull every issue tethered to the project, paginated.
  const { owner, repoName } = splitRepo(repo);
  const numbers = [];
  let cursor = null;
  for (let page = 0; page < 50; page++) {
    const data = await gql(
      `
      query($owner: String!, $repo: String!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          issues(first: 100, after: $cursor, states: [OPEN, CLOSED], orderBy: {field: CREATED_AT, direction: ASC}) {
            pageInfo { hasNextPage endCursor }
            nodes {
              number
              state
              projectItems(first: 5) { nodes { project { id } } }
            }
          }
        }
      }
    `,
      { owner, repo: repoName, cursor }
    );
    const issues = data.repository.issues.nodes;
    for (const i of issues) {
      const onProject = i.projectItems.nodes.some((n) => n.project?.id === projectId);
      if (!onProject) continue;
      if (state === 'open' && i.state !== 'OPEN') continue;
      if (state === 'closed' && i.state !== 'CLOSED') continue;
      numbers.push(i.number);
    }
    if (!data.repository.issues.pageInfo.hasNextPage) break;
    cursor = data.repository.issues.pageInfo.endCursor;
  }
  return numbers;
}

async function fetchIssueBundle(issueNumber, repo) {
  const out = await gh([
    'issue',
    'view',
    String(issueNumber),
    '-R',
    repo,
    '--json',
    'body,comments,state,createdAt,closedAt',
  ]);
  const parsed = JSON.parse(out);
  const timing =
    (parsed.comments || []).find((c) => c.body && c.body.includes('⏱ Timing Log')) ?? null;
  const priorHeal = (parsed.comments || []).some((c) => isHealComment(c.body));
  return {
    body: parsed.body ?? '',
    timing,
    state: parsed.state,
    priorHeal,
    createdAt: parsed.createdAt ?? null,
    closedAt: parsed.closedAt ?? null,
  };
}

async function writeIssueBody(issueNumber, repo, body, projectDir) {
  const dir = projectTmpDir(projectDir);
  mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `aitm-heal-${issueNumber}-${Date.now()}.md`);
  writeFileSync(tmp, body, 'utf8');
  try {
    await gh(['issue', 'edit', String(issueNumber), '-R', repo, '--body-file', tmp]);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
}

async function postHealComment(issueNumber, repo, comment, projectDir) {
  const dir = projectTmpDir(projectDir);
  mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `aitm-heal-comment-${issueNumber}-${Date.now()}.md`);
  writeFileSync(tmp, comment, 'utf8');
  try {
    await gh(['issue', 'comment', String(issueNumber), '-R', repo, '--body-file', tmp]);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
}

function summaryRow(n, r) {
  const enc = r.encodingChanged ? 'enc' : '   ';
  const fld = r.deltas?.length ? `fields(${r.deltas.length})` : 'fields(0)';
  const skip = r.skipped ? `skip:${r.skipReason}` : '';
  const err = r.error ? `ERR:${r.error}` : '';
  return `#${n}\t${enc}\t${fld}\t${skip}\t${err}`.trimEnd();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadConfig();
  if (!cfg.repo) {
    process.stderr.write('heal-backlog: repo not configured\n');
    process.exit(1);
  }
  if (!cfg.projectId) {
    process.stderr.write('heal-backlog: projectId not configured\n');
    process.exit(1);
  }
  const projectDir = getProjectDir();
  const fieldDefs = loadProjectFieldDefs(projectDir);
  const thresholdMin = Number(cfg.reviewPauseThresholdMin) || 5;

  const reportLines = [];
  reportLines.push(`# Backlog heal report — ${new Date().toISOString()}`);
  reportLines.push('');
  reportLines.push(`- mode: ${args.apply ? 'APPLY' : 'dry-run'}`);
  reportLines.push(`- state filter: ${args.state}`);
  reportLines.push(`- repo: ${cfg.repo}`);
  reportLines.push(`- projectId: ${cfg.projectId}`);
  reportLines.push('');

  // 1. Schema validation (once)
  let schemaDriftFound = false;
  if (args.schemaCheck) {
    reportLines.push('## Project schema validation');
    reportLines.push('');
    try {
      const projectFields = await fetchProjectFields(cfg.projectId);
      const drift = diffSchema(projectFields, fieldDefs);
      schemaDriftFound = drift.hasDrift;
      if (!drift.hasDrift) {
        reportLines.push('No drift detected.');
      } else {
        if (drift.missing.length)
          reportLines.push(`- missing: ${drift.missing.map((d) => d.name).join(', ')}`);
        if (drift.extra.length)
          reportLines.push(`- extra: ${drift.extra.map((d) => d.name).join(', ')}`);
        if (drift.optionDrift.length) {
          for (const d of drift.optionDrift) {
            reportLines.push(
              `- option drift in **${d.name}** — missing: [${d.missing.join(', ')}], extra: [${d.extra.join(', ')}]`
            );
          }
        }
        if (drift.statusOptionDrift.length) {
          for (const d of drift.statusOptionDrift) {
            reportLines.push(
              `- Status options drift — missing: [${d.missing.join(', ')}], extra: [${d.extra.join(', ')}]`
            );
          }
        }
      }
    } catch (err) {
      reportLines.push(`schema fetch failed: ${err.message}`);
    }
    reportLines.push('');
  }

  // 2. Enumerate issues
  const numbers =
    args.scope ??
    (await fetchAllIssueNumbers({ repo: cfg.repo, state: args.state, projectId: cfg.projectId }));
  reportLines.push(`## Per-issue heal (${numbers.length} issues)`);
  reportLines.push('');
  reportLines.push('```');
  reportLines.push('issue\tenc\tfields\tskip\terror');

  let healedCount = 0;
  let issuesWithDeltaCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const n of numbers) {
    let row = { encodingChanged: false, deltas: [], skipped: false, skipReason: null, error: null };
    try {
      const { body, timing, priorHeal, closedAt, createdAt } = await fetchIssueBundle(n, cfg.repo);
      const backfillTs = normalizeMarkerTs(closedAt || createdAt);
      const heal = healIssue({
        body,
        timingCommentBody: timing?.body ?? null,
        fieldDefs,
        thresholdMin,
        deepDiveBackfillTs: backfillTs,
      });
      row.encodingChanged = heal.changedBody && heal.deltas.length === 0;
      row.deltas = heal.deltas;
      row.skipped = heal.skipped;
      row.skipReason = heal.skipReason;

      if (args.apply) {
        if (heal.changedBody) {
          await writeIssueBody(n, cfg.repo, heal.body, projectDir);
          row.encodingChanged = true;
        }
        if (heal.deltas.length && !priorHeal) {
          await postHealComment(
            n,
            cfg.repo,
            renderHealComment({ deltas: heal.deltas }),
            projectDir
          );
        }
      }
      if (heal.deltas.length) issuesWithDeltaCount++;
      if (heal.changedBody) healedCount++;
      if (heal.skipped) skippedCount++;
    } catch (err) {
      row.error = err.message;
      errorCount++;
    }
    reportLines.push(summaryRow(n, row));
  }
  reportLines.push('```');
  reportLines.push('');
  reportLines.push('## Summary');
  reportLines.push('');
  reportLines.push(`- issues scanned: ${numbers.length}`);
  reportLines.push(`- body changed: ${healedCount}`);
  reportLines.push(`- timing-delta found: ${issuesWithDeltaCount}`);
  reportLines.push(`- skipped: ${skippedCount}`);
  reportLines.push(`- errors: ${errorCount}`);
  reportLines.push(`- schema drift: ${schemaDriftFound ? 'YES' : 'no'}`);

  const reportDir = projectTmpDir(projectDir);
  mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(
    reportDir,
    `heal-backlog-${new Date().toISOString().replace(/[:.]/g, '-')}.md`
  );
  writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
  process.stdout.write(`Report written: ${reportPath}\n`);
  process.stdout.write(
    `Scanned ${numbers.length} issues. body-changed=${healedCount} delta=${issuesWithDeltaCount} skipped=${skippedCount} errors=${errorCount} schemaDrift=${schemaDriftFound}\n`
  );

  if (schemaDriftFound && !args.ignoreSchemaDrift) {
    process.exit(3);
  }
}

const __dir = path.dirname(fileURLToPath(import.meta.url));
const _isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (_isMain) {
  main().catch((err) => {
    process.stderr.write(`heal-backlog: ${err.stack || err.message}\n`);
    process.exit(1);
  });
}

void __dir;
