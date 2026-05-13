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
import { tmpdir } from 'node:os';
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

async function fetchBody({ repo, issueNumber }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return stdout;
}

async function writeBody({ repo, issueNumber, body }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'aitm-migrate-'));
  const file = path.join(dir, 'body.md');
  try {
    writeFileSync(file, body);
    await pexec('gh', ['issue', 'edit', String(issueNumber), '-R', repo, '--body-file', file], {
      timeout: GH_API_TIMEOUT_MS,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function scanOpenIssues({ repo }) {
  // gh search issues; falls back to scanning open issues if search is restricted.
  try {
    const { stdout } = await pexec(
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
  } catch (err) {
    process.stderr.write(`scan failed: ${err.message}\n`);
    return [];
  }
}

async function migrateOne({ repo, issueNumber, dry }) {
  const body = await fetchBody({ repo, issueNumber });
  const result = transformBody(body);
  const label = `#${issueNumber}`;
  if (!result.changed) {
    process.stdout.write(
      `${label}: no change (legacy=${result.legacyCount}, new=${result.newCount})\n`
    );
    return;
  }
  if (dry) {
    process.stdout.write(
      `${label}: would migrate (legacy=${result.legacyCount}, new=${result.newCount})\n`
    );
    return;
  }
  await writeBody({ repo, issueNumber, body: result.body });
  process.stdout.write(
    `${label}: migrated (legacy=${result.legacyCount}, new=${result.newCount})\n`
  );
}

async function main(argv) {
  const args = argv.slice(2);
  const dry = args.includes('--dry-run');
  const scan = args.includes('--scan');
  const numbers = args
    .filter((a) => /^\d+$/.test(a) || /^#\d+$/.test(a))
    .map((a) => Number(a.replace(/^#/, '')));

  const cfg = loadConfig();
  const repo = cfg.repo;
  if (!repo) {
    process.stderr.write('missing `repo` in .ai-task-manager/task-tracker.json\n');
    process.exit(2);
  }

  let targets = numbers;
  if (scan) {
    const scanned = await scanOpenIssues({ repo });
    targets = [...new Set([...targets, ...scanned])];
  }

  if (targets.length === 0) {
    process.stderr.write(
      'usage: migrate-fields-encoding.mjs <issue#> [...] [--dry-run] [--scan]\n'
    );
    process.exit(2);
  }

  for (const n of targets) {
    try {
      await migrateOne({ repo, issueNumber: n, dry });
    } catch (err) {
      process.stderr.write(`#${n}: error — ${err.message}\n`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv).catch((err) => {
    process.stderr.write(`fatal: ${err.message}\n`);
    process.exit(1);
  });
}
