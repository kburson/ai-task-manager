// @story #925
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TAIL_PROFILE_BACKGROUND_CONVERGENCE,
  TAIL_PROFILE_TASK_OWNER,
  resolveTailProfile,
  selectTailSteps,
} from '../../../../lib/move-state/tail-profiles.mjs';
import { moveState } from '../../../../lib/move-state/move-state-core.mjs';
import { DEFAULT_TAIL_STEPS } from '../../../../lib/move-state/post-commit-tail.mjs';
import { runMoveStateInProcess } from '../../../../runtime.mjs';
import { runMoveStateHost } from '../../../../../gh/move-state.mjs';

test('task-owner exposes issue, project, and session scopes', () => {
  assert.deepEqual(resolveTailProfile(TAIL_PROFILE_TASK_OWNER), {
    name: 'task-owner',
    scopes: ['issue', 'project', 'session'],
  });
});

test('background-convergence exposes only issue and project scopes', () => {
  assert.deepEqual(resolveTailProfile(TAIL_PROFILE_BACKGROUND_CONVERGENCE), {
    name: 'background-convergence',
    scopes: ['issue', 'project'],
  });
});

test('task-owner preserves the exact legacy tail', () => {
  assert.deepEqual(
    selectTailSteps(DEFAULT_TAIL_STEPS, 'task-owner').map((s) => s.name),
    [
      'dispatchOnEnterActions',
      'refreshKanbanStateCache',
      'emitFullAutoReviewAudit',
      'unparkDoneDependents',
      'emitOutOfBandAudit',
      'syncTrackerState',
      'syncEventFields',
      'endTaskTracking',
    ]
  );
});

test('background convergence excludes every session effect', () => {
  assert.deepEqual(
    selectTailSteps(DEFAULT_TAIL_STEPS, 'background-convergence').map((s) => s.name),
    [
      'dispatchOnEnterActions',
      'refreshKanbanStateCache',
      'emitFullAutoReviewAudit',
      'unparkDoneDependents',
      'emitOutOfBandAudit',
      'syncEventFields',
    ]
  );
});

test('task-owner is the default profile', () => {
  assert.equal(resolveTailProfile().name, 'task-owner');
  assert.equal(resolveTailProfile(undefined).name, 'task-owner');
  assert.deepEqual(
    selectTailSteps(DEFAULT_TAIL_STEPS).map((s) => s.name),
    DEFAULT_TAIL_STEPS.map((s) => s.name)
  );
});

test('every falsy profile except undefined fails closed', () => {
  for (const value of ['', null, false, 0, -0, 0n, Number.NaN]) {
    assert.throws(
      () => resolveTailProfile(value),
      /invalid move-tail profile|unknown move-tail profile/,
      `${String(value)} must not default to task-owner`
    );
  }
});

test('non-string profiles fail closed even when string coercion names a known profile', () => {
  for (const value of [['task-owner'], new String('task-owner')]) {
    assert.throws(() => resolveTailProfile(value), /invalid move-tail profile/);
  }
});

test('unknown profiles fail closed', () => {
  assert.throws(() => resolveTailProfile('typo'), /unknown move-tail profile/);
});

test('moveState refuses an unknown profile before any saga effect', async () => {
  const calls = [];
  await assert.rejects(
    moveState({
      tailProfile: 'typo',
      _runGuardExecution: async () => {
        calls.push('guard');
        return { exit: null };
      },
    }),
    /unknown move-tail profile/
  );
  assert.deepEqual(calls, []);
});

test('moveState refuses an unsupported review authority before any saga effect', async () => {
  const calls = [];
  await assert.rejects(
    moveState({
      reviewAuthority: 'untrusted',
      _runGuardExecution: async () => {
        calls.push('guard');
        return { exit: null };
      },
    }),
    /invalid reviewAuthority/
  );
  assert.deepEqual(calls, []);
});

test('runMoveStateHost refuses an unknown profile before argv policy', async () => {
  await assert.rejects(
    runMoveStateHost({
      argv: [process.execPath, 'move-state.mjs'],
      tailProfile: 'typo',
    }),
    /unknown move-tail profile/
  );
});

test('runMoveStateHost refuses an unsupported review authority before argv policy', async () => {
  await assert.rejects(
    runMoveStateHost({
      argv: [process.execPath, 'move-state.mjs'],
      reviewAuthority: 'untrusted',
    }),
    /invalid reviewAuthority/
  );
});

test('runMoveStateInProcess forwards typed profile and review authority without argv flags', async () => {
  let received;
  const reviewAuthority = 'gate-bypassed';
  const result = await runMoveStateInProcess(
    925,
    'done',
    {
      silent: true,
      tailProfile: 'background-convergence',
      reviewAuthority,
    },
    {
      host: async (options) => {
        received = options;
        return 0;
      },
    }
  );

  assert.equal(result.ok, true);
  assert.equal(received.tailProfile, 'background-convergence');
  assert.equal(received.reviewAuthority, reviewAuthority);
  assert.doesNotMatch(received.argv.join(' '), /tail-profile|review-authority/);
});

test('runMoveStateInProcess preserves task-owner and null authority defaults', async () => {
  let received;
  await runMoveStateInProcess(
    925,
    'done',
    { silent: true },
    {
      host: async (options) => {
        received = options;
        return 0;
      },
    }
  );
  assert.equal(received.tailProfile, 'task-owner');
  assert.equal(received.reviewAuthority, null);
});
