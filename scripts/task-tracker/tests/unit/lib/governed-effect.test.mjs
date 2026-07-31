// @story #1049
import assert from 'node:assert/strict';
import test from 'node:test';

import { WorkLeaseError } from '@kburson/aitm-ledger';

import {
  GOVERNED_EFFECT_OPERATIONS,
  createGovernedEffectAdapter,
} from '../../../lib/work-lease/governed-effect.mjs';
import { createWorkLeaseHeartbeat, verifyGovernedEffect } from '../../../lib/work-lease/guard.mjs';

function authorityLease(overrides = {}) {
  return {
    projectId: 'project-1',
    leaseId: 'lease-1',
    fencingToken: '42',
    issueId: '1049',
    state: 'active',
    holder: {
      worktreeId: 'wt-1',
      sessionId: 'session-1',
      hostId: 'host-1',
    },
    ...overrides,
  };
}

function fixture(overrides = {}) {
  const calls = { store: 0, identity: 0, verify: [], heartbeat: [], stop: 0 };
  const store = { name: 'authority' };
  const withGovernedEffect = createGovernedEffectAdapter({
    projectDir: '/project',
    getStore: () => {
      calls.store += 1;
      return store;
    },
    getIdentity: () => {
      calls.identity += 1;
      return {
        principalKind: 'worker',
        provider: 'codex',
        agentRunId: 'run-1',
        sessionId: 'session-1',
        hostId: 'host-1',
        worktreeId: 'wt-1',
        pathHash: 'path-1',
        branch: 'feature/child/1049',
      };
    },
    verifyEffect: async (options) => {
      calls.verify.push(options);
      return { allowed: true, lease: authorityLease() };
    },
    createHeartbeat: (options) => {
      calls.heartbeat.push(options);
      return {
        stop() {
          calls.stop += 1;
        },
      };
    },
    ...overrides,
  });
  return { calls, store, withGovernedEffect };
}

test('governed-effect adapter accepts only the closed effect vocabulary before opening authority', async () => {
  const { calls, withGovernedEffect } = fixture();

  assert.deepEqual(GOVERNED_EFFECT_OPERATIONS, [
    'source-write',
    'issue-attributed-commit',
    'lifecycle-mutation',
    'issue-body-mutation',
    'evidence-mutation',
    'approval-mutation',
    'review-mutation',
    'close',
    'branch-worktree-orchestration',
  ]);
  await assert.rejects(
    () =>
      withGovernedEffect({ issueId: '1049', operation: 'approve' }, async () =>
        assert.fail('unknown operation reached callback')
      ),
    (error) =>
      error.code === 'invalid-request' && /unknown governed effect operation/.test(error.message)
  );
  assert.equal(calls.identity, 0);
  assert.equal(calls.store, 0);
  assert.equal(calls.verify.length, 0);
});

test('governed-effect adapter verifies the exact issue and operation before the callback', async () => {
  const { calls, store, withGovernedEffect } = fixture();
  const result = await withGovernedEffect(
    { issueId: '#1049', operation: 'review-mutation' },
    async (effect) => {
      assert.equal(calls.verify.length, 1, 'verification precedes the callback');
      assert.deepEqual(effect.leaseContext, {
        projectId: 'project-1',
        leaseId: 'lease-1',
        fencingToken: '42',
        worktreeId: 'wt-1',
      });
      assert.equal(typeof effect.reverify, 'function');
      return 'mutated';
    }
  );

  assert.equal(result, 'mutated');
  assert.equal(calls.store, 1);
  assert.equal(calls.verify[0].issueId, '#1049');
  assert.equal(calls.verify[0].operation, 'review-mutation');
  assert.equal(calls.verify[0].sessionId, 'session-1');
  assert.equal(calls.verify[0].hostId, 'host-1');
  assert.equal(calls.verify[0].projectDir, '/project');
  assert.equal(calls.verify[0].store, store);
  assert.deepEqual(calls.verify[0].holderIdentity, {
    principalKind: 'worker',
    provider: 'codex',
    agentRunId: 'run-1',
    sessionId: 'session-1',
    hostId: 'host-1',
    worktreeId: 'wt-1',
    pathHash: 'path-1',
    branch: 'feature/child/1049',
  });
});

test('missing, stale, and mismatched leases invoke zero callback effects', async () => {
  for (const code of ['lease-not-held', 'fence-stale', 'authority-unavailable']) {
    let callbacks = 0;
    const { withGovernedEffect } = fixture({
      verifyEffect: async () => {
        throw new WorkLeaseError(code, `refused: ${code}`);
      },
    });

    await assert.rejects(
      () =>
        withGovernedEffect({ issueId: '1049', operation: 'lifecycle-mutation' }, async () => {
          callbacks += 1;
        }),
      (error) => error.code === code
    );
    assert.equal(callbacks, 0, `${code} must not invoke the mutation`);
  }
});

