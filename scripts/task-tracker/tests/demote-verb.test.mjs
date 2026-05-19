#!/usr/bin/env node
// Unit tests for scripts/task-tracker/verbs/demote.mjs.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runDemote } from '../verbs/demote.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function makeDeps({ body = '', live = null, moveCode = 0 } = {}) {
  const calls = { writes: [], timings: [], moves: [], fetches: 0 };
  let secondFetch = false;
  return {
    calls,
    deps: {
      fetchIssueBody: async () => {
        calls.fetches++;
        if (secondFetch) return { body };
        secondFetch = true;
        return { body };
      },
      writeIssueBody: async ({ body: b }) => {
        calls.writes.push(b);
      },
      getLiveState: async () => live,
      runMoveState: async ({ issueNumber, target }) => {
        calls.moves.push({ issueNumber, target });
        return moveCode;
      },
      postTimingRow: async ({ row }) => {
        calls.timings.push(row);
      },
    },
  };
}

function bodyWithState(state) {
  return `<!-- aitm-last-known-state: ${state} -->\n<!-- aitm-last-known-state-ts: 2026-05-10T00:00:00Z -->\n\nbody.\n`;
}

test('demote: test→develop happy path', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('test'), live: 'test' });
  const r = await runDemote({ issueNumber: 200, cfg, deps });
  assert.equal(r.status, 'demoted');
  assert.equal(r.from, 'test');
  assert.equal(r.to, 'develop');
  assert.deepEqual(calls.moves, [{ issueNumber: 200, target: 'develop' }]);
  // #128 — demote no longer emits a `move:<target>` audit row. The paired
  // `demoted` + `<target>:enter` rows are emitted from move-state.mjs via
  // the `--demote` flag and are not visible to this dependency-injected fake.
  assert.equal(calls.timings.length, 0);
});

test('demote: review→develop happy path', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('review'), live: 'review' });
  const r = await runDemote({ issueNumber: 201, cfg, deps });
  assert.equal(r.status, 'demoted');
  assert.equal(r.from, 'review');
  assert.equal(r.to, 'develop');
  assert.deepEqual(calls.moves, [{ issueNumber: 201, target: 'develop' }]);
});

test('demote: refused from every non-{test,review} source', async () => {
  for (const from of ['backlog', 'refine', 'plan', 'develop', 'done']) {
    const { deps, calls } = makeDeps({ body: bodyWithState(from), live: from });
    const r = await runDemote({ issueNumber: 202, cfg, deps });
    assert.equal(r.status, 'invalid-source-refused', `from=${from} expected refusal`);
    assert.equal(r.from, from);
    assert.match(r.message, /demote only valid from test or review/);
    assert.equal(calls.moves.length, 0);
    assert.equal(calls.timings.length, 0);
  }
});

test('demote: drift refused when live ≠ recorded', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('test'), live: 'review' });
  const r = await runDemote({ issueNumber: 203, cfg, deps });
  assert.equal(r.status, 'drift-refused');
  assert.equal(r.live, 'review');
  assert.equal(r.recorded, 'test');
  assert.match(r.message, /drift detected/);
  assert.match(r.message, /\/task reconcile/);
  assert.equal(calls.moves.length, 0);
});

test('demote: transition-failed when move-state exits non-zero', async () => {
  const { deps, calls } = makeDeps({
    body: bodyWithState('test'),
    live: 'test',
    moveCode: 3,
  });
  const r = await runDemote({ issueNumber: 204, cfg, deps });
  assert.equal(r.status, 'transition-failed');
  assert.equal(r.exitCode, 3);
  // No timing row on failed transition.
  assert.equal(calls.timings.length, 0);
});

test('demote: bootstrap when lastKnownState absent — syncs to live, then refuses if live is not test/review', async () => {
  const { deps } = makeDeps({ body: '## just a body\n', live: 'plan' });
  const r = await runDemote({ issueNumber: 205, cfg, deps });
  assert.equal(r.status, 'invalid-source-refused');
  assert.equal(r.from, 'plan');
});

test('demote: bootstrap then demote from test succeeds', async () => {
  const { deps, calls } = makeDeps({ body: '## just a body\n', live: 'test' });
  const r = await runDemote({ issueNumber: 206, cfg, deps });
  assert.equal(r.status, 'demoted');
  assert.equal(r.bootstrapped, true);
  assert.equal(r.from, 'test');
  assert.equal(r.to, 'develop');
  assert.deepEqual(calls.moves, [{ issueNumber: 206, target: 'develop' }]);
});
