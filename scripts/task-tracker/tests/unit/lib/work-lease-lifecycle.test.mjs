// @story #1054

import assert from 'node:assert/strict';
import { canonicalRequestDigest, canonicalRequestJson } from '@kburson/aitm-ledger';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import * as sessionState from '../../../session-state.mjs';
import { saveState } from '../../../state.mjs';

const lifecycle = await import('../../../lib/work-lease/lifecycle-orchestration.mjs').catch(
  () => ({})
);

const displayPath = '/project/.worktrees/1054-lifecycle-journal-core';
const holder = Object.freeze({
  principalKind: 'worker',
  provider: 'codex',
  agentRunId: 'run-1054',
  sessionId: 'session-1054',
  hostId: 'host-1',
  pid: 1054,
  worktreeId: 'worktree-1054',
  pathHash: createHash('sha256').update(displayPath).digest('hex'),
  branch: 'feature/child/1054',
});
const binding = Object.freeze({
  sessionId: holder.sessionId,
  issueId: '1054',
  worktreeId: holder.worktreeId,
  displayPath,
});
const authority = Object.freeze({
  lease: Object.freeze({
    projectId: 'project-1',
    leaseId: 'lease-1054',
    fencingToken: '41',
    worktreeId: holder.worktreeId,
  }),
  holder,
  binding,
});

function makeJournal(overrides = {}) {
  return lifecycle.createLifecycleJournal({
    operationId: 'lifecycle:1054:pause:1',
    action: 'pause',
    issueId: '1054',
    authority,
    projections: [
      { name: 'timing', input: { event: 'pause:other' } },
      { name: 'session', input: { paused: true } },
    ],
    ...overrides,
  });
}

function pauseRequest(overrides = {}) {
  return {
    projectId: authority.lease.projectId,
    leaseId: authority.lease.leaseId,
    fencingToken: authority.lease.fencingToken,
    idempotencyKey: 'lifecycle:1054:pause:request:1',
    requestedAt: '2026-08-01T02:00:00.000Z',
    ttlMs: 86_400_000,
    lifecycle: { expectedState: 'active', nextState: 'paused' },
    holder,
    binding,
    ...overrides,
  };
}

function pausedReceipt(overrides = {}) {
  return {
    projectId: authority.lease.projectId,
    issueId: '1054',
    mode: 'write',
    leaseId: authority.lease.leaseId,
    fencingToken: authority.lease.fencingToken,
    state: 'paused',
    holder,
    acquiredAt: '2026-08-01T01:45:00.000Z',
    heartbeatAt: '2026-08-01T02:00:00.000Z',
    expiresAt: '2026-08-02T02:00:00.000Z',
    audit: {},
    ...overrides,
  };
}

function sandbox() {
  return mkdtempSync(path.join(projectScratchDir('test'), 'tt-work-lease-lifecycle-'));
}

function journalWithReceipt() {
  const request = pauseRequest();
  const receipt = pausedReceipt();
  const journal = lifecycle.attachLifecycleReceipt(
    lifecycle.attachLifecycleRequest(makeJournal(), 'renew', request),
    receipt
  );
  return { request, receipt, journal };
}

function committedReplayStore(receipt, observe = () => {}) {
  return {
    async replayMutation(selector) {
      observe(selector);
      return { selector, outcome: 'committed', statusCode: 200, result: receipt };
    },
  };
}

function clearJournal(sid, operationId, fencingToken, dir) {
  return sessionState.clearWorkLeaseLifecycleJournal(
    sid,
    operationId,
    authority.lease.leaseId,
    fencingToken,
    dir
  );
}

test('lifecycle journal starts before request attachment with stable authority and projections', () => {
  const journal = makeJournal();

  assert.equal(journal.schema, 1);
  assert.deepEqual(journal.authority, authority);
  assert.deepEqual(journal.projections, [
    {
      name: 'timing',
      projectionId: 'lifecycle:1054:pause:1:timing',
      input: { event: 'pause:other' },
      completed: false,
    },
    {
      name: 'session',
      projectionId: 'lifecycle:1054:pause:1:session',
      input: { paused: true },
      completed: false,
    },
  ]);
  assert.equal(Object.hasOwn(journal, 'request'), false);
  assert.equal(Object.hasOwn(journal, 'receipt'), false);
});

test('projection checkpoint is idempotent only for the exact prior proof', () => {
  const journal = makeJournal();
  const proof = { applied: true, remoteVersion: '7' };
  const withCheckpoint = lifecycle.checkpointLifecycleProjection(journal, 'timing', proof);
  const repeated = lifecycle.checkpointLifecycleProjection(withCheckpoint, 'timing', proof);

  assert.deepEqual(repeated, withCheckpoint);
  assert.equal(journal.projections[0].completed, false);
  assert.deepEqual(withCheckpoint.projections[0], {
    ...journal.projections[0],
    completed: true,
    proof,
  });
  assert.throws(
    () =>
      lifecycle.checkpointLifecycleProjection(withCheckpoint, 'timing', {
        applied: true,
        remoteVersion: '8',
      }),
    /checkpoint cannot be overwritten/
  );
});

