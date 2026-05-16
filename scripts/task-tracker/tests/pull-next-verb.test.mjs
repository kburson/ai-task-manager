#!/usr/bin/env node
// Unit tests for scripts/task-tracker/verbs/pull-next.mjs (#135).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runPullNext } from '../verbs/pull-next.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function makeDeps({ liveState = 'develop', children = [], promoteResult = { status: 'ok' } } = {}) {
  const calls = { promotes: [], stateLookups: 0 };
  return {
    calls,
    deps: {
      getLiveState: async ({ issueNumber }) => {
        calls.stateLookups++;
        calls.lastLookup = issueNumber;
        return liveState;
      },
      epicChildren: {
        fetchSiblings: async () => children,
      },
      promote: async (rest) => {
        calls.promotes.push(rest);
        return promoteResult;
      },
    },
  };
}

test('runPullNext refuses when epic is not in develop', async () => {
  const { deps, calls } = makeDeps({ liveState: 'plan' });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'epic-not-in-develop');
  assert.equal(calls.promotes.length, 0);
});

test('runPullNext returns no-children for epic with no sub-issues', async () => {
  const { deps } = makeDeps({ children: [] });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'no-children');
});

test('runPullNext returns no-eligible when no refine-state children', async () => {
  const { deps } = makeDeps({
    children: [
      { number: 101, state: 'plan', sequence: 1 },
      { number: 102, state: 'done', sequence: 2 },
    ],
  });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'no-eligible');
  assert.deepEqual(result.counts, { plan: 1, done: 1 });
});

test('runPullNext promotes lowest-sequence refine child', async () => {
  const { deps, calls } = makeDeps({
    children: [
      { number: 105, state: 'refine', sequence: 5 },
      { number: 103, state: 'refine', sequence: 3 },
      { number: 104, state: 'plan', sequence: 4 },
    ],
  });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'pulled');
  assert.equal(result.childNumber, 103);
  assert.equal(result.childSequence, 3);
  assert.deepEqual(calls.promotes, [['103']]);
});

test('runPullNext requires epicNumber and cfg', async () => {
  await assert.rejects(() => runPullNext({ cfg }), /epicNumber is required/);
  await assert.rejects(() => runPullNext({ epicNumber: 1 }), /cfg is required/);
});

test('runPullNext surfaces fetch failures', async () => {
  const deps = {
    getLiveState: async () => 'develop',
    epicChildren: {
      fetchSiblings: async () => {
        throw new Error('graphql down');
      },
    },
    promote: async () => ({ status: 'ok' }),
  };
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'fetch-failed');
  assert.match(result.message, /graphql down/);
});
