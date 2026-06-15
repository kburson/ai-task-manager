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

const pexec = promisify(execFile);

// ── pure reporting core (unit-tested) ──────────────────────────────────────
// Takes [{ number, title, body }], returns { reports, failCount } where each
// report is { number, title, ok, missing }.
export function buildSweepReport(issues) {
  const reports = issues.map((issue) => {
    const { ok, missing } = verifyIssueBody(issue.body ?? '');
    return { number: issue.number, title: issue.title ?? '', ok, missing };
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
  lines.push('');
  lines.push(
    failCount === 0
      ? `All ${reports.length} open issue bodies are canonical.`
      : `${failCount}/${reports.length} open issue bodies failed the verifier.`
  );
  return lines.join('\n');
}

// ── live fetch ─────────────────────────────────────────────────────────────
async function listOpenIssues(repo, { perPage = 100, timeoutMs = 30000 } = {}) {
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

async function main() {
  const asJson = process.argv.slice(2).includes('--json');
  const cfg = loadConfig();
  if (!cfg.repo) {
    process.stderr.write('No repo configured in task-tracker.json\n');
    process.exit(1);
  }
  const issues = await listOpenIssues(cfg.repo);
  const result = buildSweepReport(issues);
  if (asJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stdout.write(formatSweepReport(result) + '\n');
  }
  process.exit(result.failCount === 0 ? 0 : 5);
}

// Only run when invoked directly (so tests can import the pure core).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`${err?.message ?? err}\n`);
    process.exit(1);
  });
}
