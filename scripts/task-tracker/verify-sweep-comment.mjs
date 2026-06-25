#!/usr/bin/env node
// #539 AC5 verifier. Confirms the live-backlog duplicate-`start` sweep result is
// recorded in a comment on the given issue. Fetches the issue's comments via
// `gh` and asserts an `aitm-sweep-result` marker is present AND reports a fully
// converged backlog (`after_corrupted=0`). Exits 0 when satisfied, 1 otherwise.
//
// Single argv-friendly command (no pipes, no shell) so it runs unchanged under
// the evidence-runner's execFile spawn:
//   node scripts/task-tracker/verify-sweep-comment.mjs <issue> [--repo owner/name]
import { execFileSync } from 'node:child_process';

import { loadConfig } from './config.mjs';

function parseArgs(argv) {
  const args = { issue: null, repo: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') args.repo = argv[++i];
    else if (a.startsWith('--repo=')) args.repo = a.slice('--repo='.length);
    else if (!args.issue && /^#?\d+$/.test(a)) args.issue = a.replace(/^#/, '');
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.issue) {
    process.stderr.write('verify-sweep-comment: issue number required\n');
    process.exit(2);
  }
  const repo = args.repo || loadConfig().repo;
  if (!repo) {
    process.stderr.write('verify-sweep-comment: repo not resolved\n');
    process.exit(2);
  }

  const raw = execFileSync('gh', ['issue', 'view', args.issue, '-R', repo, '--json', 'comments'], {
    encoding: 'utf8',
  });
  const comments = JSON.parse(raw).comments || [];

  const marker = /<!--\s*aitm-sweep-result:([^>]*)-->/;
  for (const c of comments) {
    const m = marker.exec(c.body || '');
    if (!m) continue;
    const fields = Object.fromEntries(
      m[1]
        .trim()
        .split(/\s+/)
        .map((kv) => kv.split('='))
        .filter((p) => p.length === 2)
    );
    if (fields.after_corrupted === '0') {
      process.stdout.write(
        `verify-sweep-comment: OK issue=#${args.issue} ` +
          `before_corrupted=${fields.before_corrupted} before_extra=${fields.before_extra} ` +
          `after_corrupted=${fields.after_corrupted} after_extra=${fields.after_extra}\n`
      );
      process.exit(0);
    }
    process.stderr.write(
      `verify-sweep-comment: marker found but after_corrupted=${fields.after_corrupted} (expected 0)\n`
    );
    process.exit(1);
  }

  process.stderr.write(
    `verify-sweep-comment: no aitm-sweep-result marker on any comment of #${args.issue}\n`
  );
  process.exit(1);
}

main();
