// @story #1117 #1457

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BoundaryLockAcquireError,
  createStateCursor,
} from '../../../../task-tracker/lib/state-cursor.mjs';
import { RepositoryAdapter } from '../../../../task-tracker/lib/repository-adapter.mjs';
import { IssueLockError } from '../../../../task-tracker/issue-mutator-lock.mjs';

function state(id, residentActions = []) {
  return Object.freeze({ id, residentActions: Object.freeze(residentActions) });
}

function machine() {
  const states = new Map([
    ['develop', state('develop', [{ id: 'develop-action' }])],
    ['test', state('test', [{ id: 'test-action' }])],
    ['review', state('review', [{ id: 'review-agent-validation' }])],
    ['done', state('done')],
  ]);
  return Object.freeze({
    get(id) {
      const found = states.get(String(id).toLowerCase());
      if (!found) throw new Error(`unknown state: ${id}`);
      return found;
    },
    next(id) {
      return { develop: 'test', test: 'review', review: 'done' }[id];
    },
    backwardTargets(id) {
      return { test: ['develop'], review: ['develop'], done: [] }[id] ?? [];
    },
  });
}

function snapshot(currentState, overrides = {}) {
  return {
    issue: { value: 1117 },
    currentState: { value: currentState },
    stateVisitId: `${currentState}:1`,
    actionLedger: { status: 'clean', events: [] },
    invocation: { issue: 1117, cwd: '/worktree' },
    ...overrides,
  };
}

function harness({
  initial = 'test',
  hydrationStates = [],
  residentResults = [],
  boundaryResult = { kind: 'moved', phase: 'commit', exit: 0 },
  onResume,
} = {}) {
  const calls = [];
  const pendingHydrations = [...hydrationStates];
  const pendingResidents = [...residentResults];
  let current = initial;
  const repository = {
    calls,
    async hydrateTask() {
      const stateId = pendingHydrations.length > 0 ? pendingHydrations.shift() : current;
      calls.push({ name: 'hydrateTask', state: stateId });
      return snapshot(stateId);
    },
    async requestLegacyBoundary(input) {
      calls.push({ name: `requestLegacyBoundary:${input.fromState}->${input.target}`, input });
      if (boundaryResult.kind === 'moved') current = input.target;
      return boundaryResult;
    },
  };
  const actions = {
    async resume(residents, currentSnapshot, options) {
      calls.push({
        name: `resume:${currentSnapshot.currentState.value}`,
        residents: residents.map(({ id }) => id),
        options,
      });
      if (onResume) await onResume({ residents, snapshot: currentSnapshot, options, calls });
      return pendingResidents.shift() ?? { status: 'complete' };
    },
  };
  return { calls, cursor: createStateCursor({ machine: machine(), repository, actions }) };
}

test('matrix refusal happens before resident or boundary effects', async () => {
  const { cursor, calls } = harness({ initial: 'develop' });
  const result = await cursor.execute({
    issue: 1117,
    cwd: '/worktree',
    trigger: 'advance-forward',
    requestedTarget: 'done',
  });
  assert.equal(result.kind, 'matrix-refused');
  assert.match(result.reason, /develop|done/i);
  assert.deepEqual(result.allowedTargets, ['test']);
  assert.deepEqual(
    calls.map(({ name }) => name),
    ['hydrateTask']
  );
});

test('self-target forward resumes residents before returning noop', async () => {
  const { cursor, calls } = harness({ initial: 'review' });
  const result = await cursor.execute({
    issue: 1117,
    cwd: '/worktree',
    trigger: 'advance-forward',
    requestedTarget: 'review',
  });
  assert.deepEqual(result, { kind: 'noop', state: 'review' });
  assert.deepEqual(
    calls.map(({ name }) => name),
    ['hydrateTask', 'resume:review']
  );
});

test('actions-only resumes residents and never requests a boundary', async () => {
  const { cursor, calls } = harness({ initial: 'review' });
  const result = await cursor.execute({
    issue: 1117,
    cwd: '/worktree',
    trigger: 'actions-only',
  });
  assert.deepEqual(result, { kind: 'resident-complete', state: 'review' });
  assert.deepEqual(
    calls.map(({ name }) => name),
    ['hydrateTask', 'resume:review']
  );
});

