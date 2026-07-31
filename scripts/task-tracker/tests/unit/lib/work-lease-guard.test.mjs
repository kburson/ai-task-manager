// @story #1049
import assert from 'node:assert/strict';
import test from 'node:test';

import { WorkLeaseError } from '@kburson/aitm-ledger';

import { createWorkLeaseHeartbeat, verifyGovernedEffect } from '../../../lib/work-lease/guard.mjs';

const NOW = '2026-07-30T12:00:00.000Z';
const FIVE_MINUTES = 5 * 60 * 1000;

function lease(overrides = {}) {
  return {
    projectId: 'project-1',
    leaseId: 'lease-1',
    fencingToken: '42',
    issueId: '1049',
    state: 'active',
    acquiredAt: '2026-07-30T11:00:00.000Z',
    heartbeatAt: '2026-07-30T11:56:00.000Z',
    expiresAt: '2026-07-30T13:00:00.000Z',
    holder: { worktreeId: 'wt-1', sessionId: 'session-1', hostId: 'host-1' },
    ...overrides,
  };
}

function session(overrides = {}) {
  return {
    issue: '#1049',
    lease: {
      projectId: 'project-1',
      leaseId: 'lease-1',
      fencingToken: '42',
      worktreeId: 'wt-1',
    },
    ...overrides,
  };
}

function baseOptions(overrides = {}) {
  const persisted = session();
  const calls = { verify: [], renew: [], saved: [] };
  const store = {
    verify(request) {
      calls.verify.push(request);
      return { allowed: true, lease: lease({ heartbeatAt: NOW }) };
    },
    renew(request) {
      calls.renew.push(request);
      return lease({ heartbeatAt: request.requestedAt });
    },
  };
  return {
    issueId: '1049',
    sessionId: 'session-1',
    projectDir: '/project',
    hostId: 'host-1',
    operation: 'source-write',
    store,
    loadSession: () => persisted,
    saveSession: (_sessionId, next) => calls.saved.push(next),
    resolveWorktreeIdentity: () => ({ worktreeId: 'wt-1' }),
    now: () => new Date(NOW),
    calls,
    ...overrides,
  };
}

test('verifyGovernedEffect awaits sync or async authority verification and persists only lease identity', async () => {
  const options = baseOptions();
  options.store.verify = async (request) => {
    options.calls.verify.push(request);
    return { allowed: true, lease: lease({ heartbeatAt: NOW }) };
  };

  const result = await verifyGovernedEffect(options);

  assert.equal(result.lease.leaseId, 'lease-1');
  assert.deepEqual(options.calls.verify, [
    {
      projectId: 'project-1',
      leaseId: 'lease-1',
      fencingToken: '42',
      operation: 'source-write',
      verifiedAt: NOW,
    },
  ]);
  assert.deepEqual(options.calls.saved, [
    {
      ...session(),
      lease: {
        projectId: 'project-1',
        leaseId: 'lease-1',
        fencingToken: '42',
        worktreeId: 'wt-1',
      },
    },
  ]);
});

test('verifyGovernedEffect rejects missing or mismatched persisted authority before an effect', async () => {
  for (const [name, overrides, code] of [
    ['missing lease', { loadSession: () => ({ issue: '#1049' }) }, 'lease-not-held'],
    ['wrong issue', { loadSession: () => session({ issue: '#1050' }) }, 'lease-not-held'],
    [
      'wrong canonical worktree',
      { resolveWorktreeIdentity: () => ({ worktreeId: 'wt-other' }) },
      'lease-not-held',
    ],
  ]) {
    const options = baseOptions(overrides);
    await assert.rejects(
      () => verifyGovernedEffect(options),
      (error) => error instanceof WorkLeaseError && error.code === code,
      name
    );
    assert.equal(options.calls.verify.length, 0, `${name} must not call authority`);
  }
});

