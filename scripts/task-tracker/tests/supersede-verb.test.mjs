#!/usr/bin/env node
// @story #401
// Tests for scripts/task-tracker/verbs/supersede.mjs — pure core, DI fakes.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { parseArgs, runSupersede } from '../verbs/supersede.mjs';
import { parseSupersededBy } from '../lib/superseded-marker.mjs';

const CFG = { repo: 'owner/repo' };
const TS = '2026-06-14T12:00:00.000Z';

// Build DI deps + a call-log. `live` is the set of existing issue numbers;
// `moveCode` is the simulated move-state.mjs exit code; `body` seeds the dead
// story's body for the in-place mutate.
function makeDeps({ live = [], moveCode = 0, body = 'dead story body' } = {}) {
  const calls = {
    issueExists: [],
    mutateIssueBody: [],
    runMoveState: [],
    postComment: [],
    closeNotPlanned: [],
  };
  let currentBody = body;
  const deps = {
    now: () => TS,
    issueExists: async ({ issueNumber }) => {
      calls.issueExists.push(issueNumber);
      return live.includes(issueNumber);
    },
    mutateIssueBody: async ({ issueNumber, mutate }) => {
      currentBody = mutate(currentBody);
      calls.mutateIssueBody.push({ issueNumber, body: currentBody });
      return currentBody;
    },
    runMoveState: async ({ issueNumber }) => {
      calls.runMoveState.push(issueNumber);
      return moveCode;
    },
    postComment: async ({ issueNumber, body: commentBody }) => {
      calls.postComment.push({ issueNumber, body: commentBody });
    },
    closeNotPlanned: async ({ issueNumber }) => {
      calls.closeNotPlanned.push(issueNumber);
    },
  };
  return { calls, deps, getBody: () => currentBody };
}

test('parseArgs: positional dead + --by', () => {
  assert.deepEqual(parseArgs(['230', '--by', '399'], null), {
    deadIssue: 230,
    byIssue: 399,
    byProvided: true,
  });
});

test('parseArgs: dead falls back to active bind', () => {
  assert.deepEqual(parseArgs(['--by', '#399'], '#230'), {
    deadIssue: 230,
    byIssue: 399,
    byProvided: true,
  });
});

test('parseArgs: missing --by reported via byProvided', () => {
  const r = parseArgs(['230'], null);
  assert.equal(r.deadIssue, 230);
  assert.equal(r.byProvided, false);
});

test('happy path: stamps marker, moves done, comments both, closes not-planned', async () => {
  const { calls, deps, getBody } = makeDeps({ live: [399] });
  const result = await runSupersede({ deadIssue: 230, byIssue: 399, cfg: CFG, deps });

  assert.equal(result.status, 'superseded');
  assert.equal(result.ts, TS);
  // AC6 checked the superseder, not the dead story
  assert.deepEqual(calls.issueExists, [399]);
  // AC1/AC2 marker written to the dead story
  assert.deepEqual(parseSupersededBy(getBody()), { ref: '#399', ts: TS });
  assert.deepEqual(
    calls.mutateIssueBody.map((c) => c.issueNumber),
    [230]
  );
  // AC3 move-state ran on the dead story
  assert.deepEqual(calls.runMoveState, [230]);
  // AC4 + back-ref: comment on both
  assert.deepEqual(
    calls.postComment.map((c) => c.issueNumber),
    [230, 399]
  );
  // AC7 closed not-planned
  assert.deepEqual(calls.closeNotPlanned, [230]);
});

test('superseder-missing: refuses before any write', async () => {
  const { calls, deps } = makeDeps({ live: [] });
  const result = await runSupersede({ deadIssue: 230, byIssue: 399, cfg: CFG, deps });

  assert.equal(result.status, 'superseder-missing');
  assert.deepEqual(calls.mutateIssueBody, []);
  assert.deepEqual(calls.runMoveState, []);
  assert.deepEqual(calls.postComment, []);
  assert.deepEqual(calls.closeNotPlanned, []);
});

test('transition-failed: marker written, no comments/close on nonzero move exit', async () => {
  const { calls, deps } = makeDeps({ live: [399], moveCode: 5 });
  const result = await runSupersede({ deadIssue: 230, byIssue: 399, cfg: CFG, deps });

  assert.equal(result.status, 'transition-failed');
  assert.equal(result.exitCode, 5);
  assert.deepEqual(
    calls.mutateIssueBody.map((c) => c.issueNumber),
    [230]
  );
  assert.deepEqual(calls.runMoveState, [230]);
  assert.deepEqual(calls.postComment, []);
  assert.deepEqual(calls.closeNotPlanned, []);
});

test('self-supersede throws', async () => {
  const { deps } = makeDeps({ live: [230] });
  await assert.rejects(
    runSupersede({ deadIssue: 230, byIssue: 230, cfg: CFG, deps }),
    /cannot supersede itself/
  );
});

test('missing byIssue throws', async () => {
  const { deps } = makeDeps({ live: [] });
  await assert.rejects(
    runSupersede({ deadIssue: 230, byIssue: null, cfg: CFG, deps }),
    /--by <superseding#> is required/
  );
});

test('missing deadIssue throws', async () => {
  const { deps } = makeDeps({ live: [399] });
  await assert.rejects(
    runSupersede({ deadIssue: null, byIssue: 399, cfg: CFG, deps }),
    /no dead issue/
  );
});