test('request attachment is immutable and correlated to the persisted old authority', () => {
  const journal = makeJournal();
  const request = pauseRequest();
  const attached = lifecycle.attachLifecycleRequest(journal, 'renew', request);
  const repeated = lifecycle.attachLifecycleRequest(attached, 'renew', request);

  assert.deepEqual(repeated, attached);
  assert.equal(Object.hasOwn(journal, 'request'), false);
  assert.deepEqual(attached.request, {
    operation: 'renew',
    idempotencyKey: request.idempotencyKey,
    canonicalRequest: canonicalRequestJson(request),
  });
  assert.throws(
    () => lifecycle.attachLifecycleRequest(journal, 'renew', pauseRequest({ fencingToken: '42' })),
    /request does not match persisted authority/
  );
  assert.throws(
    () =>
      lifecycle.attachLifecycleRequest(
        attached,
        'renew',
        pauseRequest({ idempotencyKey: 'lifecycle:1054:pause:request:2' })
      ),
    /request cannot be overwritten/
  );
});

test('receipt attachment requires a request and is immutable', () => {
  const journal = makeJournal();
  const receipt = pausedReceipt();
  assert.throws(
    () => lifecycle.attachLifecycleReceipt(journal, receipt),
    /request must be attached before receipt/
  );

  const requested = lifecycle.attachLifecycleRequest(journal, 'renew', pauseRequest());
  const attached = lifecycle.attachLifecycleReceipt(requested, receipt);
  const repeated = lifecycle.attachLifecycleReceipt(attached, receipt);
  assert.deepEqual(repeated, attached);
  assert.equal(Object.hasOwn(requested, 'receipt'), false);
  assert.deepEqual(attached.receipt, receipt);
  assert.throws(
    () => lifecycle.attachLifecycleReceipt(attached, pausedReceipt({ audit: { changed: true } })),
    /receipt cannot be overwritten/
  );
});

test('only exact committed mutation replay mints a live cleanup proof', async () => {
  const { request, receipt, journal } = journalWithReceipt();
  let replayed;
  const proof = await lifecycle.authenticateLifecycleMutationCommit({
    journal,
    store: committedReplayStore(receipt, (selector) => {
      replayed = selector;
    }),
  });

  assert.deepEqual(replayed, {
    projectId: request.projectId,
    operation: 'renew',
    idempotencyKey: request.idempotencyKey,
    requestDigest: canonicalRequestDigest(request),
  });
  assert.deepEqual(JSON.parse(JSON.stringify(proof)), {});
  assert.equal(lifecycle.assertLifecycleMutationCommitAuthority(proof, journal), proof);
  assert.throws(
    () => lifecycle.assertLifecycleMutationCommitAuthority({}, journal),
    /live in-memory mutation commit proof/
  );
  await assert.rejects(
    () =>
      lifecycle.authenticateLifecycleMutationCommit({
        journal,
        store: {
          async replayMutation(selector) {
            return { selector, outcome: 'absent' };
          },
        },
      }),
    /exact committed receipt/
  );
});

