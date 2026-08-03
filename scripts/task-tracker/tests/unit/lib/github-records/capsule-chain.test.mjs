// @story #1073
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createAitmRecordEnvelope } from '../../../../lib/github-records/record-envelope.mjs';
import {
  detectRecordFork,
  resolveSupersession,
  validateCapsuleChain,
} from '../../../../lib/github-records/capsule-chain.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1073;
const capsuleTypes = [
  'coordinator-grant',
  'coordinator-revocation',
  'work-assignment',
  'execution-result',
  'verification-evidence',
  'review-result',
  'record-disposition',
  'contract-sealed',
  'contract-amended',
  'lifecycle-transition',
  'handoff',
  'integration-result',
  'conflict-resolution',
  'repair-result',
];

function id(number) {
  return `01J0000000000000000000${String(number).padStart(4, '0')}`;
}

function capsule({
  recordId,
  recordType = 'verification-evidence',
  predecessor = null,
  supersedes = null,
  createdAt = '2026-08-03T20:00:00.000Z',
  repository: recordRepository = repository,
  issue: recordIssue = issue,
} = {}) {
  const envelope = createAitmRecordEnvelope({
    recordId,
    recordType,
    repository: recordRepository,
    issue: recordIssue,
    predecessor,
    supersedes,
    createdAt,
    actor: 'codex/session-1073',
    epoch: 1,
    grantId: id(9999),
    payload: { kind: recordType, result: recordId },
  });
  return Object.freeze({ commentNodeId: `IC_kwDOCapsule${recordId.slice(-4)}`, envelope });
}

test('all fourteen v1 capsule types validate through the common correlated envelope', () => {
  for (const [index, recordType] of capsuleTypes.entries()) {
    const record = capsule({ recordId: id(index + 1), recordType });
    const result = validateCapsuleChain({ records: [record], repository, issue });
    assert.deepEqual(result.records, [record]);
    assert.deepEqual(result.forks, []);
  }
});

test('chain validation rejects unknown types, correlation mismatches, duplicate IDs, and predecessor corruption', () => {
  const root = capsule({ recordId: id(1) });
  const successor = capsule({ recordId: id(2), predecessor: id(1) });
  const self = {
    ...successor,
    envelope: { ...successor.envelope, recordId: id(3), predecessor: id(3) },
  };
  const foreign = capsule({ recordId: id(4), repository: 'kburson/other' });
  const unknown = capsule({ recordId: id(5), recordType: 'unknown-capsule' });
  const missing = capsule({ recordId: id(6), predecessor: id(77) });
  const firstCycle = capsule({ recordId: id(7), predecessor: id(8) });
  const secondCycle = capsule({ recordId: id(8), predecessor: id(7) });

  for (const [records, error] of [
    [[unknown], /capsule-chain:record-type/],
    [[foreign], /capsule-chain:identity/],
    [[root, { ...root, commentNodeId: 'IC_kwDODuplicate' }], /capsule-chain:duplicate-record-id/],
    [[self], /capsule-chain:self-link/],
    [[missing], /capsule-chain:missing-predecessor/],
    [[firstCycle, secondCycle], /capsule-chain:predecessor-cycle/],
  ]) {
    assert.throws(() => validateCapsuleChain({ records, repository, issue }), error);
  }
});

test('non-empty chains require one root for validation and supersession resolution', () => {
  const firstRoot = capsule({ recordId: id(1) });
  const secondRoot = capsule({ recordId: id(2) });
  for (const operation of [validateCapsuleChain, resolveSupersession]) {
    assert.throws(
      () => operation({ records: [firstRoot, secondRoot], repository, issue }),
      /capsule-chain:multiple-roots/
    );
  }
  assert.deepEqual(validateCapsuleChain({ records: [], repository, issue }).records, []);
});

test('fork detection returns a blocked diagnostic without selecting the newer successor', () => {
  const root = capsule({ recordId: id(1) });
  const earlier = capsule({
    recordId: id(2),
    predecessor: id(1),
    createdAt: '2026-08-03T20:00:00.000Z',
  });
  const newer = capsule({
    recordId: id(3),
    predecessor: id(1),
    createdAt: '2026-08-03T21:00:00.000Z',
  });
  const records = [root, newer, earlier];

  assert.deepEqual(detectRecordFork({ records, repository, issue }), {
    status: 'blocked',
    predecessorRecordId: id(1),
    successorRecordIds: [id(2), id(3)],
  });
  assert.deepEqual(validateCapsuleChain({ records, repository, issue }).forks, [
    {
      status: 'blocked',
      predecessorRecordId: id(1),
      successorRecordIds: [id(2), id(3)],
    },
  ]);
});

