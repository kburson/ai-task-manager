#!/usr/bin/env node
// @story #908 (epic #912)
// vc:1 — the Full-Auto merge path yields a command the classifier permits.
//
// planFullAutoMerge must produce a `pr merge <N> --auto --<method>` argv (which
// only ENABLES GitHub auto-merge, not the blocked local merge) for a reviewed PR,
// and a no-PR sentinel for the operator-authorized local lane.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { planFullAutoMerge } from '../../../../task-tracker/lib/full-auto-merge.mjs';

const ghAutoCfg = { fullAutoMerge: { mechanism: 'gh-auto-merge' } };

test('gh-auto-merge: enables auto-merge, never a bare local merge', () => {
  const plan = planFullAutoMerge({ prNumber: 907, cfg: ghAutoCfg });
  assert.equal(plan.ok, true);
  assert.equal(plan.mechanism, 'gh-auto-merge');
  assert.deepEqual(plan.argv, ['pr', 'merge', '907', '--auto', '--merge']);
  // The classifier-blocked shape is `pr merge <N> --merge` with NO --auto.
  assert.ok(plan.argv.includes('--auto'), 'must enable auto-merge, not merge now');
  assert.equal(plan.requiresPr, true);
});

test('gh-auto-merge: honors mergeMethod (squash)', () => {
  const plan = planFullAutoMerge({
    prNumber: '#42',
    cfg: { fullAutoMerge: { mechanism: 'gh-auto-merge', mergeMethod: 'squash' } },
  });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.argv, ['pr', 'merge', '42', '--auto', '--squash']);
});

test('gh-auto-merge: missing PR number → actionable refusal', () => {
  const plan = planFullAutoMerge({ cfg: ghAutoCfg });
  assert.equal(plan.ok, false);
  assert.match(plan.message, /full-auto-merge-missing-pr/);
});

test('local-trunk-lane: authorized → no-PR sentinel (no gh command)', () => {
  const plan = planFullAutoMerge({
    cfg: { fullAutoMerge: { mechanism: 'local-trunk-lane', operatorAuthorized: true } },
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.mechanism, 'local-trunk-lane');
  assert.equal(plan.argv, null);
  assert.equal(plan.requiresPr, false);
  assert.equal(plan.localLane, true);
});

test('end-to-end path: a reviewed PR is drivable to merge with a permitted command', () => {
  // Simulate the close verb: resolve → plan → (would exec argv via gh).
  const plan = planFullAutoMerge({ prNumber: 907, cfg: ghAutoCfg });
  assert.equal(plan.ok, true);
  // The argv is executable by the agent (no classifier-blocked local merge),
  // so the drive does not stall at the merge step.
  assert.equal(plan.argv[0], 'pr');
  assert.equal(plan.argv[1], 'merge');
  assert.ok(!(plan.argv.includes('--merge') && !plan.argv.includes('--auto')));
});
