// @story #882
//
// A move whose target IS the issue's current state is a SATISFIED NO-OP, not an
// illegal transition. Before #882, `validateTransition` recognized only the
// FORWARD/BACKWARD edge sets, so every self-loop refused with exit 5 and was
// compensated one state at a time in `classifyMoveStateBenign` (#385 done→done,
// #444 test→test). `review → review` was the third instance of that defect.
//
// These tests pin the generic rule so the enumeration cannot return.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stateIds, validateTransition } from '../../../lib/lifecycle-policy/index.mjs';
import { computeTransitionPlan } from '../../../lib/move-state/transition-plan.mjs';
import { classifyMoveStateBenign, isMoveStateNoop } from '../../../runtime.mjs';

test('every state self-transition is a legal no-op', () => {
  for (const s of stateIds()) {
    const v = validateTransition(s, s);
    assert.equal(v.ok, true, `${s} → ${s} must be legal`);
    assert.equal(v.noop, true, `${s} → ${s} must be flagged noop`);
    assert.equal(v.reason, undefined, `${s} → ${s} must carry no refusal reason`);
  }
});

test('review → review specifically is legal (the reported defect)', () => {
  assert.deepEqual(validateTransition('review', 'review'), { ok: true, noop: true });
});

test('a genuine illegal transition still refuses', () => {
  const v = validateTransition('refine', 'done');
  assert.equal(v.ok, false);
  assert.match(v.reason, /illegal transition: refine → done/);
});

test('a legal non-self transition is NOT flagged noop', () => {
  const v = validateTransition('test', 'review');
  assert.equal(v.ok, true);
  assert.equal(v.noop, undefined);
});

test('an unknown state still refuses even when from === to', () => {
  const v = validateTransition('groom', 'groom');
  assert.equal(v.ok, false);
  assert.match(v.reason, /unknown state: groom/);
});

test('computeTransitionPlan surfaces noop for a self-transition', () => {
  const plan = computeTransitionPlan({ fromState: 'review', toState: 'review' });
  assert.equal(plan.noop, true);
  assert.equal(plan.matrix.ok, true);
  assert.equal(plan.matrix.reason, null);
});

test('computeTransitionPlan reports noop:false for a real move', () => {
  const plan = computeTransitionPlan({ fromState: 'test', toState: 'review' });
  assert.equal(plan.noop, false);
});

test('computeTransitionPlan reports noop:false when the matrix gate is skipped', () => {
  // Unknown `from` (SKIP_NETWORK with no --from): nothing to compare against.
  assert.equal(computeTransitionPlan({ fromState: '', toState: 'review' }).noop, false);
  // supersede/force bypass the matrix entirely.
  assert.equal(
    computeTransitionPlan({ fromState: 'done', toState: 'done', flags: { force: true } }).noop,
    false
  );
});

test('classifyMoveStateBenign is de-enumerated — it matches ANY self-loop', () => {
  // The two historically hardcoded cases.
  for (const s of ['done', 'test']) {
    assert.equal(
      classifyMoveStateBenign({
        state: s,
        status: 5,
        stderr: `BLOCKED: illegal transition: ${s} → ${s}. Allowed: x.`,
      }),
      true
    );
  }
  // Every other state, including the one that was missing (#882) and the
  // multi-word slug, must classify the same way with no further patching.
  for (const s of ['review', 'develop', 'plan', 'refine', 'on-deck', 'backlog']) {
    assert.equal(
      classifyMoveStateBenign({
        state: s,
        status: 5,
        stderr: `BLOCKED: illegal transition: ${s} → ${s}. Allowed: x.`,
      }),
      true,
      `${s} self-loop must classify benign`
    );
  }
});

test('classifyMoveStateBenign still surfaces genuine refusals', () => {
  // Not a self-loop.
  assert.equal(
    classifyMoveStateBenign({
      state: 'done',
      status: 5,
      stderr: 'BLOCKED: illegal transition: refine → done. Allowed: develop.',
    }),
    false
  );
  // Self-loop text, but for a different target than the one requested.
  assert.equal(
    classifyMoveStateBenign({
      state: 'review',
      status: 5,
      stderr: 'BLOCKED: illegal transition: test → test. Allowed: x.',
    }),
    false
  );
  // A gate refusal, not a matrix refusal.
  assert.equal(
    classifyMoveStateBenign({ state: 'done', status: 1, stderr: 'BLOCKED: gate failed' }),
    false
  );
  // A spawn failure (non-numeric status).
  assert.equal(classifyMoveStateBenign({ state: 'done', status: null, stderr: 'ENOENT' }), false);
});

test('isMoveStateNoop matches only the host token', () => {
  assert.equal(isMoveStateNoop('↻ #882 is already in review — no state change\n'), false);
  assert.equal(
    isMoveStateNoop('↻ #882 is already in review — no state change\naitm-move-noop state=review\n'),
    true
  );
  assert.equal(isMoveStateNoop('✓ Issue #882 moved to: review\n'), false);
  assert.equal(isMoveStateNoop(''), false);
  assert.equal(isMoveStateNoop(undefined), false);
});
