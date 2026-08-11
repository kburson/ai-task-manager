#!/usr/bin/env node
// @story #69
// Unit tests for scripts/task-tracker/verbs/reconcile.mjs.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runReconcile } from '../../../verbs/reconcile.mjs';
import { normalizeStateId } from '../../../lib/lifecycle-policy/index.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function makeDeps({ body = '', live = null, moveCode = 0 } = {}) {
  const calls = { writes: [], markers: [], moves: [], persists: [] };
  return {
    calls,
    deps: {
      fetchIssueBody: async () => ({ body }),
      writeIssueBody: async ({ body: b }) => {
        calls.writes.push(b);
      },
      getLiveState: async () => live,
      runMoveState: async ({ issueNumber, target }) => {
        calls.moves.push({ issueNumber, target });
        return moveCode;
      },
      // #516 — drift events are now body audit markers, not timing rows. Capture
      // the appended marker text produced by the `mutate` callback.
      mutateIssueBody: async ({ mutate }) => {
        calls.markers.push(mutate(''));
      },
      persistTrackerState: ({ issueNumber, state }) => {
        calls.persists.push({ issueNumber, state });
      },
    },
  };
}

function bodyWithState(state) {
  return `<!-- aitm-last-known-state: ${state} -->\n<!-- aitm-last-known-state-ts: 2026-05-11T00:00:00Z -->\n\nbody.\n`;
}

function proofBodyWithState(state) {
  return [
    `<!-- aitm-last-known-state: ${state} -->`,
    '<!-- aitm-last-known-state-ts: 2026-07-28T00:00:00Z -->',
    '',
    '## Acceptance Criteria',
    '',
    '- [x] Recovery invalidates stale AC proof <!-- aitm-verified vc-list="vc:1" sha="abc1234" ts="2026-07-28T00:01:00Z" exit="0" -->',
    '',
    '### Functional (verified at Test)',
    '',
    '- [x] All automated tests pass <!-- aitm-verified cmd="`npm test`" sha="abc1234" ts="2026-07-28T00:02:00Z" exit="0" --> <!-- dod:functional:tests -->',
    '',
  ].join('\n');
}

test('reconcile accept-live: drifted issue writes new state + reconciled audit marker', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('plan'), live: 'develop' });
  const r = await runReconcile({ issueNumber: 300, mode: 'accept-live', cfg, deps });
  assert.equal(r.status, 'reconciled');
  assert.equal(r.mode, 'accept-live');
  assert.equal(r.from, 'plan');
  assert.equal(r.to, 'develop');
  assert.equal(calls.writes.length, 1);
  assert.match(calls.writes[0], /aitm-last-known-state state="develop"/);
  assert.match(calls.writes[0], /aitm-entered-develop(?::|\s+ts=")/);
  // #516 — drift reconcile is a body audit marker, not a timing row.
  assert.equal(calls.markers.length, 1);
  assert.match(calls.markers[0], /aitm-reconciled/);
  assert.match(calls.markers[0], /plan.*develop/);
  assert.equal(calls.moves.length, 0);
  assert.deepEqual(calls.persists, [{ issueNumber: 300, state: 'develop' }]);
});

for (const recorded of ['test', 'review']) {
  test(`reconcile accept-live: ${recorded} → develop invalidates stale demotion proof and reports it (#1037)`, async () => {
    const { deps, calls } = makeDeps({
      body: proofBodyWithState(recorded),
      live: 'develop',
    });

    const result = await runReconcile({
      issueNumber: 1037,
      mode: 'accept-live',
      cfg,
      deps,
      now: () => '2026-07-28T01:00:00Z',
    });

    assert.equal(result.status, 'reconciled');
    assert.deepEqual(result.stripped, [
      'Recovery invalidates stale AC proof',
      'All automated tests pass',
    ]);
    assert.equal(calls.writes.length, 1);
    assert.match(
      calls.writes[0],
      /- \[ \] Recovery invalidates stale AC proof <!-- aitm-verified vc-list="vc:1" -->/
    );
    assert.match(
      calls.writes[0],
      /- \[ \] All automated tests pass <!-- aitm-verified cmd="`npm test`" --> <!-- dod:functional:tests -->/
    );
    assert.doesNotMatch(calls.writes[0], /aitm-verified[^>]*(?:sha|ts|exit)=/);
    assert.equal(calls.markers.length, 1);
    assert.match(calls.markers[0], /stripped: Recovery invalidates stale AC proof/);
    assert.match(calls.markers[0], /All automated tests pass/);
  });
}

