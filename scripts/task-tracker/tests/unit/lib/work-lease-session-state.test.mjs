import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import {
  leaseContextEnvironment,
  normalizeLeaseContext,
  readWorkLeaseIntentRequest,
} from '../../../lib/work-lease/context.mjs';
import {
  activeTaskPath,
  attachWorkLeaseIntentReceipt,
  checkpointWorkLeaseProjection,
  captureActiveTaskSnapshot,
  clearActiveTaskLease,
  clearWorkLeaseIntent,
  getActiveTask,
  restoreActiveTaskSnapshot,
  setActiveTask,
  setWorkLeaseIntent,
  setWorkLeaseProjectionInput,
} from '../../../session-state.mjs';
import { loadState, saveState } from '../../../state.mjs';

const LEASE = Object.freeze({
  projectId: 'project-1',
  leaseId: 'lease-1',
  fencingToken: '42',
  worktreeId: 'worktree-1',
});

function sandbox() {
  return mkdtempSync(path.join(projectScratchDir('test'), 'tt-work-lease-session-'));
}

function acquireRequest(overrides = {}) {
  return {
    projectId: 'project-1',
    issueId: '1049',
    mode: 'write',
    idempotencyKey: 'acquire:session-1:#1049',
    requestedAt: '2026-07-30T12:00:00.000Z',
    ttlMs: 300_000,
    holder: {
      principalKind: 'worker',
      provider: 'codex',
      agentRunId: 'run-1',
      sessionId: 'session-1',
      hostId: 'host-1',
      pid: 123,
      worktreeId: 'worktree-1',
      pathHash: 'path-1',
      branch: 'feature/child/1049',
    },
    ...overrides,
  };
}

test('lease context has an exact persisted shape and exposes only child fencing env keys', () => {
  assert.deepEqual(normalizeLeaseContext({ ...LEASE }), LEASE);
  assert.throws(
    () => normalizeLeaseContext({ ...LEASE, expiresAt: 'secretly-sticky' }),
    /exactly projectId, leaseId, fencingToken, and worktreeId/
  );
  assert.throws(
    () => normalizeLeaseContext({ ...LEASE, fencingToken: 42 }),
    /positive base-10 integer string/
  );

  assert.deepEqual(leaseContextEnvironment(LEASE), {
    AITM_LEASE_ID: 'lease-1',
    AITM_FENCING_TOKEN: '42',
  });
  assert.deepEqual(leaseContextEnvironment(null), {});
  assert.equal('AITM_LEASE_AUTH_TOKEN' in leaseContextEnvironment(LEASE), false);
});

