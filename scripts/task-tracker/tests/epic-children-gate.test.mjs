#!/usr/bin/env node
// Unit tests for scripts/task-tracker/lib/epic-children-gate.mjs (#135).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  fetchEpicChildren,
  planEpicDevelopChildrenGate,
  findNextEligibleChild,
  enrichChildrenWithBlockedBy,
  wipAdvanceDecision,
  planRefineWipGate,
  childCreationAllowedAtEpicState,
} from '../lib/epic-children-gate.mjs';

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
        { number: 101, state: 'refine', sequence: 1 },
        { number: 102, state: 'backlog', sequence: 2 },
      ]),
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.blockers.length, 1);
  assert.match(result.blockers[0], /epic-children-not-at-refine/);
  assert.match(result.blockers[0], /#102/);
  assert.equal(result.offendingChildren.length, 1);
});

test('planEpicDevelopChildrenGate refuses when any child is PAST refine (children must not lead parent)', async () => {
  const result = await planEpicDevelopChildrenGate({
    cfg,
    issueNumber: 100,
    deps: {
      fetchSiblings: stubFetch([
        { number: 101, state: 'refine', sequence: 1 },
        { number: 102, state: 'plan', sequence: 2 },
        { number: 103, state: 'develop', sequence: 3 },
        { number: 104, state: 'done', sequence: 4 },
      ]),
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.blockers[0], /epic-children-not-at-refine/);
  assert.match(result.blockers[0], /#102/);
  assert.match(result.blockers[0], /#103/);
  assert.match(result.blockers[0], /#104/);
  assert.doesNotMatch(result.blockers[0], /#101/);
  assert.equal(result.offendingChildren.length, 3);
});

test('planEpicDevelopChildrenGate passes when all children are at refine', async () => {
  const result = await planEpicDevelopChildrenGate({
    cfg,
    issueNumber: 100,
    deps: {
      fetchSiblings: stubFetch([
        { number: 101, state: 'refine', sequence: 1 },
        { number: 102, state: 'refine', sequence: 2 },
        { number: 103, state: 'refine', sequence: 3 },
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

test('findNextEligibleChild returns lowest-sequence refine-state child', () => {
  const next = findNextEligibleChild([
    { number: 5, state: 'refine', sequence: 3 },
    { number: 6, state: 'refine', sequence: 1 },
    { number: 7, state: 'plan', sequence: 2 },
  ]);
  assert.equal(next.number, 6);
});

test('findNextEligibleChild skips children with null sequence', () => {
  const next = findNextEligibleChild([
    { number: 5, state: 'refine', sequence: null },
    { number: 6, state: 'refine', sequence: 4 },
  ]);
  assert.equal(next.number, 6);
});

test('findNextEligibleChild returns null when no refine-state children', () => {
  const next = findNextEligibleChild([
    { number: 5, state: 'plan', sequence: 1 },
    { number: 6, state: 'develop', sequence: 2 },
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

// ---------------------------------------------------------------------------
// #248 — dependency-aware findNextEligibleChild
// ---------------------------------------------------------------------------

test('findNextEligibleChild excludes a child whose blocker is not Done', () => {
  // #6 is blocked by #9 (still in develop, not Done) → must be skipped even
  // though it has the lower sequence. #7 (unblocked) is chosen instead.
  const next = findNextEligibleChild([
    { number: 6, state: 'refine', sequence: 1, blockedBy: [9] },
    { number: 7, state: 'refine', sequence: 2, blockedBy: [] },
    { number: 9, state: 'develop', sequence: 0 },
  ]);
  assert.equal(next.number, 7);
});

test('findNextEligibleChild prefers a child that blocks a sibling (blocking-first)', () => {
  // #8 blocks #6, so #8 sorts ahead of the lower-sequence leaf child #5.
  const next = findNextEligibleChild([
    { number: 5, state: 'refine', sequence: 1, blockedBy: [] },
    { number: 8, state: 'refine', sequence: 3, blockedBy: [] },
    { number: 6, state: 'refine', sequence: 4, blockedBy: [8] },
  ]);
  assert.equal(next.number, 8);
});

test('findNextEligibleChild keeps sequence-ascending tiebreak among equals', () => {
  // No blockers anywhere → reduces to lowest-sequence (original behavior).
  const next = findNextEligibleChild([
    { number: 5, state: 'refine', sequence: 3, blockedBy: [] },
    { number: 6, state: 'refine', sequence: 1, blockedBy: [] },
  ]);
  assert.equal(next.number, 6);
});

test('findNextEligibleChild makes a child eligible once its blocker is Done', () => {
  // #6 blocked by #9; #9 is now Done → #6 becomes selectable (and it blocks
  // nobody, but it is the only eligible refine child here).
  const next = findNextEligibleChild([
    { number: 6, state: 'refine', sequence: 2, blockedBy: [9] },
    { number: 9, state: 'done', sequence: 1 },
  ]);
  assert.equal(next.number, 6);
});

test('enrichChildrenWithBlockedBy attaches parsed blockedBy per child', async () => {
  const bodies = {
    6: 'Scope...\n<!-- aitm-blocked-by: #8, #9 -->\n',
    7: 'No marker here.',
  };
  const enriched = await enrichChildrenWithBlockedBy({
    children: [
      { number: 6, state: 'refine', sequence: 1 },
      { number: 7, state: 'refine', sequence: 2 },
    ],
    cfg,
    deps: { fetchBody: async ({ issueNumber }) => bodies[issueNumber] ?? '' },
  });
  assert.deepEqual(enriched[0].blockedBy, [8, 9]);
  assert.deepEqual(enriched[1].blockedBy, []);
});

test('enrichChildrenWithBlockedBy treats a fetch failure as no blockers', async () => {
  const enriched = await enrichChildrenWithBlockedBy({
    children: [{ number: 6, state: 'refine', sequence: 1 }],
    cfg,
    deps: {
      fetchBody: async () => {
        throw new Error('network down');
      },
    },
  });
  assert.deepEqual(enriched[0].blockedBy, []);
});

// ---------------------------------------------------------------------------
// #247 — Refine→Plan WIP budget (wipAdvanceDecision)
// ---------------------------------------------------------------------------

test('wipAdvanceDecision: allows first child out of Refine (no advancing sibling)', () => {
  const children = [
    { number: 10, state: 'refine', blockedBy: [] },
    { number: 11, state: 'refine', blockedBy: [] },
  ];
  const d = wipAdvanceDecision({ promotingNumber: 10, children });
  assert.equal(d.ok, true);
  assert.deepEqual(d.advancing, []);
});

test('wipAdvanceDecision: refuses a second child while one already advances', () => {
  const children = [
    { number: 10, state: 'develop', blockedBy: [] }, // already advancing
    { number: 11, state: 'refine', blockedBy: [] }, // wants to advance
  ];
  const d = wipAdvanceDecision({ promotingNumber: 11, children });
  assert.equal(d.ok, false);
  assert.deepEqual(d.advancing, [10]);
});

test('wipAdvanceDecision: blocker-exception lets a blocker run ahead of its parked sibling', () => {
  // 10 is unparked and advancing (would normally refuse a second advance), but
  // 12 is parked out of Refine waiting on the promoting child 11 — so 11 is
  // admitted under the blocker-exception so it can clear 12's park.
  const children = [
    { number: 10, state: 'develop', blockedBy: [] }, // unparked, advancing
    { number: 12, state: 'develop', blockedBy: [11] }, // parked, blocked by the promoting child
    { number: 11, state: 'refine', blockedBy: [] }, // the blocker, wants to advance
  ];
  const d = wipAdvanceDecision({ promotingNumber: 11, children });
  assert.equal(d.ok, true);
  assert.match(d.reason, /exception/);
});

test('wipAdvanceDecision: a parked out-of-Refine sibling does not count against the budget', () => {
  const children = [
    { number: 10, state: 'develop', blockedBy: [99] }, // parked on an unrelated blocker
    { number: 11, state: 'refine', blockedBy: [] },
  ];
  const d = wipAdvanceDecision({ promotingNumber: 11, children });
  assert.equal(d.ok, true);
  assert.deepEqual(d.advancing, []);
});

test('wipAdvanceDecision: Done siblings never count as advancing', () => {
  const children = [
    { number: 10, state: 'done', blockedBy: [] },
    { number: 11, state: 'refine', blockedBy: [] },
  ];
  const d = wipAdvanceDecision({ promotingNumber: 11, children });
  assert.equal(d.ok, true);
});

test('planRefineWipGate: solo issue (no parent) bypasses', async () => {
  const r = await planRefineWipGate({
    cfg,
    issueNumber: 11,
    deps: { fetchParentIssue: async () => null },
  });
  assert.equal(r.ok, true);
});

test('planRefineWipGate: refuses when an epic sibling already advances', async () => {
  const r = await planRefineWipGate({
    cfg,
    issueNumber: 11,
    deps: {
      fetchParentIssue: async () => 5,
      fetchSiblings: async () => [
        { number: 10, state: 'develop' },
        { number: 11, state: 'refine' },
      ],
      fetchBody: async () => '', // no blockers anywhere
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.blockers[0], /wip-budget-exceeded/);
});

test('planRefineWipGate: fails open when sibling fetch throws', async () => {
  const r = await planRefineWipGate({
    cfg,
    issueNumber: 11,
    deps: {
      fetchParentIssue: async () => 5,
      fetchSiblings: async () => {
        throw new Error('network down');
      },
    },
  });
  assert.equal(r.ok, true);
});

// ---------------------------------------------------------------------------
// #247 — childCreationAllowedAtEpicState (AC4)
// ---------------------------------------------------------------------------

test('childCreationAllowedAtEpicState: true for every state except done', () => {
  for (const s of ['backlog', 'refine', 'plan', 'develop', 'test', 'review']) {
    assert.equal(childCreationAllowedAtEpicState(s), true, `expected ${s} to allow`);
  }
  assert.equal(childCreationAllowedAtEpicState('done'), false);
  assert.equal(childCreationAllowedAtEpicState('DONE'), false);
  assert.equal(childCreationAllowedAtEpicState(undefined), false);
  assert.equal(childCreationAllowedAtEpicState(''), false);
});
