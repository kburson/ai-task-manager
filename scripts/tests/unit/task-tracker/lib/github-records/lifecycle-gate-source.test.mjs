// @story #1083
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  projectLifecycleGateEvidence,
  resolveLifecycleGateEvidence,
} from '../../../../../task-tracker/lib/github-records/lifecycle-gate-source.mjs';
import { createAitmRecordEnvelope } from '../../../../../task-tracker/lib/github-records/record-envelope.mjs';
import {
  capsule,
  grantId,
  id,
  issue,
  repository,
} from '../../../../helpers/github-record-lifecycle-fixtures.mjs';

const commitSha = 'a'.repeat(40);

function directorySource(acceptedRecordIds, authorityOverrides = {}) {
  return Object.freeze({
    sourceKind: 'github-records/v1',
    contract: Object.freeze({ acceptedRecordIds: Object.freeze([...acceptedRecordIds]) }),
    authority: Object.freeze({
      contractRecordId: id(100),
      contractEpoch: 2,
      authorityEpoch: 1,
      coordinatorGrantId: grantId,
      commentNodeId: 'IC_kwDOContract',
      ...authorityOverrides,
    }),
  });
}

test('projects accepted exact-SHA directory evidence with explicit provenance', () => {
  const evidence = capsule({
    recordId: id(1),
    recordType: 'verification-evidence',
    payload: {
      schema: 'aitm.lifecycle-evidence/v1',
      evidenceKind: 'test',
      contractEpoch: 2,
      commitSha,
      result: 'passed',
      provenance: 'agent',
    },
  });

  const projected = projectLifecycleGateEvidence({
    repository,
    issue,
    contractSource: directorySource([evidence.envelope.recordId]),
    records: [evidence],
    expectedSha: commitSha,
  });

  assert.deepEqual(projected, {
    sourceKind: 'github-records/v1',
    expectedSha: commitSha,
    evidence: [
      {
        recordId: evidence.envelope.recordId,
        recordType: 'verification-evidence',
        evidenceKind: 'test',
        result: 'passed',
        contractEpoch: 2,
        commitSha,
        provenance: 'agent',
        authority: { grantId, epoch: 1, actor: 'codex' },
      },
    ],
    acceptedRecordIds: [evidence.envelope.recordId],
    authority: directorySource([]).authority,
  });
  assert.equal(Object.isFrozen(projected), true);
  assert.equal(Object.isFrozen(projected.evidence), true);
  assert.equal(Object.isFrozen(projected.evidence[0].authority), true);
});

test('returns the same immutable projection shape for legacy-body issues', () => {
  const projected = projectLifecycleGateEvidence({
    repository,
    issue,
    contractSource: Object.freeze({
      sourceKind: 'legacy-body/v1',
      contract: Object.freeze({ acceptedRecordIds: Object.freeze([]) }),
      authority: null,
    }),
    records: [],
    expectedSha: commitSha,
  });

  assert.deepEqual(projected, {
    sourceKind: 'legacy-body/v1',
    expectedSha: commitSha,
    evidence: [],
    acceptedRecordIds: [],
    authority: null,
  });
  assert.equal(Object.isFrozen(projected), true);
});

test('preserves human and Full-Auto approval provenance without conflating them', () => {
  const projections = ['human', 'full-auto'].map((provenance, index) => {
    const evidence = capsule({
      recordId: id(10 + index),
      recordType: 'review-result',
      payload: {
        schema: 'aitm.lifecycle-evidence/v1',
        evidenceKind: 'approval',
        contractEpoch: 2,
        commitSha,
        result: 'approved',
        provenance,
      },
    });
    return projectLifecycleGateEvidence({
      repository,
      issue,
      contractSource: directorySource([evidence.envelope.recordId]),
      records: [evidence],
      expectedSha: commitSha,
    }).evidence[0];
  });

  assert.deepEqual(
    projections.map(({ provenance }) => provenance),
    ['human', 'full-auto']
  );
  assert.equal(projections[0].recordType, 'review-result');
  assert.equal(projections[1].recordType, 'review-result');
});

test('rejects accepted evidence bound to a stale epoch, wrong SHA, or stale authority', () => {
  const cases = [
    {
      name: 'contract epoch',
      payload: { contractEpoch: 1, commitSha },
      authority: {},
      category: 'contract-epoch',
    },
    {
      name: 'commit SHA',
      payload: { contractEpoch: 2, commitSha: 'b'.repeat(40) },
      authority: {},
      category: 'sha',
    },
    {
      name: 'coordinator authority',
      payload: { contractEpoch: 2, commitSha },
      authority: { authorityEpoch: 2 },
      category: 'authority',
    },
  ];

  for (const entry of cases) {
    const evidence = capsule({
      recordId: id(20 + cases.indexOf(entry)),
      recordType: 'verification-evidence',
      payload: {
        schema: 'aitm.lifecycle-evidence/v1',
        evidenceKind: 'test',
        result: 'passed',
        provenance: 'agent',
        ...entry.payload,
      },
    });
    assert.throws(
      () =>
        projectLifecycleGateEvidence({
          repository,
          issue,
          contractSource: directorySource([evidence.envelope.recordId], entry.authority),
          records: [evidence],
          expectedSha: commitSha,
        }),
      new RegExp(`lifecycle-gate-source:${entry.category}`),
      entry.name
    );
  }
});