for (const scenario of [
  { recorded: 'plan', live: 'develop', label: 'forward drift' },
  { recorded: 'done', live: 'review', label: 'unrelated rollback' },
]) {
  test(`reconcile accept-live preserves execution proof for ${scenario.label} (#1037)`, async () => {
    const body = proofBodyWithState(scenario.recorded);
    const { deps, calls } = makeDeps({ body, live: scenario.live });

    const result = await runReconcile({
      issueNumber: 1037,
      mode: 'accept-live',
      cfg,
      deps,
    });

    assert.deepEqual(result.stripped, []);
    assert.match(calls.writes[0], /- \[x\] Recovery invalidates stale AC proof/);
    assert.match(calls.writes[0], /sha="abc1234"/);
    assert.doesNotMatch(calls.markers[0], /stripped:/);
  });
}

test('reconcile accept-live stamps aitm-entered-<live> when absent (#174)', async () => {
  const body =
    '<!-- aitm-last-known-state: develop -->\n' +
    '<!-- aitm-last-known-state-ts: 2026-05-18T00:00:00Z -->\n' +
    '\n' +
    '<!-- aitm-entered-refine: 2026-05-18T00:00:00Z -->\n' +
    '\n' +
    '<!-- aitm-entered-develop: 2026-05-18T00:10:00Z -->\n' +
    '\n' +
    'body.\n';
  const { deps, calls } = makeDeps({ body, live: 'test' });
  const r = await runReconcile({ issueNumber: 174, mode: 'accept-live', cfg, deps });
  assert.equal(r.status, 'reconciled');
  assert.equal(r.to, 'test');
  assert.equal(calls.writes.length, 1);
  const written = calls.writes[0];
  assert.match(written, /aitm-entered-refine(?::|\s+ts=")/);
  assert.match(written, /aitm-entered-develop(?::|\s+ts=")/);
  assert.match(written, /aitm-entered-test(?::|\s+ts=")/);
  // Monotonic order in body: refine, develop, test.
  const idxRefine = written.indexOf('aitm-entered-refine');
  const idxDevelop = written.indexOf('aitm-entered-develop');
  const idxTest = written.indexOf('aitm-entered-test');
  assert.ok(idxRefine < idxDevelop, 'refine before develop');
  assert.ok(idxDevelop < idxTest, 'develop before test');
});

test('reconcile accept-live is idempotent for entry marker (#174)', async () => {
  const existingTs = '2026-05-18T00:10:00Z';
  const body =
    '<!-- aitm-last-known-state: refine -->\n' +
    '<!-- aitm-last-known-state-ts: 2026-05-18T00:00:00Z -->\n' +
    '\n' +
    `<!-- aitm-entered-develop: ${existingTs} -->\n` +
    '\n' +
    'body.\n';
  const { deps, calls } = makeDeps({ body, live: 'develop' });
  const r = await runReconcile({ issueNumber: 1742, mode: 'accept-live', cfg, deps });
  assert.equal(r.status, 'reconciled');
  assert.equal(calls.writes.length, 1);
  const written = calls.writes[0];
  // Single entered-develop marker preserved with original timestamp.
  const matches = written.match(/aitm-entered-develop:\s*([^>\s]+)/g) || [];
  assert.equal(matches.length, 1, 'exactly one entered-develop marker');
  assert.ok(written.includes(`aitm-entered-develop: ${existingTs}`));
  // Single reconciled audit marker (no phantom re-fire).
  assert.equal(calls.markers.length, 1);
});

// #436 — regression for the live-board-status → slug → stampEntryMarker path
// that #433's AC5 never exercised. `defaultGetLiveState` resolves the live
// status by passing the raw board display name through `normalizeStateId`;
// for the Assigned column that name is "Assigned" (a space). Before the fix the
// slug once contained a space, which `stampEntryMarker` rejected with
// `unknown stage`, crashing `reconcile accept-live`. We feed the raw
// display name through the SAME resolver the production default uses so the
// test covers the whole chain end-to-end.
test('reconcile accept-live: Assigned live status stamps aitm-entered-assigned without throwing (#436)', async () => {
  const liveSlug = normalizeStateId('Assigned'); // mirrors defaultGetLiveState
  assert.equal(liveSlug, 'assigned', 'resolver must produce the kebab slug');
  const { deps, calls } = makeDeps({ body: bodyWithState('backlog'), live: liveSlug });
  let result;
  await assert.doesNotReject(async () => {
    result = await runReconcile({ issueNumber: 436, mode: 'accept-live', cfg, deps });
  }, /unknown stage/);
  assert.equal(result.status, 'reconciled');
  assert.equal(result.from, 'backlog');
  assert.equal(result.to, 'assigned');
  assert.equal(calls.writes.length, 1);
  assert.match(calls.writes[0], /aitm-last-known-state state="assigned"/);
  assert.match(calls.writes[0], /aitm-entered-assigned(?::|\s+ts=")/);
});

// #740 — revert-to-recorded is now FORWARD-ONLY. A recorded state BEHIND the
// live board (recorded=plan, live=develop) can no longer be "pushed back": the
// single develop→plan jump this test used to assert was only ever mock-legal
// (in production develop→plan is an illegal matrix transition, move-state exits
// 5), so the honest contract is to refuse and name `accept-live`.
test('reconcile revert-to-recorded: recorded BEHIND live refuses forward-only, names accept-live (#740)', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('plan'), live: 'develop' });
  const r = await runReconcile({ issueNumber: 301, mode: 'revert-to-recorded', cfg, deps });
  assert.equal(r.status, 'wrong-direction');
  assert.equal(r.from, 'develop');
  assert.equal(r.to, 'plan');
  assert.match(r.message, /accept-live/);
  // Forward-only: no board move, no audit marker, no body write.
  assert.equal(calls.moves.length, 0);
  assert.equal(calls.markers.length, 0);
  assert.equal(calls.writes.length, 0);
});

test('reconcile: no drift refused', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('plan'), live: 'plan' });
  const r = await runReconcile({ issueNumber: 302, mode: 'accept-live', cfg, deps });
  assert.equal(r.status, 'no-drift-refused');
  assert.match(r.message, /no drift detected/);
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.moves.length, 0);
  assert.equal(calls.markers.length, 0);
});

test('reconcile: missing mode returns error', async () => {
  const { deps } = makeDeps({ body: bodyWithState('plan'), live: 'develop' });
  const r = await runReconcile({ issueNumber: 303, cfg, deps });
  assert.equal(r.status, 'error');
  assert.match(r.message, /mode is required/);
});

test('reconcile: unknown mode returns error', async () => {
  const { deps } = makeDeps({ body: bodyWithState('plan'), live: 'develop' });
  const r = await runReconcile({ issueNumber: 304, mode: 'force-it', cfg, deps });
  assert.equal(r.status, 'error');
  assert.match(r.message, /unknown mode/);
});

test('reconcile revert-to-recorded: no recorded state → error', async () => {
  const { deps, calls } = makeDeps({ body: 'no marker here\n', live: 'plan' });
  const r = await runReconcile({ issueNumber: 305, mode: 'revert-to-recorded', cfg, deps });
  assert.equal(r.status, 'error');
  assert.match(r.message, /no recorded state/);
  assert.equal(calls.moves.length, 0);
});

test('reconcile accept-live: no live state → error', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('plan'), live: null });
  const r = await runReconcile({ issueNumber: 306, mode: 'accept-live', cfg, deps });
  assert.equal(r.status, 'error');
  assert.match(r.message, /no live state/);
  assert.equal(calls.writes.length, 0);
});

