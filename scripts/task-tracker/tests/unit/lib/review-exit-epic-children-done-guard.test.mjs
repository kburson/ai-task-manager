#!/usr/bin/env node
// @story #877
// Unit tests for review-exit-epic-children-done-guard (#877) and the
// `reviewEpicDoneChildrenGate` it wraps.
//
// #1216 requires completed children to converge on both CLOSED/COMPLETED issue
// state and the Done board state. These tests pin that terminal predicate and
// the wrapper's transition scoping. A child still in Review is not delivered.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  reviewExitEpicChildrenDoneGuard,
  GUARD_ID,
} from '../../../lib/review-exit-epic-children-done-guard.mjs';
import { reviewEpicDoneChildrenGate } from '../../../lib/epic-children-gate.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function stubFetch(children) {
  return async () => children;
}

function terminal(number, rank) {
  return {
    number,
    state: 'done',
    boardState: 'done',
    rank,
    issueState: 'closed',
    closeReason: 'completed',
  };
}

// ---------------------------------------------------------------------------
// reviewEpicDoneChildrenGate — the predicate.
// ---------------------------------------------------------------------------

test('gate passes for a non-epic (no children)', async () => {
  const result = await reviewEpicDoneChildrenGate({
    cfg,
    issueNumber: 1,
    deps: { fetchSiblings: stubFetch([]) },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.children, []);
});

test('gate passes when every child is done', async () => {
  const result = await reviewEpicDoneChildrenGate({
    cfg,
    issueNumber: 100,
    deps: {
      fetchSiblings: stubFetch([terminal(101, 1), terminal(102, 2)]),
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.children.length, 2);
});

// The regression #877 must not introduce: `review` is admissible at
// develop → test, but NOT at review → done.
test('gate refuses when a child is still at review', async () => {
  const result = await reviewEpicDoneChildrenGate({
    cfg,
    issueNumber: 100,
    deps: {
      fetchSiblings: stubFetch([terminal(101, 1), { number: 102, state: 'review', rank: 2 }]),
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.blockers.length, 1);
  assert.match(result.blockers[0], /epic-children-not-done/);
  assert.match(result.blockers[0], /promotes to Done/);
  assert.match(result.blockers[0], /#102/);
  assert.equal(result.offendingChildren.length, 1);
  assert.equal(result.offendingChildren[0].number, 102);
});

for (const pendingState of ['backlog', 'assigned', 'refine', 'plan', 'develop', 'test', 'review']) {
  test(`gate refuses when any child is at ${pendingState}`, async () => {
    const result = await reviewEpicDoneChildrenGate({
      cfg,
      issueNumber: 100,
      deps: {
        fetchSiblings: stubFetch([terminal(101, 1), { number: 102, state: pendingState, rank: 2 }]),
      },
    });
    assert.equal(result.ok, false);
    assert.match(result.blockers[0], /epic-children-not-done/);
    assert.match(result.blockers[0], /#102/);
  });
}

test('gate accepts mixed-case "DONE"', async () => {
  const result = await reviewEpicDoneChildrenGate({
    cfg,
    issueNumber: 100,
    deps: {
      fetchSiblings: stubFetch([
        {
          number: 101,
          state: 'DONE',
          boardState: 'DONE',
          rank: 1,
          issueState: 'CLOSED',
          closeReason: 'COMPLETED',
        },
      ]),
    },
  });
  assert.equal(result.ok, true);
});

test('gate surfaces fetch failure as a blocker', async () => {
  const result = await reviewEpicDoneChildrenGate({
    cfg,
    issueNumber: 100,
    deps: {
      fetchSiblings: async () => {
        throw new Error('boom');
      },
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.blockers[0], /epic-children-fetch-failed.*boom/);
});

test('gate requires cfg and issueNumber', async () => {
  await assert.rejects(() => reviewEpicDoneChildrenGate({ issueNumber: 1 }), /cfg is required/);
  await assert.rejects(() => reviewEpicDoneChildrenGate({ cfg }), /issueNumber is required/);
});

// ---------------------------------------------------------------------------
// reviewExitEpicChildrenDoneGuard — the wrapper.
// ---------------------------------------------------------------------------

test('guard exposes the expected id', () => {
  assert.equal(reviewExitEpicChildrenDoneGuard.id, 'review-exit-epic-children-done');
  assert.equal(GUARD_ID, 'review-exit-epic-children-done');
});

test('short-circuits when toState is not "done" (e.g. bounce-back to develop)', async () => {
  const result = await reviewExitEpicChildrenDoneGuard.run({
    cfg,
    issueNumber: 999,
    toState: 'develop',
    deps: {
      reviewEpicDoneChildrenGate: async () => {
        throw new Error('gate should not be called');
      },
    },
  });
  assert.deepEqual(result, { ok: true });
});

test('short-circuits when ctx is missing cfg', async () => {
  const result = await reviewExitEpicChildrenDoneGuard.run({ issueNumber: 999, toState: 'done' });
  assert.deepEqual(result, { ok: true });
});

test('short-circuits when ctx is missing issueNumber', async () => {
  const result = await reviewExitEpicChildrenDoneGuard.run({ cfg, toState: 'done' });
  assert.deepEqual(result, { ok: true });
});

test('passes when gate returns ok', async () => {
  const result = await reviewExitEpicChildrenDoneGuard.run({
    cfg,
    issueNumber: 100,
    toState: 'done',
    deps: { reviewEpicDoneChildrenGate: async () => ({ ok: true, children: [] }) },
  });
  assert.deepEqual(result, { ok: true });
});

test('surfaces gate refusal with reason + blockers', async () => {
  const blockers = [
    'epic-children-not-done: every child must be at done before the epic promotes to Done: #101 (state=review)',
  ];
  const result = await reviewExitEpicChildrenDoneGuard.run({
    cfg,
    issueNumber: 100,
    toState: 'done',
    deps: { reviewEpicDoneChildrenGate: async () => ({ ok: false, blockers }) },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.blockers, blockers);
  assert.equal(result.reason, blockers[0]);
});

test('omitted toState (legacy call site) still invokes the gate', async () => {
  // Mirrors the develop-side wrapper contract: short-circuit only when toState
  // is *present and not "done"*, so older call sites that omit it are covered
  // rather than silently bypassed.
  let called = false;
  await reviewExitEpicChildrenDoneGuard.run({
    cfg,
    issueNumber: 100,
    deps: {
      reviewEpicDoneChildrenGate: async () => {
        called = true;
        return { ok: true };
      },
    },
  });
  assert.equal(called, true);
});

test('defaults reason to the generic key when the gate omits blockers', async () => {
  const result = await reviewExitEpicChildrenDoneGuard.run({
    cfg,
    issueNumber: 100,
    toState: 'done',
    deps: { reviewEpicDoneChildrenGate: async () => ({ ok: false }) },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'epic-children-not-done');
  assert.deepEqual(result.blockers, []);
});
