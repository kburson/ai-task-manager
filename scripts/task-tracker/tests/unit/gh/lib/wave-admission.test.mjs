#!/usr/bin/env node
// @story #49
// Unit tests for scripts/gh/lib/wave-admission.mjs
//
// Covers:
//   - solo bypass (no parentEpicNumber)
//   - lower-Sequence sibling in Development → blocker
//   - lower-Sequence sibling in Backlog → ok (Backlog excluded)
//   - lower-Sequence sibling in Review or Done → ok (terminal excluded)
//   - same-Sequence sibling in Development → ok (newcomer rule)
//   - higher-Sequence sibling in Development → ok (next wave)

//   - #947: mapSubIssueNodes coerces every CLOSED sub-issue to `done` and keeps
//     the raw column in `boardState`

import { strict as assert } from 'node:assert';
import { admit, mapSubIssueNodes } from '../../../../../gh/lib/wave-admission.mjs';

function stub(siblings) {
  return async () => siblings;
}

// 1. Solo bypass — no parentEpicNumber
{
  const r = await admit({ parentEpicNumber: null, rank: 3 });
  assert.equal(r.ok, true, 'solo issue with no parent should pass');
  assert.deepEqual(r.blockers, []);
}

// 2. Lower-Sequence sibling in development → blocker
{
  const r = await admit({
    parentEpicNumber: 41,
    rank: 3,
    repo: 'o/r',
    projectId: 'P',
    fetchSiblings: stub([{ number: 47, rank: 1, state: 'develop' }]),
  });
  assert.equal(r.ok, false);
  assert.equal(r.blockers.length, 1);
  assert.equal(r.blockers[0].issue, 47);
}

// 3. Lower-Sequence sibling in backlog → not a blocker
{
  const r = await admit({
    parentEpicNumber: 41,
    rank: 3,
    repo: 'o/r',
    projectId: 'P',
    fetchSiblings: stub([{ number: 47, rank: 1, state: 'backlog' }]),
  });
  assert.equal(r.ok, true, JSON.stringify(r));
}

// 4. Lower-Sequence sibling in Review → not a blocker
{
  const r = await admit({
    parentEpicNumber: 41,
    rank: 3,
    repo: 'o/r',
    projectId: 'P',
    fetchSiblings: stub([{ number: 47, rank: 1, state: 'r4r' }]),
  });
  assert.equal(r.ok, true, JSON.stringify(r));
}

// 5. Lower-Sequence sibling in Done → not a blocker
{
  const r = await admit({
    parentEpicNumber: 41,
    rank: 3,
    repo: 'o/r',
    projectId: 'P',
    fetchSiblings: stub([{ number: 47, rank: 1, state: 'done' }]),
  });
  assert.equal(r.ok, true, JSON.stringify(r));
}

// 6. Same-Sequence sibling in development → not a blocker (newcomer rule)
{
  const r = await admit({
    parentEpicNumber: 41,
    rank: 3,
    repo: 'o/r',
    projectId: 'P',
    fetchSiblings: stub([{ number: 50, rank: 3, state: 'develop' }]),
  });
  assert.equal(r.ok, true, JSON.stringify(r));
}

// 7. Higher-Sequence sibling in development → not a blocker
{
  const r = await admit({
    parentEpicNumber: 41,
    rank: 3,
    repo: 'o/r',
    projectId: 'P',
    fetchSiblings: stub([{ number: 51, rank: 4, state: 'develop' }]),
  });
  assert.equal(r.ok, true, JSON.stringify(r));
}

// 8. Mixed siblings — only lower in-flight ones block
{
  const r = await admit({
    parentEpicNumber: 41,
    rank: 3,
    repo: 'o/r',
    projectId: 'P',
    fetchSiblings: stub([
      { number: 47, rank: 1, state: 'done' }, // ignored
      { number: 48, rank: 2, state: 'review' }, // BLOCKS (in-flight, lower)
      { number: 50, rank: 3, state: 'develop' }, // same wave, ignored
      { number: 51, rank: 4, state: 'refine' }, // higher, ignored
      { number: 52, rank: 1, state: 'backlog' }, // backlog, ignored
    ]),
  });
  assert.equal(r.ok, false);
  assert.equal(r.blockers.length, 1, JSON.stringify(r.blockers));
  assert.equal(r.blockers[0].issue, 48);
  assert.equal(r.blockers[0].state, 'review');
}

// 9. Sequence values that aren't numbers are skipped (no crash)
{
  const r = await admit({
    parentEpicNumber: 41,
    rank: 3,
    repo: 'o/r',
    projectId: 'P',
    fetchSiblings: stub([{ number: 99, rank: null, state: 'develop' }]),
  });
  assert.equal(r.ok, true, JSON.stringify(r));
}

