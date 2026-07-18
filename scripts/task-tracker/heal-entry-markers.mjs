#!/usr/bin/env node
// Generalized heal for stage-entry markers. Backfills missing markers and
// re-stamps out-of-order chains for the lifecycle stages (refine, plan,
// develop, test, review) that historically traversed before entry-marker
// stamping was mandatory (#140) or the chain-integrity close gate (#138)
// treated them as required, or whose entries were stamped out-of-order by
// retrospective verb runs after a delegate-failure drift (#172/#175).
//
// Three cases warrant a heal, applied per stage in HEALABLE_STAGES:
//
//   (a) `aitm-entered-<stage>` missing AND a later-indexed stage marker is
//       present — the issue traversed <stage> before stamping existed.
//   (b) `aitm-entered-<stage>` present but `aitm-backfill:<stage>:` audit
//       marker missing — the entry was injected without an audit trail.
//   (c) `aitm-entered-<stage>` present but out-of-order relative to a later
//       stage's marker — the chain-integrity gate (#138) will refuse close.
//       Strips both the entry and any existing audit marker, then re-stamps
//       using `createdAt` (with a per-stage ms offset to preserve internal
//       order) as a conservative lower bound.
//
// Usage:
//   node scripts/task-tracker/heal-entry-markers.mjs [#N ...] [--apply|--check-only]
//
// Without `--apply`, runs in dry-run mode and prints the plan. Without issue
// numbers, scans all open issues in the configured repo. With `--check-only`,
// exits non-zero (1) if any anomaly would be healed, useful for CI/audit
// sweeps. `--apply` and `--check-only` are mutually exclusive.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from './lib/scratch-dir.mjs';
import { fileURLToPath } from 'node:url';

import { loadConfig } from './config.mjs';
import {
  STAGES,
  parseEntryMarkersFirstVisit as parseEntryMarkers,
  parseEntryMarkers as parseEntryMarkersFull,
  backfillEntryMarker,
  LEGAL_TRANSITIONS,
  safeBackfillTs,
  normalizeTs,
} from './lib/stage-entry-markers.mjs';

// #675 AC4 — safeBackfillTs/normalizeTs now live in lib/stage-entry-markers.mjs
// so reconcile.mjs's backfill mode shares the same interval-safe timestamp
// algorithm instead of independently re-deriving it. Re-exported here so this
// module's own tests (which import safeBackfillTs from heal-entry-markers.mjs
// directly) keep working unchanged.
export { safeBackfillTs };
import { GH_API_TIMEOUT_MS } from './lib/process-timeouts.mjs';
import { assertKnownArgv, reportStrictArgvError } from './lib/argv-strict.mjs';

export const USAGE =
  'Usage: heal-entry-markers.mjs [<issue#> ...] [--apply | --check-only]\n' +
  '  (default)     audit only, no writes; all open issues when none are named\n' +
  '  --apply       write the healed entry markers\n' +
  '  --check-only  exit 1 if any issue would be healed\n' +
  '  --help, -h    print this usage and exit; never writes\n';

const pexec = promisify(execFile);

// `backlog` (STAGES[0]) is healable as of #253. The #252 contiguity guard checks
// the full prior-stage prefix (STAGES[0..toIdx-1]) on every forward move past Refine,
// so `aitm-entered-backlog` is now a required marker. Issues created before
// create-issue.mjs stamped the initial-state marker (e.g. #237, #230) lack it; the
// case-(a) backfill (marker missing AND a later-indexed stage marker present) repairs
// them. safeBackfillTs already handles stageIdx 0 (lowerMs falls back to createdAt).
const HEALABLE_STAGES = ['backlog', 'refine', 'plan', 'develop', 'test', 'review'];
const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s, i]));

