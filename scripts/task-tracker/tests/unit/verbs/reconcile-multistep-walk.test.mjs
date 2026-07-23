#!/usr/bin/env node
// @story #740
// Unit tests for the multi-step forward walk in `revert-to-recorded`
// (scripts/task-tracker/verbs/reconcile.mjs).
//
// Before #740, `revert-to-recorded` made a single `runMoveState({ target:
// recorded })` call. That only closed a one-state gap: `move-state` validates
// every transition against the adjacency-only matrix, so a jump across two or
// more states is illegal and the lone call fails without ever reconciling. The
// fix walks the board FORWARD one legal `FORWARD` step at a time from the live
// state up to the recorded marker, so every hop is a matrix-legal (audited)
// transition. #740 also redefines revert as forward-ONLY: when the recorded
// marker is BEHIND the live board there is no legal walk, so the mode refuses
// and names `accept-live`.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runReconcile } from '../../../verbs/reconcile.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function makeDeps({ body = '', live = null, moveCode = 0 } = {}) {
  const calls = { writes: [], markers: [], moves: [], persists: [] };
  return {
    calls,
    deps: {
      fetchIssueBody: async () => ({ body }),
      writeIssueBody: async ({ body: b }) => {
        calls.writes.push(b);
      },
      getLiveState: async () => live,
      runMoveState: async ({ issueNumber, target }) => {
        calls.moves.push({ issueNumber, target });
        return moveCode;
      },
      mutateIssueBody: async ({ mutate }) => {
        calls.markers.push(mutate(''));
      },
      persistTrackerState: ({ issueNumber, state }) => {
        calls.persists.push({ issueNumber, state });
      },
    },
  };
}

function bodyWithState(state) {
  return `<!-- aitm-last-known-state: ${state} -->\n<!-- aitm-last-known-state-ts: 2026-05-11T00:00:00Z -->\n\nbody.\n`;
}

test('AC1/AC2: a two-state gap (board=develop, marker=review) walks develop→test→review', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('review'), live: 'develop' });
  const r = await runReconcile({ issueNumber: 740, mode: 'revert-to-recorded', cfg, deps });
  assert.equal(r.status, 'reconciled');
  assert.equal(r.mode, 'revert-to-recorded');
  assert.equal(r.from, 'develop');
  assert.equal(r.to, 'review');
  // Every hop is a matrix-legal adjacent forward step, in order.
  assert.deepEqual(r.walked, ['test', 'review']);
  assert.deepEqual(calls.moves, [
    { issueNumber: 740, target: 'test' },
    { issueNumber: 740, target: 'review' },
  ]);
  // One best-effort audit marker naming the walked path.
  assert.equal(calls.markers.length, 1);
  assert.match(calls.markers[0], /aitm-reverted/);
  assert.match(calls.markers[0], /develop.*test.*review/);
  // revert never rewrites the body via writeIssueBody.
  assert.equal(calls.writes.length, 0);
});

test('AC1/AC2: a wider gap (board=refine, marker=review) walks every intermediate state', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('review'), live: 'refine' });
  const r = await runReconcile({ issueNumber: 741, mode: 'revert-to-recorded', cfg, deps });
  assert.equal(r.status, 'reconciled');
  assert.equal(r.from, 'refine');
  assert.equal(r.to, 'review');
  assert.deepEqual(r.walked, ['plan', 'develop', 'test', 'review']);
  assert.deepEqual(
    calls.moves.map((m) => m.target),
    ['plan', 'develop', 'test', 'review']
  );
});

test('AC1: a single forward step (board=develop, marker=test) is unchanged behaviour', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('test'), live: 'develop' });
  const r = await runReconcile({ issueNumber: 742, mode: 'revert-to-recorded', cfg, deps });
  assert.equal(r.status, 'reconciled');
  assert.equal(r.to, 'test');
  assert.deepEqual(r.walked, ['test']);
  assert.deepEqual(calls.moves, [{ issueNumber: 742, target: 'test' }]);
});

test('AC4: recorded BEHIND live (board=review, marker=plan) refuses forward-only, names accept-live', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('plan'), live: 'review' });
  const r = await runReconcile({ issueNumber: 743, mode: 'revert-to-recorded', cfg, deps });
  assert.equal(r.status, 'wrong-direction');
  assert.equal(r.from, 'review');
  assert.equal(r.to, 'plan');
  assert.match(r.message, /accept-live/);
  // No board move, no audit marker, no body write on a refused revert.
  assert.equal(calls.moves.length, 0);
  assert.equal(calls.markers.length, 0);
  assert.equal(calls.writes.length, 0);
});

test('AC2: a mid-walk move-state failure stops and reports the walked prefix', async () => {
  // The FIRST hop (develop→test) returns exit 7; the walk must stop there and
  // surface the failing target with the prefix walked so far (empty here).
  const { deps, calls } = makeDeps({
    body: bodyWithState('review'),
    live: 'develop',
    moveCode: 7,
  });
  const r = await runReconcile({ issueNumber: 744, mode: 'revert-to-recorded', cfg, deps });
  assert.equal(r.status, 'transition-failed');
  assert.equal(r.exitCode, 7);
  assert.equal(r.failedAt, 'test');
  assert.deepEqual(r.walked, []);
  // Only the first hop was attempted; no audit marker on failure.
  assert.deepEqual(calls.moves, [{ issueNumber: 744, target: 'test' }]);
  assert.equal(calls.markers.length, 0);
});
