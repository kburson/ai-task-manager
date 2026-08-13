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
//                                              [--rename-timing-slugs]
//
// Default: --state all, dry-run (no writes). `--apply` is the only switch that
// performs writes. Exit code is non-zero if schema drift is found (so the
// script can be wired into CI later) unless `--ignore-schema-drift` is set.
//
// `--rename-timing-slugs` (#520) switches to a dedicated one-shot mode that
// rewrites historical ⏱ Timing Log Event-column slugs to the #516 uniform
// `<state>:<past-tense>` vocabulary in place. It reuses the same enumeration,
// `--scope`, `--state`, and dry-run/`--apply` scaffolding. Dry-run (default)
// prints the planned rewrites without mutating any comment; `--apply` writes
// the rewritten comment through the sanctioned `updateTimingComment` helper —
// never `gh issue edit`. The rename is idempotent: re-running on an
// already-migrated log is a no-op. This mode runs INSTEAD of the field-reconcile
// pass (it does not touch issue bodies, fields, or the schema check).

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
import { insertDeepDivePostedMarker, readDeepDiveSignals } from './lib/deep-dive.mjs';
import { convergeDiscuss, isDiscussPending } from './lib/discuss-marker.mjs';
import { getDiscussLabel, syncDiscussLabel } from './lib/discuss-label.mjs';
import { gh, gql, splitRepo } from '../gh/lib/github-projects.mjs';
import { STATE_TO_CONFIG_KEY } from './lib/move-state/policy.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';
import { findTimingComment, updateTimingComment } from './gh-timing-comment.mjs';
import { renameTimingLogBody } from './lib/timing-slug-rename.mjs';
import { assertKnownArgv, reportStrictArgvError } from './lib/argv-strict.mjs';
import { confirmBlastRadius } from './lib/blast-radius-guard.mjs';

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
const STATIC_KEYS = ['priority', 'size', 'estimate', 'rank'];
// Derived from the move-state policy constant so the two column lists cannot
// drift apart (#699). R4P has a deliberately non-mechanical display name;
// diffSchema compares case-insensitively but must still diagnose the live
// canonical board spelling.
export const CANONICAL_STATUS_OPTIONS = Object.keys(STATE_TO_CONFIG_KEY).map((state) =>
  state === 'ready-for-plan'
    ? 'Ready for Planning'
    : state
        .split('-')
        .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
        .join(' ')
);

// ----- Pure helpers (unit-tested) -----

