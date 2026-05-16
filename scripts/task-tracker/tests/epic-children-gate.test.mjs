#!/usr/bin/env node
// Unit tests for scripts/task-tracker/lib/epic-children-gate.mjs (#135).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  fetchEpicChildren,
  planEpicDevelopChildrenGate,
  findNextEligibleChild,
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
