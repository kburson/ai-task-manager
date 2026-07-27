#!/usr/bin/env node
// @story #848
//
// `park` is the Refine|Plan → Backlog transition: an issue whose premise was
// falsified after refinement has a sanctioned way back to Backlog instead of
// sitting in a ready-to-work column or being closed unresolved. The verb
// HARD-REFUSES unless the caller declares why with a non-empty
// `--reason "<text>"`, and threads that reason into `move-state.mjs
// --demote-reason` so it lands on the `demoted:backlog` timing row.
//
// Unlike `demote`, park does NOT invalidate AC/VC/DoD evidence (AC4) — a
// re-picked issue's Priority/Size/Estimate and any already-stamped evidence
// survive the round trip untouched.
//
// These tests drive the pure core (`runPark`) and the arg/argv seams
// directly, via dependency injection, so no live GitHub round-trip is
// needed.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runPark, defaultRunMoveState, parseArgs, PARK_TARGET, LEGAL_FROM } from './park.mjs';

const CFG = { repo: 'owner/repo', projectId: 'PROJ' };

// A deps bundle whose every seam is a spy. The refusal path must trip BEFORE any
// of these are touched, so an untouched-spy assertion proves fail-fast ordering.
function makeDeps({ recorded = 'refine', moveExit = 0 } = {}) {
  const calls = { fetchIssueBody: 0, getLiveState: 0, runMoveState: [], mutateIssueBody: 0 };
  return {
    calls,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => {
        calls.fetchIssueBody += 1;
        return {
          body: `<!-- aitm-last-known-state: ${recorded} --><!-- aitm-last-known-state-ts: 2026-07-27T00:00:00.000Z -->`,
        };
      },
      getLiveState: async () => {
        calls.getLiveState += 1;
        return recorded;
      },
      runMoveState: async (args) => {
        calls.runMoveState.push(args);
        return moveExit;
      },
      mutateIssueBody: async ({ mutate }) => {
        calls.mutateIssueBody += 1;
        return mutate(
          `<!-- aitm-last-known-state: ${recorded} --><!-- aitm-last-known-state-ts: 2026-07-27T00:00:00.000Z -->`
        );
      },
    },
  };
}

test('PARK_TARGET is backlog and LEGAL_FROM is exactly refine/plan', () => {
  assert.equal(PARK_TARGET, 'backlog');
  assert.deepEqual([...LEGAL_FROM].sort(), ['plan', 'refine']);
});

test('runPark hard-refuses with no --reason (from refine)', async () => {
  const { calls, deps } = makeDeps({ recorded: 'refine' });
  const result = await runPark({ issueNumber: 848, cfg: CFG, deps });
  assert.equal(result.status, 'reason-required');
  assert.match(result.message, /--reason/);
  assert.equal(calls.fetchIssueBody, 0, 'refuses BEFORE any network fetch');
  assert.equal(calls.runMoveState.length, 0, 'never moves the board');
});

test('runPark hard-refuses with no --reason (from plan)', async () => {
  const { calls, deps } = makeDeps({ recorded: 'plan' });
  const result = await runPark({ issueNumber: 848, cfg: CFG, deps });
  assert.equal(result.status, 'reason-required');
  assert.equal(calls.runMoveState.length, 0);
});

test('runPark treats a whitespace-only --reason as absent', async () => {
  const { calls, deps } = makeDeps({ recorded: 'refine' });
  const result = await runPark({ issueNumber: 848, cfg: CFG, reason: '   \t ', deps });
  assert.equal(result.status, 'reason-required');
  assert.equal(calls.runMoveState.length, 0);
});

test('runPark from refine with a real --reason parks and threads the reason', async () => {
  const { calls, deps } = makeDeps({ recorded: 'refine', moveExit: 0 });
  const result = await runPark({
    issueNumber: 848,
    cfg: CFG,
    reason: 'premise falsified after refine review',
    deps,
  });
  assert.equal(result.status, 'parked');
  assert.equal(result.from, 'refine');
  assert.equal(result.to, 'backlog');
  assert.equal(calls.runMoveState.length, 1, 'move-state invoked exactly once');
  assert.equal(
    calls.runMoveState[0].reason,
    'premise falsified after refine review',
    'the declared reason is threaded into runMoveState'
  );
  assert.equal(calls.runMoveState[0].target, 'backlog');
});

