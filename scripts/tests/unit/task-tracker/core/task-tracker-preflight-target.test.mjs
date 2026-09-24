#!/usr/bin/env node
// @story #845
// Unit: `resolvePreflightTarget` from task-tracker.mjs.
//
// #845: `active-only` mode (start/resume/pause/stop/update) discarded the
// CLI `<N>` argument unconditionally, so a cold `start <N>` bind never
// threaded a target into `runPreflight`, which then early-returned before
// the assignee gate ran. Target must thread on a COLD bind (no active task)
// but stay undefined on a WARM bind so switch-style rebind is preserved.

import { strict as assert } from 'node:assert';
import { resolvePreflightTarget } from '../../../../task-tracker/task-tracker.mjs';

// 1. Cold active-only bind — target threads through.
{
  const target = resolvePreflightTarget({
    mode: 'active-only',
    rest: ['845'],
    stateBefore: { active: null },
  });
  assert.equal(target, '#845');
}

// 2. Warm active-only bind (switch rebind) — target stays undefined.
{
  const target = resolvePreflightTarget({
    mode: 'active-only',
    rest: ['845'],
    stateBefore: { active: '#100' },
  });
  assert.equal(target, undefined);
}

// 3. target-required mode — always threads target regardless of state.
{
  const target = resolvePreflightTarget({
    mode: 'target-required',
    rest: ['845'],
    stateBefore: { active: null },
  });
  assert.equal(target, '#845');
}

// 4. Cold active-only bind with no rest args — no target to thread.
{
  const target = resolvePreflightTarget({
    mode: 'active-only',
    rest: [],
    stateBefore: { active: null },
  });
  assert.equal(target, null);
}

// 5. stateBefore itself null/undefined (defensive) — treated as cold.
{
  const target = resolvePreflightTarget({
    mode: 'active-only',
    rest: ['845'],
    stateBefore: undefined,
  });
  assert.equal(target, '#845');
}

console.log('task-tracker-preflight-target.test.mjs: ok');

// @story #1750 — the same dispatcher selection must be available to the
// read-only session adapter without inventing a second bind/resume route.
const { resolveSessionActionInvocation } =
  await import('../../../../task-tracker/task-tracker.mjs');
assert.deepEqual(
  resolveSessionActionInvocation({
    verb: 'resume',
    mode: 'switch-target',
    rest: [],
    stateBefore: { active: null, lastActive: '#1750', paused: true },
  }),
  {
    actionId: 'resume',
    issue: 1750,
    explicitTarget: false,
    target: '#1750',
    stateBefore: { active: '#1750', lastActive: '#1750', paused: true },
  }
);
assert.deepEqual(
  resolveSessionActionInvocation({
    verb: '#1750',
    mode: 'switch-target',
    rest: [],
    stateBefore: { active: '#1665' },
  }),
  {
    actionId: 'bind',
    issue: 1750,
    explicitTarget: true,
    target: '#1750',
    stateBefore: { active: '#1750' },
  }
);
