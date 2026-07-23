#!/usr/bin/env node
// @story #505
// #505 — `scripts/gh/move-state.mjs` gains a `--force` flag that relaxes the
// forward-progress gates for a *delivered operator override* (close --force's
// terminal board move), exactly as `--supersede` does for an *abandoned*
// story. Without it, a forced close from a non-`review` column closed the
// GitHub issue but the board move (`plan → done`) was refused by the one-step
// matrix, stranding the card.
//
// #559 relocated the flag logic out of the inline CLI body into two focused
// modules: argv parsing now lives in `lib/move-state/policy.mjs`
// (`parseMoveStateArgs`) and the matrix/guard bypass decision lives in
// `lib/move-state/transition-plan.mjs` (`computeTransitionPlan`). The #505
// invariant is unchanged — `--force` bypasses both the one-step matrix gate
// and the runGuards entry/exit pipeline — so these assert that behavior
// directly against its new homes rather than grepping the dismantled inline
// structure. The usage-string check still reads the host source (usage() text
// stayed in the CLI), plus a behavioral check on the matrix the flag bypasses.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTransition } from '../../../state-machine.mjs';
import { parseMoveStateArgs } from '../../../lib/move-state/policy.mjs';
import { computeTransitionPlan } from '../../../lib/move-state/transition-plan.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const SRC = readFileSync(path.resolve(__dirname, '../../../gh/move-state.mjs'), 'utf8');
const argv = (...rest) => ['node', 'move-state.mjs', ...rest];

test('the matrix the --force flag bypasses genuinely refuses plan → done', () => {
  // If this ever becomes a legal one-step move, the bypass would be moot and
  // the #505 reproduction would no longer hold.
  const v = validateTransition('plan', 'done');
  assert.equal(v.ok, false, 'plan → done must be illegal under the normal matrix');
});

test('--force is parsed as a flag', () => {
  const r = parseMoveStateArgs(argv('9', 'done', '--force'));
  assert.equal(r.error, null);
  assert.equal(r.forceFlag, true, 'the --force flag must set forceFlag');
  // Absent the flag it must default false (no accidental always-on bypass).
  assert.equal(parseMoveStateArgs(argv('9', 'done')).forceFlag, false);
});

test('--force bypasses the state-machine matrix gate', () => {
  const forced = computeTransitionPlan({
    fromState: 'plan',
    toState: 'done',
    flags: { force: true },
  });
  assert.equal(forced.bypass, true, '--force must mark the plan as a bypass');
  assert.equal(
    forced.matrix.applies,
    false,
    'the matrix gate must not apply under --force (so validateTransition is skipped)'
  );
  // Sanity: the same move WITHOUT --force is gated and rejected by the matrix.
  const gated = computeTransitionPlan({ fromState: 'plan', toState: 'done' });
  assert.equal(gated.matrix.applies, true);
  assert.equal(gated.matrix.ok, false);
});

test('--force bypasses the runGuards entry/exit pipeline', () => {
  const forced = computeTransitionPlan({
    fromState: 'plan',
    toState: 'done',
    flags: { force: true },
  });
  assert.equal(forced.runGuardPipeline, false, 'the guard pipeline must be skipped under --force');
  // Without the flag the pipeline runs.
  const gated = computeTransitionPlan({ fromState: 'plan', toState: 'done' });
  assert.equal(gated.runGuardPipeline, true);
});

test('--force is documented in usage and distinct from --supersede', () => {
  assert.ok(/\[--force\]/.test(SRC), 'usage must list --force');
  assert.ok(/operator override/.test(SRC), 'usage must describe --force as a delivered override');
});

console.log('move-state-force-flag.test.mjs — all assertions passed');
