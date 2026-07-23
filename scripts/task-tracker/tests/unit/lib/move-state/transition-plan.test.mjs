#!/usr/bin/env node
// @story #559
// Unit tests for the focused modules extracted from scripts/gh/move-state.mjs:
//   1. lib/move-state/policy.mjs        — input/policy (argv, gate, hints, map)
//   2. lib/move-state/transition-plan.mjs — the pure (from,to,flags) → plan
//
// These cover the policy + transition-plan modules that were previously only
// reachable through the move-state monolith. They assert the pure decision
// surface directly; the move-state characterization harness (#558) separately
// proves the host's observable behavior is unchanged.

import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  STATE_TO_CONFIG_KEY,
  refusalVerbHint,
  parseMoveStateArgs,
  decideVerbGate,
} from '../../../../lib/move-state/policy.mjs';
import { computeTransitionPlan } from '../../../../lib/move-state/transition-plan.mjs';

// argv helper: simulate `node move-state.mjs <...args>`.
const argv = (...rest) => ['node', 'move-state.mjs', ...rest];

// ===========================================================================
// policy.mjs — STATE_TO_CONFIG_KEY + refusalVerbHint
// ===========================================================================

test('STATE_TO_CONFIG_KEY maps every canonical state to a kanban option key', () => {
  for (const s of ['backlog', 'on-deck', 'refine', 'plan', 'develop', 'test', 'review', 'done']) {
    assert.match(STATE_TO_CONFIG_KEY[s], /^kanbanOption/);
  }
  // Unknown states are absent (host treats absence as the unknown-state exit).
  assert.equal(STATE_TO_CONFIG_KEY.bogus, undefined);
});

test('refusalVerbHint: forward → promote, backlog → demote, else reconcile', () => {
  assert.equal(refusalVerbHint('develop'), '/task promote');
  assert.equal(refusalVerbHint('done'), '/task promote');
  assert.equal(refusalVerbHint('backlog'), '/task demote');
  // A state with no forward/backward classification falls to reconcile.
  assert.equal(refusalVerbHint('mystery'), '/task reconcile');
});

// ===========================================================================
// policy.mjs — parseMoveStateArgs
// ===========================================================================

test('parseMoveStateArgs: happy path collects issue, state, and flags', () => {
  const r = parseMoveStateArgs(
    argv('123', 'plan', '--from', 'refine', '--item-id', 'IID', '--demote')
  );
  assert.equal(r.error, null);
  assert.equal(r.issueArg, '123');
  assert.equal(r.stateArg, 'plan');
  assert.equal(r.fromOverride, 'refine');
  assert.equal(r.itemIdOverride, 'IID');
  assert.equal(r.demoteFlag, true);
  assert.equal(r.supersedeFlag, false);
  assert.equal(r.forceFlag, false);
});

test('parseMoveStateArgs: --supersede and --force flags are recognized', () => {
  const r = parseMoveStateArgs(argv('9', 'done', '--supersede', '--force'));
  assert.equal(r.supersedeFlag, true);
  assert.equal(r.forceFlag, true);
});

test('parseMoveStateArgs: missing args → usage error', () => {
  assert.equal(parseMoveStateArgs(argv()).error, 'usage');
  assert.equal(parseMoveStateArgs(argv('123')).error, 'usage');
});

test('parseMoveStateArgs: non-numeric issue → usage error', () => {
  assert.equal(parseMoveStateArgs(argv('abc', 'plan')).error, 'usage');
});

test('parseMoveStateArgs: unknown state → unknown-state error', () => {
  const r = parseMoveStateArgs(argv('123', 'banana'));
  assert.equal(r.error, 'unknown-state');
  assert.equal(r.stateArg, 'banana');
});

test('parseMoveStateArgs: --out-of-band requires a non-empty reason', () => {
  assert.equal(parseMoveStateArgs(argv('123', 'plan', '--out-of-band')).error, 'out-of-band');
  const ok = parseMoveStateArgs(argv('123', 'plan', '--out-of-band', 'disk full'));
  assert.equal(ok.error, null);
  assert.equal(ok.outOfBandReason, 'disk full');
});

// ===========================================================================
// policy.mjs — decideVerbGate (precedence: env → oob → cfg → tty → refuse)
// ===========================================================================