test('session journal updates and cleanup require the exact operation and old fence', () => {
  const dir = sandbox();
  const previousSid = process.env.AI_TASK_MANAGER_SESSION_ID;
  process.env.AI_TASK_MANAGER_SESSION_ID = holder.sessionId;
  try {
    const sid = holder.sessionId;
    const journal = makeJournal();
    sessionState.setActiveTask(sid, { issue: '#1054', ...authority }, dir);
    sessionState.setWorkLeaseLifecycleJournal(sid, journal, dir);
    assert.throws(
      () =>
        sessionState.setActiveTask(
          sid,
          { issue: '#1054', workLeaseLifecycleJournal: { ...journal, action: 'stop' } },
          dir
        ),
      /generic session write cannot create or replace lifecycle journal/
    );
    sessionState.setActiveTask(sid, { issue: '#1054', wordsAtStart: 2 }, dir);
    assert.deepEqual(sessionState.getActiveTask(sid, dir).workLeaseLifecycleJournal, journal);
    assert.equal(
      sessionState.clearActiveTaskLease(
        sid,
        authority.lease.leaseId,
        authority.lease.fencingToken,
        dir
      ),
      false
    );
    assert.deepEqual(sessionState.getActiveTask(sid, dir).lease, authority.lease);

    const withCheckpoint = lifecycle.checkpointLifecycleProjection(journal, 'timing', {
      applied: true,
    });
    assert.throws(
      () =>
        sessionState.updateWorkLeaseLifecycleJournal(sid, 'wrong-operation', withCheckpoint, dir),
      /operation identity does not match/
    );
    assert.throws(
      () =>
        sessionState.updateWorkLeaseLifecycleJournal(
          sid,
          journal.operationId,
          { ...journal, action: 'stop' },
          dir
        ),
      /immutable fields cannot be overwritten/
    );
    sessionState.updateWorkLeaseLifecycleJournal(sid, journal.operationId, withCheckpoint, dir);
    assert.deepEqual(
      sessionState.getActiveTask(sid, dir).workLeaseLifecycleJournal,
      withCheckpoint
    );

    assert.equal(clearJournal(sid, 'wrong-operation', authority.lease.fencingToken, dir), false);
    assert.equal(clearJournal(sid, journal.operationId, '40', dir), false);
    assert.equal(clearJournal(sid, journal.operationId, authority.lease.fencingToken, dir), true);
    const cleared = sessionState.getActiveTask(sid, dir);
    for (const key of ['workLeaseLifecycleJournal', 'lease', 'holder', 'binding']) {
      assert.equal(cleared[key], undefined);
    }
    sessionState.setActiveTask(sid, { issue: '#1054', ...authority }, dir);
    sessionState.setWorkLeaseLifecycleJournal(sid, journal, dir);
    const activePath = sessionState.activeTaskPath(sid, dir);
    const journalOnly = JSON.parse(readFileSync(activePath, 'utf8'));
    for (const key of ['lease', 'holder', 'binding']) delete journalOnly[key];
    writeFileSync(activePath, `${JSON.stringify(journalOnly, null, 2)}\n`);
    saveState(
      { active: null, lastActive: '#1054', entryStartTs: null, wordsAtEntryStart: 0 },
      path.join(dir, '.tmp', 'aitm', 'state', 'task-tracker-state.json')
    );
    assert.deepEqual(sessionState.getActiveTask(sid, dir).workLeaseLifecycleJournal, journal);
  } finally {
    if (previousSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
    else process.env.AI_TASK_MANAGER_SESSION_ID = previousSid;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fenced cleanup invokes the session clear only under the live exact-replay proof', async () => {
  const { receipt, journal: incompleteJournal } = journalWithReceipt();
  const incompleteAuthority = await lifecycle.authenticateLifecycleMutationCommit({
    journal: incompleteJournal,
    store: committedReplayStore(receipt),
  });
  assert.throws(
    () =>
      lifecycle.completeLifecycleCleanup({
        journal: incompleteJournal,
        commitAuthority: incompleteAuthority,
        clear() {
          throw new Error('must not run');
        },
      }),
    /projections must be complete/
  );
  const journal = lifecycle.checkpointLifecycleProjection(
    lifecycle.checkpointLifecycleProjection(incompleteJournal, 'timing', { applied: true }),
    'session',
    { applied: true }
  );
  const commitAuthority = await lifecycle.authenticateLifecycleMutationCommit({
    journal,
    store: committedReplayStore(receipt),
  });
  let clearedWith;
  assert.equal(
    lifecycle.completeLifecycleCleanup({
      journal,
      commitAuthority,
      clear(expected) {
        clearedWith = expected;
        return true;
      },
    }),
    true
  );
  assert.deepEqual(clearedWith, {
    operationId: journal.operationId,
    leaseId: authority.lease.leaseId,
    fencingToken: authority.lease.fencingToken,
  });
  assert.throws(
    () =>
      lifecycle.completeLifecycleCleanup({
        journal,
        commitAuthority: {},
        clear() {
          throw new Error('must not run');
        },
      }),
    /live in-memory mutation commit proof/
  );
});

test('lifecycle journal refuses secret material in projection inputs', () => {
  assert.throws(
    () =>
      lifecycle.createLifecycleJournal({
        operationId: 'lifecycle:1054:pause:2',
        action: 'pause',
        issueId: '1054',
        authority,
        projections: [{ name: 'session', input: { authorization: 'Bearer secret' } }],
      }),
    /secret lease material is forbidden/
  );
});

test('lifecycle journal refuses duplicate projection identities', () => {
  assert.throws(
    () =>
      makeJournal({
        projections: [
          { name: 'session', input: { paused: true } },
          { name: 'session', input: { paused: false } },
        ],
      }),
    /projection names must be unique/
  );
});

test('lifecycle journal refuses unknown initial fields', () => {
  assert.throws(
    () => makeJournal({ request: pauseRequest() }),
    /initial input has an unknown shape/
  );
  assert.throws(
    () => lifecycle.normalizeLifecycleJournal({ ...makeJournal(), request: null }),
    /request must be an object/
  );
});
