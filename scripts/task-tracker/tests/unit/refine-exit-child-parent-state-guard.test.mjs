#!/usr/bin/env node
// @story #339
// Unit tests for refine-exit-child-parent-state-guard (#339).
//
// Mirror of #338's backlog-exit child-parent-state guard one stage later:
// a sub-issue moving refine → plan is refused when parent's board Status is
// outside {develop, test, review, done}.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  refineExitChildParentStateGuard,
  GUARD_ID,
} from '../../lib/refine-exit-child-parent-state-guard.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function makeDeps({ parent = 100, parentState = 'develop', fetchThrows, readThrows } = {}) {
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
  assert.equal(refineExitChildParentStateGuard.id, 'refine-exit-child-parent-developing-or-beyond');
  assert.equal(GUARD_ID, 'refine-exit-child-parent-developing-or-beyond');
});

test('short-circuits when fromState !== "refine"', async () => {
  const result = await refineExitChildParentStateGuard.run({
    cfg,
    issueNumber: 999,
    fromState: 'plan',
    toState: 'develop',
    deps: makeDeps({ parentState: 'backlog' }),
  });
  assert.deepEqual(result, { ok: true });
});

test('short-circuits when toState !== "plan"', async () => {
  const result = await refineExitChildParentStateGuard.run({
    cfg,
    issueNumber: 999,
    fromState: 'refine',
    toState: 'backlog',
    deps: makeDeps({ parentState: 'backlog' }),
  });
  assert.deepEqual(result, { ok: true });
});

test('short-circuits when ctx missing cfg', async () => {
  const result = await refineExitChildParentStateGuard.run({
    issueNumber: 999,
    fromState: 'refine',
    toState: 'plan',
  });
  assert.deepEqual(result, { ok: true });
});

test('short-circuits when ctx missing issueNumber', async () => {
  const result = await refineExitChildParentStateGuard.run({
    cfg,
    fromState: 'refine',
    toState: 'plan',
  });
  assert.deepEqual(result, { ok: true });
});

test('passes when issue has no parent (leaf / top-level epic)', async () => {
  const result = await refineExitChildParentStateGuard.run({
    cfg,
    issueNumber: 1,
    fromState: 'refine',
    toState: 'plan',
    deps: {
      fetchParentIssue: async () => null,
      readParentStatus: async () => {
        throw new Error('readParentStatus should not be called when no parent');
      },
    },
  });
  assert.deepEqual(result, { ok: true });
});

for (const parentState of ['develop', 'test', 'review', 'done']) {
  test(`passes when parent state is "${parentState}"`, async () => {
    const result = await refineExitChildParentStateGuard.run({
      cfg,
      issueNumber: 2,
      fromState: 'refine',
      toState: 'plan',
      deps: makeDeps({ parent: 100, parentState }),
    });
    assert.deepEqual(result, { ok: true });
  });
}

for (const parentState of ['backlog', 'refine', 'plan']) {
  test(`refuses when parent state is "${parentState}"`, async () => {
    const result = await refineExitChildParentStateGuard.run({
      cfg,
      issueNumber: 3,
      fromState: 'refine',
      toState: 'plan',
      deps: makeDeps({ parent: 100, parentState }),
    });
    assert.equal(result.ok, false);
    assert.match(
      result.reason,
      new RegExp(
        `parent #100 is in ${parentState}; child cannot leave refine until parent reaches develop`
      )
    );
    assert.deepEqual(result.blockers, [result.reason]);
  });
}

test('passes when parent state is null (not on board / transient read failure)', async () => {
  const result = await refineExitChildParentStateGuard.run({
    cfg,
    issueNumber: 4,
    fromState: 'refine',
    toState: 'plan',
    deps: makeDeps({ parent: 100, parentState: null }),
  });
  assert.deepEqual(result, { ok: true });
});

test('fail-open when fetchParentIssue throws', async () => {
  const result = await refineExitChildParentStateGuard.run({
    cfg,
    issueNumber: 5,
    fromState: 'refine',
    toState: 'plan',
    deps: makeDeps({ fetchThrows: 'graphql 500' }),
  });
  assert.deepEqual(result, { ok: true });
});

test('fail-open when readParentStatus throws', async () => {
  const result = await refineExitChildParentStateGuard.run({
    cfg,
    issueNumber: 6,
    fromState: 'refine',
    toState: 'plan',
    deps: makeDeps({ parent: 100, readThrows: 'graphql 502' }),
  });
  assert.deepEqual(result, { ok: true });
});

test('mixed-case parent state still matches (normalized)', async () => {
  const result = await refineExitChildParentStateGuard.run({
    cfg,
    issueNumber: 7,
    fromState: 'refine',
    toState: 'plan',
    deps: makeDeps({ parent: 100, parentState: 'DEVELOP' }),
  });
  assert.deepEqual(result, { ok: true });
});

test('legacy call site without fromState/toState still invokes deps', async () => {
  let called = 0;
  const result = await refineExitChildParentStateGuard.run({
    cfg,
    issueNumber: 8,
    deps: {
      fetchParentIssue: async () => {
        called++;
        return 100;
      },
      readParentStatus: async () => {
        called++;
        return 'develop';
      },
    },
  });
  assert.equal(called, 2);
  assert.deepEqual(result, { ok: true });
});