export function healIssue({
  body,
  timingCommentBody,
  fieldDefs,
  now = () => new Date().toISOString(),
  thresholdMin = 5,
  deepDiveBackfillTs = null,
}) {
  const result = {
    changedBody: false,
    deltas: [],
    skipped: false,
    skipReason: null,
    action: [],
    discussPending: false,
  };

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

  // #325 — symmetric backfill for the `aitm-deep-dive-posted` marker. Legacy
  // bodies with a `## Deep-Dive Analysis` heading but no posted marker get the
  // marker stamped at the same backfill ts so `planDeepDiveGate` clears.
  if (deepDiveBackfillTs) {
    const sig = readDeepDiveSignals(workingBody);
    if (sig.hasHeading && !sig.hasPosted) {
      const next = insertDeepDivePostedMarker(workingBody, deepDiveBackfillTs);
      if (next !== workingBody) {
        workingBody = next;
        result.action.push('backfill-deep-dive-posted');
      }
    }
  }

  // 1b. Vestigial AC bullet strip (marker-gated; never strips without a marker).
  const afterStrip = stripVestigialAcBullets(workingBody);
  if (afterStrip !== workingBody) {
    result.action.push('strip-vestigial-ac');
    workingBody = afterStrip;
  }

  // 1c. #486 — converge any discuss entry affordance to the canonical resting
  // state: strip the visible `{discuss}` token, ensure exactly one hidden
  // `aitm-discuss-requested` marker. Pure + idempotent; already-discussed bodies
  // pass through untouched. `discussPending` is surfaced so the apply loop can
  // reconcile the visible "Discuss" label to match.
  const afterConverge = convergeDiscuss(workingBody, { ts: now() });
  if (afterConverge !== workingBody) {
    result.action.push('converge-discuss');
    workingBody = afterConverge;
  }
  result.discussPending = isDiscussPending(workingBody);

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
    'Created',
    'Updated',
    'Closed',
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

export function parseArgs(argv, io = {}) {
  const out = io.out || process.stdout;
  const err = io.err || process.stderr;
  const exit = io.exit || ((code) => process.exit(code));
  const args = {
    state: 'all',
    apply: false,
    scope: null,
    schemaCheck: true,
    ignoreSchemaDrift: false,
    renameTimingSlugs: false,
    yes: false,
  };

  // #878 — refuse unknown flags before interpreting anything. `--no-schema-check`
  // is a literal declared boolean here, not a generic `--no-` prefix convention.
  try {
    assertKnownArgv(argv, {
      flags: [
        '--apply',
        '--no-schema-check',
        '--ignore-schema-drift',
        '--rename-timing-slugs',
        '--yes',
      ],
      options: ['--state', '--scope'],
    });
  } catch (e) {
    if (!reportStrictArgvError(e, { err: (s) => err.write(s) })) throw e;
    printUsage(err);
    exit(2);
    return args;
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--yes') args.yes = true;
    else if (a === '--no-schema-check') args.schemaCheck = false;
    else if (a === '--ignore-schema-drift') args.ignoreSchemaDrift = true;
    else if (a === '--rename-timing-slugs') args.renameTimingSlugs = true;
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
      printUsage(out);
      exit(0);
      return args;
    }
  }
  if (!['open', 'closed', 'all'].includes(args.state)) {
    err.write(`heal-backlog: invalid --state ${args.state}\n`);
    exit(2);
    return args;
  }
  return args;
}

export function printUsage(out = process.stdout) {
  out.write(
    'Usage: heal-backlog.mjs [--state open|closed|all] [--apply] [--scope N,N,...] [--no-schema-check] [--ignore-schema-drift] [--rename-timing-slugs] [--yes]\n' +
      '  --yes  skip the blast-radius confirmation prompt on a multi-issue --apply\n'
  );
}

