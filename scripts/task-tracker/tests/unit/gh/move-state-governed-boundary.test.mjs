// @story #1049
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import test from 'node:test';

import {
  governedOperationForLifecycleVerb,
  runGovernedLifecycleMutation,
  runMoveStateHost,
  runOfflineLifecycleProbe,
} from '../../../../gh/move-state.mjs';
import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';

function boundaryFixture(overrides = {}) {
  const events = [];
  const effect = { reverify: async () => events.push('reverify') };
  const deps = {
    issue: '1049',
    verb: 'review',
    operation: 'review-mutation',
    projectDir: '/project',
    acquireLock: async (options, callback) => {
      events.push('lock');
      return options.authorize(callback);
    },
    withGovernedEffect: async (options, callback) => {
      events.push(`verify:${options.operation}`);
      if (options.heartbeat) events.push('heartbeat');
      return callback(effect);
    },
    runGuard: async () => {
      events.push('guard');
      return { exit: null };
    },
    runMutation: async () => {
      events.push('mutation');
      return 0;
    },
    ...overrides,
  };
  return { deps, events };
}

test('governed lifecycle reverifies after its guard immediately before mutation', async () => {
  const { deps, events } = boundaryFixture();
  assert.equal(await runGovernedLifecycleMutation(deps), 0);
  assert.deepEqual(events, [
    'lock',
    'verify:review-mutation',
    'heartbeat',
    'guard',
    'reverify',
    'mutation',
  ]);
});

test('stale authority invokes zero guard timing/status/body/spawn or mutation effects', async () => {
  const { deps, events } = boundaryFixture({
    withGovernedEffect: async () => {
      events.push('verify');
      const error = new Error('stale fence');
      error.code = 'fence-stale';
      throw error;
    },
  });
  await assert.rejects(
    () => runGovernedLifecycleMutation(deps),
    (error) => {
      return error.code === 'fence-stale';
    }
  );
  assert.deepEqual(events, ['lock', 'verify']);
});

test('already-held lifecycle lock still verifies before guard and mutation', async () => {
  const { deps, events } = boundaryFixture({ alreadyLocked: true });
  assert.equal(await runGovernedLifecycleMutation(deps), 0);
  assert.deepEqual(events, [
    'verify:review-mutation',
    'heartbeat',
    'guard',
    'reverify',
    'mutation',
  ]);
});

test('authority lost during a long lifecycle guard blocks the next mutation', async () => {
  const { deps, events } = boundaryFixture({
    runGuard: async () => {
      events.push('long-guard');
      return { exit: null };
    },
  });
  deps.withGovernedEffect = async (options, callback) => {
    events.push(`verify:${options.operation}`);
    events.push('heartbeat');
    return callback({
      reverify: async () => {
        events.push('reverify-stale');
        const error = new Error('fence lost during guard');
        error.code = 'fence-stale';
        throw error;
      },
    });
  };
  await assert.rejects(
    () => runGovernedLifecycleMutation(deps),
    (error) => error.code === 'fence-stale'
  );
  assert.deepEqual(events, [
    'lock',
    'verify:review-mutation',
    'heartbeat',
    'long-guard',
    'reverify-stale',
  ]);
});

test('guard refusal remains inside authority and invokes zero mutation effects', async () => {
  const { deps, events } = boundaryFixture({
    runGuard: async () => {
      events.push('guard-refusal');
      return { exit: 4 };
    },
  });
  assert.equal(await runGovernedLifecycleMutation(deps), 4);
  assert.deepEqual(events, ['lock', 'verify:review-mutation', 'heartbeat', 'guard-refusal']);
});

test('unsupported lifecycle callers fail closed instead of falling back to generic authority', () => {
  assert.throws(
    () => governedOperationForLifecycleVerb('unknown'),
    /unsupported governed lifecycle verb: unknown/
  );
});

test('offline lifecycle probe exercises only lock ownership and zero mutation collaborators', async () => {
  const events = [];
  const result = await runOfflineLifecycleProbe({
    issue: '1049',
    verb: 'promote',
    projectDir: '/project',
    acquireLock: async (options, callback) => {
      events.push(['lock', options.issue, options.verb, options.projDir]);
      return callback();
    },
  });
  assert.equal(result, 0);
  assert.deepEqual(events, [['lock', '1049', 'promote', '/project']]);
});

test('parent close cannot authorize a child cascade with the parent lease', async () => {
  const { deps, events } = boundaryFixture({
    issue: '1050',
    verb: 'close',
    operation: 'close',
    withGovernedEffect: async (options) => {
      events.push(`verify-child:${options.issueId}`);
      const error = new Error('requested issue does not match the persisted work lease');
      error.code = 'lease-not-held';
      throw error;
    },
  });
  await assert.rejects(
    () => runGovernedLifecycleMutation(deps),
    (error) => error.code === 'lease-not-held'
  );
  assert.deepEqual(events, ['lock', 'verify-child:1050']);
});

test('TTY-allowed host maps typed stale authority to governed exit 8 without a stack', async () => {
  const projectDir = mkdtempProjectIsolated('aitm-tty-governed-');
  const calls = [];
  const stderr = [];
  const originalWrite = process.stderr.write;
  const env = {
    ...process.env,
    AI_TASK_MANAGER_PROJECT_DIR: projectDir,
  };
  delete env.AITM_VERB_CONTEXT;
  delete env.AITM_INTERNAL;
  delete env.TT_SKIP_NETWORK;
  try {
    process.stderr.write = (chunk) => {
      stderr.push(String(chunk));
      return true;
    };
    const exit = await runMoveStateHost({
      argv: [process.execPath, 'move-state.mjs', '1049', 'on-deck', '--from', 'backlog'],
      env,
      isTty: true,
      withGovernedEffect: async (options) => {
        calls.push(options);
        const error = new Error('stale TTY fence');
        error.code = 'fence-stale';
        throw error;
      },
    });
    assert.equal(exit, 8);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].issueId, '1049');
    assert.equal(calls[0].operation, 'lifecycle-mutation');
    assert.match(stderr.join(''), /stale TTY fence/);
    assert.doesNotMatch(stderr.join(''), /\n\s+at\s/);
  } finally {
    process.stderr.write = originalWrite;
    rmSync(projectDir, { recursive: true, force: true });
  }
});