test('distinguishes missing, superseded, and malformed accepted records', () => {
  const payload = {
    schema: 'aitm.lifecycle-evidence/v1',
    evidenceKind: 'test',
    contractEpoch: 2,
    commitSha,
    result: 'passed',
    provenance: 'agent',
  };
  const root = capsule({ recordId: id(30), recordType: 'verification-evidence', payload });
  const replacement = Object.freeze({
    commentNodeId: 'IC_kwDOCapsule0031',
    envelope: createAitmRecordEnvelope({
      recordId: id(31),
      recordType: 'verification-evidence',
      repository,
      issue,
      payload,
      actor: 'codex',
      epoch: 1,
      grantId,
      predecessor: root.envelope.recordId,
      supersedes: root.envelope.recordId,
      createdAt: '2026-08-05T11:01:00.000Z',
    }),
  });
  const malformed = capsule({
    recordId: id(32),
    recordType: 'verification-evidence',
    payload: { ...payload, unexpected: true },
  });

  assert.throws(
    () =>
      projectLifecycleGateEvidence({
        repository,
        issue,
        contractSource: directorySource([id(99)]),
        records: [],
        expectedSha: commitSha,
      }),
    /lifecycle-gate-source:accepted-record-missing/
  );
  assert.throws(
    () =>
      projectLifecycleGateEvidence({
        repository,
        issue,
        contractSource: directorySource([root.envelope.recordId]),
        records: [root, replacement],
        expectedSha: commitSha,
      }),
    /lifecycle-gate-source:accepted-record-superseded/
  );
  assert.throws(
    () =>
      projectLifecycleGateEvidence({
        repository,
        issue,
        contractSource: directorySource([malformed.envelope.recordId]),
        records: [malformed],
        expectedSha: commitSha,
      }),
    /lifecycle-gate-source:evidence/
  );
});

test('resolves contract and accepted capsules while ignoring non-capsule records', async () => {
  const evidence = capsule({
    recordId: id(40),
    recordType: 'verification-evidence',
    payload: {
      schema: 'aitm.lifecycle-evidence/v1',
      evidenceKind: 'test',
      contractEpoch: 2,
      commitSha,
      result: 'passed',
      provenance: 'agent',
    },
  });
  const projected = await resolveLifecycleGateEvidence({
    repository,
    issue,
    issueBody: 'directory body',
    expectedSha: commitSha,
    deps: {
      async resolveContractSource() {
        return directorySource([evidence.envelope.recordId]);
      },
      async listIssueRecords() {
        return [evidence, { envelope: { recordType: 'estimation-forecast' } }];
      },
    },
  });
  assert.deepEqual(
    projected.evidence.map(({ recordId }) => recordId),
    [evidence.envelope.recordId]
  );

  await assert.rejects(
    resolveLifecycleGateEvidence({
      repository,
      issue,
      issueBody: 'directory body',
      expectedSha: commitSha,
      deps: {
        async resolveContractSource() {
          return directorySource([evidence.envelope.recordId]);
        },
        async listIssueRecords() {
          throw new Error('offline');
        },
      },
    }),
    /lifecycle-gate-source:unavailable/
  );
});

test('keeps unrelated accepted capsules out of lifecycle evidence without rejecting them', () => {
  const assignment = capsule({
    recordId: id(50),
    recordType: 'work-assignment',
    payload: { kind: 'assignment' },
  });
  const evidence = capsule({
    recordId: id(51),
    predecessor: assignment.envelope.recordId,
    recordType: 'verification-evidence',
    payload: {
      schema: 'aitm.lifecycle-evidence/v1',
      evidenceKind: 'test',
      contractEpoch: 2,
      commitSha,
      result: 'passed',
      provenance: 'agent',
    },
  });
  const acceptedRecordIds = [assignment.envelope.recordId, evidence.envelope.recordId];

  const projected = projectLifecycleGateEvidence({
    repository,
    issue,
    contractSource: directorySource(acceptedRecordIds),
    records: [assignment, evidence],
    expectedSha: commitSha,
  });

  assert.deepEqual(projected.acceptedRecordIds, acceptedRecordIds);
  assert.deepEqual(
    projected.evidence.map(({ recordId }) => recordId),
    [evidence.envelope.recordId]
  );
});
