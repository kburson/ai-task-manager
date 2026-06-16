#!/usr/bin/env node
// Unit tests for backlog-exit-child-parent-state-guard (#338; relocated to
// on-deck-exit in #433).
//
// Mirror of plan-epic-children-guard's coverage but child-side: a child sub-
// issue moving on-deck → refine is refused when the parent epic's board Status
// is outside {refine, plan, develop}.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  backlogExitChildParentStateGuard,
  GUARD_ID,
} from '../lib/backlog-exit-child-parent-state-guard.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function makeDeps({ parent = 100, parentState = 'plan', fetchThrows, readThrows } = {}) {
  return {
    fetchParentIssue: async () => {
      if (fetchThrows) throw new Error(fetchThrows);
      return parent;
    },
    readParentStatus: async () => {
      if (readThrows) throw new Error(readThrows);
      return parentState;
    },
  };
}

test('guard exposes the expected id', () => {
  assert.equal(backlogExitChildParentStateGuard.id, 'backlog-exit-child-parent-refine-or-plan');
  assert.equal(GUARD_ID, 'backlog-exit-child-parent-refine-or-plan');
});

test('short-circuits when fromState !== "on-deck"', async () => {
  const result = await backlogExitChildParentStateGuard.run({
    cfg,
    issueNumber: 999,
    fromState: 'refine',
    toState: 'plan',
    deps: makeDeps({ parentState: 'done' }),
  });
  assert.deepEqual(result, { ok: true });
});

test('short-circuits when toState !== "refine"', async () => {
  const result = await backlogExitChildParentStateGuard.run({
    cfg,
    issueNumber: 999,
    fromState: 'on-deck',
    toState: 'plan',
    deps: makeDeps({ parentState: 'done' }),
  });
  assert.deepEqual(result, { ok: true });
});

test('short-circuits when ctx missing cfg', async () => {
  const result = await backlogExitChildParentStateGuard.run({
    issueNumber: 999,
    fromState: 'on-deck',
    toState: 'refine',
  });
  assert.deepEqual(result, { ok: true });
});

test('short-circuits when ctx missing issueNumber', async () => {
  const result = await backlogExitChildParentStateGuard.run({
    cfg,
    fromState: 'on-deck',
    toState: 'refine',
  });
  assert.deepEqual(result, { ok: true });
});

test('passes when issue has no parent (leaf / top-level epic)', async () => {
  const result = await backlogExitChildParentStateGuard.run({
    cfg,
    issueNumber: 1,
    fromState: 'on-deck',
    toState: 'refine',
    deps: {
      fetchParentIssue: async () => null,
      readParentStatus: async () => {
        throw new Error('readParentStatus should not be called when no parent');
      },
    },
  });
  assert.deepEqual(result, { ok: true });
});

test('passes when parent state is "refine"', async () => {
  const result = await backlogExitChildParentStateGuard.run({
    cfg,
    issueNumber: 2,
    fromState: 'on-deck',
    toState: 'refine',
    deps: makeDeps({ parent: 100, parentState: 'refine' }),
  });
  assert.deepEqual(result, { ok: true });
});

test('passes when parent state is "plan"', async () => {
  const result = await backlogExitChildParentStateGuard.run({
    cfg,
    issueNumber: 3,
    fromState: 'on-deck',
    toState: 'refine',
    deps: makeDeps({ parent: 100, parentState: 'plan' }),
  });
  assert.deepEqual(result, { ok: true });
});

test('passes when parent state is "develop" (mid-develop discovery work)', async () => {
  const result = await backlogExitChildParentStateGuard.run({
    cfg,
    issueNumber: 31,
    fromState: 'on-deck',
    toState: 'refine',
    deps: makeDeps({ parent: 100, parentState: 'develop' }),
  });
  assert.deepEqual(result, { ok: true });
});

for (const parentState of ['backlog', 'test', 'review', 'done']) {
  test(`refuses when parent state is "${parentState}"`, async () => {
    const result = await backlogExitChildParentStateGuard.run({
      cfg,
      issueNumber: 4,
      fromState: 'on-deck',
      toState: 'refine',
      deps: makeDeps({ parent: 100, parentState }),
    });
    assert.equal(result.ok, false);
    assert.match(
      result.reason,
      new RegExp(
        `parent #100 is in ${parentState}; child cannot enter refine until parent is in refine, plan, or develop`
      )
    );
    assert.deepEqual(result.blockers, [result.reason]);
  });
}

test('passes when parent state is null (parent not on board / transient read failure)', async () => {
  const result = await backlogExitChildParentStateGuard.run({
    cfg,
    issueNumber: 5,
    fromState: 'on-deck',
    toState: 'refine',
    deps: makeDeps({ parent: 100, parentState: null }),
  });
  assert.deepEqual(result, { ok: true });
});

test('fail-open when fetchParentIssue throws', async () => {
  const result = await backlogExitChildParentStateGuard.run({
    cfg,
    issueNumber: 6,
    fromState: 'on-deck',
    toState: 'refine',
    deps: makeDeps({ fetchThrows: 'graphql 500' }),
  });
  assert.deepEqual(result, { ok: true });
});

test('fail-open when readParentStatus throws', async () => {
  const result = await backlogExitChildParentStateGuard.run({
    cfg,
    issueNumber: 7,
    fromState: 'on-deck',
    toState: 'refine',
    deps: makeDeps({ parent: 100, readThrows: 'graphql 502' }),
  });
  assert.deepEqual(result, { ok: true });
});

test('mixed-case parent state still matches (normalized)', async () => {
  const result = await backlogExitChildParentStateGuard.run({
    cfg,
    issueNumber: 8,
    fromState: 'on-deck',
    toState: 'refine',
    deps: makeDeps({ parent: 100, parentState: 'PLAN' }),
  });
  assert.deepEqual(result, { ok: true });
});

test('legacy call site without fromState/toState still invokes deps', async () => {
  let called = 0;
  const result = await backlogExitChildParentStateGuard.run({
    cfg,
    issueNumber: 9,
    deps: {
      fetchParentIssue: async () => {
        called++;
        return 100;
      },
      readParentStatus: async () => {
        called++;
        return 'plan';
      },
    },
  });
  assert.equal(called, 2);
  assert.deepEqual(result, { ok: true });
});
