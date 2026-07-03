#!/usr/bin/env node
// Migrate one or more GitHub issue bodies from the legacy fenced fields-DB block
// (or stacked drift) to the single-line `<!-- aitm-fields: ... -->` encoding.
//
// Usage:
//   node scripts/task-tracker/migrate-fields-encoding.mjs <issue#> [<issue#> ...]
//   node scripts/task-tracker/migrate-fields-encoding.mjs --scan
//     (scans open issues with the legacy marker via `gh search issues`)
//
// Idempotent: a body with exactly one new-encoding block and no legacy block
// is a no-op.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { projectScratchDir } from './lib/scratch-dir.mjs';
import path from 'node:path';

import { parseIssueFieldDb, stripIssueFieldDb, formatIssueFieldDb } from './issue-field-db.mjs';
import { loadConfig } from './config.mjs';
import { GH_API_TIMEOUT_MS } from './lib/process-timeouts.mjs';

const pexec = promisify(execFile);

export function transformBody(body) {
  const legacyCount = (body.match(/^[ \t]*<!--\s*ai-task-manager:fields:start\s*-->/gm) || [])
    .length;
  const newCount = (body.match(/^[ \t]*<!--\s*aitm-fields:/gm) || []).length;

  if (legacyCount === 0 && newCount <= 1) {
    return { changed: false, body, legacyCount, newCount };
  }

  const parsed = parseIssueFieldDb(body);
  if (!parsed.ok) {
    return { changed: false, body, legacyCount, newCount, reason: parsed.reason };
  }
  const nextBody = `${stripIssueFieldDb(body)}\n\n${formatIssueFieldDb(parsed.values)}\n`;
  return {
    changed: nextBody !== body,
    body: nextBody,
    legacyCount,
    newCount,
    values: parsed.values,
  };
}

export async function fetchBody({ repo, issueNumber }, deps = {}) {
  const run = deps.pexec || pexec;
  const { stdout } = await run(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return stdout;
}

export async function writeBody({ repo, issueNumber, body }, deps = {}) {
  const run = deps.pexec || pexec;
  const mkdtemp = deps.mkdtemp || mkdtempSync;
  const write = deps.writeFile || writeFileSync;
  const rm = deps.rm || rmSync;
  const scratch = deps.scratchDir || projectScratchDir;
  const dir = mkdtemp(path.join(scratch('test'), 'aitm-migrate-'));
  const file = path.join(dir, 'body.md');
  try {
    write(file, body);
    await run('gh', ['issue', 'edit', String(issueNumber), '-R', repo, '--body-file', file], {
      timeout: GH_API_TIMEOUT_MS,
    });
  } finally {
    rm(dir, { recursive: true, force: true });
  }
}

export async function scanOpenIssues({ repo }, deps = {}) {
  const run = deps.pexec || pexec;
  const err = deps.err || ((s) => process.stderr.write(s));
  // gh search issues; falls back to scanning open issues if search is restricted.
  try {
    const { stdout } = await run(
      'gh',
      [
        'search',
        'issues',
        'ai-task-manager:fields:start',
        '--repo',
        repo,
        '--state',
        'open',
        '--json',
        'number',
        '--limit',
        '500',
      ],
      { timeout: GH_API_TIMEOUT_MS }
    );
    return JSON.parse(stdout).map((x) => x.number);
  } catch (e) {
    err(`scan failed: ${e.message}\n`);
    return [];
  }
}

export async function migrateOne({ repo, issueNumber, dry }, deps = {}) {
  const fetch = deps.fetchBody || fetchBody;
  const write = deps.writeBody || writeBody;
  const out = deps.out || ((s) => process.stdout.write(s));
  const body = await fetch({ repo, issueNumber }, deps);
  const result = transformBody(body);
  const label = `#${issueNumber}`;
  if (!result.changed) {
    out(`${label}: no change (legacy=${result.legacyCount}, new=${result.newCount})\n`);
    return;
  }
  if (dry) {
    out(`${label}: would migrate (legacy=${result.legacyCount}, new=${result.newCount})\n`);
    return;
  }
  await write({ repo, issueNumber, body: result.body }, deps);
  out(`${label}: migrated (legacy=${result.legacyCount}, new=${result.newCount})\n`);
}

export async function main(argv, deps = {}) {
  const load = deps.loadConfig || loadConfig;
  const scanFn = deps.scanOpenIssues || scanOpenIssues;
  const migrateFn = deps.migrateOne || migrateOne;
  const err = deps.err || ((s) => process.stderr.write(s));
  const exit = deps.exit || ((c) => process.exit(c));
  const args = argv.slice(2);
  const dry = args.includes('--dry-run');
  const scan = args.includes('--scan');
  const numbers = args
    .filter((a) => /^\d+$/.test(a) || /^#\d+$/.test(a))
    .map((a) => Number(a.replace(/^#/, '')));

  const cfg = load();
  const repo = cfg.repo;
  if (!repo) {
    err('missing `repo` in .ai-task-manager/task-tracker.json\n');
    return exit(2);
  }

  let targets = numbers;
  if (scan) {
    const scanned = await scanFn({ repo }, deps);
    targets = [...new Set([...targets, ...scanned])];
  }

  if (targets.length === 0) {
    err('usage: migrate-fields-encoding.mjs <issue#> [...] [--dry-run] [--scan]\n');
    return exit(2);
  }

  for (const n of targets) {
    try {
      await migrateFn({ repo, issueNumber: n, dry }, deps);
    } catch (e) {
      err(`#${n}: error — ${e.message}\n`);
    }
  }
  return undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv).catch((err) => {
    process.stderr.write(`fatal: ${err.message}\n`);
    process.exit(1);
  });
}
