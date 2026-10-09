#!/usr/bin/env node
// @story #197
// Exercises the partition behavior `/task close` relies on:
// `flushAndForgetQueueFor(closeTarget)` must remove all queued timing rows for
// the closing issue (whether delivery succeeds or fails) while leaving rows
// for other issues untouched. Mirrors the runtime wiring in
// `scripts/task-tracker/runtime.mjs` (`flushAndForgetQueueFor`).

import { strict as assert } from 'node:assert';
import { rmSync } from 'node:fs';
import {
  createActivatedUnitRuntimeRoot,
  withUnitRuntimeRoot,
} from '../../../helpers/unit-runtime-root.mjs';
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);
import { parseTimingRow } from '../../../../task-tracker/lib/timing-row-reader.mjs';
const timingRow = (description) =>
  `| 2026-10-02 12:00:00 -05:00 | pause:other |  |  |  | 0 | ${description} |`;
import path from 'node:path';
import { enqueue, peek, drainAndDiscard, drainMatching } from '../../../../task-tracker/queue.mjs';

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

await withUnitRuntimeRoot(async () => {
  // Scenario 1 — network healthy mid-close: targeted rows delivered, others kept.
  {
    const t = createActivatedUnitRuntimeRoot('tt-cd-ok-');
    const p = path.join(
      t,
      '.ai-task-manager',
      'runtime',
      'store',
      'state',
      'task-tracker-queue.json'
    );
    enqueue({ kind: 'timing', issue: '#197', row: timingRow('review-flush') }, p);
    enqueue({ kind: 'timing', issue: '#197', row: timingRow('done-enter') }, p);
    enqueue({ kind: 'timing', issue: '#39', row: timingRow('stranded') }, p);
    const posted = [];
    const flush = makeFlushAndForget(async (evt) => {
      posted.push(parseTimingRow(evt.row).description);
    });
    const r = await flush(p, '#197');
    assert.deepEqual(r, { delivered: 2, discarded: 0, retained: 0 });
    assert.deepEqual(posted.sort(), ['done-enter', 'review-flush']);
    const left = peek(p);
    assert.equal(left.length, 1);
    assert.equal(left[0].issue, '#39');
    rmSync(t, { recursive: true });
  }

  // Scenario 2 — network still down at close: targeted rows discarded.
  {
    const t = createActivatedUnitRuntimeRoot('tt-cd-down-');
    const p = path.join(
      t,
      '.ai-task-manager',
      'runtime',
      'store',
      'state',
      'task-tracker-queue.json'
    );
    enqueue({ kind: 'timing', issue: '#197', row: timingRow('a') }, p);
    enqueue({ kind: 'timing', issue: '#197', row: timingRow('b') }, p);
    enqueue({ kind: 'timing', issue: '#197', row: timingRow('c') }, p);
    const flush = makeFlushAndForget(async () => {
      throw new Error('net down');
    });
    const r = await flush(p, 197);
    assert.deepEqual(r, { delivered: 0, discarded: 3, retained: 0 });
    assert.deepEqual(peek(p), []);
    rmSync(t, { recursive: true });
  }

  // Scenario 3 — transient blip during close: first call fails, retries deliver.
  // Models the per-row in-process retry the close path performs via its own
  // `safePostTiming` callers; `flushAndForgetQueueFor` itself does one attempt
  // per row, so the simulation here is a single-pass handler that flakes once.
  {
    const t = createActivatedUnitRuntimeRoot('tt-cd-flake-');
    const p = path.join(
      t,
      '.ai-task-manager',
      'runtime',
      'store',
      'state',
      'task-tracker-queue.json'
    );
    enqueue({ kind: 'timing', issue: '#197', row: timingRow('a') }, p);
    enqueue({ kind: 'timing', issue: '#197', row: timingRow('b') }, p);
    let n = 0;
    const flush = makeFlushAndForget(async () => {
      n++;
      if (n === 1) throw new Error('flake');
    });
    const r = await flush(p, '#197');
    assert.deepEqual(r, { delivered: 1, discarded: 1, retained: 0 });
    assert.deepEqual(peek(p), []);
    rmSync(t, { recursive: true });
  }

  // Scenario 4 — empty match set is a no-op.
  {
    const t = createActivatedUnitRuntimeRoot('tt-cd-empty-');
    const p = path.join(
      t,
      '.ai-task-manager',
      'runtime',
      'store',
      'state',
      'task-tracker-queue.json'
    );
    enqueue({ kind: 'timing', issue: '#39', row: timingRow('x') }, p);
    const flush = makeFlushAndForget(async () => {});
    const r = await flush(p, '#197');
    assert.deepEqual(r, { delivered: 0, discarded: 0, retained: 0 });
    assert.equal(peek(p).length, 1);
    rmSync(t, { recursive: true });
  }

  // Scenario 5 — outcome-critical draining retains a failed terminal row.
  {
    const t = createActivatedUnitRuntimeRoot('tt-cd-retain-');
    const p = path.join(
      t,
      '.ai-task-manager',
      'runtime',
      'store',
      'state',
      'task-tracker-queue.json'
    );
    enqueue({ kind: 'timing', issue: '#197', row: timingRow('issue:wrap') }, p);
    const result = await drainMatching(
      async () => {
        throw new Error('network down');
      },
      p,
      (event) => event.issue === '#197'
    );
    assert.deepEqual(result, { delivered: 0, pending: 1 });
    assert.equal(peek(p).length, 1);
    rmSync(t, { recursive: true });
  }

  console.log('close-drain.test.mjs: all passed');
});