test('verified effect reverifies freshly and stops one optional heartbeat in finally', async () => {
  const { calls, withGovernedEffect } = fixture();

  await assert.rejects(
    () =>
      withGovernedEffect(
        { issueId: '1049', operation: 'close', heartbeat: true },
        async (effect) => {
          assert.equal(calls.heartbeat.length, 1);
          await effect.reverify();
          assert.equal(calls.verify.length, 2);
          throw new Error('mutation failed');
        }
      ),
    /mutation failed/
  );

  assert.equal(calls.stop, 1);
  assert.equal(
    calls.heartbeat[0].ownerKey,
    'session-1:project-1:lease-1:42:wt-1',
    'heartbeat identity is the durable lease identity, not the command'
  );
  assert.equal(
    calls.verify[0].heartbeatOwnerKey,
    undefined,
    'initial verification resolves the authoritative lease before deriving its heartbeat key'
  );
  assert.equal(
    calls.verify[1].heartbeatOwnerKey,
    calls.heartbeat[0].ownerKey,
    'reverify observes remembered lease-heartbeat failure under the same key'
  );
  assert.equal(calls.heartbeat[0].operation, 'close');
});

test('short governed effects do not start a heartbeat unless the caller opts in', async () => {
  const { calls, withGovernedEffect } = fixture();
  await withGovernedEffect(
    { issueId: '1049', operation: 'issue-body-mutation' },
    async (effect) => {
      await effect.reverify();
    }
  );
  assert.equal(calls.verify.length, 2, 'reverify is one additional fresh authority call');
  assert.equal(calls.heartbeat.length, 0, 'reverify does not implicitly start a heartbeat');
  assert.equal(calls.stop, 0);
});

test('heartbeat failure is remembered by lease identity across operation names', async () => {
  const timers = new Map();
  const leaseOwner = 'session-1:project-1:lease-1:42:wt-1';
  let heartbeatFails = false;
  let operationBCallbacks = 0;
  const holder = {
    principalKind: 'worker',
    provider: 'codex',
    agentRunId: 'run-1',
    sessionId: 'session-1',
    hostId: 'host-1',
    pid: 123,
    worktreeId: 'wt-1',
    pathHash: 'ea0135bca5e3bd815f5b7b8f8c83d86f584697bc29e0cc3b30937153abef2844',
    branch: 'feature/child/1049',
  };
  const binding = {
    sessionId: 'session-1',
    issueId: '1049',
    worktreeId: 'wt-1',
    displayPath: '/project',
  };
  const persisted = {
    issue: '#1049',
    lease: {
      projectId: 'project-1',
      leaseId: 'lease-1',
      fencingToken: '42',
      worktreeId: 'wt-1',
    },
    holder,
    binding,
  };
  const rawVerify = (options) =>
    verifyGovernedEffect({
      ...options,
      loadSession: () => persisted,
      saveSession: async () => {},
      resolveWorktreeIdentity: async () => ({ worktreeId: 'wt-1' }),
      now: () => new Date('2026-07-30T12:00:00.000Z'),
    });
  const withGovernedEffect = createGovernedEffectAdapter({
    projectDir: '/project',
    getStore: () => ({
      verify: () => {
        if (heartbeatFails) {
          throw new WorkLeaseError('authority-unavailable', 'lease heartbeat lost authority');
        }
        return {
          allowed: true,
          lease: authorityLease({
            acquiredAt: '2026-07-30T11:00:00.000Z',
            heartbeatAt: '2026-07-30T12:00:00.000Z',
            expiresAt: '2026-07-30T12:15:00.000Z',
            holder,
          }),
        };
      },
    }),
    getIdentity: () => ({
      principalKind: 'worker',
      sessionId: 'session-1',
      hostId: 'host-1',
    }),
    verifyEffect: rawVerify,
    createHeartbeat: (options) =>
      createWorkLeaseHeartbeat({
        ...options,
        setInterval: (tick) => {
          const timer = { tick, unref() {} };
          timers.set(options.ownerKey, timer);
          return timer;
        },
        clearInterval: () => {},
      }),
  });

  await withGovernedEffect({ issueId: '1049', operation: 'close', heartbeat: true }, async () => {
    assert.ok(timers.has(leaseOwner));
    heartbeatFails = true;
    await timers.get(leaseOwner).tick();
    heartbeatFails = false;
  });

  await assert.rejects(
    () =>
      withGovernedEffect({ issueId: '1049', operation: 'review-mutation' }, async () => {
        operationBCallbacks += 1;
      }),
    (error) =>
      error instanceof WorkLeaseError &&
      error.code === 'authority-unavailable' &&
      /lease heartbeat lost authority/.test(error.message)
  );
  assert.equal(operationBCallbacks, 0, 'remembered failure fences the next operation callback');
});
