// @story #1343
import assert from 'node:assert/strict';
import test from 'node:test';

import { blockedByGuard } from '../../../../task-tracker/lib/blocked-by-guard.mjs';

async function freshRegistry() {
  return import(`../../../../task-tracker/lib/guard-registry.mjs?t=${Date.now()}-${Math.random()}`);
}

function openBlockerContext() {
  return {
    issueNumber: 1335,
    body: '<!-- aitm-blocked-by refs="#1334" -->',
    fetchBlockerState: async (issueNumber) => {
      assert.equal(issueNumber, 1334);
      return 'ready-for-plan';
    },
  };
}

test('normal R4P source exit guards refuse an open blocker', async () => {
  const { registerGuard, runGuards } = await freshRegistry();
  registerGuard('ready-for-plan', 'exit', blockedByGuard);

  const result = await runGuards('ready-for-plan', 'backlog', openBlockerContext());

  assert.equal(result.ok, false);
  assert.deepEqual(result.refusals, [
    {
      id: 'blocked-by-not-done',
      reason: 'cannot exit because blockers are open: #1334 (ready-for-plan)',
    },
  ]);
});

test('exit-disabled guard selection omits R4P exit guards but retains Backlog entry guards', async () => {
  const { registerGuard, runGuards } = await freshRegistry();
  const phases = [];
  registerGuard('ready-for-plan', 'exit', {
    ...blockedByGuard,
    run: async (ctx) => {
      phases.push('exit');
      return blockedByGuard.run(ctx);
    },
  });
  registerGuard('backlog', 'entry', {
    id: 'backlog-entry-spy',
    run: () => {
      phases.push('entry');
      return { ok: true };
    },
  });

  const result = await runGuards('ready-for-plan', 'backlog', openBlockerContext(), {
    includeExitGuards: false,
    includeEntryGuards: true,
  });

  assert.deepEqual(result, { ok: true, refusals: [] });
  assert.deepEqual(phases, ['entry']);
});

test('entry-disabled guard selection retains source exit guards but omits target entry guards', async () => {
  const { registerGuard, runGuards } = await freshRegistry();
  const phases = [];
  registerGuard('ready-for-plan', 'exit', {
    id: 'r4p-exit-spy',
    run: () => {
      phases.push('exit');
      return { ok: true };
    },
  });
  registerGuard('backlog', 'entry', {
    id: 'backlog-entry-spy',
    run: () => {
      phases.push('entry');
      return { ok: false, reason: 'entry refused' };
    },
  });

  const result = await runGuards(
    'ready-for-plan',
    'backlog',
    {},
    {
      includeExitGuards: true,
      includeEntryGuards: false,
    }
  );

  assert.deepEqual(result, { ok: true, refusals: [] });
  assert.deepEqual(phases, ['exit']);
});