// 10. Plan is in-flight; Ready for Planning remains parked.
{
  const r = await admit({
    parentEpicNumber: 41,
    rank: 3,
    repo: 'o/r',
    projectId: 'P',
    fetchSiblings: stub([
      { number: 47, rank: 1, state: 'ready-for-plan' },
      { number: 48, rank: 2, state: 'plan' },
    ]),
  });
  assert.equal(r.ok, false);
  assert.deepEqual(
    r.blockers.map((blocker) => blocker.state),
    ['plan']
  );
}

// ---------------------------------------------------------------------------
// #947 — mapSubIssueNodes: CLOSED is terminal regardless of board column.
// ---------------------------------------------------------------------------

const BOARD = 'PVT_board';

// Build a GraphQL sub-issue node in the exact shape defaultFetchSiblings selects.
function node({ number, state = 'OPEN', stateReason = null, column, rank, projectId = BOARD }) {
  const fieldValues = { nodes: [] };
  if (column !== undefined) {
    fieldValues.nodes.push({ name: column, field: { name: 'Status' } });
  }
  if (rank !== undefined) {
    fieldValues.nodes.push({ number: rank, field: { name: 'Rank' } });
  }
  return {
    number,
    state,
    stateReason,
    projectItems:
      column === undefined && rank === undefined
        ? { nodes: [] }
        : { nodes: [{ project: { id: projectId }, fieldValues }] },
  };
}

// 11. CLOSED child ON the board, parked in Backlog → terminal. This is the
//     exact #859/#945 shape that deadlocked the develop→test gate.
{
  const [c] = mapSubIssueNodes(
    [node({ number: 945, state: 'CLOSED', stateReason: 'NOT_PLANNED', column: 'Backlog' })],
    BOARD
  );
  assert.equal(c.state, 'done', 'a CLOSED child on the board must resolve terminal');
  assert.equal(c.boardState, 'backlog', 'the raw column must survive additively');
  assert.equal(c.closeReason, 'not_planned');
}

// 12. CLOSED child parked mid-flight (Develop) → terminal, raw column kept.
{
  const [c] = mapSubIssueNodes(
    [node({ number: 12, state: 'CLOSED', stateReason: 'COMPLETED', column: 'Develop', rank: 4 })],
    BOARD
  );
  assert.equal(c.state, 'done');
  assert.equal(c.boardState, 'develop');
  assert.equal(c.rank, 4, 'rank still reads off the board item');
  assert.equal(c.closeReason, 'completed');
}

// 13. No-regression: CLOSED child with NO project item still resolves terminal
//     (the pre-#947 behaviour), with an empty raw column.
{
  const [c] = mapSubIssueNodes([node({ number: 13, state: 'CLOSED' })], BOARD);
  assert.equal(c.state, 'done');
  assert.equal(c.boardState, '', 'off-board child has no raw column');
  assert.equal(c.closeReason, null, 'CLOSED with no stateReason has no disposition');
}

// 14. OPEN child is never coerced — `state` is the live column.
{
  const [c] = mapSubIssueNodes([node({ number: 14, column: 'Develop', rank: 2 })], BOARD);
  assert.equal(c.state, 'develop');
  assert.equal(c.boardState, 'develop');
  assert.equal(c.closeReason, null, 'an open child has no disposition');
}

// 15. An item on a DIFFERENT board is ignored (item matching unchanged); a
//     CLOSED child is still terminal through that path.
{
  const [open, closed] = mapSubIssueNodes(
    [
      node({ number: 15, column: 'Develop', rank: 9, projectId: 'PVT_other' }),
      node({ number: 16, state: 'CLOSED', column: 'Refine', projectId: 'PVT_other' }),
    ],
    BOARD
  );
  assert.equal(open.state, '', 'a foreign board item contributes no Status');
  assert.equal(open.rank, null, 'a foreign board item contributes no Rank');
  assert.equal(closed.state, 'done');
  assert.equal(closed.boardState, '');
}

// 16. Nullish / empty input is tolerated.
{
  assert.deepEqual(mapSubIssueNodes(undefined, BOARD), []);
  const [malformed] = mapSubIssueNodes([null], BOARD);
  assert.equal(malformed.number, null);
  assert.equal(malformed.hasCurrentRefinement, false);
  assert.equal(malformed.childEvidenceError, 'malformed child descriptor');
}

// 17. End-to-end through `admit`: a lower-ranked CLOSED sibling stranded in
//     Develop no longer blocks wave admission.
{
  const siblings = mapSubIssueNodes(
    [node({ number: 47, state: 'CLOSED', stateReason: 'NOT_PLANNED', column: 'Develop', rank: 1 })],
    BOARD
  );
  const r = await admit({
    parentEpicNumber: 41,
    rank: 3,
    repo: 'o/r',
    projectId: BOARD,
    fetchSiblings: stub(siblings),
  });
  assert.equal(r.ok, true, JSON.stringify(r));
}

console.log('wave-admission.test.mjs: all passed');
