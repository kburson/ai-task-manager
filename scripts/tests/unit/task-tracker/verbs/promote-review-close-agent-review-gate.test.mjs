// @story #998
//
// `promote`'s `review → close` delegation (`ALIAS_VERB.review === 'close'`)
// fired unconditionally, regardless of whether the prior Agent Review Gate
// run actually passed. Observed live on #996: a story sitting in `review`
// with an `aitm-review-failed` marker and a drifted trunk HEAD would have
// sailed straight past `close`'s human-approval gate the instant "Final
// Review Passed" happened to be ticked, shipping a known-failed, now-stale
// Agent Review with no re-verification of the moved trunk at all.
//
// `runPromote` must redirect to `/task review` instead of `/task close`
// whenever the Review state's own action (the Agent Review Gate) has not
// completed with a passing result — the same completeness signal
// `approve.mjs` already gates human sign-off on (`isAgentReviewComplete`).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runPromote } from '../../../../task-tracker/verbs/promote.mjs';
import { writeLastKnownState } from '../../../../task-tracker/gh-timing-comment.mjs';
import { stampReviewFailed } from '../../../../task-tracker/lib/agent-review/review-gate.mjs';
import '../../../../task-tracker/lib/state-bootstrap.mjs';

const cfg = { repo: 'owner/name' };

function baseDeps(overrides = {}) {
  return {
    projectDir: process.cwd(),
    assertBound: () => {},
    getLiveState: async () => 'review', // matches recorded → no drift
    runMoveState: async () => 0,
    postTimingRow: async () => {},
    mutateIssueBody: async ({ mutate }) => {
      mutate('');
      return { status: 'no-op' };
    },
    stampStartTime: async () => {},
    ...overrides,
  };
}

test('runPromote redirects to /task review, not /task close, when aitm-review-failed is present', async () => {
  const body = stampReviewFailed(writeLastKnownState('## Scope\n\nbody\n', 'review'), [
    'lint: 3 errors',
  ]);
  const spawned = [];
  const res = await runPromote({
    issueNumber: 996,
    cfg,
    deps: baseDeps({
      fetchIssueBody: async () => ({ body }),
      spawnVerb: async ({ verb }) => {
        spawned.push(verb);
        return 0;
      },
    }),
  });
  assert.deepEqual(spawned, ['review'], 'must spawn review, never close');
  assert.equal(res.status, 'redelegated-to-review');
  assert.equal(res.reason, 'review-failed');
  assert.equal(res.delegate, 'review');
  assert.match(res.message, /aitm-review-failed/);
  assert.match(res.message, /\/task review/);
});

test('runPromote redirects to /task review when no Agent Review evidence has ever been recorded', async () => {
  const body = writeLastKnownState('## Scope\n\nbody, never reviewed\n', 'review');
  const spawned = [];
  const res = await runPromote({
    issueNumber: 995,
    cfg,
    deps: baseDeps({
      fetchIssueBody: async () => ({ body }),
      spawnVerb: async ({ verb }) => {
        spawned.push(verb);
        return 0;
      },
    }),
  });
  assert.deepEqual(spawned, ['review']);
  assert.equal(res.status, 'redelegated-to-review');
  assert.equal(res.reason, 'not-run');
});

test('runPromote still delegates review → close when Agent Review genuinely passed (unchanged)', async () => {
  const passedBody = writeLastKnownState(
    '## Scope\n\nbody\n\n' +
      '- [x] Agent Review Passed <!-- aitm-verified ts="2026-07-26T00:00:00Z" gate="agent-review" result="pass" -->\n' +
      '- [ ] Final Review Passed\n',
    'review'
  );
  const spawned = [];
  // First call is the pre-move drift check (must match `recorded`); the
  // second is the post-alias "did the delegate actually reach target" check
  // (#710) — simulate close's delegate landing the board on `done`.
  let liveCalls = 0;
  const res = await runPromote({
    issueNumber: 994,
    cfg,
    deps: baseDeps({
      fetchIssueBody: async () => ({ body: passedBody }),
      spawnVerb: async ({ verb }) => {
        spawned.push(verb);
        return 0;
      },
      getLiveState: async () => (liveCalls++ === 0 ? 'review' : 'done'),
    }),
  });
  assert.deepEqual(spawned, ['close'], 'a genuinely-passed Agent Review keeps the close alias');
  assert.equal(res.status, 'promoted');
  assert.equal(res.from, 'review');
  assert.equal(res.to, 'done');
});