test('ordinary forward completes residents before requesting one boundary', async () => {
  const { cursor, calls } = harness({ initial: 'test' });
  const result = await cursor.execute({
    issue: 1117,
    cwd: '/worktree',
    trigger: 'advance-forward',
    requestedTarget: 'review',
  });
  assert.deepEqual(
    calls.map(({ name }) => name),
    [
      'hydrateTask',
      'resume:test',
      'hydrateTask',
      'requestLegacyBoundary:test->review',
      'hydrateTask',
      'resume:review',
    ]
  );
  assert.equal(result.kind, 'resident-result');
  assert.equal(result.state, 'review');
  assert.deepEqual(result.result, { status: 'complete' });
});

test('reverse and bypass skip current residents', async () => {
  for (const invocation of [
    { trigger: 'advance-reverse', requestedTarget: 'develop' },
    {
      trigger: 'bypass',
      requestedTarget: 'done',
      flags: { force: true, reason: 'operator recovery' },
    },
  ]) {
    const { cursor, calls } = harness({ initial: 'review' });
    const result = await cursor.execute({ issue: 1117, cwd: '/worktree', ...invocation });
    assert.equal(result.kind, 'resident-result');
    assert.equal(
      calls.some(({ name }) => name === 'resume:review'),
      false
    );
    assert.equal(calls.filter(({ name }) => name.startsWith('requestLegacyBoundary')).length, 1);
  }
});

test('force carries skipped resident IDs without resolving them', async () => {
  const { cursor, calls } = harness({ initial: 'review' });
  const result = await cursor.execute({
    issue: 1117,
    cwd: '/worktree',
    trigger: 'bypass',
    requestedTarget: 'done',
    flags: { force: true, reason: 'operator recovery' },
  });
  const boundary = calls.find(({ name }) => name === 'requestLegacyBoundary:review->done');
  assert.deepEqual(boundary.input.skippedResidentActions, ['review-agent-validation']);
  assert.equal(
    calls.some(({ name }) => name === 'resume:review'),
    false
  );
  assert.equal(result.kind, 'resident-result');
});

test('ordinary forward returns dormant for incomplete or damaged resident work', async () => {
  for (const residentResult of [
    { status: 'waiting', deadline: '2026-09-01T00:00:00Z' },
    { status: 'paused', reason: 'action-ledger-unavailable' },
  ]) {
    const { cursor, calls } = harness({ initial: 'test', residentResults: [residentResult] });
    const result = await cursor.execute({
      issue: 1117,
      cwd: '/worktree',
      trigger: 'advance-forward',
      requestedTarget: 'review',
    });
    assert.deepEqual(result, { kind: 'dormant', state: 'test', result: residentResult });
    assert.equal(
      calls.some(({ name }) => name.startsWith('requestLegacyBoundary')),
      false
    );
  }
});

test('source drift refuses before the legacy boundary', async () => {
  const { cursor, calls } = harness({ initial: 'test', hydrationStates: ['test', 'review'] });
  const result = await cursor.execute({
    issue: 1117,
    cwd: '/worktree',
    trigger: 'advance-forward',
    requestedTarget: 'review',
  });
  assert.deepEqual(result, { kind: 'drift', expectedState: 'test', actualState: 'review' });
  assert.equal(
    calls.some(({ name }) => name.startsWith('requestLegacyBoundary')),
    false
  );
});

test('legacy refusal results preserve every diagnostic field', async () => {
  const results = [
    {
      kind: 'gate-refused',
      phase: 'guard',
      exit: 4,
      refusals: [{ id: 'blocked', reason: 'blocked' }],
      warns: [{ id: 'dirty', reason: 'dirty' }],
      timing: { activeSec: 4 },
    },
    {
      kind: 'move-refused',
      phase: 'status-write',
      exit: 7,
      itemId: 'PVTI_1',
      sentinelPresent: false,
      boardMoved: false,
      failures: ['tail'],
    },
    {
      kind: 'boundary-lock-refused',
      phase: 'lock',
      exit: 7,
      holder: { pid: 123 },
      retry: { afterMs: 50 },
    },
  ];
  for (const boundaryResult of results) {
    const { cursor, calls } = harness({ initial: 'test', boundaryResult });
    const actual = await cursor.execute({
      issue: 1117,
      cwd: '/worktree',
      trigger: 'advance-forward',
      requestedTarget: 'review',
    });
    assert.deepEqual(actual, boundaryResult);
    assert.equal(
      calls.some(({ name }) => name === 'resume:review'),
      false
    );
  }
});