test('verifyGovernedEffect requires the authority holder session, host, and supplied trusted identity', async () => {
  for (const [name, holder, holderIdentity] of [
    ['wrong session', { worktreeId: 'wt-1', sessionId: 'session-2', hostId: 'host-1' }, undefined],
    ['wrong host', { worktreeId: 'wt-1', sessionId: 'session-1', hostId: 'host-2' }, undefined],
    [
      'wrong trusted provider',
      {
        worktreeId: 'wt-1',
        sessionId: 'session-1',
        hostId: 'host-1',
        provider: 'claude',
        agentRunId: 'run-1',
      },
      { provider: 'codex', agentRunId: 'run-1' },
    ],
  ]) {
    const options = baseOptions({
      ...(holderIdentity === undefined ? {} : { holderIdentity }),
      store: {
        verify: () => ({ allowed: true, lease: lease({ holder }) }),
        renew: () => lease(),
      },
    });
    await assert.rejects(
      () => verifyGovernedEffect(options),
      (error) => error instanceof WorkLeaseError && error.code === 'lease-not-held',
      name
    );
  }
});

test('verifyGovernedEffect compares every supplied stable trusted holder field', async () => {
  const trusted = {
    principalKind: 'worker',
    provider: 'codex',
    agentRunId: 'run-1',
    sessionId: 'session-1',
    hostId: 'host-1',
    worktreeId: 'wt-1',
    pathHash: 'path-hash-1',
    branch: 'feature/child/1049',
  };
  for (const [field, value] of [
    ['principalKind', 'integration'],
    ['pathHash', 'path-hash-other'],
    ['branch', 'feature/other'],
  ]) {
    const options = baseOptions({
      holderIdentity: trusted,
      store: {
        verify: () => ({
          allowed: true,
          lease: lease({ holder: { ...trusted, [field]: value } }),
        }),
        renew: () => lease(),
      },
    });
    await assert.rejects(
      () => verifyGovernedEffect(options),
      (error) => error instanceof WorkLeaseError && error.code === 'lease-not-held',
      field
    );
  }
});

test('verifyGovernedEffect fails closed for stale, unavailable, malformed, or disallowed authority replies', async () => {
  const cases = [
    ['stale', () => Promise.reject(new WorkLeaseError('fence-stale', 'stale')), 'fence-stale'],
    [
      'missing credential',
      () => Promise.reject(new WorkLeaseError('authority-unauthenticated', 'credential missing')),
      'authority-unauthenticated',
    ],
    ['unavailable', () => Promise.reject(new Error('network down')), 'authority-unavailable'],
    ['malformed', () => Promise.resolve(null), 'invalid-request'],
    ['malformed envelope', () => Promise.resolve({ lease: lease() }), 'invalid-request'],
    ['disallowed', () => Promise.resolve({ allowed: false, lease: lease() }), 'lease-not-held'],
  ];
  for (const [name, verify, code] of cases) {
    const options = baseOptions({ store: { verify, renew: () => lease() } });
    await assert.rejects(
      () => verifyGovernedEffect(options),
      (error) => error instanceof WorkLeaseError && error.code === code,
      name
    );
  }

  const unknownOperation = baseOptions({ operation: 'lease-heartbeat' });
  await assert.rejects(
    () => verifyGovernedEffect(unknownOperation),
    (error) => error instanceof WorkLeaseError && error.code === 'invalid-request'
  );
  assert.equal(
    unknownOperation.calls.verify.length,
    0,
    'unknown operations must not reach authority'
  );

  const originalSkipNetwork = process.env.TT_SKIP_NETWORK;
  process.env.TT_SKIP_NETWORK = '1';
  try {
    let called = false;
    const options = baseOptions({
      store: {
        async verify() {
          called = true;
          throw new WorkLeaseError('authority-unavailable', 'remote unavailable');
        },
        renew: () => lease(),
      },
    });
    await assert.rejects(() => verifyGovernedEffect(options), /remote unavailable/);
    assert.equal(called, true, 'TT_SKIP_NETWORK must not bypass remote authority');
  } finally {
    if (originalSkipNetwork === undefined) delete process.env.TT_SKIP_NETWORK;
    else process.env.TT_SKIP_NETWORK = originalSkipNetwork;
  }
});

