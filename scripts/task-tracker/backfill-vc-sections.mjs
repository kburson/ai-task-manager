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
// Audit/dry-run is the DEFAULT (#722) — nothing is written without `--apply`:
//   node scripts/task-tracker/backfill-vc-sections.mjs            # audit only
//   node scripts/task-tracker/backfill-vc-sections.mjs --apply    # write
//   node scripts/task-tracker/backfill-vc-sections.mjs --help     # usage, no writes
//
// #879 — `--scope N,N,...` narrows the working set to the named issue(s),
// honored in both audit and `--apply` mode. A scope number absent from the
// fetched open-issue list is a hard error (typo/closed/nonexistent — mirrors
// #878's fail-loud philosophy) before any write happens. A scope number that
// IS open but already has a VC section (`buildVcBackfill` returns
// `status: 'skip'`) is not a mistake; it gets an explicit
// `scope-target-already-healed` warning line rather than vanishing into the
// aggregate `skipped` tally — naming a specific issue means its outcome must
// be visible.
//   node scripts/task-tracker/backfill-vc-sections.mjs --scope 877          # audit one
//   node scripts/task-tracker/backfill-vc-sections.mjs --scope 877,881 --apply

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { auditEvidenceMarkers } from './lib/evidence-markers.mjs';
import { parseVerificationCommands } from './lib/verification-commands.mjs';
import { renderVcSection, spliceVcSection, nextVcId } from './lib/vc-emit.mjs';
import { mutateIssueBody } from './lib/issue-body-mutate.mjs';
import { parseStrict, reportStrictArgvError } from './lib/argv-strict.mjs';
import { confirmBlastRadius } from './lib/blast-radius-guard.mjs';

const pexec = promisify(execFile);

// Line-start heading match — mirrors `PICKUP_HEADING_RE` in lib/deep-dive.mjs.
// A raw substring search (e.g. `indexOf('## Pickup Directive...')`) would also
// match the same text quoted inside AC/Scope/User-Story prose, splicing the VC
// section into the middle of that prose instead of before the real heading.
const PICKUP_HEADING_RE = /^##\s+Pickup Directive\b.*$/im;

// The standard Functional-DoD commands a freshly-created post-#410 body
// seeds when no AC/DoD command is declared. Matches preflight-issue.mjs' result
// for a standard DoD, so a defaulted back-fill equals a recreated body.
// #934 — the two-lane `tests` DoD split seeds `npm test` + `npm run test:slow`
// (each under its own runner budget) in place of the single `npm run test:all`,
// so a defaulted back-fill still equals a recreated body.
export const DEFAULT_VC_COMMANDS = [
  'npm test',
  'npm run test:slow',
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

  // #772 — stamp stable ids (tombstone-aware next-id, though a VC-less body has
  // none yet) and splice with one blank line above AND below the header.
  const vcSection = renderVcSection(commands, nextVcId(src));

  // Canonical placement (#410): immediately before the Pickup Directive heading;
  // append at end-of-body when the heading is absent (sparse/epic bodies).
  const match = PICKUP_HEADING_RE.exec(src);
  const healed =
    match === null
      ? spliceVcSection(src, vcSection, '')
      : spliceVcSection(src.slice(0, match.index), vcSection, src.slice(match.index));

  return { status: 'healed', mode, commands, body: healed };
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
  'Usage: backfill-vc-sections.mjs [--apply] [--dry-run] [--scope N,N,...] [--yes] [--help]\n' +
  '  (default)   audit only, no writes\n' +
  '  --apply     write the healed VC section to each open issue that needs one\n' +
  '  --dry-run   explicit alias for the audit-only default\n' +
  '  --scope     restrict to the named open issue number(s), comma-separated\n' +
  '  --yes       skip the blast-radius confirmation prompt on a multi-issue --apply\n' +
  '  --help, -h  print this usage and exit; never writes\n';

// Parse `--scope 877,881` (or `--scope=877,881`) into a Set of issue numbers.
// Non-numeric tokens are dropped silently here; they simply will never match
// a fetched issue number and so surface via the unmatched-scope hard error.
function parseScope(value) {
  return new Set(
    String(value)
      .split(',')
      .map((s) => Number(s.trim().replace(/^#/, '')))
      .filter(Number.isFinite)
  );
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const log = deps.log || ((s) => console.log(s));

  // Strict argv first: refuse unknown tokens before any `gh` call, so a typo is
  // a no-op rather than an unbounded write (#878).
  const parsed = parseStrict(argv, {
    flags: ['--apply', '--dry-run', '--yes'],
    options: ['--scope'],
    usage: USAGE,
  });
  if (parsed.help) {
    log(USAGE);
    return;
  }

  const list = deps.listOpenIssues || listOpenIssues;
  const mutate = deps.mutateIssueBody || mutateIssueBody;
  const err = deps.err || ((s) => console.error(s));
  const confirm = deps.confirmBlastRadius || confirmBlastRadius;
  const apply = Boolean(parsed.values['--apply']);
  const yes = Boolean(parsed.values['--yes']);
  const repo = 'kburson/ai-task-manager';
  const allIssues = await list(deps);

  let issues = allIssues;
  if (parsed.values['--scope'] !== undefined) {
    const scope = parseScope(parsed.values['--scope']);
    const matched = allIssues.filter((it) => scope.has(it.number));
    const matchedNumbers = new Set(matched.map((it) => it.number));
    const unmatched = [...scope].filter((n) => !matchedNumbers.has(n));
    if (unmatched.length) {
      err(
        `backfill-vc-sections: --scope names issue(s) not found among open issues: ` +
          `${unmatched.sort((a, b) => a - b).join(', ')}`
      );
      if (deps.exit) deps.exit(2);
      else process.exitCode = 2;
      return;
    }
    issues = matched;
  }

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

  const summary = { skipped: 0, derived: 0, default: 0, failed: 0 };
  for (const it of issues.sort((a, b) => a.number - b.number)) {
    const plan = buildVcBackfill(it.body || '');
    if (plan.status === 'skip') {
      summary.skipped += 1;
      if (parsed.values['--scope'] !== undefined) {
        log(`#${it.number}  scope-target-already-healed  (no write)`);
      }
      continue;
    }
    const tag = plan.mode === 'derived' ? 'healed-derived' : 'healed-default';
    if (!apply) {
      summary[plan.mode] += 1;
      log(
        `#${it.number}  ${tag}  [${plan.commands.join(', ')}]  (audit — no writes; pass --apply to write)`
      );
      continue;
    }
    try {
      const r = await mutate({
        issueNumber: it.number,
        repo,
        mutate: (base) => buildVcBackfill(base).body ?? base,
      });
      summary[plan.mode] += 1;
      log(`#${it.number}  ${tag}  ${r.status}  [${plan.commands.join(', ')}]`);
    } catch (e) {
      summary.failed += 1;
      err(`#${it.number}  FAILED  ${e.message}`);
    }
  }

  log(
    `\nopen=${issues.length}  skipped=${summary.skipped}  ` +
      `healed-derived=${summary.derived}  healed-default=${summary.default}  failed=${summary.failed}` +
      `${!apply ? '  (audit — no writes; pass --apply to write)' : ''}`
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
