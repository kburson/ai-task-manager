#!/usr/bin/env node
// #891 — migrate legacy prose-position non-demonstrable tags to the
// canonical `<!-- aitm-non-demonstrable -->` marker. Not part of the npm
// package — repo-local maintenance tool. Idempotent; safe to re-run.
//
// `NON_DEMONSTRABLE_TAG_RE` (body-invariants.mjs) used to test the AC's
// visible label text for the substring "invalid — non-demonstrable", which
// meant prose merely discussing the tag (not genuinely bearing it) could
// satisfy the opt-out. #891 anchors the regex to a trailing HTML-comment
// marker instead. This script finds AC lines that carried the old prose form
// and appends the new marker, so legacy bodies keep their honest opt-out
// after the regex change. Writes exclusively through `mutateIssueBody` so the
// marker-invariant guard stays active.
//
// Usage (dry-run by default; only `--apply` writes):
//   node scripts/maintenance/migrate-non-demonstrable-tag-position.mjs                # dry-run, full corpus (open + closed)
//   node scripts/maintenance/migrate-non-demonstrable-tag-position.mjs --apply        # full corpus, writes
//   node scripts/maintenance/migrate-non-demonstrable-tag-position.mjs --issue 123    # single issue (add --apply to write)
//   node scripts/maintenance/migrate-non-demonstrable-tag-position.mjs --yes          # skip blast-radius prompt on multi-issue --apply

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { loadConfig } from '../task-tracker/config.mjs';
import { mutateIssueBody } from '../task-tracker/lib/issue-body-mutate.mjs';
import { confirmBlastRadius } from '../task-tracker/lib/blast-radius-guard.mjs';
import { assertKnownArgv, reportStrictArgvError } from '../task-tracker/lib/argv-strict.mjs';
import {
  findLegacyNonDemonstrableAcs,
  migrateBody,
} from './lib/migrate-non-demonstrable-tag-position-core.mjs';

const execFileP = promisify(execFile);

export const USAGE =
  'Usage: migrate-non-demonstrable-tag-position.mjs [--apply] [--issue <n>] [--yes]\n' +
  '  (default)   dry-run, no writes\n' +
  '  --apply     append the canonical marker to legacy-tagged ACs\n' +
  '  --issue <n> restrict to a single issue\n' +
  '  --yes       skip the blast-radius confirmation prompt on a multi-issue --apply\n' +
  '  --help, -h  print this usage and exit; never writes\n';

function parseArgs(argv) {
  const args = { apply: false, issue: null, yes: false };
  if (assertKnownArgv(argv, { flags: ['--apply', '--yes'], options: ['--issue'], usage: USAGE })) {
    args.help = true;
    return args;
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--yes') args.yes = true;
    else if (a === '--issue' && argv[i + 1]) {
      args.issue = String(argv[i + 1]).replace(/^#/, '');
      i++;
    }
  }
  return args;
}

async function gh(argv) {
  const { stdout } = await execFileP('gh', argv, { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

async function ghJSON(argv) {
  return JSON.parse(await gh(argv));
}

async function listAllIssues(repo) {
  return ghJSON([
    'issue',
    'list',
    '-R',
    repo,
    '--state',
    'all',
    '--limit',
    '1000',
    '--json',
    'number,body',
  ]);
}

async function fetchIssue(repo, n) {
  return ghJSON(['issue', 'view', n, '-R', repo, '--json', 'number,body']);
}

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

async function migrateIssue(repo, issue, dryRun) {
  const n = String(issue.number);
  try {
    const preview = migrateBody(issue.body);
    if (!preview.changed) return { n, status: 'unchanged' };
    if (dryRun) return { n, status: 'would-migrate', count: preview.migrated.length };
    const res = await mutateIssueBody({
      issueNumber: Number(n),
      repo,
      mutate: (base) => migrateBody(base).next,
    });
    return {
      n,
      status: res.status === 'no-op' ? 'unchanged' : 'migrated',
      count: preview.migrated.length,
    };
  } catch (e) {
    return { n, status: 'error', summary: (e.message || String(e)).split('\n')[0] };
  }
}

async function main(deps = {}) {
  const confirm = deps.confirmBlastRadius || confirmBlastRadius;
  const { apply, issue, yes, help } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log(USAGE);
    return;
  }
  const dryRun = !apply;
  const cfg = loadConfig();
  if (!cfg.repo) {
    console.error('repo not configured. Run: /task config repo owner/repo');
    process.exit(1);
  }

  const issues = issue ? [await fetchIssue(cfg.repo, issue)] : await listAllIssues(cfg.repo);
  const candidates = issues.filter((i) => findLegacyNonDemonstrableAcs(i.body).length > 0);
  console.log(
    `migrate-non-demonstrable-tag-position: ${issues.length} issue(s), ${candidates.length} candidate(s) | repo=${cfg.repo} | mode=${dryRun ? 'dry-run' : 'write'}`
  );

  if (!dryRun) {
    const decision = await confirm({
      issueNumbers: candidates.map((i) => i.number),
      yes,
      log: (s) => process.stdout.write(s),
      warn: (s) => process.stderr.write(s),
    });
    if (!decision.proceed) {
      process.exit(2);
      return;
    }
  }

  const results = await runPool(candidates, (i) => migrateIssue(cfg.repo, i, dryRun), 4);
  const tally = {};
  for (const r of results) {
    tally[r.status] = (tally[r.status] || 0) + 1;
    if (r.status !== 'unchanged') {
      console.log(
        `#${r.n}: ${r.status}${r.count ? ` (${r.count} AC line(s))` : ''}${r.summary ? ` — ${r.summary}` : ''}`
      );
    }
  }
  console.log(
    `done: ${Object.entries(tally)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')}`
  );
  if (tally.error) process.exit(1);
}

main().catch((err) => {
  if (reportStrictArgvError(err, { usage: USAGE })) process.exit(2);
  console.error(err.stack || err.message);
  process.exit(1);
});
