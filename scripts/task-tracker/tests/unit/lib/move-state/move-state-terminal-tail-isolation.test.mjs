#!/usr/bin/env node
// @story #714
// Proves the post-`runStatusWrite` tail steps in the move-state mutation block
// are isolated: once the authoritative board Status write has committed, no
// downstream best-effort step (audit-comment post, field sync, tracker-state
// write, timing flush) may unwind to the top level and flip the process exit
// code to non-zero. A committed terminal `done` move must report success even
// when a tail side-effect throws.
//
// The tail is exercised through the injectable `runPostCommitTail(ctx, steps)`
// sequencer extracted from move-state.mjs. `runStatusWrite` + its exit-honor
// stay OUTSIDE the tail (they remain authoritative), so a genuine status-write
// failure (non-null exit) is not this sequencer's concern and is asserted
// separately at the host boundary.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  runPostCommitTail,
  DEFAULT_TAIL_STEPS,
} from '../../../../lib/move-state/post-commit-tail.mjs';

// Capture stderr for the duration of `fn`.
async function withCapturedStderr(fn) {
  const original = process.stderr.write.bind(process.stderr);
  const chunks = [];
  process.stderr.write = (chunk, ...rest) => {
    chunks.push(String(chunk));
    // Do not echo to the real stderr — keep test output clean.
    if (typeof rest[rest.length - 1] === 'function') rest[rest.length - 1]();
    return true;
  };
  try {
    await fn();
  } finally {
    process.stderr.write = original;
  }
  return chunks.join('');
}

test('AC1: a throwing post-commit tail step does NOT propagate — the sequencer resolves', async () => {
  const order = [];
  const steps = [
    { name: 'stepA', fn: async () => order.push('A') },
    {
      name: 'stepThrows',
      fn: async () => {
        order.push('B');
        throw new Error('field sync exploded');
      },
    },
    { name: 'stepC', fn: async () => order.push('C') },
  ];

  // Must NOT reject. If runPostCommitTail let the throw escape, this await throws.
  await withCapturedStderr(async () => {
    await runPostCommitTail({}, steps);
  });

  // Order preserved and every step ran despite the middle throw.
  assert.deepEqual(order, ['A', 'B', 'C']);
});

test('AC1: the throwing step is logged to stderr, naming the step', async () => {
  const steps = [
    {
      name: 'syncEventFields',
      fn: async () => {
        throw new Error('boom');
      },
    },
  ];
  const err = await withCapturedStderr(async () => {
    await runPostCommitTail({}, steps);
  });
  // #716 layered a structured `[move-state:warn]` diagnostic over the raw log.
  assert.match(err, /\[move-state:warn\]/);
  assert.match(err, /syncEventFields/);
  assert.match(err, /boom/);
});

test('AC4: a synchronous (non-async) throwing step is also isolated', async () => {
  const order = [];
  const steps = [
    {
      name: 'syncTrackerState',
      fn: () => {
        throw new Error('sync throw');
      },
    },
    { name: 'endTaskTracking', fn: () => order.push('end') },
  ];
  await withCapturedStderr(async () => {
    await runPostCommitTail({}, steps);
  });
  assert.deepEqual(order, ['end']);
});

test('AC3: a benign audit-comment stderr line is never surfaced as a failure reason', async () => {
  // Simulate the emitFullAutoReviewAudit step writing its BENIGN informational
  // line (audit-timing.mjs ~187) to stderr, then completing normally. The tail
  // sequencer must NOT treat that benign line as a failure: it returns no
  // failure entry for a step that did not throw.
  const benignLine =
    '[human-reviewer-audit] #714: posted full-auto audit comment (no human reviewer)\n';
  const steps = [
    {
      name: 'emitFullAutoReviewAudit',
      fn: async () => {
        process.stderr.write(benignLine);
        // returns normally — informational, NOT a failure
      },
    },
  ];
  let result;
  const err = await withCapturedStderr(async () => {
    result = await runPostCommitTail({}, steps);
  });
  // The benign line is present on stderr...
  assert.match(err, /posted full-auto audit comment/);
  // ...but the sequencer records ZERO failures, so nothing can be surfaced as
  // a failure `detail`.
  assert.equal(result.failures.length, 0);
  // And the sequencer never emitted its own `[move-state] ... failed` line for
  // this non-throwing step.
  assert.doesNotMatch(err, /\[move-state\].*emitFullAutoReviewAudit.*failed/);
});

test('the sequencer reports which steps failed without changing control flow', async () => {
  const steps = [
    { name: 'ok1', fn: async () => {} },
    {
      name: 'boom1',
      fn: async () => {
        throw new Error('e1');
      },
    },
    { name: 'ok2', fn: async () => {} },
  ];
  let result;
  await withCapturedStderr(async () => {
    result = await runPostCommitTail({}, steps);
  });
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].name, 'boom1');
  assert.match(result.failures[0].error.message, /e1/);
});

test('DEFAULT_TAIL_STEPS enumerates the exact tail order (post-#756: entry evidence moved to the atomic core)', () => {
  const names = DEFAULT_TAIL_STEPS.map((s) => s.name);
  assert.deepEqual(names, [
    'dispatchOnEnterActions',
    'refreshKanbanStateCache',
    'emitFullAutoReviewAudit',
    'unparkDoneDependents',
    'emitOutOfBandAudit',
    'syncTrackerState',
    'syncEventFields',
    'endTaskTracking',
  ]);
});