test('reconcile accept-live: preserves forward markers as history + adds visit marker (#181)', async () => {
  // #181 schema: forward markers are preserved as audit history. accept-live
  // updates last-known-state and stamps entered-<live>-N as a new visit. The
  // chain-integrity gate validates the resulting sequence against
  // LEGAL_TRANSITIONS (done->review is the rollback arc).
  const body =
    '<!-- aitm-last-known-state: done -->\n' +
    '<!-- aitm-last-known-state-ts: 2026-05-16T16:37:00Z -->\n' +
    '\n' +
    '<!-- aitm-entered-review: 2026-05-16T16:30:00Z -->\n' +
    '\n' +
    '<!-- aitm-entered-done: 2026-05-16T16:37:00Z -->\n' +
    '\n' +
    'body.\n';
  const { deps, calls } = makeDeps({ body, live: 'review' });
  const r = await runReconcile({ issueNumber: 148, mode: 'accept-live', cfg, deps });
  assert.equal(r.status, 'reconciled');
  assert.deepEqual(r.stripped, []);
  assert.equal(calls.writes.length, 1);
  assert.match(calls.writes[0], /aitm-last-known-state state="review"/);
  assert.match(calls.writes[0], /aitm-entered-review(?::|\s+ts=")/);
  assert.match(calls.writes[0], /aitm-entered-done(?::|\s+ts=")/);
  assert.match(calls.writes[0], /aitm-entered-review-2(?::|\s+ts=")/);
  assert.equal(calls.markers.length, 1);
  assert.doesNotMatch(calls.markers[0], /stripped:/);
});

// #740 — re-pointed at a forward scenario (recorded=test AHEAD of live=develop)
// so it still exercises the body-untouched invariant it was written to protect:
// the revert path moves the board forward via move-state and never strips or
// rewrites the body (only the best-effort audit marker is appended).
test('reconcile revert-to-recorded: does NOT strip future entry markers', async () => {
  const body =
    '<!-- aitm-last-known-state: test -->\n' +
    '<!-- aitm-last-known-state-ts: 2026-05-16T16:00:00Z -->\n' +
    '\n' +
    '<!-- aitm-entered-develop: 2026-05-16T16:10:00Z -->\n' +
    '\n' +
    'body.\n';
  const { deps, calls } = makeDeps({ body, live: 'develop' });
  const r = await runReconcile({ issueNumber: 149, mode: 'revert-to-recorded', cfg, deps });
  assert.equal(r.status, 'reconciled');
  assert.equal(r.mode, 'revert-to-recorded');
  assert.equal(r.from, 'develop');
  assert.equal(r.to, 'test');
  assert.deepEqual(r.walked, ['test']);
  // revert path does not touch body via writeIssueBody — only board state via
  // move-state (one forward hop) plus the best-effort audit marker.
  assert.equal(calls.writes.length, 0);
  assert.deepEqual(calls.moves, [{ issueNumber: 149, target: 'test' }]);
});

// #740 — forward scenario (recorded=test AHEAD of live=develop) so the FIRST
// forward hop is a legal target that move-state rejects at runtime (exit 7).
test('reconcile revert: transition-failed when move-state exits non-zero', async () => {
  const { deps, calls } = makeDeps({
    body: bodyWithState('test'),
    live: 'develop',
    moveCode: 7,
  });
  const r = await runReconcile({ issueNumber: 307, mode: 'revert-to-recorded', cfg, deps });
  assert.equal(r.status, 'transition-failed');
  assert.equal(r.exitCode, 7);
  assert.equal(r.failedAt, 'test');
  assert.equal(calls.markers.length, 0);
});
