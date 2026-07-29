// @story #925
// Strict child inventory must distinguish an authoritative empty snapshot from
// an unavailable or incomplete board read.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { normalizeSubIssueBoardSnapshot } from '../../../lib/sub-issue-board-snapshot.mjs';

const projectItem = (projectId, statusName) => ({
  project: { id: projectId },
  fieldValueByName: statusName == null ? null : { name: statusName },
});

const child = (number, items) => ({
  number,
  projectItems: { nodes: items },
});

const snapshotData = (children) => ({
  repository: {
    issue: {
      subIssues: { nodes: children },
    },
  },
});

test('a successful empty sub-issue inventory is an authoritative leaf snapshot', () => {
  assert.deepEqual(normalizeSubIssueBoardSnapshot(snapshotData([]), 'P1'), {
    status: 'ok',
    children: [],
  });
});

test('successful child board states are canonical lifecycle state ids', () => {
  const data = snapshotData([
    child(11, [projectItem('P1', 'Done')]),
    child(12, [projectItem('P1', 'DONE')]),
  ]);

  assert.deepEqual(normalizeSubIssueBoardSnapshot(data, 'P1'), {
    status: 'ok',
    children: [
      { number: 11, boardState: 'done' },
      { number: 12, boardState: 'done' },
    ],
  });
});

test('a missing repository issue makes child inventory unknown', () => {
  const result = normalizeSubIssueBoardSnapshot({ repository: { issue: null } }, 'P1');

  assert.equal(result.status, 'unknown');
  assert.match(result.error, /issue unavailable/i);
});

test('a child without a matching project item makes child inventory unknown', () => {
  const data = snapshotData([child(11, [projectItem('P2', 'Done')])]);

  const result = normalizeSubIssueBoardSnapshot(data, 'P1');

  assert.equal(result.status, 'unknown');
  assert.match(result.error, /child #11 board unknown/i);
});

test('a child with a null Status makes child inventory unknown', () => {
  const data = snapshotData([child(11, [projectItem('P1', null)])]);

  const result = normalizeSubIssueBoardSnapshot(data, 'P1');

  assert.equal(result.status, 'unknown');
  assert.match(result.error, /child #11 board unknown/i);
});
