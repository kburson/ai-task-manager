#!/usr/bin/env node
// One-shot heal — backfills `aitm-entered-refine` on issues that traversed
// Refine before stage-entry marker stamping was wired (#140) or before the
// chain-integrity close gate (#138) treated the marker as required.
//
// Detection: issue body has any later-stage entry marker (plan/develop/test/
// review) but no `aitm-entered-refine`. That combination is unreachable today
// — the only way to be in that state is to have traversed Refine before
// stamping existed. Backfilled with the audit marker `aitm-backfill:refine:
// pre-gate-refine-traversal:<ts>` so the heal is distinguishable from a real
// entry. Timestamp used is issue.createdAt (lower bound — the issue couldn't
// have entered Refine before it existed).
//
// Usage:
//   node scripts/task-tracker/heal-refine-entry-marker.mjs [#N ...] [--apply]
//
// Without `--apply`, runs in dry-run mode and prints the plan. Without issue
// numbers, scans all open issues in the configured repo.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from './lib/scratch-dir.mjs';

import { loadConfig } from './config.mjs';
import { backfillEntryMarker } from './lib/stage-entry-markers.mjs';
import { GH_API_TIMEOUT_MS } from './lib/process-timeouts.mjs';
import { assertKnownArgv, reportStrictArgvError } from './lib/argv-strict.mjs';
import { confirmBlastRadius } from './lib/blast-radius-guard.mjs';

export const USAGE =
  'Usage: heal-refine-entry-marker.mjs [<issue#> ...] [--apply] [--yes]\n' +
  '  (default)   audit only, no writes; all open issues when none are named\n' +
  '  --apply     write the backfilled refine entry marker\n' +
  '  --yes       skip the blast-radius confirmation prompt on a multi-issue --apply\n' +
  '  --help, -h  print this usage and exit; never writes\n';

const pexec = promisify(execFile);

const LATER_STAGE_RE = /<!--\s*aitm-entered-(plan|develop|test|review|done):/i;
const REFINE_ENTRY_RE = /<!--\s*aitm-entered-refine:/i;
const REFINE_ENTRY_TS_RE = /<!--\s*aitm-entered-refine:\s*([^\s-][^\s]*?)\s*-->/i;
// Widened (#380) to detect both legacy `aitm-backfill: refine:…` and new
// `aitm-backfill stage="refine" …` forms.
const REFINE_BACKFILL_AUDIT_RE = /<!--\s*aitm-backfill(?::\s*refine:|\s+stage="refine")/i;
const BACKFILL_REASON = 'pre-gate-refine-traversal';

function parseArgs(argv) {
  const issues = [];
  let apply = false;
  let yes = false;
  for (const a of argv) {
    if (a === '--apply') apply = true;
    else if (a === '--yes') yes = true;
    else if (/^#?\d+$/.test(a)) issues.push(String(a).replace(/^#/, ''));
  }
  return { issues, apply, yes };
}

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
  const rm = deps.unlink || unlinkSync;
  const scratch = deps.scratchDir || projectScratchDir;
  const tmp = path.join(scratch('test'), `aitm-heal-refine-${process.pid}-${Date.now()}.md`);
  write(tmp, body, 'utf8');
  try {
    await run('gh', ['issue', 'edit', num, '-R', repo, '--body-file', tmp], {
      timeout: GH_API_TIMEOUT_MS,
    });
  } finally {
    try {
      rm(tmp);
    } catch {
      /* best-effort: cleanup; failure is non-fatal */
    }
  }
}