test('decideVerbGate: verb env or out-of-band reason → allow', () => {
  assert.equal(
    decideVerbGate({ hasVerbEnv: true, outOfBandReason: '', directAllowed: false, isTty: false })
      .decision,
    'allow'
  );
  assert.equal(
    decideVerbGate({ hasVerbEnv: false, outOfBandReason: 'x', directAllowed: false, isTty: false })
      .decision,
    'allow'
  );
});

test('decideVerbGate: TTY allows even without verb env', () => {
  assert.equal(
    decideVerbGate({ hasVerbEnv: false, outOfBandReason: '', directAllowed: false, isTty: true })
      .decision,
    'allow'
  );
});

test('decideVerbGate: directAllowed non-TTY → allow-with-warning', () => {
  assert.equal(
    decideVerbGate({ hasVerbEnv: false, outOfBandReason: '', directAllowed: true, isTty: false })
      .decision,
    'allow-with-warning'
  );
});

test('decideVerbGate: agent context with no escape hatch → refuse', () => {
  assert.equal(
    decideVerbGate({ hasVerbEnv: false, outOfBandReason: '', directAllowed: false, isTty: false })
      .decision,
    'refuse'
  );
});

// ===========================================================================
// transition-plan.mjs — computeTransitionPlan
// ===========================================================================

test('computeTransitionPlan: legal forward move passes the matrix gate', () => {
  const p = computeTransitionPlan({ fromState: 'refine', toState: 'plan' });
  assert.equal(p.matrix.applies, true);
  assert.equal(p.matrix.ok, true);
  assert.equal(p.matrix.reason, null);
  assert.equal(p.runGuardPipeline, true);
  assert.equal(p.bypass, false);
});

test('computeTransitionPlan: illegal skip is flagged with a reason', () => {
  const p = computeTransitionPlan({ fromState: 'backlog', toState: 'develop' });
  assert.equal(p.matrix.applies, true);
  assert.equal(p.matrix.ok, false);
  assert.match(p.matrix.reason, /illegal transition: backlog → develop/);
});

test('computeTransitionPlan: unknown fromState skips the matrix gate', () => {
  const p = computeTransitionPlan({ fromState: '', toState: 'plan' });
  assert.equal(p.matrix.applies, false);
  assert.equal(p.matrix.ok, true);
  assert.equal(p.matrix.reason, null);
});

test('computeTransitionPlan: supersede/force bypass matrix + guard pipeline', () => {
  const sup = computeTransitionPlan({
    fromState: 'plan',
    toState: 'done',
    flags: { supersede: true },
  });
  assert.equal(sup.bypass, true);
  assert.equal(sup.matrix.applies, false);
  assert.equal(sup.runGuardPipeline, false);

  const force = computeTransitionPlan({
    fromState: 'plan',
    toState: 'done',
    flags: { force: true },
  });
  assert.equal(force.bypass, true);
  assert.equal(force.runGuardPipeline, false);
});

test('computeTransitionPlan: done move surfaces terminal side-effect flags', () => {
  const p = computeTransitionPlan({ fromState: 'review', toState: 'done' });
  assert.equal(p.isDoneMove, true);
  assert.deepEqual(p.doneSideEffects, {
    fullAutoAudit: true,
    unparkDependents: true,
    endTaskTracking: true,
  });
});

test('computeTransitionPlan: demote suppresses full-auto audit + end-tracking', () => {
  const p = computeTransitionPlan({
    fromState: 'review',
    toState: 'done',
    flags: { demote: true },
  });
  assert.equal(p.demote, true);
  assert.equal(p.doneSideEffects.fullAutoAudit, false);
  assert.equal(p.doneSideEffects.endTaskTracking, false);
  assert.equal(p.doneSideEffects.unparkDependents, true);
});

test('computeTransitionPlan: non-done move has null doneSideEffects + state warns', () => {
  const review = computeTransitionPlan({ fromState: 'test', toState: 'review' });
  assert.equal(review.isDoneMove, false);
  assert.equal(review.doneSideEffects, null);
  assert.equal(review.dirtyCheckOnReview, true);
  assert.equal(review.backlogWarn, false);

  const backlog = computeTransitionPlan({ fromState: 'on-deck', toState: 'backlog' });
  assert.equal(backlog.backlogWarn, true);
  assert.equal(backlog.dirtyCheckOnReview, false);
});
