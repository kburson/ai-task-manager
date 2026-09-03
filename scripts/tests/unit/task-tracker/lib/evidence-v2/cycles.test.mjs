// @story #1499
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { logicalRecordFixture } from '../../../../helpers/evidence-v2/logical-records.mjs';
import { createRecord } from '../../../../../task-tracker/lib/evidence-v2/codec.mjs';
import {
  projectCycle,
  planCycleOpen,
} from '../../../../../task-tracker/lib/evidence-v2/cycles.mjs';
import { hash } from '../../../../../task-tracker/lib/evidence-v2/value.mjs';

function completedFixture() {
  const f = logicalRecordFixture();
  const delivery = f.make(
    'delivery',
    {
      acceptanceId: hash('acceptance'),
      intentId: hash('intent'),
      candidateId: hash('candidate'),
      pr: {
        provider: 'github',
        id: 'PR_1',
        number: 1,
        repositoryId: f.repositoryId,
        baseRef: 'refs/heads/trunk',
        headRef: 'refs/heads/work',
      },
      expectedHeadSha: '1'.repeat(40),
      landedCommitSha: '2'.repeat(40),
      landedTreeOid: '3'.repeat(40),
      targetObservation: { ref: 'refs/heads/trunk', headSha: '2'.repeat(40) },
      contentVerification: {
        subjectId: hash('subject'),
        authorizedTreeOid: '3'.repeat(40),
        landedTreeOid: '3'.repeat(40),
        result: 'match',
      },
      methodObservation: { requested: 'squash', observed: 'squash', result: 'compliant' },
      transport: { provider: 'github', operationId: randomUUID(), result: 'merged' },
    },
    { predecessorId: f.cycle.recordId }
  );
  // The projector is tested independently from delivery reference validation.
  const started = f.make(
    'close-started',
    {
      deliveryId: delivery.recordId,
      acceptanceId: hash('acceptance'),
      closeTransactionId: randomUUID(),
      expectedCycleRevision: delivery.recordId,
      expectedBinding: {
        status: 'absent',
        repositoryId: f.repositoryId,
        issue: f.cycle.issueNumber,
        cycleId: f.cycle.cycleId,
        sid: null,
        worktreePath: null,
        bindingGenerationId: null,
      },
      effectOperationKeys: Object.fromEntries(
        [
          'timing',
          'estimation',
          'lifecycle',
          'board',
          'disposition',
          'issue',
          'labels',
          'cleanup',
        ].map((name) => [name, `${f.cycle.cycleId}:${name}`])
      ),
    },
    { predecessorId: delivery.recordId }
  );
  const completion = f.make(
    'cycle-completed',
    {
      closeStartedId: started.recordId,
      closeTransactionId: started.payload.closeTransactionId,
      finalObservation: { issue: 'closed', board: 'done', disposition: 'Delivered' },
    },
    { predecessorId: started.recordId }
  );
  return { ...f, delivery, started, completion };
}

test('projects an open cycle and keeps rebased candidates in that cycle', () => {
  const f = logicalRecordFixture();
  const second = f.make('candidate', f.candidate.payload, {
    operationId: randomUUID(),
    predecessorId: f.candidate.recordId,
  });
  const projected = projectCycle([f.cycle, f.candidate, second]);
  assert.equal(projected.current.cycleId, f.cycle.cycleId);
  assert.equal(projected.current.candidates.length, 2);
  assert.equal(projected.completedCycles.length, 0);
});

test('opens one correlated successor without retiring completed history', () => {
  const f = completedFixture();
  const operation = { operationId: randomUUID(), cycleId: randomUUID() };
  const planned = planCycleOpen({
    projection: projectCycle([f.cycle, f.delivery, f.started, f.completion], { validate: false }),
    reason: 'reopen',
    externalEvent: { id: 'github:event:42', state: 'REOPENED' },
    authority: { approved: true, hostId: f.authorityHostId },
    operation,
  });
  assert.equal(planned.cycleId, operation.cycleId);
  assert.equal(planned.payload.previousCycleId, f.cycle.cycleId);
  assert.equal(planned.payload.externalEventId, 'github:event:42');

  const reopened = createRecord({
    schema: 'aitm.evidence-record/v2',
    recordType: 'cycle-opened',
    repositoryId: f.repositoryId,
    issueNumber: f.cycle.issueNumber,
    cycleId: planned.cycleId,
    operationId: operation.operationId,
    predecessorId: f.completion.recordId,
    actor: { id: 'rehearsal-author', kind: 'user' },
    recordedAt: '2026-09-03T18:30:00.000Z',
    payload: planned.payload,
  });
  const projected = projectCycle([f.cycle, f.delivery, f.started, f.completion, reopened], {
    validate: false,
  });
  assert.equal(projected.current.cycleId, reopened.cycleId);
  assert.deepEqual(
    projected.completedCycles.map((cycle) => cycle.cycleId),
    [f.cycle.cycleId]
  );

  const duplicate = planCycleOpen({
    projection: projected,
    reason: 'reopen',
    externalEvent: { id: 'github:event:42', state: 'REOPENED' },
    authority: { approved: true, hostId: f.authorityHostId },
    operation,
  });
  assert.equal(duplicate.status, 'existing');
  assert.equal(duplicate.cycleId, reopened.cycleId);
});

test('refuses raw reopen drift, unapproved reopen, and forked successors', () => {
  const f = completedFixture();
  const projection = projectCycle([f.cycle, f.delivery, f.started, f.completion], {
    validate: false,
  });
  assert.throws(
    () =>
      planCycleOpen({
        projection,
        reason: 'reopen',
        externalEvent: { id: 'e', state: 'REOPENED' },
        authority: { approved: false, hostId: f.authorityHostId },
        operation: { operationId: randomUUID(), cycleId: randomUUID() },
      }),
    /cycle-open:authority/
  );
  assert.throws(
    () =>
      planCycleOpen({
        projection,
        reason: 'reopen',
        externalEvent: null,
        authority: { approved: true, hostId: f.authorityHostId },
        operation: { operationId: randomUUID(), cycleId: randomUUID() },
      }),
    /cycle-open:external-event/
  );
});
