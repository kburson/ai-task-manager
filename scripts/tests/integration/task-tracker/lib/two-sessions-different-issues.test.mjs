#!/usr/bin/env node
// @story #216
// #216 AC8 — Two concurrent sessions A and B posting to DIFFERENT issues
// hold DIFFERENT per-issue lock paths. Their critical sections may overlap
// freely; no collision, no contention.

import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const workerPath = path.join(__dirname, '../../helpers/worker.mjs');
const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-int-diff-'));
const logPath = path.join(tmp, 'events.ndjson');
writeFileSync(logPath, '');

function runWorker(issue, label, holdMs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [workerPath, tmp, issue, label, logPath, String(holdMs)], {
      stdio: 'inherit',
    });
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker exit ${code}`))));
  });
}

// Fire two workers against different issues concurrently. Each holds the
// lock for 200ms. If the per-issue lock granularity is correct, the two
// critical sections OVERLAP; if a global lock were used by mistake, they
// would serialize.
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
