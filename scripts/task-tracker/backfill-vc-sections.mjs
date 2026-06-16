#!/usr/bin/env node
// #427 — One-shot, idempotent heal that back-fills a `## Verification Commands`
// (VC) section onto open issues created before #410 made the section mandatory.
//
// #410 seeds a VC section at creation time; the pre-#410 corpus carries none, so
// every such issue trips `plan-exit-vc-presence-guard` the moment it is picked
// up for Plan→Develop. This script converges each VC-less body to what #410
// would have produced, using the SAME derivation preflight-issue.mjs uses.
//
// The pure core `buildVcBackfill(body)` is exported for offline unit tests; the
// CLI wraps it with `gh issue list` enumeration and `mutateIssueBody` writes.
//
//   node scripts/task-tracker/backfill-vc-sections.mjs            # heal live
//   node scripts/task-tracker/backfill-vc-sections.mjs --dry-run  # plan only

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { auditEvidenceMarkers } from './lib/evidence-markers.mjs';
import { parseVerificationCommands } from './lib/verification-commands.mjs';
import { mutateIssueBody } from './lib/issue-body-mutate.mjs';

const pexec = promisify(execFile);

const PICKUP_ANCHOR = '## Pickup Directive — MANDATORY, DO NOT SKIP';

// The four standard Functional-DoD commands a freshly-created post-#410 body
// seeds when no AC/DoD command is declared. Matches preflight-issue.mjs' result
// for a standard DoD, so a defaulted back-fill equals a recreated body.
export const DEFAULT_VC_COMMANDS = [
  'npm run test:all',
  'npm run lint',
  'npm run format:check',
  'git log --oneline -1',
];

// Pure: decide whether `body` needs a VC section and, if so, return the healed
// body. Idempotent — keyed on the SAME parser the presence-guard consumes.
//
//   { status: 'skip' }                              already has a VC section
//   { status: 'healed', mode, commands, body }      mode: 'derived' | 'default'
export function buildVcBackfill(body = '') {
  const src = String(body);
  if (parseVerificationCommands(src).length >= 1) {
    return { status: 'skip' };
  }
  const derived = auditEvidenceMarkers(src).missingVerificationCommands;
  const mode = derived.length ? 'derived' : 'default';
  const commands = derived.length ? derived : DEFAULT_VC_COMMANDS;

  const vcSection =
    '## Verification Commands\n\n' + commands.map((c) => `- [ ] \`${c}\``).join('\n') + '\n\n';

  // Canonical placement (#410): immediately before the Pickup Directive anchor;
  // append at end-of-body when the anchor is absent (sparse/epic bodies).
  const idx = src.indexOf(PICKUP_ANCHOR);
  const healed =
    idx === -1
      ? src.replace(/\s*$/, '\n\n') + vcSection
      : src.slice(0, idx) + vcSection + src.slice(idx);

  return { status: 'healed', mode, commands, body: healed };
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
  const dryRun = process.argv.includes('--dry-run');
  const repo = 'kburson/ai-task-manager';
  const issues = await listOpenIssues();

  const summary = { skipped: 0, derived: 0, default: 0, failed: 0 };
  for (const it of issues.sort((a, b) => a.number - b.number)) {
    const plan = buildVcBackfill(it.body || '');
    if (plan.status === 'skip') {
      summary.skipped += 1;
      continue;
    }
    const tag = plan.mode === 'derived' ? 'healed-derived' : 'healed-default';
    if (dryRun) {
      summary[plan.mode] += 1;
      console.log(`#${it.number}  ${tag}  [${plan.commands.join(', ')}]  (dry-run)`);
      continue;
    }
    try {
      const r = await mutateIssueBody({
        issueNumber: it.number,
        repo,
        mutate: (base) => buildVcBackfill(base).body ?? base,
      });
      summary[plan.mode] += 1;
      console.log(`#${it.number}  ${tag}  ${r.status}  [${plan.commands.join(', ')}]`);
    } catch (err) {
      summary.failed += 1;
      console.error(`#${it.number}  FAILED  ${err.message}`);
    }
  }

  console.log(
    `\nopen=${issues.length}  skipped=${summary.skipped}  ` +
      `healed-derived=${summary.derived}  healed-default=${summary.default}  failed=${summary.failed}` +
      `${dryRun ? '  (dry-run — no writes)' : ''}`
  );
}

const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
