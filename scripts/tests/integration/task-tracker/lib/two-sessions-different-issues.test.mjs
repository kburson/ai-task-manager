#!/usr/bin/env node
// @story #216
// #216 AC8 — Two concurrent sessions A and B posting to DIFFERENT issues
// hold DIFFERENT per-issue lock paths. Their critical sections may overlap
// freely; no collision, no contention.

import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { createActivatedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const workerPath = path.join(__dirname, '../../helpers/worker.mjs');
const tmp = await createActivatedRuntimeRootFixture('tt-int-diff-');
const logPath = path.join(tmp, 'events.ndjson');
writeFileSync(logPath, '');

const enteredWorkers = [];
function runWorker(issue, label, holdMs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      process.execPath,
      [workerPath, tmp, issue, label, logPath, String(holdMs), 'overlap-barrier'],
      {
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      }
    );
    proc.on('message', (message) => {
      if (message.event !== 'entered') return;
      enteredWorkers.push(proc);
      if (enteredWorkers.length === 2) {
        for (const worker of enteredWorkers) worker.send('release');
      }
    });
    proc.on('error', reject);
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker exit ${code}`))));
  });
}

// Each worker waits inside its acquired critical section until both have
// entered. This proves independent locks without relying on startup timing.
// A global lock cannot satisfy the barrier and fails with a bounded timeout.
await Promise.all([runWorker('#A1', 'sess-A', 200), runWorker('#B2', 'sess-B', 200)]);

assert.equal(existsSync(logPath), true);
const lines = readFileSync(logPath, 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l));

const aStart = lines.find((e) => e.session === 'sess-A' && e.event === 'start');
const aEnd = lines.find((e) => e.session === 'sess-A' && e.event === 'end');
const bStart = lines.find((e) => e.session === 'sess-B' && e.event === 'start');
const bEnd = lines.find((e) => e.session === 'sess-B' && e.event === 'end');
assert.ok(aStart && aEnd && bStart && bEnd, 'both workers logged start+end');

// Overlap = A.start < B.end && B.start < A.end
const overlap = aStart.t < bEnd.t && bStart.t < aEnd.t;
assert.ok(
  overlap,
  'critical sections overlap across different issues (per-issue lock granularity)'
);

rmSync(tmp, { recursive: true });
console.log('two-sessions-different-issues.test.mjs: all passed');