test('active-task snapshot restoration preserves exact prior bytes or exact absence', () => {
  const dir = sandbox();
  try {
    const sid = 'session-byte-restore';
    const p = activeTaskPath(sid, dir);
    mkdirSync(path.dirname(p), { recursive: true });
    const exact = '{ "issue": "#1049", "wordsAtStart": 7 }\n';
    writeFileSync(p, exact, 'utf8');
    const snapshot = captureActiveTaskSnapshot(sid, dir);

    setWorkLeaseIntent(
      sid,
      {
        operation: 'acquire',
        request: acquireRequest({ idempotencyKey: 'restore-existing' }),
        projectionInputs: { session: { issue: '#1049' } },
      },
      dir
    );
    assert.equal(restoreActiveTaskSnapshot(sid, snapshot, 'restore-existing', dir), true);
    assert.equal(readFileSync(p, 'utf8'), exact);

    const absentSid = 'session-absence-restore';
    const absent = captureActiveTaskSnapshot(absentSid, dir);
    setWorkLeaseIntent(
      absentSid,
      {
        operation: 'acquire',
        request: acquireRequest({
          idempotencyKey: 'restore-absence',
          holder: {
            ...acquireRequest().holder,
            sessionId: absentSid,
          },
        }),
        projectionInputs: { session: { issue: '#1049' } },
      },
      dir
    );
    assert.equal(restoreActiveTaskSnapshot(absentSid, absent, 'restore-absence', dir), true);
    assert.equal(getActiveTask(absentSid, dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('same-issue generic writes preserve lease and kanban while cross-issue writes carry neither', () => {
  const dir = sandbox();
  try {
    setActiveTask(
      'session-1',
      { issue: '#1049', lease: LEASE, kanbanState: 'develop', wordsAtStart: 1 },
      dir
    );

    setActiveTask('session-1', { issue: '#1049', wordsAtStart: 2 }, dir);
    assert.deepEqual(getActiveTask('session-1', dir).lease, LEASE);
    assert.equal(getActiveTask('session-1', dir).kanbanState, 'develop');

    setActiveTask('session-1', { issue: '1049', wordsAtStart: 2 }, dir);
    assert.deepEqual(getActiveTask('session-1', dir).lease, LEASE);
    assert.equal(getActiveTask('session-1', dir).kanbanState, 'develop');

    setActiveTask('session-1', { issue: '#1051', wordsAtStart: 3 }, dir);
    const switched = getActiveTask('session-1', dir);
    assert.equal(switched.lease, undefined);
    assert.equal(switched.kanbanState, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('generic state saves retain paused authority without restoring an active bind', () => {
  const dir = sandbox();
  const statePath = path.join(dir, '.tmp', 'aitm', 'state', 'task-tracker-state.json');
  const priorSid = process.env.AI_TASK_MANAGER_SESSION_ID;
  process.env.AI_TASK_MANAGER_SESSION_ID = 'session-paused';
  try {
    setActiveTask('session-paused', { issue: '#1049', lease: LEASE, kanbanState: 'develop' }, dir);
    saveState(
      {
        active: null,
        lastActive: '#1049',
        entryStartTs: null,
        wordsAtEntryStart: 0,
      },
      statePath
    );

    const persisted = getActiveTask('session-paused', dir);
    assert.equal(persisted.issue, null);
    assert.equal(persisted.leaseIssue, '#1049');
    assert.deepEqual(persisted.lease, LEASE);
    assert.equal(persisted.kanbanState, 'develop');
    assert.equal(loadState(statePath).active, null);
  } finally {
    if (priorSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
    else process.env.AI_TASK_MANAGER_SESSION_ID = priorSid;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lease clear is stale-token safe', () => {
  const dir = sandbox();
  try {
    setActiveTask('session-1', { issue: '#1049', lease: LEASE }, dir);

    assert.equal(clearActiveTaskLease('session-1', '41', dir), false);
    assert.deepEqual(getActiveTask('session-1', dir).lease, LEASE);

    assert.equal(clearActiveTaskLease('session-1', '42', dir), true);
    assert.equal(getActiveTask('session-1', dir).lease, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('intent persists one exact request and rejects credential material before mutation', () => {
  const dir = sandbox();
  try {
    const request = acquireRequest();
    const stored = setWorkLeaseIntent(
      'session-1',
      {
        operation: 'acquire',
        request,
        projectionInputs: {
          session: { issue: '#1049' },
          fleet: { issue: '#1049', worktreeId: 'worktree-1' },
        },
      },
      dir
    );
    assert.deepEqual(readWorkLeaseIntentRequest(stored.workLeaseIntent), request);
    assert.equal(stored.workLeaseIntent.idempotencyKey, request.idempotencyKey);
    assert.equal(stored.workLeaseIntent.receipt, undefined);
    assert.equal(stored.workLeaseIntent.transitionId, undefined);
    assert.deepEqual(stored.workLeaseIntent.projections.session, {
      input: { issue: '#1049' },
      completed: false,
    });

    assert.throws(
      () =>
        setWorkLeaseIntent(
          'session-secret',
          {
            operation: 'acquire',
            request: acquireRequest({ tokenEnv: 'AITM_LEASE_AUTH_TOKEN' }),
            projectionInputs: { session: { issue: '#1049' } },
          },
          dir
        ),
      /secret lease material/
    );
    assert.equal(getActiveTask('session-secret', dir), null);

    assert.throws(
      () =>
        setWorkLeaseIntent(
          'session-bearer',
          {
            operation: 'acquire',
            request,
            projectionInputs: {
              session: { authorization: 'Bearer do-not-persist' },
            },
          },
          dir
        ),
      /secret lease material/
    );
    assert.equal(getActiveTask('session-bearer', dir), null);

    assert.throws(
      () =>
        setWorkLeaseIntent(
          'session-env-secret',
          {
            operation: 'acquire',
            request,
            projectionInputs: {
              session: { env: { AITM_LEASE_AUTH_TOKEN: 'do-not-persist' } },
            },
          },
          dir
        ),
      /secret lease material/
    );
    assert.equal(getActiveTask('session-env-secret', dir), null);

    assert.throws(
      () =>
        setWorkLeaseIntent(
          'session-variant-secret',
          {
            operation: 'acquire',
            request,
            projectionInputs: {
              session: {
                authorizationHeader: 'opaque',
                clientSecretValue: 'opaque',
              },
            },
          },
          dir
        ),
      /secret lease material/
    );
    assert.equal(getActiveTask('session-variant-secret', dir), null);

    assert.throws(
      () =>
        setWorkLeaseIntent(
          'session-bearer-key',
          {
            operation: 'acquire',
            request,
            projectionInputs: {
              session: { bearer: 'opaque-secret' },
            },
          },
          dir
        ),
      /secret lease material/
    );
    assert.equal(getActiveTask('session-bearer-key', dir), null);

    setActiveTask('session-mismatch', { issue: '#1049', lease: LEASE }, dir);
    assert.throws(
      () =>
        setWorkLeaseIntent(
          'session-mismatch',
          {
            operation: 'acquire',
            request: acquireRequest({ issueId: '1051' }),
            projectionInputs: { session: { issue: '#1051' } },
          },
          dir
        ),
      /intent issue does not match/
    );
    assert.equal(getActiveTask('session-mismatch', dir).workLeaseIntent, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('intent, receipt, and projection persistence is idempotent but never overwrites recovery state', () => {
  const dir = sandbox();
  try {
    const input = {
      operation: 'acquire',
      request: acquireRequest(),
      projectionInputs: { session: { issue: '#1049' } },
    };
    const first = setWorkLeaseIntent('session-1', input, dir);
    assert.deepEqual(setWorkLeaseIntent('session-1', input, dir), first);
    assert.throws(
      () =>
        setWorkLeaseIntent(
          'session-1',
          {
            ...input,
            request: acquireRequest({ idempotencyKey: 'different-intent' }),
          },
          dir
        ),
      /unreconciled work-lease intent/
    );
    assert.deepEqual(
      readWorkLeaseIntentRequest(getActiveTask('session-1', dir).workLeaseIntent),
      input.request
    );

    const receiptInput = { receipt: { lease: LEASE } };
    const withReceipt = attachWorkLeaseIntentReceipt('session-1', receiptInput, dir);
    assert.deepEqual(attachWorkLeaseIntentReceipt('session-1', receiptInput, dir), withReceipt);
    assert.throws(
      () =>
        attachWorkLeaseIntentReceipt(
          'session-1',
          { receipt: { lease: { ...LEASE, leaseId: 'other' } } },
          dir
        ),
      /receipt cannot be overwritten/
    );

    checkpointWorkLeaseProjection(
      'session-1',
      'session',
      undefined,
      '2026-07-30T12:02:00.000Z',
      dir
    );
    const completed = getActiveTask('session-1', dir);
    assert.equal(
      clearWorkLeaseIntent('session-1', undefined, dir),
      false,
      'a session-only intent must not satisfy the fixed reconciliation set'
    );
    assert.deepEqual(
      checkpointWorkLeaseProjection(
        'session-1',
        'session',
        undefined,
        '2026-07-30T12:03:00.000Z',
        dir
      ),
      completed,
      'a repeated checkpoint must preserve the first durable completion'
    );
    assert.deepEqual(
      setWorkLeaseProjectionInput('session-1', 'session', { issue: '#1049' }, undefined, dir),
      completed,
      'replaying the same input must not reset a completed projection'
    );
    assert.throws(
      () => setWorkLeaseProjectionInput('session-1', 'session', { issue: '#1051' }, undefined, dir),
      /projection input cannot be overwritten/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('intent receipt and projection checkpoints update atomically and clear only after reconciliation', () => {
  const dir = sandbox();
  try {
    setActiveTask('session-1', { issue: '#1049', lease: LEASE }, dir);
    setWorkLeaseIntent(
      'session-1',
      {
        operation: 'switchLease',
        request: {
          projectId: 'project-1',
          issueId: '1049',
          leaseId: 'lease-1',
          fencingToken: '42',
          idempotencyKey: 'switch:1049:1051',
          switchedAt: '2026-07-30T12:01:00.000Z',
          target: acquireRequest({
            issueId: '1051',
            idempotencyKey: 'acquire:session-1:#1051',
          }),
        },
        projectionInputs: {
          session: { from: '#1049', to: '#1051' },
          fleet: { from: '#1049', to: '#1051' },
        },
      },
      dir
    );

    attachWorkLeaseIntentReceipt(
      'session-1',
      {
        receipt: {
          lease: { ...LEASE, leaseId: 'lease-2', fencingToken: '44' },
          transition: { transitionId: 'transition-1' },
        },
      },
      dir
    );
    setWorkLeaseProjectionInput(
      'session-1',
      'timing',
      { from: '#1049', to: '#1051' },
      'transition-1',
      dir
    );
    setWorkLeaseProjectionInput(
      'session-1',
      'github',
      { from: '#1049', to: '#1051' },
      'transition-1',
      dir
    );
    checkpointWorkLeaseProjection(
      'session-1',
      'session',
      'transition-1',
      '2026-07-30T12:02:00.000Z',
      dir
    );

    assert.equal(clearWorkLeaseIntent('session-1', 'transition-1', dir), false);
    assert.ok(getActiveTask('session-1', dir).workLeaseIntent);

    checkpointWorkLeaseProjection(
      'session-1',
      'fleet',
      'transition-1',
      '2026-07-30T12:02:01.000Z',
      dir
    );
    checkpointWorkLeaseProjection(
      'session-1',
      'timing',
      'transition-1',
      '2026-07-30T12:02:02.000Z',
      dir
    );
    assert.equal(
      clearWorkLeaseIntent('session-1', 'transition-1', dir),
      false,
      'a completed subset must not reconcile the fixed projection set'
    );
    checkpointWorkLeaseProjection(
      'session-1',
      'github',
      'transition-1',
      '2026-07-30T12:02:03.000Z',
      dir
    );
    assert.equal(clearWorkLeaseIntent('session-1', 'stale-transition', dir), false);
    assert.equal(clearWorkLeaseIntent('session-1', 'transition-1', dir), true);
    assert.equal(getActiveTask('session-1', dir).workLeaseIntent, undefined);
    assert.deepEqual(getActiveTask('session-1', dir).lease, LEASE);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('recovery mutations fail closed without replacing malformed session state', () => {
  const dir = sandbox();
  try {
    const p = activeTaskPath('session-corrupt', dir);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, '{ malformed', 'utf8');

    assert.throws(
      () =>
        setWorkLeaseIntent(
          'session-corrupt',
          {
            operation: 'acquire',
            request: acquireRequest(),
            projectionInputs: { session: { issue: '#1049' } },
          },
          dir
        ),
      /active-task state is not valid JSON/
    );
    assert.equal(readFileSync(p, 'utf8'), '{ malformed');
    assert.throws(
      () => setActiveTask('session-corrupt', { issue: '#1049', wordsAtStart: 1 }, dir),
      /active-task state is not valid JSON/
    );
    assert.equal(readFileSync(p, 'utf8'), '{ malformed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('recovery mutations reject a present malformed intent without replacing it', () => {
  const dir = sandbox();
  try {
    const p = activeTaskPath('session-malformed-intent', dir);
    mkdirSync(path.dirname(p), { recursive: true });
    const raw = JSON.stringify({ issue: '#1049', workLeaseIntent: null });
    writeFileSync(p, raw, 'utf8');

    assert.throws(
      () =>
        setWorkLeaseIntent(
          'session-malformed-intent',
          {
            operation: 'acquire',
            request: acquireRequest(),
            projectionInputs: { session: { issue: '#1049' } },
          },
          dir
        ),
      /active-task workLeaseIntent is malformed/
    );
    assert.equal(readFileSync(p, 'utf8'), raw);
    assert.throws(
      () => setActiveTask('session-malformed-intent', { issue: '#1049', wordsAtStart: 1 }, dir),
      /active-task workLeaseIntent is malformed/
    );
    assert.equal(readFileSync(p, 'utf8'), raw);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('receipt persistence refuses nested credentials and preserves prior intent', () => {
  const dir = sandbox();
  try {
    setWorkLeaseIntent(
      'session-1',
      {
        operation: 'acquire',
        request: acquireRequest(),
        projectionInputs: { session: { issue: '#1049' } },
      },
      dir
    );
    assert.throws(
      () =>
        attachWorkLeaseIntentReceipt(
          'session-1',
          {
            receipt: { lease: LEASE, metadata: { credentials: 'do-not-persist' } },
          },
          dir
        ),
      /secret lease material/
    );
    const record = getActiveTask('session-1', dir);
    assert.ok(record.workLeaseIntent);
    assert.equal(record.workLeaseIntent.receipt, undefined);
    assert.throws(
      () =>
        attachWorkLeaseIntentReceipt(
          'session-1',
          {
            receipt: {
              lease: LEASE,
              transport: { token_env: 'AITM_LEASE_AUTH_TOKEN' },
            },
          },
          dir
        ),
      /secret lease material/
    );
    assert.equal(getActiveTask('session-1', dir).workLeaseIntent.receipt, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('projection persistence rejects values that cannot replay as exact JSON', () => {
  const dir = sandbox();
  try {
    const cyclic = {};
    cyclic.self = cyclic;
    for (const input of [
      { missing: undefined },
      { counter: 1n },
      { callback() {} },
      { cyclic },
      { invalid: Number.NaN },
    ]) {
      assert.throws(
        () =>
          setWorkLeaseIntent(
            'session-json',
            {
              operation: 'acquire',
              request: acquireRequest(),
              projectionInputs: { session: input },
            },
            dir
          ),
        /durable JSON/
      );
      assert.equal(getActiveTask('session-json', dir), null);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