test('supersession preserves immutable history and computes effective records', () => {
  const original = capsule({ recordId: id(1) });
  const correction = capsule({ recordId: id(2), predecessor: id(1), supersedes: id(1) });
  const result = resolveSupersession({ records: [original, correction], repository, issue });

  assert.deepEqual(result.records, [original, correction]);
  assert.deepEqual(result.effectiveRecords, [correction]);
  assert.deepEqual(result.supersededRecordIds, [id(1)]);
});

test('supersession resolution orders effective records by validated predecessor structure', () => {
  const first = capsule({ recordId: id(1) });
  const second = capsule({ recordId: id(2), predecessor: id(1) });
  const third = capsule({ recordId: id(3), predecessor: id(2) });
  const ordered = resolveSupersession({
    records: [first, second, third],
    repository,
    issue,
  });
  const reversed = resolveSupersession({
    records: [third, second, first],
    repository,
    issue,
  });

  assert.deepEqual(
    ordered.effectiveRecords.map((record) => record.envelope.recordId),
    [id(1), id(2), id(3)]
  );
  assert.deepEqual(
    reversed.effectiveRecords.map((record) => record.envelope.recordId),
    [id(1), id(2), id(3)]
  );
  assert.deepEqual(reversed.records, [third, second, first]);
});

test('supersession resolution blocks a predecessor fork instead of producing effective authority', () => {
  const root = capsule({ recordId: id(1) });
  const firstSuccessor = capsule({ recordId: id(2), predecessor: id(1) });
  const secondSuccessor = capsule({ recordId: id(3), predecessor: id(1) });

  assert.throws(
    () =>
      resolveSupersession({
        records: [root, firstSuccessor, secondSuccessor],
        repository,
        issue,
      }),
    /capsule-chain:fork/
  );
});

test('supersession rejects a future predecessor-chain descendant regardless of input order', () => {
  const root = capsule({ recordId: id(1) });
  const second = capsule({ recordId: id(2), predecessor: id(1), supersedes: id(3) });
  const third = capsule({ recordId: id(3), predecessor: id(2) });

  for (const records of [
    [root, second, third],
    [third, second, root],
  ]) {
    assert.throws(
      () => resolveSupersession({ records, repository, issue }),
      /capsule-chain:invalid-supersession-target/
    );
  }
});

test('supersession rejects missing, self, duplicate-active, incompatible, and cyclic targets', () => {
  const original = capsule({ recordId: id(1) });
  const missing = capsule({ recordId: id(2), predecessor: id(1), supersedes: id(88) });
  const self = {
    ...capsule({ recordId: id(3) }),
    envelope: { ...capsule({ recordId: id(3) }).envelope, supersedes: id(3) },
  };
  const first = capsule({ recordId: id(4), predecessor: id(1), supersedes: id(1) });
  const second = capsule({ recordId: id(5), predecessor: id(4), supersedes: id(1) });
  const incompatible = capsule({
    recordId: id(6),
    predecessor: id(1),
    supersedes: id(1),
    recordType: 'review-result',
  });
  const cycleFirst = capsule({ recordId: id(7), predecessor: id(1), supersedes: id(8) });
  const cycleSecond = capsule({ recordId: id(8), predecessor: id(7), supersedes: id(7) });

  for (const [records, error] of [
    [[original, missing], /capsule-chain:missing-supersedes/],
    [[self], /capsule-chain:self-supersedes/],
    [[original, first, second], /capsule-chain:multiple-superseding-records/],
    [[original, incompatible], /capsule-chain:incompatible-supersession/],
    [[original, cycleFirst, cycleSecond], /capsule-chain:supersession-cycle/],
  ]) {
    assert.throws(() => resolveSupersession({ records, repository, issue }), error);
  }
});

test('chain validation rejects opaque durable containers without invoking their accessors', () => {
  const valid = capsule({ recordId: id(1) });
  const accessorEnvelope = { ...valid.envelope };
  Object.defineProperty(accessorEnvelope, 'payload', {
    enumerable: true,
    get: () => {
      throw new Error('must not read');
    },
  });
  for (const records of [
    [new Map()],
    [{ ...valid, envelope: { ...valid.envelope, payload: new Map() } }],
    [{ ...valid, envelope: accessorEnvelope }],
  ]) {
    assert.throws(
      () => validateCapsuleChain({ records, repository, issue }),
      /capsule-chain:record/
    );
  }
});
