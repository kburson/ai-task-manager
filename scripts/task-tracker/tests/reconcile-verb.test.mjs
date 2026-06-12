#!/usr/bin/env node
// Unit tests for scripts/task-tracker/verbs/reconcile.mjs.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runReconcile } from '../verbs/reconcile.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function makeDeps({ body = '', live = null, moveCode = 0 } = {}) {
  const calls = { writes: [], timings: [], moves: [], persists: [] };
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
      postTimingRow: async ({ row }) => {
        calls.timings.push(row);
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

test('reconcile accept-live: drifted issue writes new state + drift-reconcile row', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('plan'), live: 'develop' });
  const r = await runReconcile({ issueNumber: 300, mode: 'accept-live', cfg, deps });
  assert.equal(r.status, 'reconciled');
  assert.equal(r.mode, 'accept-live');
  assert.equal(r.from, 'plan');
  assert.equal(r.to, 'develop');
  assert.equal(calls.writes.length, 1);
  assert.match(calls.writes[0], /aitm-last-known-state state="develop"/);
  assert.match(calls.writes[0], /aitm-entered-develop(?::|\s+ts=")/);
  assert.equal(calls.timings.length, 1);
  assert.match(calls.timings[0], /drift-reconcile/);
  assert.match(calls.timings[0], /plan.*develop/);
  assert.equal(calls.moves.length, 0);
  assert.deepEqual(calls.persists, [{ issueNumber: 300, state: 'develop' }]);
});

test('reconcile accept-live stamps aitm-entered-<live> when absent (#174)', async () => {
  const body =
    '<!-- aitm-last-known-state: develop -->\n' +
    '<!-- aitm-last-known-state-ts: 2026-05-18T00:00:00Z -->\n' +
    '\n' +
    '<!-- aitm-entered-refine: 2026-05-18T00:00:00Z -->\n' +
    '\n' +
    '<!-- aitm-entered-develop: 2026-05-18T00:10:00Z -->\n' +
    '\n' +
    'body.\n';
  const { deps, calls } = makeDeps({ body, live: 'test' });
  const r = await runReconcile({ issueNumber: 174, mode: 'accept-live', cfg, deps });
  assert.equal(r.status, 'reconciled');
  assert.equal(r.to, 'test');
  assert.equal(calls.writes.length, 1);
  const written = calls.writes[0];
  assert.match(written, /aitm-entered-refine(?::|\s+ts=")/);
  assert.match(written, /aitm-entered-develop(?::|\s+ts=")/);
  assert.match(written, /aitm-entered-test(?::|\s+ts=")/);
  // Monotonic order in body: refine, develop, test.
  const idxRefine = written.indexOf('aitm-entered-refine');
  const idxDevelop = written.indexOf('aitm-entered-develop');
  const idxTest = written.indexOf('aitm-entered-test');
  assert.ok(idxRefine < idxDevelop, 'refine before develop');
  assert.ok(idxDevelop < idxTest, 'develop before test');
});

test('reconcile accept-live is idempotent for entry marker (#174)', async () => {
  const existingTs = '2026-05-18T00:10:00Z';
  const body =
    '<!-- aitm-last-known-state: refine -->\n' +
    '<!-- aitm-last-known-state-ts: 2026-05-18T00:00:00Z -->\n' +
    '\n' +
    `<!-- aitm-entered-develop: ${existingTs} -->\n` +
    '\n' +
    'body.\n';
  const { deps, calls } = makeDeps({ body, live: 'develop' });
  const r = await runReconcile({ issueNumber: 1742, mode: 'accept-live', cfg, deps });
  assert.equal(r.status, 'reconciled');
  assert.equal(calls.writes.length, 1);
  const written = calls.writes[0];
  // Single entered-develop marker preserved with original timestamp.
  const matches = written.match(/aitm-entered-develop:\s*([^>\s]+)/g) || [];
  assert.equal(matches.length, 1, 'exactly one entered-develop marker');
  assert.ok(written.includes(`aitm-entered-develop: ${existingTs}`));
  // Single drift-reconcile timing row (no phantom re-fire).
  assert.equal(calls.timings.length, 1);
});

test('reconcile revert-to-recorded: drifted issue pushes board back + drift-revert row', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('plan'), live: 'develop' });
  const r = await runReconcile({ issueNumber: 301, mode: 'revert-to-recorded', cfg, deps });
  assert.equal(r.status, 'reconciled');
  assert.equal(r.mode, 'revert-to-recorded');
  assert.equal(r.from, 'develop');
  assert.equal(r.to, 'plan');
  assert.deepEqual(calls.moves, [{ issueNumber: 301, target: 'plan' }]);
  assert.equal(calls.timings.length, 1);
  assert.match(calls.timings[0], /drift-revert/);
  assert.equal(calls.writes.length, 0);
});

test('reconcile: no drift refused', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('plan'), live: 'plan' });
  const r = await runReconcile({ issueNumber: 302, mode: 'accept-live', cfg, deps });
  assert.equal(r.status, 'no-drift-refused');
  assert.match(r.message, /no drift detected/);
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.moves.length, 0);
  assert.equal(calls.timings.length, 0);
});

