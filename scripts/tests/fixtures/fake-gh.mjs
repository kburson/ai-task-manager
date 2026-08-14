#!/usr/bin/env node
// Test-only fake `gh`. Backs issue comments by a JSON file at $FAKE_GH_STORE.
// Supports the three subcommands postTimingEvent calls: `issue view --json
// comments`, `issue comment`, and `api graphql ... updateIssueComment`.
//
// Comments are namespaced by issue number: `issue view <n>` returns only the
// comments created for issue <n>, so a multi-issue test (e.g. cli.test's
// start/resume block binding #200/#201/#202) sees each issue's timing log in
// isolation — a fresh issue reads as genuinely absent. `api graphql`
// updateIssueComment locates the target comment by id across all issues.
//
// Optional $FAKE_GH_DELAY_MS introduces a delay between the read and the
// write inside the fake's update path — used to widen the lost-update
// window so the concurrency test fails *without* the lock.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const storePath = process.env.FAKE_GH_STORE;
const delayMs = Number(process.env.FAKE_GH_DELAY_MS || 0);

function load() {
  if (!existsSync(storePath)) return { comments: [], nextId: 1 };
  return JSON.parse(readFileSync(storePath, 'utf8'));
}
function save(s) {
  writeFileSync(storePath, JSON.stringify(s, null, 2));
}
function sleepSync(ms) {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// `gh issue view <n> -R <repo> --json comments` → comments for issue <n> only.
if (args[0] === 'issue' && args[1] === 'view') {
  const issue = String(args[2] ?? '').replace(/^#/, '');
  const s = load();
  const comments = s.comments.filter((c) => String(c.issue ?? '') === issue);
  process.stdout.write(JSON.stringify({ comments }));
  process.exit(0);
}

// `gh issue comment <n> -R <repo> --body <body>`
if (args[0] === 'issue' && args[1] === 'comment') {
  const issue = String(args[2] ?? '').replace(/^#/, '');
  const i = args.indexOf('--body');
  const body = i >= 0 ? args[i + 1] : '';
  const s = load();
  const id = `C_${s.nextId++}`;
  s.comments.push({ id, url: `https://example/${id}`, body, issue });
  save(s);
  process.stdout.write(`https://example/${id}\n`);
  process.exit(0);
}

// `gh api graphql -f query=... -f id=<id> -f body=<body>`
if (args[0] === 'api' && args[1] === 'graphql') {
  let id, body;
  for (const a of args) {
    if (a.startsWith('id=')) id = a.slice(3);
    if (a.startsWith('body=')) body = a.slice(5);
  }
  const s = load();
  // The vulnerability without the lock: read, then sleep, then write —
  // a concurrent updater can squeeze in and lose one row.
  sleepSync(delayMs);
  const c = s.comments.find((x) => x.id === id);
  if (c) c.body = body;
  save(s);
  process.stdout.write('{}\n');
  process.exit(0);
}

process.stderr.write(`fake-gh: unsupported args: ${JSON.stringify(args)}\n`);
process.exit(2);
