#!/usr/bin/env node
// Unit tests for scripts/task-tracker/verbs/reconcile.mjs.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runReconcile } from '../verbs/reconcile.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function makeDeps({ body = '', live = null, moveCode = 0 } = {}) {
  const calls = { writes: [], timings: [], moves: [] };
  return {
    calls,
    deps: {
      fetchIssueBody: async () => ({ body }),
      writeIssueBody: async ({ body: b }) => { calls.writes.push(b); },
      getLiveState: async () => live,
      runMoveState: async ({ issueNumber, target }) => { calls.moves.push({ issueNumber, target }); return moveCode; },
      postTimingRow: async ({ row }) => { calls.timings.push(row); },
    },
  };
}

function bodyWithState(state) {
  return `<!-- aitm-last-known-state: ${state} -->\n<!-- aitm-last-known-state-ts: 2026-05-11T00:00:00Z -->\n\nbody.\n`;
}

test('reconcile accept-live: drifted issue writes new state + drift-reconcile row', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('analyze'), live: 'development' });
  const r = await runReconcile({ issueNumber: 300, mode: 'accept-live', cfg, deps });
  assert.equal(r.status, 'reconciled');
  assert.equal(r.mode, 'accept-live');
  assert.equal(r.from, 'analyze');
  assert.equal(r.to, 'development');
  assert.equal(calls.writes.length, 1);
  assert.match(calls.writes[0], /aitm-last-known-state: development/);
  assert.equal(calls.timings.length, 1);
  assert.match(calls.timings[0], /drift-reconcile/);
  assert.match(calls.timings[0], /analyze.*development/);
  assert.equal(calls.moves.length, 0);
});

test('reconcile revert-to-recorded: drifted issue pushes board back + drift-revert row', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('analyze'), live: 'development' });
  const r = await runReconcile({ issueNumber: 301, mode: 'revert-to-recorded', cfg, deps });
  assert.equal(r.status, 'reconciled');
  assert.equal(r.mode, 'revert-to-recorded');
  assert.equal(r.from, 'development');
  assert.equal(r.to, 'analyze');
  assert.deepEqual(calls.moves, [{ issueNumber: 301, target: 'analyze' }]);
  assert.equal(calls.timings.length, 1);
  assert.match(calls.timings[0], /drift-revert/);
  assert.equal(calls.writes.length, 0);
});

test('reconcile: no drift refused', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('analyze'), live: 'analyze' });
  const r = await runReconcile({ issueNumber: 302, mode: 'accept-live', cfg, deps });
  assert.equal(r.status, 'no-drift-refused');
  assert.match(r.message, /no drift detected/);
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.moves.length, 0);
  assert.equal(calls.timings.length, 0);
});

test('reconcile: missing mode returns error', async () => {
  const { deps } = makeDeps({ body: bodyWithState('analyze'), live: 'development' });
  const r = await runReconcile({ issueNumber: 303, cfg, deps });
  assert.equal(r.status, 'error');
  assert.match(r.message, /mode is required/);
});

test('reconcile: unknown mode returns error', async () => {
  const { deps } = makeDeps({ body: bodyWithState('analyze'), live: 'development' });
  const r = await runReconcile({ issueNumber: 304, mode: 'force-it', cfg, deps });
  assert.equal(r.status, 'error');
  assert.match(r.message, /unknown mode/);
});

test('reconcile revert-to-recorded: no recorded state → error', async () => {
  const { deps, calls } = makeDeps({ body: 'no marker here\n', live: 'analyze' });
  const r = await runReconcile({ issueNumber: 305, mode: 'revert-to-recorded', cfg, deps });
  assert.equal(r.status, 'error');
  assert.match(r.message, /no recorded state/);
  assert.equal(calls.moves.length, 0);
});

test('reconcile accept-live: no live state → error', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('analyze'), live: null });
  const r = await runReconcile({ issueNumber: 306, mode: 'accept-live', cfg, deps });
  assert.equal(r.status, 'error');
  assert.match(r.message, /no live state/);
  assert.equal(calls.writes.length, 0);
});

test('reconcile revert: transition-failed when move-state exits non-zero', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('analyze'), live: 'development', moveCode: 7 });
  const r = await runReconcile({ issueNumber: 307, mode: 'revert-to-recorded', cfg, deps });
  assert.equal(r.status, 'transition-failed');
  assert.equal(r.exitCode, 7);
  assert.equal(calls.timings.length, 0);
});