test('reconcile: missing mode returns error', async () => {
  const { deps } = makeDeps({ body: bodyWithState('plan'), live: 'develop' });
  const r = await runReconcile({ issueNumber: 303, cfg, deps });
  assert.equal(r.status, 'error');
  assert.match(r.message, /mode is required/);
});

test('reconcile: unknown mode returns error', async () => {
  const { deps } = makeDeps({ body: bodyWithState('plan'), live: 'develop' });
  const r = await runReconcile({ issueNumber: 304, mode: 'force-it', cfg, deps });
  assert.equal(r.status, 'error');
  assert.match(r.message, /unknown mode/);
});

test('reconcile revert-to-recorded: no recorded state → error', async () => {
  const { deps, calls } = makeDeps({ body: 'no marker here\n', live: 'plan' });
  const r = await runReconcile({ issueNumber: 305, mode: 'revert-to-recorded', cfg, deps });
  assert.equal(r.status, 'error');
  assert.match(r.message, /no recorded state/);
  assert.equal(calls.moves.length, 0);
});

test('reconcile accept-live: no live state → error', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('plan'), live: null });
  const r = await runReconcile({ issueNumber: 306, mode: 'accept-live', cfg, deps });
  assert.equal(r.status, 'error');
  assert.match(r.message, /no live state/);
  assert.equal(calls.writes.length, 0);
});

test('reconcile accept-live: preserves forward markers as history + adds visit marker (#181)', async () => {
  // #181 schema: forward markers are preserved as audit history. accept-live
  // updates last-known-state and stamps entered-<live>-N as a new visit. The
  // chain-integrity gate validates the resulting sequence against
  // LEGAL_TRANSITIONS (done->review is the rollback arc).
  const body =
    '<!-- aitm-last-known-state: done -->\n' +
    '<!-- aitm-last-known-state-ts: 2026-05-16T16:37:00Z -->\n' +
    '\n' +
    '<!-- aitm-entered-review: 2026-05-16T16:30:00Z -->\n' +
    '\n' +
    '<!-- aitm-entered-done: 2026-05-16T16:37:00Z -->\n' +
    '\n' +
    'body.\n';
  const { deps, calls } = makeDeps({ body, live: 'review' });
  const r = await runReconcile({ issueNumber: 148, mode: 'accept-live', cfg, deps });
  assert.equal(r.status, 'reconciled');
  assert.deepEqual(r.stripped, []);
  assert.equal(calls.writes.length, 1);
  assert.match(calls.writes[0], /aitm-last-known-state state="review"/);
  assert.match(calls.writes[0], /aitm-entered-review(?::|\s+ts=")/);
  assert.match(calls.writes[0], /aitm-entered-done(?::|\s+ts=")/);
  assert.match(calls.writes[0], /aitm-entered-review-2(?::|\s+ts=")/);
  assert.equal(calls.timings.length, 1);
  assert.doesNotMatch(calls.timings[0], /stripped:/);
});

test('reconcile revert-to-recorded: does NOT strip future entry markers', async () => {
  const body =
    '<!-- aitm-last-known-state: plan -->\n' +
    '<!-- aitm-last-known-state-ts: 2026-05-16T16:00:00Z -->\n' +
    '\n' +
    '<!-- aitm-entered-develop: 2026-05-16T16:10:00Z -->\n' +
    '\n' +
    'body.\n';
  const { deps, calls } = makeDeps({ body, live: 'develop' });
  const r = await runReconcile({ issueNumber: 149, mode: 'revert-to-recorded', cfg, deps });
  assert.equal(r.status, 'reconciled');
  assert.equal(r.mode, 'revert-to-recorded');
  // revert path does not touch body — only board state via move-state.
  assert.equal(calls.writes.length, 0);
  assert.deepEqual(calls.moves, [{ issueNumber: 149, target: 'plan' }]);
});

test('reconcile revert: transition-failed when move-state exits non-zero', async () => {
  const { deps, calls } = makeDeps({
    body: bodyWithState('plan'),
    live: 'develop',
    moveCode: 7,
  });
  const r = await runReconcile({ issueNumber: 307, mode: 'revert-to-recorded', cfg, deps });
  assert.equal(r.status, 'transition-failed');
  assert.equal(r.exitCode, 7);
  assert.equal(calls.timings.length, 0);
});
