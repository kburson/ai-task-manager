#!/usr/bin/env node
// @story #968
// `move-state.mjs`'s independent guard pipeline (`runGuardExecution` /
// `guard-execution.mjs`) must attribute the review→done close-attribution
// gate against `origin/trunk` — not the shared local `trunk` ref — when run
// inside a linked worktree, exactly like `verbs/close.mjs`'s #908 fix. This
// covers `buildCloseGatesDeps`, the extracted helper `runGuardExecution` now
// delegates to for that override.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { buildCloseGatesDeps } from '../../../../lib/move-state/guard-execution.mjs';

function makePexec({ worktree }) {
  return async (cmd, args) => {
    if (cmd === 'git' && args[0] === 'rev-parse' && args[1] === '--git-dir') {
      return {
        stdout: worktree ? '/repo/.git/worktrees/task-968\n' : '/repo/.git\n',
      };
    }
    throw new Error(`unexpected pexec call: ${cmd} ${args.join(' ')}`);
  };
}

test('buildCloseGatesDeps: move to done, linked worktree → resolveTrunkRef yields origin/trunk', async () => {
  const deps = await buildCloseGatesDeps({
    stateArg: 'done',
    pexec: makePexec({ worktree: true }),
    projectDir: '/repo',
  });
  assert.equal(typeof deps.closeGates.resolveTrunkRef, 'function');
  const ref = await deps.closeGates.resolveTrunkRef({ cfg: {} });
  assert.equal(ref, 'origin/trunk');
});

test('buildCloseGatesDeps: move to done, main worktree → resolveTrunkRef yields local trunk', async () => {
  const deps = await buildCloseGatesDeps({
    stateArg: 'done',
    pexec: makePexec({ worktree: false }),
    projectDir: '/repo',
  });
  const ref = await deps.closeGates.resolveTrunkRef({ cfg: {} });
  assert.equal(ref, 'trunk');
});

test('buildCloseGatesDeps: linked worktree, explicit cfg.trunkRef still wins', async () => {
  const deps = await buildCloseGatesDeps({
    stateArg: 'done',
    pexec: makePexec({ worktree: true }),
    projectDir: '/repo',
  });
  const ref = await deps.closeGates.resolveTrunkRef({ cfg: { trunkRef: 'origin/main' } });
  assert.equal(ref, 'origin/main');
});

test('buildCloseGatesDeps: move that is not → done → no override (undefined)', async () => {
  const deps = await buildCloseGatesDeps({
    stateArg: 'test',
    pexec: makePexec({ worktree: true }),
    projectDir: '/repo',
  });
  assert.equal(deps, undefined);
});

test('buildCloseGatesDeps: pexec failure (not a git repo) → treated as main worktree, does not throw', async () => {
  const deps = await buildCloseGatesDeps({
    stateArg: 'done',
    pexec: async () => {
      throw new Error('not a git repository');
    },
    projectDir: '/repo',
  });
  const ref = await deps.closeGates.resolveTrunkRef({ cfg: {} });
  assert.equal(ref, 'trunk');
});
