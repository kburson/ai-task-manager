// @story #1557
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bootstrapGuards, EXIT_STATES } from '../../../../task-tracker/lib/guard-bootstrap.mjs';
import { GUARDS } from '../../../../task-tracker/lib/guard-registry.mjs';
import { blockedByGuard, GUARD_ID } from '../../../../task-tracker/lib/blocked-by-guard.mjs';

function makeCtx({ blockedBy = [], states = {}, graphError, stateError, projectionError } = {}) {
  const reconciliations = [];
  return {
    issueNumber: 100,
    repo: 'owner/name',
    cfg: {
      repo: 'owner/name',
      projectId: 'P',
      fieldDisposition: 'F_DISPOSITION',
    },
    fromState: 'develop',
    toState: 'test',
    readDependencies: async () => {
      if (graphError) throw new Error(graphError);
      return { blockedBy, blocking: [] };
    },
    fetchBlockerState: async (ref) => {
      if (stateError) throw new Error(stateError);
      return states[ref] ?? null;
    },
    reconcileDisposition: async (input) => {
      reconciliations.push(input);
      if (projectionError) throw new Error(projectionError);
      return { status: blockedBy.length ? 'projected' : 'cleared' };
    },
    reconciliations,
  };
}

test('native dependency guard allows no dependencies and all-Done dependencies', async () => {
  for (const ctx of [makeCtx(), makeCtx({ blockedBy: [5, 7], states: { 5: 'done', 7: 'done' } })]) {
    const result = await blockedByGuard.run(ctx);
    assert.deepEqual(result, { ok: true });
    assert.equal(ctx.reconciliations.length, 1);
  }
});

test('native dependency guard refuses unfinished and unknown dependencies', async () => {
  const unfinished = await blockedByGuard.run(
    makeCtx({ blockedBy: [5, 7], states: { 5: 'done', 7: 'test' } })
  );
  assert.equal(unfinished.ok, false);
  assert.match(unfinished.reason, /#7 \(test\)/);
  assert.doesNotMatch(unfinished.reason, /#5/);

  const unknown = await blockedByGuard.run(makeCtx({ blockedBy: [9], states: {} }));
  assert.equal(unknown.ok, false);
  assert.match(unknown.reason, /#9 \(unknown\)/);
});

test('native dependency guard fails closed on graph, state, or projection failure', async () => {
  for (const [input, message] of [
    [{ graphError: 'graph unavailable' }, /graph unavailable/],
    [{ blockedBy: [5], stateError: 'status unavailable' }, /status unavailable/],
    [{ projectionError: 'project unavailable' }, /project unavailable/],
  ]) {
    const result = await blockedByGuard.run(makeCtx(input));
    assert.equal(result.ok, false);
    assert.match(result.reason, message);
  }
});

test('bootstrap keeps the native dependency guard on every forward delivery exit', () => {
  bootstrapGuards();
  for (const state of EXIT_STATES) {
    const ids = GUARDS[state].exit.map((guard) => guard.id);
    const shouldGuard = !['backlog', 'refine'].includes(state);
    assert.equal(ids.includes(GUARD_ID), shouldGuard, `unexpected exit policy at ${state}`);
  }
  assert.equal(
    GUARDS.done.exit.some((guard) => guard.id === GUARD_ID),
    false
  );
});
