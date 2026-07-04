#!/usr/bin/env node
// Heal legacy `aitm-stage-rollup` markers to schema:2 seconds (#694). Not part
// of the npm package — repo-local maintenance tool. Idempotent; safe to re-run.
//
// Rebuilds every rollup from raw timing evidence (entry markers primary,
// ⏱ Timing Log ladder fallback) via scripts/maintenance/lib/
// heal-stage-rollups-core.mjs, then writes exclusively through
// `mutateIssueBody` so the marker-invariant guard stays active.
//
// Usage (#698: dry-run by default; only `--apply` writes):
//   node scripts/maintenance/heal-stage-rollups.mjs                # dry-run over full corpus (open + closed)
//   node scripts/maintenance/heal-stage-rollups.mjs --apply        # full corpus, writes
//   node scripts/maintenance/heal-stage-rollups.mjs --issue 123    # single issue (add --apply to write)
//   node scripts/maintenance/heal-stage-rollups.mjs --verify       # scan only; exit 1 if any schema:1 remains

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';
import { loadConfig } from '../task-tracker/config.mjs';
import { mutateIssueBody } from '../task-tracker/lib/issue-body-mutate.mjs';
import {
  healBody,
  parseHealArgs,
  parseLadderRows,
  parseRollupMarker,
  rebuildFromEntryMarkers,
} from './lib/heal-stage-rollups-core.mjs';

const execFileP = promisify(execFile);

// ---- CLI (guards run before loadConfig so `--help` never touches gh) ----

const argv = process.argv.slice(2);
if (wantsHelp(argv)) {
  emitSelfDoc('heal-stage-rollups');
  process.exit(0);
}
const parsed = parseHealArgs(argv);
if (parsed.error) {
  console.error(`heal-stage-rollups: ${parsed.error}`);
  console.error('Usage: heal-stage-rollups.mjs [--apply] [--dry-run] [--verify] [--issue <n>]');
  process.exit(2);
}
const dryRun = parsed.mode !== 'write';
const verify = parsed.mode === 'verify';
const singleIssue = parsed.issue;

const cfg = loadConfig();
if (!cfg.repo) {
  console.error('repo not configured. Run: /task config repo owner/repo');
  process.exit(1);
}

// ---- gh helpers ----

async function gh(argv) {
  const { stdout } = await execFileP('gh', argv, { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

async function ghJSON(argv) {
  return JSON.parse(await gh(argv));
}

async function listAllIssues() {
  // Bodies fetched in the list call: one round-trip covers candidate
  // detection AND the entry-marker rebuild for most issues.
  const out = await ghJSON([
    'issue',
    'list',
    '-R',
    cfg.repo,
    '--state',
    'all',
    '--limit',
    '1000',
    '--json',
    'number,body',
  ]);
  return out;
}

async function fetchIssue(n) {
  return ghJSON(['issue', 'view', n, '-R', cfg.repo, '--json', 'number,body']);
}

async function fetchLadderRows(n) {
  const { comments } = await ghJSON(['issue', 'view', n, '-R', cfg.repo, '--json', 'comments']);
  const timing = (comments || []).find((c) => c.body && c.body.includes('⏱ Timing Log'));
  return timing ? parseLadderRows(timing.body) : [];
}

// ---- candidate detection ----

function isCandidate(body) {
  const b = String(body || '');
  return b.includes('aitm-stage-rollup') || b.includes('aitm-entered-');
}

function markerSchema(body) {
  const payload = parseRollupMarker(body);
  return payload ? (payload.schema ?? 1) : null;
}

// ---- bounded worker pool ----

async function runPool(items, worker, size = 4) {
  const results = [];
  let idx = 0;
  const lanes = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(lanes);
  return results;
}

// ---- per-issue heal ----

async function healIssue(issue) {
  const n = String(issue.number);
  try {
    // Ladder rows are fetched only when the entry-marker rebuild yields
    // nothing — most issues resolve from body markers alone.
    const ladderRows = rebuildFromEntryMarkers(issue.body) ? [] : await fetchLadderRows(n);
    const preview = healBody(issue.body, ladderRows);
    if (!preview.changed) {
      return { n, status: 'unchanged', summary: preview.summary };
    }
    if (dryRun) {
      return { n, status: 'would-heal', summary: preview.summary };
    }
    const res = await mutateIssueBody({
      issueNumber: Number(n),
      repo: cfg.repo,
      // Recompute from the freshly-fetched base so retries stay correct.
      mutate: (base) => healBody(base, ladderRows).next,
    });
    return { n, status: res.status === 'no-op' ? 'unchanged' : 'healed', summary: preview.summary };
  } catch (e) {
    return { n, status: 'error', summary: (e.message || String(e)).split('\n')[0] };
  }
}

// ---- main ----

(async () => {
  const issues = singleIssue ? [await fetchIssue(singleIssue)] : await listAllIssues();
  const candidates = issues.filter((i) => isCandidate(i.body));
  console.log(
    `heal-stage-rollups: ${issues.length} issue(s), ${candidates.length} candidate(s) | repo=${cfg.repo} | mode=${
      verify ? 'verify' : dryRun ? 'dry-run' : 'write'
    }`
  );

  if (verify) {
    const legacy = candidates.filter((i) => markerSchema(i.body) === 1);
    for (const i of legacy) console.log(`#${i.number}: schema:1 marker remains`);
    console.log(`verify: ${legacy.length} schema:1 marker(s) remaining`);
    process.exit(legacy.length > 0 ? 1 : 0);
  }

  const results = await runPool(candidates, healIssue, 4);
  const tally = {};
  for (const r of results) {
    tally[r.status] = (tally[r.status] || 0) + 1;
    if (r.status !== 'unchanged') console.log(`#${r.n}: ${r.status} — ${r.summary}`);
  }
  console.log(
    `done: ${Object.entries(tally)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')}`
  );
  if (tally.error) process.exit(1);
})().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
