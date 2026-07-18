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

// ---------------------------------------------------------------------------
// #248 — dependency-aware findNextEligibleChild
// ---------------------------------------------------------------------------

test('findNextEligibleChild excludes a child whose blocker is not Done', () => {
  // #6 is blocked by #9 (still in develop, not Done) → must be skipped even
  // though it has the lower sequence. #7 (unblocked) is chosen instead.
  const next = findNextEligibleChild([
    { number: 6, state: 'refine', rank: 1, blockedBy: [9] },
    { number: 7, state: 'refine', rank: 2, blockedBy: [] },
    { number: 9, state: 'develop', rank: 0 },
  ]);
  assert.equal(next.number, 7);
});

test('findNextEligibleChild prefers a child that blocks a sibling (blocking-first)', () => {
  // #8 blocks #6, so #8 sorts ahead of the lower-sequence leaf child #5.
  const next = findNextEligibleChild([
    { number: 5, state: 'refine', rank: 1, blockedBy: [] },
    { number: 8, state: 'refine', rank: 3, blockedBy: [] },
    { number: 6, state: 'refine', rank: 4, blockedBy: [8] },
  ]);
  assert.equal(next.number, 8);
});

test('findNextEligibleChild keeps rank-ascending tiebreak among equals', () => {
  // No blockers anywhere → reduces to lowest-sequence (original behavior).
  const next = findNextEligibleChild([
    { number: 5, state: 'refine', rank: 3, blockedBy: [] },
    { number: 6, state: 'refine', rank: 1, blockedBy: [] },
  ]);
  assert.equal(next.number, 6);
});

test('findNextEligibleChild makes a child eligible once its blocker is Done', () => {
  // #6 blocked by #9; #9 is now Done → #6 becomes selectable (and it blocks
  // nobody, but it is the only eligible refine child here).
  const next = findNextEligibleChild([
    { number: 6, state: 'refine', rank: 2, blockedBy: [9] },
    { number: 9, state: 'done', rank: 1 },
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
      { number: 6, state: 'refine', rank: 1 },
      { number: 7, state: 'refine', rank: 2 },
    ],
    cfg,
    deps: { fetchBody: async ({ issueNumber }) => bodies[issueNumber] ?? '' },
  });
  assert.deepEqual(enriched[0].blockedBy, [8, 9]);
  assert.deepEqual(enriched[1].blockedBy, []);
});

test('enrichChildrenWithBlockedBy treats a fetch failure as no blockers', async () => {
  const enriched = await enrichChildrenWithBlockedBy({
    children: [{ number: 6, state: 'refine', rank: 1 }],
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

// ------------------------------------------------------------------
// developEpicTestChildrenGate (#337, relaxed by #877) — develop → test
// admission. Predicate: every child must be at `review` or later.
// The stricter child-`done` rule moved to `reviewEpicDoneChildrenGate`.
// ------------------------------------------------------------------

test('developEpicTestChildrenGate passes for non-epic (no children)', async () => {
  const result = await developEpicTestChildrenGate({
    cfg,
    issueNumber: 1,
    deps: { fetchSiblings: stubFetch([]) },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.children, []);
});

for (const pendingState of ['backlog', 'on-deck', 'refine', 'plan', 'develop', 'test']) {
  test(`developEpicTestChildrenGate refuses when any child is at ${pendingState}`, async () => {
    const result = await developEpicTestChildrenGate({
      cfg,
      issueNumber: 100,
      deps: {
        fetchSiblings: stubFetch([
          { number: 101, state: 'done', rank: 1 },
          { number: 102, state: pendingState, rank: 2 },
        ]),
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.blockers.length, 1);
    assert.match(result.blockers[0], /epic-children-not-in-review/);
    assert.match(result.blockers[0], /#102/);
    assert.equal(result.offendingChildren.length, 1);
    assert.equal(result.offendingChildren[0].number, 102);
  });
}

test('developEpicTestChildrenGate passes when every child is done', async () => {
  const result = await developEpicTestChildrenGate({
    cfg,
    issueNumber: 100,
    deps: {
      fetchSiblings: stubFetch([
        { number: 101, state: 'done', rank: 1 },
        { number: 102, state: 'done', rank: 2 },
        { number: 103, state: 'done', rank: 3 },
      ]),
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.children.length, 3);
});

// #877 — the relaxation itself. `done` still passes (above); these assert the
// widening: `review` children now admit the epic to Test, alone and mixed.
test('developEpicTestChildrenGate passes when every child is at review', async () => {
  const result = await developEpicTestChildrenGate({
    cfg,
    issueNumber: 100,
    deps: {
      fetchSiblings: stubFetch([
        { number: 101, state: 'review', rank: 1 },
        { number: 102, state: 'review', rank: 2 },
      ]),
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.children.length, 2);
});

test('developEpicTestChildrenGate passes on a mix of review and done children', async () => {
  const result = await developEpicTestChildrenGate({
    cfg,
    issueNumber: 100,
    deps: {
      fetchSiblings: stubFetch([
        { number: 101, state: 'done', rank: 1 },
        { number: 102, state: 'review', rank: 2 },
        { number: 103, state: 'done', rank: 3 },
      ]),
    },
  });
  assert.equal(result.ok, true);
});

test('developEpicTestChildrenGate names every pre-review offender, not just the first', async () => {
  const result = await developEpicTestChildrenGate({
    cfg,
    issueNumber: 100,
    deps: {
      fetchSiblings: stubFetch([
        { number: 101, state: 'develop', rank: 1 },
        { number: 102, state: 'review', rank: 2 },
        { number: 103, state: 'backlog', rank: 3 },
      ]),
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.blockers[0], /#101/);
  assert.match(result.blockers[0], /#103/);
  assert.doesNotMatch(result.blockers[0], /#102/);
  assert.equal(result.offendingChildren.length, 2);
});

test('developEpicTestChildrenGate accepts mixed-case "REVIEW"', async () => {
  const result = await developEpicTestChildrenGate({
    cfg,
    issueNumber: 100,
    deps: {
      fetchSiblings: stubFetch([{ number: 101, state: 'REVIEW', rank: 1 }]),
    },
  });
  assert.equal(result.ok, true);
});

test('developEpicTestChildrenGate surfaces fetch failure as blocker', async () => {
  const result = await developEpicTestChildrenGate({
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

test('developEpicTestChildrenGate accepts mixed-case "DONE"', async () => {
  const result = await developEpicTestChildrenGate({
    cfg,
    issueNumber: 100,
    deps: {
      fetchSiblings: stubFetch([{ number: 101, state: 'DONE', rank: 1 }]),
    },
  });
  assert.equal(result.ok, true);
});

test('developEpicTestChildrenGate requires cfg and issueNumber', async () => {
  await assert.rejects(() => developEpicTestChildrenGate({ issueNumber: 1 }), /cfg is required/);
  await assert.rejects(() => developEpicTestChildrenGate({ cfg }), /issueNumber is required/);
});