test('runPark from plan with a real --reason parks', async () => {
  const { calls, deps } = makeDeps({ recorded: 'plan', moveExit: 0 });
  const result = await runPark({
    issueNumber: 848,
    cfg: CFG,
    reason: 'deprioritized',
    deps,
  });
  assert.equal(result.status, 'parked');
  assert.equal(result.from, 'plan');
  assert.equal(result.to, 'backlog');
  assert.equal(calls.runMoveState.length, 1);
});

for (const state of ['on-deck', 'develop', 'test', 'review', 'done', 'backlog']) {
  test(`runPark refuses from ${state} even with --reason`, async () => {
    const { calls, deps } = makeDeps({ recorded: state });
    const result = await runPark({ issueNumber: 848, cfg: CFG, reason: 'any reason', deps });
    assert.equal(result.status, 'invalid-source-refused');
    assert.equal(result.from, state);
    assert.equal(calls.runMoveState.length, 0);
  });
}

test('defaultRunMoveState appends --demote and --demote-reason when a reason is present', async () => {
  let seen = null;
  const exit = await defaultRunMoveState(
    { issueNumber: 848, target: 'backlog', reason: 'my reason' },
    { host: async ({ argv }) => ((seen = argv), 0) }
  );
  assert.equal(exit, 0);
  assert.ok(seen.includes('--demote'), 'reuses the --demote flag mechanism (honest audit row)');
  const i = seen.indexOf('--demote-reason');
  assert.notEqual(i, -1, '--demote-reason present');
  assert.equal(seen[i + 1], 'my reason', 'reason follows the flag');
  assert.ok(seen.includes('848') && seen.includes('backlog'));
});

test('defaultRunMoveState omits --demote-reason when the reason is blank', async () => {
  let seen = null;
  await defaultRunMoveState(
    { issueNumber: 848, target: 'backlog', reason: '   ' },
    { host: async ({ argv }) => ((seen = argv), 0) }
  );
  assert.ok(seen.includes('--demote'));
  assert.equal(seen.includes('--demote-reason'), false, 'no reason flag for a blank reason');
});

test('parseArgs extracts issue number and --reason in both forms', () => {
  assert.deepEqual(parseArgs(['#5', '--reason', 'x']), { issueNumber: 5, reason: 'x' });
  assert.deepEqual(parseArgs(['5', '--reason=y']), { issueNumber: 5, reason: 'y' });
  assert.deepEqual(parseArgs(['7']), { issueNumber: 7, reason: null });
  // A trailing bare `--reason` captures an empty string (treated as absent downstream).
  assert.deepEqual(parseArgs(['#9', '--reason']), { issueNumber: 9, reason: '' });
});

// ---------------------------------------------------------------------------
// #848 AC4 — Priority/Size/Estimate (and any stamped evidence) survive the
// round trip: park touches ONLY the lastKnownState marker, never invokes
// evidence invalidation the way `demote` does.
// ---------------------------------------------------------------------------

test('runPark does not strip AC/VC/DoD evidence — only lastKnownState changes', async () => {
  const fixture = [
    '<!-- aitm-last-known-state: refine --><!-- aitm-last-known-state-ts: 2026-07-27T00:00:00.000Z -->',
    '',
    '## Acceptance Criteria',
    '',
    '- [x] Some AC <!-- aitm-verified vc-list="vc:1" cmd="`node --test x`" sha="abc1234" ts="2026-07-27T00:00:00.000Z" exit="0" key="abc12345" -->',
    '',
    '<!-- aitm-fields: {"schema":1,"values":{"priority":"P1","size":"M","estimate":"4"}} -->',
    '',
  ].join('\n');

  let pushedBody = null;
  const deps = {
    assertBound: () => {},
    fetchIssueBody: async () => ({ body: fixture }),
    getLiveState: async () => 'refine',
    runMoveState: async () => 0,
    mutateIssueBody: async ({ mutate }) => {
      pushedBody = await mutate(fixture);
    },
  };

  const result = await runPark({
    issueNumber: 848,
    cfg: CFG,
    reason: 'premise falsified',
    deps,
  });

  assert.equal(result.status, 'parked');
  // Evidence marker (sha/ts/exit/key/vc-list) is fully preserved, unlike demote.
  assert.ok(pushedBody.includes('sha="abc1234"'), 'evidence proof props survive the park');
  assert.ok(pushedBody.includes('- [x] Some AC'), 'the AC checkbox stays ticked');
  assert.ok(
    pushedBody.includes('"priority":"P1","size":"M","estimate":"4"'),
    'Priority/Size/Estimate survive byte-identical'
  );
  assert.match(
    pushedBody,
    /aitm-last-known-state state="backlog"/,
    'state marker updates to backlog'
  );
});
