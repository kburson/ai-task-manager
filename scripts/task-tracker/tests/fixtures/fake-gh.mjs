#!/usr/bin/env node
// Test-only fake `gh` for timing-concurrency.test.mjs. Backs the timing
// comment by a JSON file at $FAKE_GH_STORE. Supports the three subcommands
// postTimingEvent calls: `issue view --json comments`, `issue comment`,
// and `api graphql ... updateIssueComment`.
//
// Optional $FAKE_GH_DELAY_MS introduces a delay between the read and the
// write inside the fake's update path — used to widen the lost-update
// window so the test fails *without* the lock.

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

// `gh issue view <n> -R <repo> --json comments`
if (args[0] === 'issue' && args[1] === 'view') {
  const s = load();
  process.stdout.write(JSON.stringify({ comments: s.comments }));
  process.exit(0);
}

// `gh issue comment <n> -R <repo> --body <body>`
if (args[0] === 'issue' && args[1] === 'comment') {
  const i = args.indexOf('--body');
  const body = i >= 0 ? args[i + 1] : '';
  const s = load();
  const id = `C_${s.nextId++}`;
  s.comments.push({ id, url: `https://example/${id}`, body });
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
