#!/usr/bin/env node
// AC4 (#171) — read-only backfill sweep.
//
// Runs the canonical `verifyIssueBody` over every OPEN issue in the repo and
// prints a per-issue report of missing sections. Read-only: it reports gaps so
// historical hand-rolled bodies can be batch-backfilled; it never mutates a
// body (any mutation must route through `mutateIssueBody`).
//
// Exit codes:
//   0  every open issue body is canonical
//   5  one or more open issue bodies failed the verifier
//   1  usage / runtime error
//
// Usage: node scripts/gh/verify-open-issue-bodies.mjs [--json]

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from '../task-tracker/config.mjs';
import { verifyIssueBody } from './lib/issue-body-verifier.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

if (import.meta.url === `file://${process.argv[1]}` && wantsHelp(process.argv.slice(2))) {
  emitSelfDoc('verify-open-issue-bodies');
  process.exit(0);
}

// Injectable seam (#650): production wiring defaults to the real bindings; tests
// override these to drive the fetch-paging, no-repo guard, JSON/text output, and
// exit-code branches offline without gh or the network. Behaviour-preserving.
export const deps = {
  execFile,
  loadConfig,
  log: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
  exit: (c) => process.exit(c),
};

// #480 AC9 — strict `{discuss}` detection: a line that is the bare token alone
// (after trim). This deliberately does NOT reuse `hasDiscussMarker` from
// lib/discuss-marker.mjs, whose substring match (`includes('{discuss}')`) yields
// false positives on prose/backtick mentions — that bug is tracked as #479. A
// `{discuss}` body is a user-request stub whose work is undefined until a Refine
// brainstorm; it is exempt from the canonical-structure requirement and reported
// as skipped (pending Refine), never as a failure.
export function hasStrictDiscussMarker(body) {
  return String(body ?? '')
    .split('\n')
    .some((line) => line.trim() === '{discuss}');
}

// ── pure reporting core (unit-tested) ──────────────────────────────────────
// Takes [{ number, title, body }], returns { reports, failCount } where each
// report is { number, title, ok, missing, skipped }. `{discuss}` stubs are
// reported with skipped:true and excluded from failCount.
export function buildSweepReport(issues) {
  const reports = issues.map((issue) => {
    if (hasStrictDiscussMarker(issue.body)) {
      return {
        number: issue.number,
        title: issue.title ?? '',
        ok: true,
        skipped: true,
        missing: [],
      };
    }
    const { ok, missing } = verifyIssueBody(issue.body ?? '');
    return { number: issue.number, title: issue.title ?? '', ok, missing, skipped: false };
  });
  const failCount = reports.filter((r) => !r.ok).length;
  return { reports, failCount };
}

export function formatSweepReport({ reports, failCount }) {
  const lines = [];
  for (const r of reports) {
    if (r.ok) continue;
    lines.push(`#${r.number} — ${r.title}`);
    for (const m of r.missing) lines.push(`  ✗ ${m}`);
  }
  const skipped = reports.filter((r) => r.skipped);
  for (const r of skipped) {
    lines.push(`#${r.number} — ${r.title}`);
    lines.push('  ⏭ skipped — {discuss} stub, pending Refine');
  }
  lines.push('');
  const scored = reports.length - skipped.length;
  const skipNote = skipped.length ? ` (${skipped.length} skipped: {discuss} stubs)` : '';
  lines.push(
    failCount === 0
      ? `All ${scored} open issue bodies are canonical${skipNote}.`
      : `${failCount}/${scored} open issue bodies failed the verifier${skipNote}.`
  );
  return lines.join('\n');
}

// ── live fetch ─────────────────────────────────────────────────────────────
export async function listOpenIssues(
  repo,
  { perPage = 100, timeoutMs = 30000, execFile: exec = execFile } = {}
) {
  const pexec = promisify(exec);
  const issues = [];
  let page = 1;
  while (true) {
    const { stdout } = await pexec(
      'gh',
      [
        'api',
        `repos/${repo}/issues?state=open&per_page=${perPage}&page=${page}`,
        '--jq',
        '[.[] | select(.pull_request | not) | {number, title, body}]',
      ],
      { timeout: timeoutMs }
    );
    const batch = JSON.parse(stdout || '[]');
    if (batch.length === 0) break;
    issues.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }
  return issues;
}

export async function main(argv = process.argv, overrides = {}) {
  const d = { ...deps, ...overrides };
  const asJson = argv.slice(2).includes('--json');
  const cfg = d.loadConfig();
  if (!cfg.repo) {
    d.err('No repo configured in task-tracker.json\n');
    return d.exit(1);
  }
  const issues = await listOpenIssues(cfg.repo, { execFile: d.execFile });
  const result = buildSweepReport(issues);
  if (asJson) {
    d.log(JSON.stringify(result, null, 2) + '\n');
  } else {
    d.log(formatSweepReport(result) + '\n');
  }
  return d.exit(result.failCount === 0 ? 0 : 5);
}

// Only run when invoked directly (so tests can import the pure core).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`${err?.message ?? err}\n`);
    process.exit(1);
  });
}
