// @story #755
// #755 shape (a): the move-state host body is an exported `runMoveStateHost`
// that RETURNS a numeric exit code and never calls process.exit. Verbs call it
// in-process and read that code (the same number the old subprocess exit code
// gave them). This test pins the return-not-exit contract: importing the module
// must NOT run the host, and the two cheapest input-validation paths
// (missing-args usage, unknown state) must resolve a code rather than kill the
// process. Both paths run with TT_SKIP_NETWORK so no GraphQL is touched.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runMoveStateHost, SHELVE_BACKWARD_GUARD_CAPABILITY } from '../../../../gh/move-state.mjs';
import { isIssueLockHeld } from '../../../../task-tracker/issue-mutator-lock.mjs';

const BASE_ENV = { ...process.env, AITM_INTERNAL: '1', TT_SKIP_NETWORK: '1' };

test('runMoveStateHost is an importable function (module load has no host side effect)', () => {
  assert.equal(typeof runMoveStateHost, 'function');
});

test('runMoveStateHost returns 1 on an unknown state without exiting the process', async () => {
  const code = await runMoveStateHost({
    argv: [process.execPath, 'move-state.mjs', '999', 'bogus-state'],
    env: BASE_ENV,
    isTty: false,
  });
  assert.equal(code, 1);
});

test('runMoveStateHost returns 1 on missing args (usage) without exiting the process', async () => {
  const code = await runMoveStateHost({
    argv: [process.execPath, 'move-state.mjs'],
    env: BASE_ENV,
    isTty: false,
  });
  assert.equal(code, 1);
});

test('unauthenticated direct movement is refused before guard selection', async () => {
  const env = { ...BASE_ENV };
  delete env.AITM_INTERNAL;
  delete env.AITM_VERB_CONTEXT;
  let guardCalls = 0;

  const code = await runMoveStateHost({
    argv: [
      process.execPath,
      'move-state.mjs',
      '1335',
      'backlog',
      '--from',
      'ready-for-plan',
      '--demote',
    ],
    env,
    isTty: false,
    _observeGuardPhasePolicy: () => {
      guardCalls += 1;
    },
  });

  assert.equal(code, 3);
  assert.equal(guardCalls, 0);
});

test('the complete guard pipeline runs while the issue boundary lock is held', async () => {
  let lockHeldDuringGuard = false;
  const observed = new Error('guard observed');

  await assert.rejects(
    runMoveStateHost({
      argv: [process.execPath, 'move-state.mjs', '1335', 'refine', '--from', 'backlog'],
      env: BASE_ENV,
      isTty: false,
      _observeGuardPhasePolicy: () => {
        lockHeldDuringGuard = isIssueLockHeld(1335);
        throw observed;
      },
    }),
    (error) => error === observed
  );

  assert.equal(lockHeldDuringGuard, true);
});

test('host boundary authorizes Shelve guard selection only for the exact exported capability', async (t) => {
  const cases = [
    {
      name: 'environment-only Shelve context is unauthorized',
      capability: undefined,
      expected: { includeExitGuards: true, includeEntryGuards: true },
    },
    {
      name: 'a freshly forged Symbol is unauthorized',
      capability: Symbol('aitm.shelve-backward-guard'),
      expected: { includeExitGuards: true, includeEntryGuards: true },
    },
    {
      name: 'the exact exported capability is authorized',
      capability: SHELVE_BACKWARD_GUARD_CAPABILITY,
      expected: { includeExitGuards: false, includeEntryGuards: true },
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      let selectedPolicy = null;
      const observed = new Error('guard policy observed');
      await assert.rejects(
        runMoveStateHost({
          argv: [
            process.execPath,
            'move-state.mjs',
            '1335',
            'backlog',
            '--from',
            'ready-for-plan',
            '--demote',
            '--demote-reason',
            'refresh stale blockers',
          ],
          env: { ...BASE_ENV, AITM_VERB_CONTEXT: 'shelve' },
          isTty: false,
          shelveBackwardGuardCapability: scenario.capability,
          _observeGuardPhasePolicy: (policy) => {
            selectedPolicy = policy;
            throw observed;
          },
        }),
        (error) => error === observed
      );

      assert.equal(Object.isFrozen(selectedPolicy), true);
      assert.deepEqual(selectedPolicy, scenario.expected);
    });
  }
});