export async function fetchProjectFields(projectId, gqlFn = gql) {
  const data = await gqlFn(
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

export async function fetchAllIssueNumbers({ repo, state, projectId }, gqlFn = gql) {
  // Pull every issue tethered to the project, paginated.
  const { owner, repoName } = splitRepo(repo);
  const numbers = [];
  let cursor = null;
  for (let page = 0; page < 50; page++) {
    const data = await gqlFn(
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

export async function fetchIssueBundle(issueNumber, repo, ghFn = gh) {
  const out = await ghFn([
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

export async function writeIssueBody(issueNumber, repo, body, projectDir, ghFn = gh) {
  const dir = projectTmpDir(projectDir);
  mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `aitm-heal-${issueNumber}-${Date.now()}.md`);
  writeFileSync(tmp, body, 'utf8');
  try {
    await ghFn(['issue', 'edit', String(issueNumber), '-R', repo, '--body-file', tmp]);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* best-effort: cleanup; failure is non-fatal */
    }
  }
}

export async function postHealComment(issueNumber, repo, comment, projectDir, ghFn = gh) {
  const dir = projectTmpDir(projectDir);
  mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `aitm-heal-comment-${issueNumber}-${Date.now()}.md`);
  writeFileSync(tmp, comment, 'utf8');
  try {
    await ghFn(['issue', 'comment', String(issueNumber), '-R', repo, '--body-file', tmp]);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* best-effort: cleanup; failure is non-fatal */
    }
  }
}

function summaryRow(n, r) {
  const enc = r.encodingChanged ? 'enc' : '   ';
  const fld = r.deltas?.length ? `fields(${r.deltas.length})` : 'fields(0)';
  const skip = r.skipped ? `skip:${r.skipReason}` : '';
  const err = r.error ? `ERR:${r.error}` : '';
  return `#${n}\t${enc}\t${fld}\t${skip}\t${err}`.trimEnd();
}

// #520 — dedicated one-shot timing-slug rename mode. Runs INSTEAD of the
// field-reconcile pass. Enumerates the same issue set (honoring --scope /
// --state), reads each issue's timing comment, and rewrites the Event-column
// slugs to the #516 vocabulary via the pure `renameTimingLogBody`. Dry-run
// (default) prints planned rewrites; --apply writes through the sanctioned
// `updateTimingComment` helper. Idempotent: an already-migrated log is a no-op.
export async function runTimingSlugRename({ cfg, args, projectDir }, deps = {}) {
  const fetchNumbers = deps.fetchAllIssueNumbers || fetchAllIssueNumbers;
  const findComment = deps.findTimingComment || findTimingComment;
  const updateComment = deps.updateTimingComment || updateTimingComment;
  const numbers =
    args.scope ??
    (await fetchNumbers({ repo: cfg.repo, state: args.state, projectId: cfg.projectId }));

  const reportLines = [];
  reportLines.push(`# Timing-slug rename report — ${new Date().toISOString()}`);
  reportLines.push('');
  reportLines.push(`- mode: ${args.apply ? 'APPLY' : 'dry-run'}`);
  reportLines.push(`- state filter: ${args.state}`);
  reportLines.push(`- repo: ${cfg.repo}`);
  reportLines.push(`- issues: ${numbers.length}`);
  reportLines.push('');

  if (args.apply) {
    const confirm = deps.confirmBlastRadius || confirmBlastRadius;
    const decision = await confirm({
      issueNumbers: numbers,
      yes: args.yes,
      log: (s) => process.stdout.write(s),
      warn: (s) => process.stderr.write(s),
    });
    if (!decision.proceed) return process.exit(2);
  }

  let scanned = 0;
  let changedCount = 0;
  let rewriteCount = 0;
  let noLogCount = 0;
  let errorCount = 0;

  for (const n of numbers) {
    scanned++;
    try {
      const comment = await findComment(`#${n}`, cfg.repo);
      if (!comment) {
        noLogCount++;
        continue;
      }
      const out = renameTimingLogBody(comment.body);
      if (!out.changed) continue;
      changedCount++;
      rewriteCount += out.rewrites.length;
      reportLines.push(`## #${n} — ${out.rewrites.length} rewrite(s)`);
      for (const r of out.rewrites) {
        const line = `- \`${r.from}\` → \`${r.to}\``;
        reportLines.push(line);
        process.stdout.write(`#${n}: ${r.from} -> ${r.to}\n`);
      }
      reportLines.push('');
      if (args.apply) {
        await updateComment(comment.id, cfg.repo, out.body);
      }
    } catch (err) {
      errorCount++;
      reportLines.push(`## #${n} — ERROR: ${err.message}`);
      reportLines.push('');
    }
  }

  reportLines.push('## Summary');
  reportLines.push('');
  reportLines.push(`- issues scanned: ${scanned}`);
  reportLines.push(`- logs rewritten: ${changedCount}`);
  reportLines.push(`- total rewrites: ${rewriteCount}`);
  reportLines.push(`- no timing log: ${noLogCount}`);
  reportLines.push(`- errors: ${errorCount}`);

  const reportDir = projectTmpDir(projectDir);
  mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(
    reportDir,
    `timing-slug-rename-${new Date().toISOString().replace(/[:.]/g, '-')}.md`
  );
  writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
  process.stdout.write(`Report written: ${reportPath}\n`);
  process.stdout.write(
    `${args.apply ? 'APPLIED' : 'DRY-RUN'}: scanned=${scanned} rewritten=${changedCount} rewrites=${rewriteCount} no-log=${noLogCount} errors=${errorCount}\n`
  );
}

// I/O + orchestration seams are injectable (`deps`) so `main` is exercisable
// offline; every dep defaults to the real implementation, keeping the CLI
// runtime path byte-identical.
export async function main(argv, deps = {}) {
  const loadConfigFn = deps.loadConfig || loadConfig;
  const getProjectDirFn = deps.getProjectDir || getProjectDir;
  const loadFieldDefsFn = deps.loadProjectFieldDefs || loadProjectFieldDefs;
  const fetchFields = deps.fetchProjectFields || fetchProjectFields;
  const fetchNumbers = deps.fetchAllIssueNumbers || fetchAllIssueNumbers;
  const fetchBundle = deps.fetchIssueBundle || fetchIssueBundle;
  const writeBody = deps.writeIssueBody || writeIssueBody;
  const postComment = deps.postHealComment || postHealComment;
  const syncLabel = deps.syncDiscussLabel || syncDiscussLabel;
  const runRename = deps.runTimingSlugRename || runTimingSlugRename;
  const out = deps.out || process.stdout;
  const err = deps.err || process.stderr;
  const exit = deps.exit || ((code) => process.exit(code));

  if (wantsHelp(argv)) {
    emitSelfDoc('heal-backlog');
    printUsage(out);
    return exit(0);
  }
  const args = parseArgs(argv, { out, err, exit });
  const cfg = loadConfigFn();
  if (!cfg.repo) {
    err.write('heal-backlog: repo not configured\n');
    return exit(1);
  }
  if (!cfg.projectId) {
    err.write('heal-backlog: projectId not configured\n');
    return exit(1);
  }
  const projectDir = getProjectDirFn();

  // #520 — slug-rename is a self-contained mode; it does not run the
  // field-reconcile/schema pass below.
  if (args.renameTimingSlugs) {
    await runRename({ cfg, args, projectDir });
    return;
  }

  const fieldDefs = loadFieldDefsFn(projectDir);
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
      const projectFields = await fetchFields(cfg.projectId);
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
    (await fetchNumbers({ repo: cfg.repo, state: args.state, projectId: cfg.projectId }));
  reportLines.push(`## Per-issue heal (${numbers.length} issues)`);
  reportLines.push('');
  reportLines.push('```');
  reportLines.push('issue\tenc\tfields\tskip\terror');

  if (args.apply) {
    const confirm = deps.confirmBlastRadius || confirmBlastRadius;
    const decision = await confirm({
      issueNumbers: numbers,
      yes: args.yes,
      log: (s) => out.write(s),
      warn: (s) => err.write(s),
    });
    if (!decision.proceed) return exit(2);
  }

  let healedCount = 0;
  let issuesWithDeltaCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const n of numbers) {
    let row = { encodingChanged: false, deltas: [], skipped: false, skipReason: null, error: null };
    try {
      const { body, timing, priorHeal, closedAt, createdAt } = await fetchBundle(n, cfg.repo);
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
          await writeBody(n, cfg.repo, heal.body, projectDir);
          row.encodingChanged = true;
        }
        // #486 — sync the visible "Discuss" label to the converged pending
        // state. Best-effort: a label failure must not abort the sweep.
        try {
          await syncLabel({
            issueNumber: n,
            repo: cfg.repo,
            label: getDiscussLabel(cfg),
            present: heal.discussPending,
          });
        } catch {
          /* label sync is advisory; the marker state is authoritative */
        }
        if (heal.deltas.length && !priorHeal) {
          await postComment(n, cfg.repo, renderHealComment({ deltas: heal.deltas }), projectDir);
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
  out.write(`Report written: ${reportPath}\n`);
  out.write(
    `Scanned ${numbers.length} issues. body-changed=${healedCount} delta=${issuesWithDeltaCount} skipped=${skippedCount} errors=${errorCount} schemaDrift=${schemaDriftFound}\n`
  );

  if (schemaDriftFound && !args.ignoreSchemaDrift) {
    return exit(3);
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
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`heal-backlog: ${err.stack || err.message}\n`);
    process.exit(1);
  });
}

void __dir;
