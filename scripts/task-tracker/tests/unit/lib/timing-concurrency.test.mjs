#!/usr/bin/env node
// @story #213
// EPIC #207 / #213 — verifies that two concurrent appenders to the same
// issue's `⏱ Timing Log` comment BOTH land their rows. The lock primitive
// from `locks.mjs` plus the read-modify-write inside `postTimingEvent`
// serializes the GH-side update so the second writer reads the first
// writer's row before appending.
//
// The fake `gh` binary (under fixtures/) backs the comment by a JSON file.
// Without the lock, two concurrent writers race their read-modify-write
// and the second one clobbers the first. With the lock, both rows persist.

import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
// This test moved one directory deeper (tests/unit → tests/unit/lib); offset the dir
// anchor back up so every __dirname-relative path below resolves to its original target.
const __dirname = path.dirname(__filename) + '/..';
const repoRoot = path.resolve(__dirname, '..', '../../..');
const fakeGhMjs = path.join(__dirname, '..', 'fixtures', 'fake-gh.mjs');

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-timing-conc-'));
const binDir = path.join(tmp, 'bin');
const store = path.join(tmp, 'store.json');

// Stage a `gh` shim on PATH that execs our fake-gh.mjs.
import { mkdirSync } from 'node:fs';
mkdirSync(binDir, { recursive: true });
const ghShim = path.join(binDir, 'gh');
writeFileSync(ghShim, `#!/bin/sh\nexec "${process.execPath}" "${fakeGhMjs}" "$@"\n`);
chmodSync(ghShim, 0o755);

// Seed empty store.
writeFileSync(store, JSON.stringify({ comments: [], nextId: 1 }));

// Worker script — calls postTimingEvent once with the description + event from
// argv. The event defaults to the neutral canonical `update` slug: the concurrent rows in
// this test exercise lock serialization, not bind semantics, and #568's
// append-guard forbids a *second* `start` row. The comment is established by one
// sequential `start` seed below; the racing workers then append neutral rows.
const workerPath = path.join(tmp, 'worker.mjs');
writeFileSync(
  workerPath,
  `
import { postTimingEvent, buildRow } from '${path.join(repoRoot, 'scripts/task-tracker/gh-timing-comment.mjs').replace(/\\/g, '/')}';
const description = process.argv[2];
const event = process.argv[3] || 'update';
const row = buildRow({
  ts: new Date().toISOString(),
  event,
  activeSec: 0,
  idleSec: 0,
  deltaWords: 0,
  wordMarker: 0,
  description,
});
await postTimingEvent({
  issueNumber: '#999',
  repo: 'x/y',
  row,
  retries: 3,
  withGovernedEffect: async (_options, callback) =>
    callback({ reverify: async () => {} }),
  // projDir picks up via AI_TASK_MANAGER_PROJECT_DIR
});
`
);

function runWorker(label, event) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath, label, event ?? ''], {
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        FAKE_GH_STORE: store,
        FAKE_GH_DELAY_MS: '50', // widen race window
        AI_TASK_MANAGER_PROJECT_DIR: tmp,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    child.stderr.on('data', (b) => (err += b.toString()));
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`worker ${label} exited ${code}: ${err}`));
    });
  });
}

// Establish the timing comment with one sequential `start` (the genuine
// first-ever bind). The append-guard permits exactly this one `start`.
await runWorker('seed-row', 'start');

// Now race two concurrent neutral-event appenders. The 50ms delay inside the
// fake's graphql update path widens the lost-update window; the per-issue lock
// must serialize them so BOTH rows survive.
await Promise.all([runWorker('alpha-row', 'update'), runWorker('beta-row', 'update')]);

const final = JSON.parse(readFileSync(store, 'utf8'));
assert.equal(final.comments.length, 1, 'one timing comment created');
const body = final.comments[0].body;
assert.match(body, /seed-row/, 'seed row landed');
assert.match(body, /alpha-row/, 'alpha row landed');
assert.match(body, /beta-row/, 'beta row landed');

rmSync(tmp, { recursive: true });
console.log('timing-concurrency.test.mjs: all passed');
