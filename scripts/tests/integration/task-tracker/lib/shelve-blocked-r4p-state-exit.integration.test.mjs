// @story #1343
import assert from 'node:assert/strict';
import test from 'node:test';

import { blockedByGuard } from '../../../../task-tracker/lib/blocked-by-guard.mjs';
import { childCannotLeadEpicExitGuard } from '../../../../task-tracker/lib/child-cannot-lead-epic-exit-guard.mjs';
import * as guardExecution from '../../../../task-tracker/lib/move-state/guard-execution.mjs';
import * as shelveTransaction from '../../../../task-tracker/lib/shelve-transaction.mjs';
import * as moveStateHost from '../../../../gh/move-state.mjs';

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

test('Shelve backward guard policy requires the exact authenticated transition signals', async (t) => {
  const deriveGuardPhasePolicy = guardExecution.deriveGuardPhasePolicy;
  assert.equal(
    typeof deriveGuardPhasePolicy,
    'function',
    'guard execution must export the pure phase-policy helper'
  );

  const cases = [
    {
      name: 'exact Shelve R4P demotion to Backlog omits only source exit guards',
      input: {
        verbContext: 'shelve',
        shelveBackwardGuardAuthorized: true,
        demoteFlag: true,
        fromState: 'ready-for-plan',
        toState: 'backlog',
      },
      expected: { includeExitGuards: false, includeEntryGuards: true },
    },
    {
      name: 'caller-controlled Shelve context without in-process authority retains the full pipeline',
      input: {
        verbContext: 'shelve',
        demoteFlag: true,
        fromState: 'ready-for-plan',
        toState: 'backlog',
      },
      expected: { includeExitGuards: true, includeEntryGuards: true },
    },
    {
      name: 'missing Shelve context retains the full pipeline',
      input: {
        shelveBackwardGuardAuthorized: true,
        demoteFlag: true,
        fromState: 'ready-for-plan',
        toState: 'backlog',
      },
      expected: { includeExitGuards: true, includeEntryGuards: true },
    },
    {
      name: 'different verb context retains the full pipeline',
      input: {
        verbContext: 'demote',
        shelveBackwardGuardAuthorized: true,
        demoteFlag: true,
        fromState: 'ready-for-plan',
        toState: 'backlog',
      },
      expected: { includeExitGuards: true, includeEntryGuards: true },
    },
    {
      name: 'missing demote flag retains the full pipeline',
      input: {
        verbContext: 'shelve',
        shelveBackwardGuardAuthorized: true,
        demoteFlag: false,
        fromState: 'ready-for-plan',
        toState: 'backlog',
      },
      expected: { includeExitGuards: true, includeEntryGuards: true },
    },
    {
      name: 'different source retains the full pipeline',
      input: {
        verbContext: 'shelve',
        shelveBackwardGuardAuthorized: true,
        demoteFlag: true,
        fromState: 'refine',
        toState: 'backlog',
      },
      expected: { includeExitGuards: true, includeEntryGuards: true },
    },
    {
      name: 'different target retains the full pipeline',
      input: {
        verbContext: 'shelve',
        shelveBackwardGuardAuthorized: true,
        demoteFlag: true,
        fromState: 'ready-for-plan',
        toState: 'plan',
      },
      expected: { includeExitGuards: true, includeEntryGuards: true },
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      assert.deepEqual(deriveGuardPhasePolicy(scenario.input), scenario.expected);
    });
  }
});

test('normal forward R4P to Plan still refuses open blockers and parent sequencing', async () => {
  const deriveGuardPhasePolicy = guardExecution.deriveGuardPhasePolicy;
  assert.equal(typeof deriveGuardPhasePolicy, 'function');

  const { registerGuard, runGuards } = await freshRegistry();
  registerGuard('ready-for-plan', 'exit', blockedByGuard);
  registerGuard('ready-for-plan', 'exit', childCannotLeadEpicExitGuard);

  const result = await runGuards(
    'ready-for-plan',
    'plan',
    {
      ...openBlockerContext(),
      cfg: { repo: 'owner/repo', projectId: 'project-id' },
      fromState: 'ready-for-plan',
      toState: 'plan',
      deps: {
        fetchParentIssue: async () => 1263,
        readParentStatus: async () => 'ready-for-plan',
      },
    },
    deriveGuardPhasePolicy({
      verbContext: 'promote',
      shelveBackwardGuardAuthorized: false,
      demoteFlag: false,
      fromState: 'ready-for-plan',
      toState: 'plan',
    })
  );

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.refusals.map(({ id }) => id),
    ['blocked-by-not-done', 'child-cannot-lead-epic-exit']
  );
  assert.match(result.refusals[0].reason, /blockers are open: #1334/);
  assert.match(result.refusals[1].reason, /parent #1263 not admitted to plan/);
});

test('caller-controlled Shelve environment cannot omit R4P exits without in-process authority', async () => {
  const { registerGuard, runGuards } = await freshRegistry();
  registerGuard('ready-for-plan', 'exit', blockedByGuard);

  const result = await runGuards(
    'ready-for-plan',
    'backlog',
    openBlockerContext(),
    guardExecution.deriveGuardPhasePolicy({
      verbContext: 'shelve',
      demoteFlag: true,
      fromState: 'ready-for-plan',
      toState: 'backlog',
    })
  );

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.refusals.map(({ id }) => id),
    ['blocked-by-not-done']
  );
});

test('default Shelve mover supplies the opaque in-process guard authority', async () => {
  const capability = moveStateHost.SHELVE_BACKWARD_GUARD_CAPABILITY;
  assert.equal(typeof capability, 'symbol', 'move-state must expose an opaque capability token');

  let seen = null;
  const exit = await shelveTransaction.defaultRunMoveState(
    { issueNumber: 1335, reason: 'refresh stale blockers' },
    {
      host: async (options) => {
        seen = options;
        return 0;
      },
    }
  );

  assert.equal(exit, 0);
  assert.equal(seen.shelveBackwardGuardCapability, capability);
  assert.equal(seen.env.AITM_VERB_CONTEXT, 'shelve');
  assert.ok(seen.argv.includes('--demote'));
});