function parseArgs(argv) {
  const issues = [];
  let apply = false;
  let checkOnly = false;
  for (const a of argv) {
    if (a === '--apply') apply = true;
    else if (a === '--check-only') checkOnly = true;
    else if (/^#?\d+$/.test(a)) issues.push(String(a).replace(/^#/, ''));
  }
  return { issues, apply, checkOnly };
}

// Pure decision used by --check-only mode and tested directly: given a set of
// per-issue heal results, return exit code 1 if any anomaly would be healed,
// 0 if the targeted set is clean. Errors propagate as exit 2.
export function checkOnlyExitCode(results) {
  if (results.some((r) => r.action === 'error')) return 2;
  if (results.some((r) => r.action === 'plan' || r.action === 'illegal-arcs')) return 1;
  return 0;
}

// #637 — I/O primitives accept an optional `deps` bag so tests can drive them
// offline. Every dep defaults to the real implementation, so production callers
// pass nothing and behaviour is unchanged.
export async function fetchOpenIssues(repo, deps = {}) {
  const run = deps.pexec || pexec;
  const { stdout } = await run(
    'gh',
    ['issue', 'list', '-R', repo, '--state', 'open', '--limit', '200', '--json', 'number'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return JSON.parse(stdout).map((i) => String(i.number));
}

export async function fetchIssue(repo, num, deps = {}) {
  const run = deps.pexec || pexec;
  const { stdout } = await run(
    'gh',
    ['issue', 'view', num, '-R', repo, '--json', 'number,body,createdAt'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return JSON.parse(stdout);
}

export async function writeBody(repo, num, body, deps = {}) {
  const run = deps.pexec || pexec;
  const write = deps.writeFile || writeFileSync;
  const unlink = deps.unlink || unlinkSync;
  const scratch = deps.scratchDir || projectScratchDir;
  const tmp = path.join(scratch('test'), `aitm-heal-entry-${process.pid}-${Date.now()}.md`);
  write(tmp, body, 'utf8');
  try {
    await run('gh', ['issue', 'edit', num, '-R', repo, '--body-file', tmp], {
      timeout: GH_API_TIMEOUT_MS,
    });
  } finally {
    try {
      unlink(tmp);
    } catch {
      /* best-effort */
    }
  }
}

export async function postComment(repo, num, body, deps = {}) {
  const run = deps.pexec || pexec;
  await run('gh', ['issue', 'comment', num, '-R', repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

// Strip both entry and audit-backfill markers for a single stage. Used before
// re-stamping out-of-order entries.
export function stripStageMarkers(body, stage) {
  const entryRe = new RegExp(`[ \\t]*<!--\\s*aitm-entered-${stage}:[^>]*?-->[ \\t]*\\n?`, 'gi');
  // Strip both legacy `aitm-backfill: <stage>:…` and new
  // `aitm-backfill stage="<stage>" …` forms (#380).
  const auditRe = new RegExp(
    `[ \\t]*<!--\\s*aitm-backfill(?::\\s*${stage}:[^>]*?|\\s+stage="${stage}"[^>]*?)-->[ \\t]*\\n?`,
    'gi'
  );
  return body
    .replace(entryRe, '')
    .replace(auditRe, '')
    .replace(/\n{3,}/g, '\n\n');
}

// Visit-aware diagnostic: returns the list of illegal arcs (transitions not in
// LEGAL_TRANSITIONS) detected by walking the body's full visit-numbered entry
// marker chain in timestamp order. Legitimate loops (review→develop, etc.) are
// in LEGAL_TRANSITIONS and are NOT flagged. Genuine illegal arcs (e.g.
// done→backlog without an explicit re-open) are returned as
// `{from, to, atTs}` rows. Diagnostic-only: this function does not propose
// a fix because illegal arcs imply data corruption requiring human judgment.
export function detectIllegalArcs(body) {
  const tuples = parseEntryMarkersFull(body);
  if (tuples.length < 2) return [];
  const ordered = [...tuples].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const illegal = [];
  for (let i = 1; i < ordered.length; i++) {
    const from = ordered[i - 1].stage;
    const to = ordered[i].stage;
    if (from === to) continue;
    if (!LEGAL_TRANSITIONS.has(`${from}->${to}`)) {
      illegal.push({ from, to, atTs: ordered[i].ts });
    }
  }
  return illegal;
}

// Detect out-of-order: returns the set of HEALABLE_STAGES whose timestamp is
// strictly greater than at least one later-indexed stage's timestamp.
export function outOfOrderHealableStages(markers) {
  const out = new Set();
  for (const stage of HEALABLE_STAGES) {
    if (!(stage in markers)) continue;
    const ts = markers[stage];
    const stageIdx = STAGE_INDEX[stage];
    for (const [s, otherTs] of Object.entries(markers)) {
      if (s === stage) continue;
      if (STAGE_INDEX[s] > stageIdx && ts > otherTs) {
        out.add(stage);
        break;
      }
    }
  }
  return out;
}

// #272 — Compute the createdAt-anchored backlog fallback. Used when the
// normal safeBackfillTs floor (the latest earlier-stage marker, or createdAt)
// does not produce a feasible ts because `aitm-entered-refine` was stamped
// at ~createdAt under the old `create-issue --status refine` defect.
//
// Marker ordering invariant (the rule this fallback restores):
//
//   GitHub createdAt < aitm-entered-backlog < aitm-entered-refine < ... < done
//
// `createdAt` is the canonical birth of the issue — the moment it first
// exists in GitHub. Before that, the issue is invisible to our state
// machine; the machine has nothing to act on. Backlog is the FIRST
// visible stage, so its entry marker MUST be strictly AFTER `createdAt`,
// and every subsequent stage marker MUST be strictly after the previous.
//
// An earlier draft of this fallback stamped backlog at `createdAt - 2s`
// under the (inverted) reasoning that "the issue was conceptually in
// Backlog from the moment it existed, so backlog precedes createdAt."
// That is wrong: nothing in the state machine can predate `createdAt`
// because the issue did not exist yet. Never stamp a stage entry marker
// before `createdAt`.
//
// Strategy:
//   1. backlogTs = createdAt + 1s   (smallest interval preserving strict ordering)
//   2. If refine is at or before backlogTs (the typical case for issues
//      born under --status refine, where refine was stamped at ~createdAt),
//      cascade refine forward to backlogTs + 1s (= createdAt + 2s).
//
// Later markers (plan, develop, test, ...) are not cascaded here because
// in practice they were stamped at real promote-time — minutes to hours
// after createdAt — and cannot collide with a backlog ts in the
// createdAt+1s..createdAt+2s window. If a future scenario produces such
// a collision, extend the cascade walk here.
//
// Returns { backlogTs, refineBumpTs|null }. Pure; no I/O.
export function backlogCreatedAtFallback({ markers, createdAt }) {
  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(createdMs)) {
    throw new Error('backlogCreatedAtFallback: createdAt is not parseable');
  }
  const backlogMs = createdMs + 1000;
  const backlogTs = normalizeTs(new Date(backlogMs).toISOString());
  const refineTs = markers.refine;
  const refineMs = refineTs ? Date.parse(refineTs) : null;
  let refineBumpTs = null;
  if (Number.isFinite(refineMs) && refineMs <= backlogMs) {
    refineBumpTs = normalizeTs(new Date(backlogMs + 1000).toISOString());
  }
  return { backlogTs, refineBumpTs };
}

// Decide what to do for one stage. Returns { action, ts?, reason?, mode? }.
export function planStageHeal({ stage, body, createdAt }) {
  const markers = parseEntryMarkers(body);
  const hasEntry = stage in markers;
  const hasAudit = new RegExp(
    `<!--\\s*aitm-backfill(?::\\s*${stage}:|\\s+stage="${stage}")`,
    'i'
  ).test(body);
  const hasLater = Object.entries(markers).some(([s]) => STAGE_INDEX[s] > STAGE_INDEX[stage]);
  const outOfOrder = outOfOrderHealableStages(markers).has(stage);

  if (outOfOrder) {
    const stripped = stripStageMarkers(body, stage);
    const ts = safeBackfillTs({
      stage,
      markers: parseEntryMarkers(stripped),
      createdAt,
    });
    return {
      action: 'restamp',
      ts,
      reason: 'out-of-order-chain-heal',
      mode: 'restamp',
      strippedBody: stripped,
    };
  }
  if (hasLater && !hasEntry) {
    try {
      const ts = safeBackfillTs({ stage, markers, createdAt });
      return {
        action: 'backfill',
        ts,
        reason: 'pre-gate-traversal',
        mode: 'entry+audit',
      };
    } catch (err) {
      // #272 — Issues born under `create-issue --status refine` have
      // `aitm-entered-refine` stamped at ~createdAt, leaving no feasible
      // floor for `aitm-entered-backlog`. Fall back to createdAt - 2s and,
      // if needed, bump the refine marker to createdAt + 1s.
      if (stage === 'backlog' && Number.isFinite(Date.parse(createdAt))) {
        const fallback = backlogCreatedAtFallback({ markers, createdAt });
        return {
          action: 'backfill',
          ts: fallback.backlogTs,
          reason: 'createdAt-anchored-backlog-fallback',
          mode: 'entry+audit',
          refineBumpTs: fallback.refineBumpTs,
        };
      }
      throw err;
    }
  }
  if (stage === 'backlog' && !hasEntry && !hasLater) {
    // #784 — Zero-marker backlog issue: no `aitm-entered-backlog` and no later
    // stage marker to anchor against. The #252 contiguity guard still requires
    // `aitm-entered-backlog` before any forward promotion, but the case-(a)
    // `hasLater && !hasEntry` backfill never fires (nothing is "later"), so the
    // issue is un-promotable with no sanctioned repair. Mint the marker from the
    // `createdAt`-anchored fallback (backlog at createdAt+1s; no refine present,
    // so `refineBumpTs` is null). Fall through to `no-heal-needed` if `createdAt`
    // is unparseable rather than throw.
    if (Number.isFinite(Date.parse(createdAt))) {
      const fallback = backlogCreatedAtFallback({ markers, createdAt });
      return {
        action: 'backfill',
        ts: fallback.backlogTs,
        reason: 'zero-marker-backlog-fallback',
        mode: 'entry+audit',
        refineBumpTs: fallback.refineBumpTs,
      };
    }
    return { action: 'skip', reason: 'no-heal-needed' };
  }
  if (hasEntry && hasLater && !hasAudit) {
    const m = new RegExp(`<!--\\s*aitm-entered-${stage}:\\s*([^\\s-][^\\s]*?)\\s*-->`, 'i').exec(
      body
    );
    const ts = m ? normalizeTs(m[1]) : null;
    if (!ts) return { action: 'skip', reason: 'entry-marker-unparseable' };
    return { action: 'audit-only', ts, reason: 'audit-only-unaudited-entry', mode: 'audit-only' };
  }
  return { action: 'skip', reason: 'no-heal-needed' };
}

function applyStageHeal({ body, stage, plan }) {
  if (plan.action === 'restamp') {
    return backfillEntryMarker(plan.strippedBody, stage, plan.ts, plan.reason);
  }
  let next = backfillEntryMarker(body, stage, plan.ts, plan.reason);
  // #272 — backlog fallback may need to bump an existing refine marker so the
  // chain remains monotone. Strip the existing refine entry + audit and
  // re-stamp at the bump ts.
  if (plan.refineBumpTs && stage === 'backlog') {
    next = stripStageMarkers(next, 'refine');
    next = backfillEntryMarker(next, 'refine', plan.refineBumpTs, 'createdAt-anchored-refine-bump');
  }
  return next;
}

export async function healOne({ repo, num, apply, deps = {} }) {
  const fetch = deps.fetchIssue || fetchIssue;
  const write = deps.writeBody || writeBody;
  const post = deps.postComment || postComment;
  const issue = await fetch(repo, num, deps);
  let body = issue.body || '';
  const createdAt = normalizeTs(issue.createdAt);
  const stagesActed = [];
  for (const stage of HEALABLE_STAGES) {
    const plan = planStageHeal({ stage, body, createdAt });
    if (plan.action === 'skip') continue;
    stagesActed.push({ stage, ...plan });
    if (apply) body = applyStageHeal({ body, stage, plan });
  }
  const illegalArcs = detectIllegalArcs(body);
  if (stagesActed.length === 0 && illegalArcs.length === 0) {
    return { num, action: 'skip', reason: 'no-heal-needed' };
  }
  if (stagesActed.length === 0 && illegalArcs.length > 0) {
    return { num, action: 'illegal-arcs', illegalArcs };
  }
  if (!apply) {
    return { num, action: 'plan', stagesActed, illegalArcs };
  }
  await write(repo, num, body, deps);
  const summary = stagesActed
    .map((s) => `\`aitm-entered-${s.stage}: ${s.ts}\` (${s.action}, reason: ${s.reason})`)
    .join('; ');
  const commentBody = `🛠 Heal entry markers: ${summary}. The chain-integrity close gate (#138) requires monotonic, audited stage-entry markers; this comment + the per-stage \`aitm-backfill\` markers provide retroactive provenance.`;
  await post(repo, num, commentBody, deps);
  return { num, action: 'applied', stagesActed };
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const load = deps.loadConfig || loadConfig;
  const fetchOpen = deps.fetchOpenIssues || fetchOpenIssues;
  const heal = deps.healOne || healOne;
  const out = deps.out || ((s) => process.stdout.write(s));
  const err = deps.err || ((s) => process.stderr.write(s));
  const exit = deps.exit || ((c) => process.exit(c));
  // #878 — refuse unknown flags before any config load or gh call. Bare issue
  // numbers are legitimate positionals here, so the budget is unbounded.
  try {
    if (
      assertKnownArgv(argv, {
        flags: ['--apply', '--check-only'],
        positionals: { max: Infinity },
        usage: USAGE,
      })
    ) {
      out(USAGE);
      return exit(0);
    }
  } catch (e) {
    if (!reportStrictArgvError(e, { err })) throw e;
    return exit(2);
  }

  const { issues, apply, checkOnly } = parseArgs(argv);
  if (apply && checkOnly) {
    err('heal-entry-markers: --apply and --check-only are mutually exclusive\n');
    return exit(2);
  }
  const cfg = load();
  const repo = cfg.repo;
  const targets = issues.length > 0 ? issues : await fetchOpen(repo, deps);
  const results = [];
  for (const num of targets) {
    try {
      results.push(await heal({ repo, num, apply, deps }));
    } catch (e) {
      results.push({ num, action: 'error', reason: e.message });
    }
  }
  for (const r of results) {
    if (r.action === 'plan') {
      const parts = r.stagesActed.map((s) => `${s.stage}=${s.action}:${s.ts}(${s.reason})`);
      out(`#${r.num}: would heal ${parts.join(', ')}\n`);
      if (r.illegalArcs && r.illegalArcs.length) {
        const arcs = r.illegalArcs.map((a) => `${a.from}->${a.to}@${a.atTs}`).join(', ');
        out(`#${r.num}: illegal arcs detected (diagnostic only): ${arcs}\n`);
      }
    } else if (r.action === 'illegal-arcs') {
      const arcs = r.illegalArcs.map((a) => `${a.from}->${a.to}@${a.atTs}`).join(', ');
      out(`#${r.num}: illegal arcs detected (diagnostic only): ${arcs}\n`);
    } else if (r.action === 'applied') {
      const parts = r.stagesActed.map((s) => `${s.stage}=${s.action}:${s.ts}`);
      out(`#${r.num}: healed ${parts.join(', ')}\n`);
    } else if (r.action === 'skip') {
      out(`#${r.num}: skip (${r.reason})\n`);
    } else if (r.action === 'error') {
      err(`#${r.num}: ERROR ${r.reason}\n`);
    }
  }
  if (!apply) {
    out('\n(dry-run — pass --apply to write)\n');
  }
  if (checkOnly) {
    return exit(checkOnlyExitCode(results));
  }
}

const _isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();
if (_isMain) {
  main().catch((err) => {
    process.stderr.write(`heal-entry-markers: ${err.message}\n`);
    process.exit(1);
  });
}
