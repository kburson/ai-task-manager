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
} from '../../../lib/epic-children-gate.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function stubFetch(children) {
  return async () => children;
}

function ready(number, rank, extra = {}) {
  return {
    number,
    state: 'ready-for-plan',
    rank,
    blockedBy: [],
    hasCurrentRefinement: true,
    ...extra,
  };
}

function terminal(number, rank, closeReason = 'completed') {
  return {
    number,
    state: 'done',
    boardState: closeReason === 'completed' ? 'done' : 'backlog',
    rank,
    issueState: 'closed',
    closeReason,
  };
}

// ---------------------------------------------------------------------------
// #248 — dependency-aware findNextEligibleChild
// ---------------------------------------------------------------------------

test('findNextEligibleChild excludes a child whose blocker is not Done', () => {
  // #6 is blocked by #9 (still in develop, not Done) → must be skipped even
  // though it has the lower sequence. #7 (unblocked) is chosen instead.
  const next = findNextEligibleChild([
    ready(6, 1, { blockedBy: [9] }),
    ready(7, 2),
    { number: 9, state: 'backlog', rank: 0, blockedBy: [] },
  ]);
  assert.equal(next.number, 7);
});

test('findNextEligibleChild prefers a child that blocks a sibling (blocking-first)', () => {
  // #8 blocks #6, so #8 sorts ahead of the lower-sequence leaf child #5.
  const next = findNextEligibleChild([ready(5, 1), ready(8, 3), ready(6, 4, { blockedBy: [8] })]);
  assert.equal(next.number, 8);
});

test('findNextEligibleChild keeps rank-ascending tiebreak among equals', () => {
  // No blockers anywhere → reduces to lowest-sequence (original behavior).
  const next = findNextEligibleChild([ready(5, 3), ready(6, 1)]);
  assert.equal(next.number, 6);
});

test('findNextEligibleChild makes a child eligible once its blocker is Done', () => {
  // #6 blocked by #9; #9 is now Done → #6 becomes selectable (and it blocks
  // nobody, but it is the only eligible refine child here).
  const next = findNextEligibleChild([ready(6, 2, { blockedBy: [9] }), terminal(9, 1)]);
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

test('enrichChildrenWithBlockedBy fails closed when evidence fetch fails', async () => {
  const enriched = await enrichChildrenWithBlockedBy({
    children: [{ number: 6, state: 'refine', rank: 1 }],
    cfg,
    deps: {
      fetchBody: async () => {
        throw new Error('network down');
      },
    },
  });
  assert.equal(enriched[0].blockedBy, null);
  assert.equal(enriched[0].hasCurrentRefinement, false);
  assert.match(enriched[0].childEvidenceError, /network down/);
});

// ---------------------------------------------------------------------------
// #247 — Refine→Plan WIP budget (wipAdvanceDecision)
// ---------------------------------------------------------------------------

test('wipAdvanceDecision: allows first child out of R4P (no active sibling)', () => {
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

test('wipAdvanceDecision: dependencies do not bypass the sequential local budget', () => {
  const children = [
    { number: 10, state: 'develop', blockedBy: [] }, // unparked, advancing
    { number: 12, state: 'develop', blockedBy: [11] }, // parked, blocked by the promoting child
    { number: 11, state: 'refine', blockedBy: [] }, // the blocker, wants to advance
  ];
  const d = wipAdvanceDecision({ promotingNumber: 11, children });
  assert.equal(d.ok, false);
  assert.deepEqual(d.advancing, [10, 12]);
});

test('wipAdvanceDecision: a blocked active sibling still consumes the local budget', () => {
  const children = [
    { number: 10, state: 'develop', blockedBy: [99] }, // parked on an unrelated blocker
    { number: 11, state: 'refine', blockedBy: [] },
  ];
  const d = wipAdvanceDecision({ promotingNumber: 11, children });
  assert.equal(d.ok, false);
  assert.deepEqual(d.advancing, [10]);
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

test('planRefineWipGate: fails closed when sibling fetch throws', async () => {
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
  assert.equal(r.ok, false);
  assert.match(r.blockers[0], /wip-children-fetch-failed/);
});

// ---------------------------------------------------------------------------
// #247 — childCreationAllowedAtEpicState (AC4)
// ---------------------------------------------------------------------------

test('childCreationAllowedAtEpicState admits the R4P lifecycle state', () => {
  for (const s of ['backlog', 'ready-for-plan', 'refine', 'plan', 'develop', 'test', 'review']) {
    assert.equal(childCreationAllowedAtEpicState(s), true, `expected ${s} to allow`);
  }
  assert.equal(childCreationAllowedAtEpicState('assigned'), false);
  assert.equal(childCreationAllowedAtEpicState('done'), false);
  assert.equal(childCreationAllowedAtEpicState('DONE'), false);
  assert.equal(childCreationAllowedAtEpicState(undefined), false);
  assert.equal(childCreationAllowedAtEpicState(''), false);
});

// ------------------------------------------------------------------
// developEpicTestChildrenGate — develop → test admission. Every child must be
// terminally delivered or closed with an accepted disposition.
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

for (const pendingState of ['backlog', 'assigned', 'refine', 'plan', 'develop', 'test']) {
  test(`developEpicTestChildrenGate refuses when any child is at ${pendingState}`, async () => {
    const result = await developEpicTestChildrenGate({
      cfg,
      issueNumber: 100,
      deps: {
        fetchSiblings: stubFetch([terminal(101, 1), { number: 102, state: pendingState, rank: 2 }]),
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.blockers.length, 1);
    assert.match(result.blockers[0], /epic-children-not-terminal/);
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
      fetchSiblings: stubFetch([terminal(101, 1), terminal(102, 2), terminal(103, 3)]),
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.children.length, 3);
});

test('developEpicTestChildrenGate refuses when every child is only at review', async () => {
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
  assert.equal(result.ok, false);
  assert.equal(result.offendingChildren.length, 2);
});

test('developEpicTestChildrenGate refuses a mix of review and terminal children', async () => {
  const result = await developEpicTestChildrenGate({
    cfg,
    issueNumber: 100,
    deps: {
      fetchSiblings: stubFetch([
        terminal(101, 1),
        { number: 102, state: 'review', rank: 2 },
        terminal(103, 3),
      ]),
    },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.offendingChildren.map((child) => child.number),
    [102]
  );
});

test('developEpicTestChildrenGate names every nonterminal offender, not just the first', async () => {
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
  assert.match(result.blockers[0], /#102/);
  assert.equal(result.offendingChildren.length, 3);
});

test('developEpicTestChildrenGate refuses mixed-case "REVIEW"', async () => {
  const result = await developEpicTestChildrenGate({
    cfg,
    issueNumber: 100,
    deps: {
      fetchSiblings: stubFetch([{ number: 101, state: 'REVIEW', rank: 1 }]),
    },
  });
  assert.equal(result.ok, false);
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

test('developEpicTestChildrenGate requires cfg and issueNumber', async () => {
  await assert.rejects(() => developEpicTestChildrenGate({ issueNumber: 1 }), /cfg is required/);
  await assert.rejects(() => developEpicTestChildrenGate({ cfg }), /issueNumber is required/);
});