export async function postComment(repo, num, body, deps = {}) {
  const run = deps.pexec || pexec;
  await run('gh', ['issue', 'comment', num, '-R', repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

// Two cases warrant a heal:
//   (a) later-stage marker present but refine-entry missing — issue traversed
//       Refine before entry stamping existed.
//   (b) refine-entry present but `aitm-backfill:refine:` audit marker missing —
//       the entry was hand-fabricated (or otherwise injected without an audit
//       trail) and needs retroactive auditing.
export function needsBackfill(body) {
  const hasLater = LATER_STAGE_RE.test(body);
  const hasEntry = REFINE_ENTRY_RE.test(body);
  const hasAudit = REFINE_BACKFILL_AUDIT_RE.test(body);
  if (hasLater && !hasEntry) return true;
  if (hasEntry && hasLater && !hasAudit) return true;
  return false;
}

function normalizeTs(iso) {
  return String(iso || '').replace(/\.\d+Z$/, 'Z');
}

function extractRefineEntryTs(body) {
  const m = REFINE_ENTRY_TS_RE.exec(body || '');
  return m ? normalizeTs(m[1]) : null;
}

export async function healOne({ repo, num, apply, deps = {} }) {
  const fetch = deps.fetchIssue || fetchIssue;
  const write = deps.writeBody || writeBody;
  const post = deps.postComment || postComment;
  const issue = await fetch(repo, num, deps);
  const body = issue.body || '';
  if (!needsBackfill(body)) {
    return { num, action: 'skip', reason: 'already-has-refine-entry-and-audit-or-never-traversed' };
  }
  const existingTs = extractRefineEntryTs(body);
  const mode = existingTs ? 'audit-only' : 'entry+audit';
  const reason = existingTs ? 'audit-only-unaudited-entry' : BACKFILL_REASON;
  const ts = existingTs || normalizeTs(issue.createdAt);
  if (!apply) {
    return { num, action: 'plan', ts, reason, mode };
  }
  const nextBody = backfillEntryMarker(body, 'refine', ts, reason);
  await write(repo, num, nextBody, deps);
  const commentBody =
    mode === 'audit-only'
      ? `🛠 Heal: added missing audit marker for existing \`aitm-entered-refine: ${ts}\` (reason: ${reason}). The entry marker was present but lacked an audit trail; this comment + the \`aitm-backfill:refine:${reason}:${ts}\` marker provide retroactive provenance.`
      : `🛠 Heal: backfilled \`aitm-entered-refine: ${ts}\` (reason: ${reason}). This issue traversed Refine before stage-entry marker stamping became mandatory; the marker was added retroactively using \`createdAt\` as a conservative lower bound. Audit trail: \`aitm-backfill:refine:${reason}:${ts}\`.`;
  await post(repo, num, commentBody, deps);
  return { num, action: 'applied', ts, mode };
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const load = deps.loadConfig || loadConfig;
  const fetchOpen = deps.fetchOpenIssues || fetchOpenIssues;
  const heal = deps.healOne || healOne;
  const out = deps.out || ((s) => process.stdout.write(s));
  const err = deps.err || ((s) => process.stderr.write(s));
  const exit = deps.exit || ((c) => process.exit(c));

  // #878 — refuse unknown flags before any config load or gh call.
  try {
    if (
      assertKnownArgv(argv, {
        flags: ['--apply', '--yes'],
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

  const { issues, apply, yes } = parseArgs(argv);
  const cfg = load();
  const repo = cfg.repo;
  const targets = issues.length > 0 ? issues : await fetchOpen(repo, deps);

  if (apply) {
    const confirm = deps.confirmBlastRadius || confirmBlastRadius;
    const decision = await confirm({
      issueNumbers: targets.map(Number),
      yes,
      log: out,
      warn: err,
    });
    if (!decision.proceed) return exit(2);
  }

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
      out(`#${r.num}: would backfill ts=${r.ts} reason=${r.reason}\n`);
    } else if (r.action === 'applied') {
      out(`#${r.num}: backfilled ts=${r.ts}\n`);
    } else if (r.action === 'skip') {
      out(`#${r.num}: skip (${r.reason})\n`);
    } else if (r.action === 'error') {
      err(`#${r.num}: ERROR ${r.reason}\n`);
    }
  }
  if (!apply) {
    out('\n(dry-run — pass --apply to write)\n');
  }
}

import { fileURLToPath } from 'node:url';
const _isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();
if (_isMain) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`heal-refine-entry-marker: ${err.message}\n`);
    process.exit(1);
  });
}
