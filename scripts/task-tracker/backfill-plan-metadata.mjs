#!/usr/bin/env node
// #488 — One-shot, idempotent back-fill that bolds `## Plan Metadata` labels on
// open issues authored before the #416 fix actually worked (it was a no-op for
// the bulleted list form — see lib/plan-metadata.mjs). #416 normalizes labels
// only at creation via `normalizeFills`; metadata authored or edited later, and
// the entire pre-#416 corpus, kept plain labels. This converges each open body
// to what creation would now produce, using the SAME section normalizer.
//
// The pure core `buildPlanMetadataBackfill(body)` is exported for offline unit
// tests; the CLI wraps it with `gh issue list` enumeration and `mutateIssueBody`
// writes so invariant markers are preserved.
//
// Audit/dry-run is the DEFAULT (AC4) — nothing is written without `--apply`:
//   node scripts/task-tracker/backfill-plan-metadata.mjs            # audit only
//   node scripts/task-tracker/backfill-plan-metadata.mjs --apply    # write
//   node scripts/task-tracker/backfill-plan-metadata.mjs --help     # usage, no writes (#722)

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  normalizePlanMetadataSection,
  findUnboldPlanMetadataLabels,
} from './lib/plan-metadata.mjs';
import { mutateIssueBody } from './lib/issue-body-mutate.mjs';
import { assertKnownArgv, reportStrictArgvError } from './lib/argv-strict.mjs';
import { confirmBlastRadius } from './lib/blast-radius-guard.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

if (import.meta.url === `file://${process.argv[1]}` && wantsHelp(process.argv.slice(2))) {
  emitSelfDoc('backfill-plan-metadata');
  process.exit(0);
}

const pexec = promisify(execFile);

// Pure: decide whether `body` has unbold Plan Metadata labels and, if so, return
// the normalized body plus the labels that would change. Idempotent — keyed on
// the SAME detector the enforcement lint uses.
//
//   { status: 'skip' }                              no section, or already bold
//   { status: 'healed', body, changed: [labels] }   section had unbold labels
export function buildPlanMetadataBackfill(body = '') {
  const src = String(body);
  const unbold = findUnboldPlanMetadataLabels(src);
  if (unbold.length === 0) return { status: 'skip' };
  return {
    status: 'healed',
    body: normalizePlanMetadataSection(src),
    changed: unbold.map((u) => u.label),
  };
}

export async function listOpenIssues(deps = {}) {
  const run = deps.pexec || pexec;
  const { stdout } = await run(
    'gh',
    ['issue', 'list', '--state', 'open', '--limit', '500', '--json', 'number,title,body'],
    { maxBuffer: 50 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}

const USAGE =
  'Usage: backfill-plan-metadata.mjs [--apply] [--yes] [--help]\n' +
  '  (default)   audit only, no writes\n' +
  '  --apply     bold the unbold Plan Metadata labels on each open issue that needs it\n' +
  '  --yes       skip the blast-radius confirmation prompt on a multi-issue --apply\n' +
  '  --help, -h  print this usage and exit; never writes\n';

export async function main(argv = process.argv.slice(2), deps = {}) {
  const log = deps.log || ((s) => console.log(s));

  // #878 — refuse unknown flags before any gh call, so a typo cannot leave
  // `--apply` honored and the intended narrowing silently dropped.
  if (assertKnownArgv(argv, { flags: ['--apply', '--yes'], usage: USAGE })) {
    log(USAGE);
    return;
  }

  const list = deps.listOpenIssues || listOpenIssues;
  const mutate = deps.mutateIssueBody || mutateIssueBody;
  const err = deps.err || ((s) => console.error(s));
  const confirm = deps.confirmBlastRadius || confirmBlastRadius;
  const apply = argv.includes('--apply');
  const yes = argv.includes('--yes');
  const repo = 'kburson/ai-task-manager';
  const issues = await list(deps);

  if (apply) {
    const decision = await confirm({
      issueNumbers: issues.map((it) => it.number),
      yes,
      log,
      warn: err,
    });
    if (!decision.proceed) {
      if (deps.exit) deps.exit(2);
      else process.exitCode = 2;
      return;
    }
  }

  const summary = { skipped: 0, healed: 0, failed: 0 };
  for (const it of issues.sort((a, b) => a.number - b.number)) {
    const plan = buildPlanMetadataBackfill(it.body || '');
    if (plan.status === 'skip') {
      summary.skipped += 1;
      continue;
    }
    if (!apply) {
      summary.healed += 1;
      log(`#${it.number}  would-bold  [${plan.changed.join(', ')}]  (audit)`);
      continue;
    }
    try {
      const r = await mutate({
        issueNumber: it.number,
        repo,
        mutate: (base) => buildPlanMetadataBackfill(base).body ?? base,
      });
      summary.healed += 1;
      log(`#${it.number}  bolded  ${r.status}  [${plan.changed.join(', ')}]`);
    } catch (e) {
      summary.failed += 1;
      err(`#${it.number}  FAILED  ${e.message}`);
    }
  }

  log(
    `\nopen=${issues.length}  skipped=${summary.skipped}  ` +
      `healed=${summary.healed}  failed=${summary.failed}` +
      `${apply ? '' : '  (audit — no writes; pass --apply to write)'}`
  );
}

const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((err) => {
    if (reportStrictArgvError(err, { usage: USAGE })) process.exit(2);
    console.error(err);
    process.exit(1);
  });
}