test('unknown boundary results fail closed and never enter target residents', async () => {
  const { cursor, calls } = harness({
    initial: 'test',
    boundaryResult: { kind: 'surprising-success', exit: 0 },
  });
  const result = await cursor.execute({
    issue: 1117,
    cwd: '/worktree',
    trigger: 'advance-forward',
    requestedTarget: 'review',
  });
  assert.deepEqual(result, {
    kind: 'invalid-boundary-result',
    phase: 'internal',
    exit: 1,
    reason: 'unknown legacy boundary result',
    receivedKind: 'surprising-success',
  });
  assert.equal(
    calls.some(({ name }) => name === 'resume:review'),
    false
  );
});

test('guard and transition consume one snapshot vintage inside the boundary lock', async () => {
  const calls = [];
  let current = 'test';
  let hydration = 0;
  let gateSnapshot;
  let gateContext;
  const repository = {
    async hydrateTask() {
      hydration += 1;
      const value = snapshot(current, { vintage: hydration });
      calls.push(hydration === 1 ? 'hydrateTask:pre-action' : `hydrateTask:${current}`);
      return value;
    },
    async withBoundaryLock(options, operation) {
      assert.equal(options.issue, 1117);
      assert.equal(options.verb, 'review');
      calls.push('withBoundaryLock:begin');
      const result = await operation();
      calls.push('withBoundaryLock:end');
      return result;
    },
    async runPreMutationGate(input) {
      calls.push('runPreMutationGate');
      gateSnapshot = input.snapshot;
      gateContext = input.moveContext;
      assert.ok(Object.isFrozen(input.moveContext));
      return { exit: null };
    },
    async requestTransition(input) {
      calls.push('requestTransition');
      assert.equal(input.moveContext.snapshot, gateSnapshot);
      assert.equal(input.moveContext, gateContext);
      current = 'review';
      return { exit: null, phase: 'commit' };
    },
    async requestLegacyBoundary() {
      throw new Error('legacy boundary must not run');
    },
  };
  const actions = {
    async resume(_residents, currentSnapshot) {
      calls.push(`resume:${currentSnapshot.currentState.value}`);
      return { status: 'complete' };
    },
  };

  const result = await createStateCursor({ machine: machine(), repository, actions }).execute({
    issue: 1117,
    cwd: '/worktree',
    trigger: 'advance-forward',
    requestedTarget: 'review',
    flags: { verb: 'review' },
  });

  assert.equal(result.kind, 'resident-result');
  assert.deepEqual(calls, [
    'hydrateTask:pre-action',
    'resume:test',
    'withBoundaryLock:begin',
    'hydrateTask:test',
    'runPreMutationGate',
    'requestTransition',
    'withBoundaryLock:end',
    'hydrateTask:review',
    'resume:review',
  ]);
});

test('boundary lock translates acquisition failure without rewriting callback provenance', async () => {
  const acquisition = new IssueLockError('held before callback', {
    issue: 1117,
    holder: { sessionId: 'other-session' },
  });
  const blocked = new RepositoryAdapter({
    withIssueLock: async () => {
      throw acquisition;
    },
  });
  await assert.rejects(
    () => blocked.withBoundaryLock({ issue: 1117 }, async () => undefined),
    (error) =>
      error instanceof BoundaryLockAcquireError &&
      error.cause === acquisition &&
      error.holder?.sessionId === 'other-session'
  );

  const nested = new IssueLockError('callback lock failure', { issue: 2222 });
  const entered = new RepositoryAdapter({
    withIssueLock: async (_options, operation) => operation(),
  });
  await assert.rejects(
    () =>
      entered.withBoundaryLock({ issue: 1117 }, async () => {
        throw nested;
      }),
    (error) => error === nested
  );
});

