#!/usr/bin/env node
// @story #216
// #216 AC9 — Two concurrent sessions A and B posting to the SAME issue
// MUST serialize on the per-issue lock. Critical sections must not overlap;
// both eventually complete; no deadlock.

import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const workerPath = path.join(__dirname, 'worker.mjs');
const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-int-same-'));
const logPath = path.join(tmp, 'events.ndjson');
writeFileSync(logPath, '');

function runWorker(label, holdMs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      process.execPath,
      [workerPath, tmp, '#SAME', label, logPath, String(holdMs)],
      { stdio: 'inherit' }
    );
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker exit ${code}`))));
  });
}

await Promise.all([runWorker('sess-A', 150), runWorker('sess-B', 150)]);

const lines = readFileSync(logPath, 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l));

const aStart = lines.find((e) => e.session === 'sess-A' && e.event === 'start');
const aEnd = lines.find((e) => e.session === 'sess-A' && e.event === 'end');
const bStart = lines.find((e) => e.session === 'sess-B' && e.event === 'start');
const bEnd = lines.find((e) => e.session === 'sess-B' && e.event === 'end');
assert.ok(aStart && aEnd && bStart && bEnd, 'both workers completed');

// Serialized = either A finishes before B starts, or B finishes before A starts.
const aBeforeB = aEnd.t <= bStart.t;
const bBeforeA = bEnd.t <= aStart.t;
assert.ok(
  aBeforeB || bBeforeA,
  `same-issue lock must serialize critical sections; got A[${aStart.t}-${aEnd.t}] B[${bStart.t}-${bEnd.t}]`
);

rmSync(tmp, { recursive: true });
console.log('two-sessions-same-issue.test.mjs: all passed');
