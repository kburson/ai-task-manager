// @story #310
// Unit tests for scripts/task-tracker/lib/epic-children-gate.mjs (#135).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  fetchEpicChildren,
  planEpicDevelopChildrenGate,
  developEpicTestChildrenGate,
  findNextEligibleChild,
  enrichChildrenWithBlockedBy,
  wipAdvanceDecision,
  planRefineWipGate,
  childCreationAllowedAtEpicState,
} from '../../lib/epic-children-gate.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function stubFetch(children) {
  return async () => children;
}

test('planEpicDevelopChildrenGate passes for non-epic (no children)', async () => {
  const result = await planEpicDevelopChildrenGate({
    cfg,
    issueNumber: 1,
    deps: { fetchSiblings: stubFetch([]) },
  });
  assert.equal(result.ok, true);
});

test('planEpicDevelopChildrenGate refuses when any child is in backlog', async () => {
  const result = await planEpicDevelopChildrenGate({
    cfg,
    issueNumber: 100,
    deps: {
      fetchSiblings: stubFetch([
        { number: 101, state: 'refine', rank: 1 },
        { number: 102, state: 'backlog', rank: 2 },
      ]),
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.blockers.length, 1);
  assert.match(result.blockers[0], /epic-children-not-refined/);
  assert.match(result.blockers[0], /#102/);
  assert.equal(result.offendingChildren.length, 1);
});

test('planEpicDevelopChildrenGate passes when children are PAST refine (#335 — children may legitimately lead the parent)', async () => {
  // Corrected rule (#335): the plan→develop gate exists to confirm every child
  // has been refined. Children that have already advanced past refine
  // (plan/develop/test/review/done) trivially satisfy refinement and pass.
  // Only `backlog` (and other pre-refine) children refuse.
  const result = await planEpicDevelopChildrenGate({
    cfg,
    issueNumber: 100,
    deps: {
      fetchSiblings: stubFetch([
        { number: 101, state: 'refine', rank: 1 },
        { number: 102, state: 'plan', rank: 2 },
        { number: 103, state: 'develop', rank: 3 },
        { number: 104, state: 'done', rank: 4 },
      ]),
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.children.length, 4);
});

for (const acceptState of ['refine', 'plan', 'develop', 'test', 'review', 'done']) {
  test(`planEpicDevelopChildrenGate passes when sole child is at ${acceptState} (#335)`, async () => {
    const result = await planEpicDevelopChildrenGate({
      cfg,
      issueNumber: 200,
      deps: {
        fetchSiblings: stubFetch([{ number: 201, state: acceptState, rank: 1 }]),
      },
    });
    assert.equal(result.ok, true, `expected ${acceptState} to pass`);
  });
}

test('planEpicDevelopChildrenGate refuses sole backlog child (#335 regression)', async () => {
  const result = await planEpicDevelopChildrenGate({
    cfg,
    issueNumber: 300,
    deps: {
      fetchSiblings: stubFetch([{ number: 301, state: 'backlog', rank: 1 }]),
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.blockers[0], /epic-children-not-refined/);
  assert.match(result.blockers[0], /#301/);
});

test('planEpicDevelopChildrenGate passes when all children are at refine', async () => {
  const result = await planEpicDevelopChildrenGate({
    cfg,
    issueNumber: 100,
    deps: {
      fetchSiblings: stubFetch([
        { number: 101, state: 'refine', rank: 1 },
        { number: 102, state: 'refine', rank: 2 },
        { number: 103, state: 'refine', rank: 3 },
      ]),
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.children.length, 3);
});

test('planEpicDevelopChildrenGate surfaces fetch failures as blockers', async () => {
  const result = await planEpicDevelopChildrenGate({
    cfg,
    issueNumber: 100,
    deps: {
      fetchSiblings: async () => {
        throw new Error('boom');
      },
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.blockers[0], /epic-children-fetch-failed/);
});

test('findNextEligibleChild returns lowest-rank refine-state child', () => {
  const next = findNextEligibleChild([
    { number: 5, state: 'refine', rank: 3 },
    { number: 6, state: 'refine', rank: 1 },
    { number: 7, state: 'plan', rank: 2 },
  ]);
  assert.equal(next.number, 6);
});

test('findNextEligibleChild skips children with null rank', () => {
  const next = findNextEligibleChild([
    { number: 5, state: 'refine', rank: null },
    { number: 6, state: 'refine', rank: 4 },
  ]);
  assert.equal(next.number, 6);
});

test('findNextEligibleChild returns null when no refine-state children', () => {
  const next = findNextEligibleChild([
    { number: 5, state: 'plan', rank: 1 },
    { number: 6, state: 'develop', rank: 2 },
  ]);
  assert.equal(next, null);
});

test('findNextEligibleChild returns null on empty list', () => {
  assert.equal(findNextEligibleChild([]), null);
  assert.equal(findNextEligibleChild(), null);
});

test('fetchEpicChildren throws when cfg or parentEpicNumber missing', async () => {
  await assert.rejects(() => fetchEpicChildren({ parentEpicNumber: 1 }), /cfg is required/);
  await assert.rejects(() => fetchEpicChildren({ cfg }), /parentEpicNumber is required/);
});

test('fetchEpicChildren returns array even when underlying returns non-array', async () => {
  const result = await fetchEpicChildren({
    cfg,
    parentEpicNumber: 1,
    deps: { fetchSiblings: async () => null },
  });
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});
