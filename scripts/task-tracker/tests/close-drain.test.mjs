#!/usr/bin/env node
// @story #197
// Exercises the partition behavior `/task close` relies on:
// `flushAndForgetQueueFor(closeTarget)` must remove all queued timing rows for
// the closing issue (whether delivery succeeds or fails) while leaving rows
// for other issues untouched. Mirrors the runtime wiring in
// `scripts/task-tracker/runtime.mjs` (`flushAndForgetQueueFor`).

import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../lib/scratch-dir.mjs';
import path from 'node:path';
import { enqueue, peek, drainAndDiscard } from '../queue.mjs';

function makeFlushAndForget(handler) {
  return async (queuePath, issueRef) => {
    const ref = String(issueRef).replace(/^#/, '');
    return drainAndDiscard(
      handler,
      queuePath,
      (evt) => String(evt.issue).replace(/^#/, '') === ref
    );
  };
}

// Scenario 1 — network healthy mid-close: targeted rows delivered, others kept.
{
  const t = mkdtempSync(path.join(projectScratchDir('test'), 'tt-cd-ok-'));
  const p = path.join(t, 'queue.json');
  enqueue({ kind: 'timing', issue: '#197', row: 'review-flush' }, p);
  enqueue({ kind: 'timing', issue: '#197', row: 'done-enter' }, p);
  enqueue({ kind: 'timing', issue: '#39', row: 'stranded' }, p);
  const posted = [];
  const flush = makeFlushAndForget(async (evt) => {
    posted.push(evt.row);
  });
  const r = await flush(p, '#197');
  assert.deepEqual(r, { delivered: 2, discarded: 0 });
  assert.deepEqual(posted.sort(), ['done-enter', 'review-flush']);
  const left = peek(p);
  assert.equal(left.length, 1);
  assert.equal(left[0].issue, '#39');
  rmSync(t, { recursive: true });
}

// Scenario 2 — network still down at close: targeted rows discarded.
{
  const t = mkdtempSync(path.join(projectScratchDir('test'), 'tt-cd-down-'));
  const p = path.join(t, 'queue.json');
  enqueue({ kind: 'timing', issue: '#197', row: 'a' }, p);
  enqueue({ kind: 'timing', issue: '#197', row: 'b' }, p);
  enqueue({ kind: 'timing', issue: '#197', row: 'c' }, p);
  const flush = makeFlushAndForget(async () => {
    throw new Error('net down');
  });
  const r = await flush(p, 197);
  assert.deepEqual(r, { delivered: 0, discarded: 3 });
  assert.deepEqual(peek(p), []);
  rmSync(t, { recursive: true });
}

// Scenario 3 — transient blip during close: first call fails, retries deliver.
// Models the per-row in-process retry the close path performs via its own
// `safePostTiming` callers; `flushAndForgetQueueFor` itself does one attempt
// per row, so the simulation here is a single-pass handler that flakes once.
{
  const t = mkdtempSync(path.join(projectScratchDir('test'), 'tt-cd-flake-'));
  const p = path.join(t, 'queue.json');
  enqueue({ kind: 'timing', issue: '#197', row: 'a' }, p);
  enqueue({ kind: 'timing', issue: '#197', row: 'b' }, p);
  let n = 0;
  const flush = makeFlushAndForget(async () => {
    n++;
    if (n === 1) throw new Error('flake');
  });
  const r = await flush(p, '#197');
  assert.deepEqual(r, { delivered: 1, discarded: 1 });
  assert.deepEqual(peek(p), []);
  rmSync(t, { recursive: true });
}

// Scenario 4 — empty match set is a no-op.
{
  const t = mkdtempSync(path.join(projectScratchDir('test'), 'tt-cd-empty-'));
  const p = path.join(t, 'queue.json');
  enqueue({ kind: 'timing', issue: '#39', row: 'x' }, p);
  const flush = makeFlushAndForget(async () => {});
  const r = await flush(p, '#197');
  assert.deepEqual(r, { delivered: 0, discarded: 0 });
  assert.equal(peek(p).length, 1);
  rmSync(t, { recursive: true });
}

console.log('close-drain.test.mjs: all passed');
