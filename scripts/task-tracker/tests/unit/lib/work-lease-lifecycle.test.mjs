// @story #1054

import assert from 'node:assert/strict';
import { canonicalRequestDigest, canonicalRequestJson } from '@kburson/aitm-ledger';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  authority,
  committedReplayStore,
  holder,
  journalWithReceipt,
  lifecycle,
  makeJournal,
  pauseRequest,
  pausedReceipt,
  readyJournal,
} from '../../helpers/work-lease-lifecycle-fixtures.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import * as sessionState from '../../../session-state.mjs';
import { saveState } from '../../../state.mjs';

function sandbox() {
  return mkdtempSync(path.join(projectScratchDir('test'), 'tt-work-lease-lifecycle-'));
}

function clearJournal(sid, journal, dir) {
  return sessionState.clearWorkLeaseLifecycleJournal(sid, journal, dir);
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
  assert.throws(
    () => lifecycle.checkpointLifecycleProjection(journal, 'session', proof),
    /prior projections must be complete/
  );
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
  assert.throws(
    () => lifecycle.attachLifecycleRequest(journal, 'renew', request),
    /projections must be complete before request attachment/
  );
  const ready = readyJournal();
  const attached = lifecycle.attachLifecycleRequest(ready, 'renew', request);
  const repeated = lifecycle.attachLifecycleRequest(attached, 'renew', request);

  assert.deepEqual(repeated, attached);
  assert.equal(Object.hasOwn(ready, 'request'), false);
  assert.deepEqual(attached.request, {
    operation: 'renew',
    idempotencyKey: request.idempotencyKey,
    canonicalRequest: canonicalRequestJson(request),
  });
  assert.throws(
    () => lifecycle.attachLifecycleRequest(ready, 'renew', pauseRequest({ fencingToken: '42' })),
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

  const requested = lifecycle.attachLifecycleRequest(readyJournal(), 'renew', pauseRequest());
  const attached = lifecycle.attachLifecycleReceipt(requested, receipt);
  const repeated = lifecycle.attachLifecycleReceipt(attached, receipt);
  assert.deepEqual(repeated, attached);
  assert.equal(Object.hasOwn(requested, 'receipt'), false);
  assert.deepEqual(attached.receipt, receipt);
  assert.throws(
    () =>
      lifecycle.attachLifecycleReceipt(
        requested,
        pausedReceipt({ issueId: '9999', leaseId: 'other-lease', fencingToken: '999' })
      ),
    /does not match the request/
  );
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
    assert.throws(
      () => sessionState.setWorkLeaseLifecycleJournal(sid, journalWithReceipt().journal, dir),
      /initial journal must be request-free and incomplete/
    );
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
    const preserved = sessionState.getActiveTask(sid, dir);
    assert.deepEqual(preserved.workLeaseLifecycleJournal, journal);
    assert.deepEqual(
      { lease: preserved.lease, holder: preserved.holder, binding: preserved.binding },
      authority
    );
    assert.throws(
      () => sessionState.setActiveTask(sid, { issue: '#9999', wordsAtStart: 3 }, dir),
      /cannot switch issue while lifecycle journal is active/
    );
    assert.deepEqual(sessionState.getActiveTask(sid, dir), preserved);
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

    const readyDetached = lifecycle.checkpointLifecycleProjection(withCheckpoint, 'session', {
      applied: true,
    });
    const requestedDetached = lifecycle.attachLifecycleRequest(
      readyDetached,
      'renew',
      pauseRequest()
    );
    const completedDetached = lifecycle.attachLifecycleReceipt(requestedDetached, pausedReceipt());
    assert.equal(clearJournal(sid, completedDetached, dir), false);
    assert.deepEqual(
      sessionState.getActiveTask(sid, dir).workLeaseLifecycleJournal,
      withCheckpoint
    );
    sessionState.updateWorkLeaseLifecycleJournal(sid, journal.operationId, readyDetached, dir);
    sessionState.updateWorkLeaseLifecycleJournal(sid, journal.operationId, requestedDetached, dir);
    sessionState.updateWorkLeaseLifecycleJournal(sid, journal.operationId, completedDetached, dir);
    assert.equal(clearJournal(sid, { ...completedDetached, action: 'stop' }, dir), false);
    assert.equal(clearJournal(sid, completedDetached, dir), true);
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
  const { receipt, journal } = journalWithReceipt();
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
    journal,
    operationId: journal.operationId,
    leaseId: authority.lease.leaseId,
    fencingToken: authority.lease.fencingToken,
  });
  assert.throws(
    () =>
      lifecycle.completeLifecycleCleanup({
        journal: { ...journal, action: 'stop' },
        commitAuthority,
        clear() {
          throw new Error('must not run');
        },
      }),
    /proof does not match/
  );
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
