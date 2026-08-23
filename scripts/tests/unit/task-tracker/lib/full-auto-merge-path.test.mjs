#!/usr/bin/env node
// @story #908 (epic #912)
// vc:1 — retired command delivery fails closed; the authorized local lane remains.
//
// Provider delivery is orchestrated by `/task deliver`, never an argv plan.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { planFullAutoMerge } from '../../../../task-tracker/lib/full-auto-merge.mjs';

const ghAutoCfg = { fullAutoMerge: { mechanism: 'gh-auto-merge' } };

test('gh-auto-merge is retired for every legacy command-plan shape', () => {
  for (const input of [
    { prNumber: 907, cfg: ghAutoCfg },
    {
      prNumber: '#42',
      cfg: { fullAutoMerge: { mechanism: 'gh-auto-merge', mergeMethod: 'squash' } },
    },
    { cfg: ghAutoCfg },
  ]) {
    const plan = planFullAutoMerge(input);
    assert.equal(plan.ok, false);
    assert.match(plan.message, /full-auto-merge-retired-mechanism/);
    assert.match(plan.message, /provider-action/);
    assert.match(plan.message, /settings-guide\.md/);
    assert.equal(Object.hasOwn(plan, 'argv'), false);
  }
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

test('provider-action cannot be downgraded into a command plan', () => {
  const plan = planFullAutoMerge({
    prNumber: 907,
    cfg: { fullAutoMerge: { mechanism: 'provider-action', mergeMethod: 'squash' } },
  });
  assert.equal(plan.ok, false);
  assert.match(plan.message, /full-auto-merge-provider-action-required/);
  assert.match(plan.message, /task deliver/);
  assert.equal(Object.hasOwn(plan, 'argv'), false);
});
