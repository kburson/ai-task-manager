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

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  normalizePlanMetadataSection,
  findUnboldPlanMetadataLabels,
} from './lib/plan-metadata.mjs';
import { mutateIssueBody } from './lib/issue-body-mutate.mjs';

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

async function listOpenIssues() {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'list', '--state', 'open', '--limit', '500', '--json', 'number,title,body'],
    { maxBuffer: 50 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const repo = 'kburson/ai-task-manager';
  const issues = await listOpenIssues();

  const summary = { skipped: 0, healed: 0, failed: 0 };
  for (const it of issues.sort((a, b) => a.number - b.number)) {
    const plan = buildPlanMetadataBackfill(it.body || '');
    if (plan.status === 'skip') {
      summary.skipped += 1;
      continue;
    }
    if (!apply) {
      summary.healed += 1;
      console.log(`#${it.number}  would-bold  [${plan.changed.join(', ')}]  (audit)`);
      continue;
    }
    try {
      const r = await mutateIssueBody({
        issueNumber: it.number,
        repo,
        mutate: (base) => buildPlanMetadataBackfill(base).body ?? base,
      });
      summary.healed += 1;
      console.log(`#${it.number}  bolded  ${r.status}  [${plan.changed.join(', ')}]`);
    } catch (err) {
      summary.failed += 1;
      console.error(`#${it.number}  FAILED  ${err.message}`);
    }
  }

  console.log(
    `\nopen=${issues.length}  skipped=${summary.skipped}  ` +
      `healed=${summary.healed}  failed=${summary.failed}` +
      `${apply ? '' : '  (audit — no writes; pass --apply to write)'}`
  );
}

const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