test('verifyGovernedEffect renews at the threshold and on a forced resume with a fifteen-minute TTL', async () => {
  const threshold = baseOptions({
    store: {
      verify: () => ({
        allowed: true,
        lease: lease({ heartbeatAt: new Date(Date.parse(NOW) - FIVE_MINUTES).toISOString() }),
      }),
      renew(request) {
        threshold.calls.renew.push(request);
        return lease({ heartbeatAt: request.requestedAt });
      },
    },
  });
  await verifyGovernedEffect(threshold);
  assert.deepEqual(threshold.calls.renew, [
    {
      projectId: 'project-1',
      leaseId: 'lease-1',
      fencingToken: '42',
      idempotencyKey: `renew:lease-1:42:${Math.floor(Date.parse(NOW) / FIVE_MINUTES)}`,
      requestedAt: NOW,
      ttlMs: 15 * 60 * 1000,
    },
  ]);

  const forced = baseOptions({
    forceRenewal: true,
    store: {
      verify: () => ({ allowed: true, lease: lease({ heartbeatAt: NOW }) }),
      renew(request) {
        forced.calls.renew.push(request);
        return Promise.resolve(lease({ heartbeatAt: request.requestedAt }));
      },
    },
  });
  await verifyGovernedEffect(forced);
  assert.equal(
    forced.calls.renew.length,
    1,
    'resume forces renewal before the five-minute threshold'
  );

  const renewalKeys = [];
  for (const requestedAt of [
    '2026-07-30T12:00:00.001Z',
    '2026-07-30T12:04:59.999Z',
    '2026-07-30T12:05:00.000Z',
  ]) {
    const options = baseOptions({
      forceRenewal: true,
      now: () => new Date(requestedAt),
      store: {
        verify: () => ({ allowed: true, lease: lease({ heartbeatAt: NOW }) }),
        renew(request) {
          renewalKeys.push(request.idempotencyKey);
          return lease({ heartbeatAt: request.requestedAt });
        },
      },
    });
    await verifyGovernedEffect(options);
  }
  assert.equal(renewalKeys[0], renewalKeys[1], 'same renewal bucket replays the exact key');
  assert.notEqual(renewalKeys[1], renewalKeys[2], 'next renewal bucket advances the key');
});

test('verifyGovernedEffect replays a response-lost renewal byte-for-byte within its bucket', async () => {
  const renewals = new Map();
  const calls = [];
  let responseLost = true;
  const store = {
    verify: () => ({ allowed: true, lease: lease({ heartbeatAt: '2026-07-30T11:55:00.000Z' }) }),
    renew(request) {
      calls.push(request);
      const canonical = JSON.stringify(request);
      const existing = renewals.get(request.idempotencyKey);
      if (existing && existing.canonical !== canonical) {
        throw new WorkLeaseError('idempotency-conflict', 'renewal replay changed its request');
      }
      if (existing) return existing.lease;
      const renewed = lease({ heartbeatAt: request.requestedAt });
      renewals.set(request.idempotencyKey, { canonical, lease: renewed });
      if (responseLost) {
        responseLost = false;
        throw new Error('renewal response lost');
      }
      return renewed;
    },
  };
  const options = (now) =>
    baseOptions({
      forceRenewal: true,
      now: () => new Date(now),
      store,
    });

  await assert.rejects(
    () => verifyGovernedEffect(options('2026-07-30T12:01:00.001Z')),
    (error) => error instanceof WorkLeaseError && error.code === 'authority-unavailable'
  );
  await verifyGovernedEffect(options('2026-07-30T12:04:59.999Z'));

  assert.deepEqual(calls[1], calls[0], 'same bucket retries the exact authority request');
  await verifyGovernedEffect(options('2026-07-30T12:05:00.000Z'));
  assert.notEqual(calls[2].idempotencyKey, calls[1].idempotencyKey);
  assert.notEqual(calls[2].requestedAt, calls[1].requestedAt);
});

