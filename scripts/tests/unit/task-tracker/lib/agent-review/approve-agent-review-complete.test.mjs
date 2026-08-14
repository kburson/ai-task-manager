// @story #881
//
// The human approval is the Review → Done EXIT condition. It is offered only
// once the Review state's ACTION — the Agent Review Gate — has completed with
// `result="pass"`. Before this, `approve` checked only that the board said
// `review`, so on #878 a human was asked to sign off on a story whose agent
// review had not run (and which the later gate run then rejected).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';

import { projectScratchDir } from '../../../../../task-tracker/lib/scratch-dir.mjs';

import {
  isAgentReviewComplete,
  agentReviewIncompleteReason,
  stampAgentReviewPassed,
  stampReviewFailed,
} from '../../../../../task-tracker/lib/agent-review/review-gate.mjs';
import { runApprove } from '../../../../../task-tracker/verbs/approve.mjs';

// `runApprove` takes the mutator lock, which mkdirs under projectDir — give it a
// real scratch dir rather than a path that cannot be created.
const PROJECT_DIR = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-approve-881-'));

const UNTICKED = ['## Definition of Done', '', '- [ ] Agent Review Passed', ''].join('\n');

const PASSED = stampAgentReviewPassed(UNTICKED, {
  ts: '2026-07-18T00:00:00.000Z',
  validators: ['body-sections', 'required-comments'],
});

// ── the predicate ───────────────────────────────────────────────────────────

test('a body with no agent-review evidence is incomplete', () => {
  assert.equal(isAgentReviewComplete(UNTICKED), false);
  assert.equal(agentReviewIncompleteReason(UNTICKED), 'not-run');
});

test('a passing gate stamp completes the state action', () => {
  assert.equal(isAgentReviewComplete(PASSED), true);
  assert.equal(agentReviewIncompleteReason(PASSED), null);
});

test('a hand-ticked box with no run evidence is NOT complete', () => {
  const handTicked = UNTICKED.replace('- [ ] Agent Review Passed', '- [x] Agent Review Passed');
  assert.equal(isAgentReviewComplete(handTicked), false);
  assert.equal(agentReviewIncompleteReason(handTicked), 'not-run');
});

test('the evidence marker completes the action whether or not the box is ticked', () => {
  // `stampAgentReviewPassed` writes the marker and leaves the tick to the derived
  // ticking pass, so completeness must not depend on the checkbox state.
  assert.match(PASSED, /- \[ \] Agent Review Passed <!-- aitm-verified/);
  assert.equal(isAgentReviewComplete(PASSED.replace('- [ ]', '- [x]')), true);
});

test('an aitm-review-failed marker makes the action incomplete even alongside a pass stamp', () => {
  // The gate passed on an earlier run, then a later run objected. The objection
  // is the live state of the action.
  const failed = stampReviewFailed(PASSED, ['body-sections: Scope missing'], {
    ts: '2026-07-18T01:00:00.000Z',
  });
  assert.equal(isAgentReviewComplete(failed), false);
  assert.equal(agentReviewIncompleteReason(failed), 'review-failed');
});

test('clearing the failure marker restores completeness', async () => {
  const { clearReviewFailed } =
    await import('../../../../../task-tracker/lib/agent-review/review-gate.mjs');
  const failed = stampReviewFailed(PASSED, ['x'], { ts: '2026-07-18T01:00:00.000Z' });
  assert.equal(isAgentReviewComplete(clearReviewFailed(failed)), true);
});

test('empty and non-string bodies are incomplete, not crashes', () => {
  for (const b of ['', null, undefined, 42]) {
    assert.equal(isAgentReviewComplete(b), false);
    assert.equal(agentReviewIncompleteReason(b), 'not-run');
  }
});

// ── the verb ────────────────────────────────────────────────────────────────

function approveWith(body, extra = {}) {
  const calls = { mutated: 0, commented: 0 };
  let current = body;
  return {
    calls,
    run: () =>
      runApprove({
        issueNumber: 881,
        cfg: { repo: 'o/r' },
        projectDir: PROJECT_DIR,
        deps: {
          assertBound: () => {},
          getBoardState: async () => 'review',
          fetchIssueBody: async () => current,
          // Apply the caller's mutate for real: approve verifies its own stamp
          // persisted, so a constant echo fails the post-write check.
          mutateIssueBody: async ({ mutate } = {}) => {
            calls.mutated += 1;
            current = typeof mutate === 'function' ? await mutate(current) : current;
            return { body: current };
          },
          postComment: async () => {
            calls.commented += 1;
          },
          fetchComments: async () => [],
          fetchProjectValues: async () => ({}),
          promptDrivers: async () => [],
          deriveDrivers: () => [],
          detectFullAuto: () => ({ fired: true, signals: 'test' }),
          nowIso: () => '2026-07-18T02:00:00Z',
          reconcileReviewApprovedTiming: async () => ({
            status: 'posted',
            ts: '2026-07-18T02:00:00Z',
          }),
          ...extra,
        },
      }),
  };
}

test('approve refuses when the gate has not run, and writes nothing', async () => {
  const { calls, run } = approveWith(UNTICKED);
  const res = await run();
  assert.equal(res.status, 'agent-review-incomplete');
  assert.equal(res.reason, 'not-run');
  assert.match(res.message, /Run `\/task review #881` first/);
  assert.equal(calls.mutated, 0, 'no approval marker may be stamped');
  assert.equal(calls.commented, 0, 'no Review Notes may be posted');
});

test('approve refuses while an objection is unresolved', async () => {
  const failed = stampReviewFailed(PASSED, ['body-sections: Scope missing'], {
    ts: '2026-07-18T01:00:00.000Z',
  });
  const { calls, run } = approveWith(failed);
  const res = await run();
  assert.equal(res.status, 'agent-review-incomplete');
  assert.equal(res.reason, 'review-failed');
  assert.match(res.message, /aitm-review-failed/);
  assert.equal(calls.mutated, 0);
});

test('approve proceeds once the state action has passed', async () => {
  const { run } = approveWith(PASSED);
  const res = await run();
  assert.notEqual(
    res.status,
    'agent-review-incomplete',
    'a passing gate must not be blocked by this check'
  );
});

test('the wrong-state check still precedes the completeness check', async () => {
  const res = await runApprove({
    issueNumber: 881,
    cfg: { repo: 'o/r' },
    projectDir: PROJECT_DIR,
    deps: {
      assertBound: () => {},
      getBoardState: async () => 'develop',
      fetchIssueBody: async () => UNTICKED,
    },
  });
  assert.equal(res.status, 'wrong-state');
});
