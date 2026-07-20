#!/usr/bin/env node
// @story #935
//
// demote-to-develop is a CODE-REWORK path and nothing else (#935). The verb
// HARD-REFUSES unless the caller declares the code-change intent with a non-empty
// `--rework "<reason>"`, and threads that reason into `move-state.mjs
// --demote-reason` so it lands on the `demoted:<state>` timing row.
//
// These tests drive the pure core (`runDemote`) and the arg/argv seams directly,
// via dependency injection, so no live GitHub round-trip is needed.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runDemote, defaultRunMoveState, parseArgs } from './demote.mjs';

const CFG = { repo: 'owner/repo', projectId: 'PROJ' };

// A deps bundle whose every seam is a spy. The refusal path must trip BEFORE any
// of these are touched, so an untouched-spy assertion proves fail-fast ordering.
function makeDeps({ recorded = 'review', moveExit = 0 } = {}) {
  const calls = { fetchIssueBody: 0, getLiveState: 0, runMoveState: [], mutateIssueBody: 0 };
  return {
    calls,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => {
        calls.fetchIssueBody += 1;
        return {
          body: `<!-- aitm-last-known-state: ${recorded} --><!-- aitm-last-known-state-ts: 2026-07-22T00:00:00.000Z -->`,
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
      mutateIssueBody: async () => {
        calls.mutateIssueBody += 1;
      },
    },
  };
}

test('runDemote hard-refuses with no --rework (from review)', async () => {
  const { calls, deps } = makeDeps({ recorded: 'review' });
  const result = await runDemote({ issueNumber: 935, cfg: CFG, deps });
  assert.equal(result.status, 'rework-required');
  assert.match(result.message, /CODE-REWORK path/);
  assert.match(result.message, /re-invoke that stage's verb in place/);
  assert.equal(calls.fetchIssueBody, 0, 'refuses BEFORE any network fetch');
  assert.equal(calls.runMoveState.length, 0, 'never moves the board');
});

test('runDemote hard-refuses with no --rework (from test)', async () => {
  const { calls, deps } = makeDeps({ recorded: 'test' });
  const result = await runDemote({ issueNumber: 935, cfg: CFG, deps });
  assert.equal(result.status, 'rework-required');
  assert.equal(calls.runMoveState.length, 0, 'never moves the board');
});

test('runDemote treats a whitespace-only --rework as absent', async () => {
  const { calls, deps } = makeDeps({ recorded: 'review' });
  const result = await runDemote({ issueNumber: 935, cfg: CFG, rework: '   \t ', deps });
  assert.equal(result.status, 'rework-required');
  assert.equal(calls.runMoveState.length, 0);
});

test('runDemote with a real --rework from a legal source demotes and threads the reason', async () => {
  const { calls, deps } = makeDeps({ recorded: 'review', moveExit: 0 });
  const result = await runDemote({
    issueNumber: 935,
    cfg: CFG,
    rework: 'fix off-by-one in resolver',
    deps,
  });
  assert.equal(result.status, 'demoted');
  assert.equal(result.from, 'review');
  assert.equal(result.to, 'develop');
  assert.equal(calls.runMoveState.length, 1, 'move-state invoked exactly once');
  assert.equal(
    calls.runMoveState[0].rework,
    'fix off-by-one in resolver',
    'the declared reason is threaded into runMoveState'
  );
  assert.equal(calls.runMoveState[0].target, 'develop');
});

test('runDemote still refuses an illegal source even with --rework', async () => {
  const { calls, deps } = makeDeps({ recorded: 'plan' });
  const result = await runDemote({ issueNumber: 935, cfg: CFG, rework: 'code change', deps });
  assert.equal(result.status, 'invalid-source-refused');
  assert.equal(result.from, 'plan');
  assert.equal(calls.runMoveState.length, 0);
});

test('defaultRunMoveState appends --demote and --demote-reason when a reason is present', async () => {
  let seen = null;
  const exit = await defaultRunMoveState(
    { issueNumber: 935, target: 'develop', rework: 'my reason' },
    { host: async ({ argv }) => ((seen = argv), 0) }
  );
  assert.equal(exit, 0);
  assert.ok(seen.includes('--demote'), 'preserves the --demote flag');
  const i = seen.indexOf('--demote-reason');
  assert.notEqual(i, -1, '--demote-reason present');
  assert.equal(seen[i + 1], 'my reason', 'reason follows the flag');
  assert.ok(seen.includes('935') && seen.includes('develop'));
});

test('defaultRunMoveState omits --demote-reason when the reason is blank', async () => {
  let seen = null;
  await defaultRunMoveState(
    { issueNumber: 935, target: 'develop', rework: '   ' },
    { host: async ({ argv }) => ((seen = argv), 0) }
  );
  assert.ok(seen.includes('--demote'));
  assert.equal(seen.includes('--demote-reason'), false, 'no reason flag for a blank reason');
});

test('parseArgs extracts issue number and --rework in both forms', () => {
  assert.deepEqual(parseArgs(['#5', '--rework', 'x']), { issueNumber: 5, rework: 'x' });
  assert.deepEqual(parseArgs(['5', '--rework=y']), { issueNumber: 5, rework: 'y' });
  assert.deepEqual(parseArgs(['7']), { issueNumber: 7, rework: null });
  // A trailing bare `--rework` captures an empty string (treated as absent downstream).
  assert.deepEqual(parseArgs(['#9', '--rework']), { issueNumber: 9, rework: '' });
});