test('boundary lock exposes hold-time percentiles and applies a bounded p95 retry budget', async () => {
  const clock = [100, 900, 1_000, 1_800];
  const lockOptions = [];
  const repository = new RepositoryAdapter({
    now: () => clock.shift(),
    boundaryLockJitterMs: 100,
    boundaryLockMaxWaitMs: 1_000,
    withIssueLock: async (options, operation) => {
      lockOptions.push(options);
      return operation();
    },
  });

  await repository.withBoundaryLock({ issue: 1117, verb: 'review' }, async () => undefined);
  await repository.withBoundaryLock({ issue: 1117, verb: 'review' }, async () => undefined);

  const timings = repository.boundaryLockTimings();
  assert.deepEqual(timings, {
    count: 2,
    p50Ms: 800,
    p95Ms: 800,
    p99Ms: 800,
    retryBudgetMs: 900,
    maxWaitMs: 1_000,
  });
  assert.equal(lockOptions[0].timeoutMs, 500);
  assert.equal(lockOptions[0].retries, 1);
  assert.equal(lockOptions[1].timeoutMs, 900);
  assert.equal(lockOptions[1].retries, 1);
});

test('damage carry is written only after a clean gate and is the sole transition-context addition', async () => {
  const calls = [];
  let gateContext;
  let current = 'review';
  const damageCarry = Object.freeze({ commentId: 'carry-42', hash: 'abc123' });
  const repository = {
    async hydrateTask() {
      return snapshot(current, {
        actionLedger: { status: 'damaged', diagnostics: ['missing resolved event'] },
      });
    },
    async withBoundaryLock(_options, operation) {
      return operation();
    },
    async runPreMutationGate({ moveContext }) {
      calls.push('gate');
      gateContext = moveContext;
      return { exit: null };
    },
    async recordLedgerDamageCarry({ snapshot: lockedSnapshot, movementIntent }) {
      calls.push('carry');
      assert.equal(lockedSnapshot, gateContext.snapshot);
      assert.equal(movementIntent.target, 'done');
      return damageCarry;
    },
    async requestTransition({ moveContext }) {
      calls.push('move');
      assert.notEqual(moveContext, gateContext);
      assert.deepEqual(Object.keys(moveContext), Object.keys(gateContext));
      for (const key of Object.keys(gateContext).filter((name) => name !== 'damageCarry')) {
        assert.equal(moveContext[key], gateContext[key]);
      }
      assert.equal(moveContext.damageCarry, damageCarry);
      assert.ok(Object.isFrozen(moveContext));
      current = 'done';
      return { exit: null };
    },
  };
  const actions = {
    async resume() {
      return { status: 'complete' };
    },
  };

  const result = await createStateCursor({ machine: machine(), repository, actions }).execute({
    issue: 1117,
    cwd: '/worktree',
    trigger: 'bypass',
    requestedTarget: 'done',
    flags: { verb: 'supersede', force: true, reason: 'operator recovery' },
  });

  assert.equal(result.kind, 'resident-result');
  assert.deepEqual(calls, ['gate', 'carry', 'move']);
});

test('a crash after confirmed movement converges by resuming the durable target', async () => {
  let crash = true;
  const first = harness({
    initial: 'test',
    onResume({ snapshot: current }) {
      if (current.currentState.value === 'review' && crash) {
        crash = false;
        throw new Error('crash-before-target-action');
      }
    },
  });
  await assert.rejects(
    first.cursor.execute({
      issue: 1117,
      cwd: '/worktree',
      trigger: 'advance-forward',
      requestedTarget: 'review',
    }),
    /crash-before-target-action/
  );
  assert.equal(
    first.calls.filter(({ name }) => name === 'requestLegacyBoundary:test->review').length,
    1
  );

  const second = harness({ initial: 'review' });
  const recovered = await second.cursor.execute({
    issue: 1117,
    cwd: '/worktree',
    trigger: 'actions-only',
  });
  assert.deepEqual(recovered, { kind: 'resident-complete', state: 'review' });
  assert.equal(
    second.calls.some(({ name }) => name.startsWith('requestLegacyBoundary')),
    false
  );
});