test('createWorkLeaseHeartbeat is unreferenced, single-flight, stoppable, and remembers a failure for the next preflight', async () => {
  let callback;
  let detachedTimerCount = 0;
  let cleared = 0;
  let release;
  let runs = 0;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const heartbeat = createWorkLeaseHeartbeat({
    ownerKey: 'owner-1',
    verifyEffect: async () => {
      runs += 1;
      await pending;
    },
    setInterval: (fn, delay) => {
      assert.equal(delay, 60_000);
      callback = fn;
      return { unref: () => detachedTimerCount++ };
    },
    clearInterval: () => cleared++,
  });
  const sameOwner = createWorkLeaseHeartbeat({ ownerKey: 'owner-1' });
  assert.notEqual(sameOwner, heartbeat, 'callers receive independent heartbeat references');
  assert.equal(sameOwner.timer, heartbeat.timer, 'one timer owns a process lease');
  assert.equal(detachedTimerCount, 1);

  const first = callback();
  const second = callback();
  assert.equal(runs, 1, 'overlapping ticks are suppressed');
  release();
  await Promise.all([first, second]);
  sameOwner.shutdown();
  assert.equal(cleared, 0, 'one retained reference keeps the shared heartbeat alive');
  heartbeat.shutdown();
  assert.equal(cleared, 1);

  const failureOptions = baseOptions({ heartbeatOwnerKey: 'owner-failure', forceRenewal: true });
  let heartbeatCalls = 0;
  const failedHeartbeat = createWorkLeaseHeartbeat({
    ownerKey: 'owner-failure',
    verifyEffect: async () => {
      heartbeatCalls += 1;
      throw new WorkLeaseError('authority-unavailable', 'heartbeat lost authority');
    },
    setInterval: (fn) => ({ unref: () => {}, tick: fn }),
    clearInterval: () => {},
  });
  await failedHeartbeat.timer.tick();
  assert.equal(heartbeatCalls, 1);
  failedHeartbeat.shutdown();
  await assert.rejects(
    () => verifyGovernedEffect(failureOptions),
    (error) => error instanceof WorkLeaseError && error.code === 'authority-unavailable'
  );
  assert.equal(
    failureOptions.calls.verify.length,
    1,
    'a remembered heartbeat failure does not skip the next authority preflight'
  );
  assert.equal(failureOptions.calls.renew.length, 0, 'remembered failure blocks renewal');
  assert.equal(
    failureOptions.calls.saved.length,
    0,
    'remembered failure blocks session persistence'
  );
  await verifyGovernedEffect(failureOptions);
  assert.equal(failureOptions.calls.verify.length, 2, 'the following preflight verifies again');
  assert.equal(failureOptions.calls.renew.length, 1, 'the following preflight can renew');
  assert.equal(failureOptions.calls.saved.length, 1, 'the following preflight can persist');
});

test('createWorkLeaseHeartbeat registers one removable process-exit listener per owner', () => {
  const listeners = [];
  const removed = [];
  const processEvents = {
    once(event, listener) {
      listeners.push({ event, listener });
    },
    removeListener(event, listener) {
      removed.push({ event, listener });
    },
  };
  const heartbeat = createWorkLeaseHeartbeat({
    ownerKey: 'owner-process',
    verifyEffect: async () => {},
    setInterval: () => ({ unref: () => {} }),
    clearInterval: () => {},
    processEvents,
  });
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].event, 'exit');
  const secondReference = createWorkLeaseHeartbeat({ ownerKey: 'owner-process' });
  assert.equal(secondReference.timer, heartbeat.timer);
  assert.equal(listeners.length, 1, 'duplicate owner registration must not leak listeners');

  secondReference.stop();
  assert.deepEqual(removed, [], 'one retained reference keeps the exit listener registered');
  heartbeat.stop();
  assert.deepEqual(removed, [{ event: 'exit', listener: listeners[0].listener }]);
});
