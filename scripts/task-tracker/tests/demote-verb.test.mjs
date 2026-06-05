#!/usr/bin/env node
// Unit tests for scripts/task-tracker/verbs/demote.mjs.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runDemote } from '../verbs/demote.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function makeDeps({ body = '', live = null, moveCode = 0 } = {}) {
  // #295 — the verb writes through `deps.mutateIssueBody({mutate})`. The
  // closure is invoked with the FRESH base; the fake tracks the resulting
  // body so tests can assert "mutate produced body X from base Y".
  const calls = { writes: [], timings: [], moves: [], fetches: 0 };
  let remote = body;
  return {
    calls,
    deps: {
      fetchIssueBody: async () => {
        calls.fetches++;
        return { body: remote };
      },
      mutateIssueBody: async ({ mutate }) => {
        const before = remote;
        const next = mutate(before);
        if (next !== before) {
          remote = next;
          calls.writes.push({ before, after: next });
        }
        return { status: 'ok' };
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
  // #295 — bootstrap stamps `test`, post-move stamp lands `develop`.
  assert.equal(calls.writes.length, 2, 'bootstrap + post-move stamp');
  assert.match(calls.writes[0].after, /aitm-last-known-state: test/);
  assert.match(calls.writes[1].after, /aitm-last-known-state: develop/);
  // The post-move closure ran over the FRESH base (bootstrap's result),
  // not the original empty body — the bootstrap marker is preserved/replaced
  // in-place rather than blown away.
  assert.equal(calls.writes[1].before, calls.writes[0].after);
});

test('demote: test→develop landed write carries develop marker (#295 closure semantics)', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('test'), live: 'test' });
  const r = await runDemote({ issueNumber: 207, cfg, deps });
  assert.equal(r.status, 'demoted');
  // Exactly one write — the post-move develop stamp.
  assert.equal(calls.writes.length, 1);
  assert.match(calls.writes[0].before, /aitm-last-known-state: test/);
  assert.match(calls.writes[0].after, /aitm-last-known-state: develop/);
});
