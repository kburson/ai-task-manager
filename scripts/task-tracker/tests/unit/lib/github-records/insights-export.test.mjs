// @story #1087

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  exportInsightsRecordSet,
  mergeInsightsRecordSets,
} from '../../../../lib/github-records/insights-export.mjs';
import {
  createDraftContract,
  projectContractLifecycle,
  sealContract,
} from '../../../../lib/github-records/delivery-contract.mjs';
import { createIssueDirectory } from '../../../../lib/github-records/issue-directory.mjs';
import {
  createAitmRecordEnvelope,
  hashRecordPayload,
} from '../../../../lib/github-records/record-envelope.mjs';
import { buildEvidenceProjection } from '../../../../lib/github-records/singleton-projections.mjs';

const fixtureUrl = new URL(
  '../../../fixtures/github-records/insights-record-set.json',
  import.meta.url
);
const guideUrl = new URL(
  '../../../../../../docs/guides/github-records-insights-ingestion.md',
  import.meta.url
);

const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
const { repository, issue, comments, recordIds, instants } = fixture;
const actor = 'codex/story-1087';

function envelope({ recordId, payload, recordType = 'singleton-projection', createdAt }) {
  return createAitmRecordEnvelope({
    repository: repository.nameWithOwner,
    issue: issue.number,
    recordType,
    payload,
    actor,
    epoch: 1,
    grantId: recordIds.grant,
    recordId,
    createdAt,
  });
}

function observation(commentNodeId, recordEnvelope, updatedAt) {
  return { commentNodeId, updatedAt, envelope: recordEnvelope };
}

function buildFixturePages() {
  const contract = sealContract({
    contract: createDraftContract({
      recordId: recordIds['delivery-contract'],
      authorityEpoch: 1,
      coordinatorGrantId: recordIds.grant,
      acceptanceCriteria: [{ logicalId: 'ac-1', text: 'Export deterministic records.' }],
      verificationCommands: [{ logicalId: 'vc-1', command: 'npm test' }],
      definitionOfDone: [{ logicalId: 'dod-1', text: 'Verification passes.' }],
    }),
    authorityEpoch: 1,
    coordinatorGrantId: recordIds.grant,
  }).contract;
  const acceptedContract = projectContractLifecycle({
    contract,
    kind: 'acceptanceCriteria',
    logicalId: 'ac-1',
    checked: true,
    acceptedRecordId: recordIds.submission,
  });
  const placeholder = (kind) => ({
    schema: 'aitm.singleton/v1',
    kind,
    logicalId: `aitm.singleton/v1:${repository.nameWithOwner}#${issue.number}:${kind}`,
  });
  const initialEvidence = buildEvidenceProjection({
    revision: 1,
    contractEpoch: 1,
    acceptedRecords: [],
  });
  const correctedEvidence = buildEvidenceProjection({
    revision: 2,
    contractEpoch: 1,
    acceptedRecords: [
      {
        recordId: recordIds.submission,
        recordType: 'verification-submitted',
        logicalId: 'ac-1',
        createdAt: instants.corrected,
      },
    ],
  });
  const initialContractRecord = observation(
    comments['delivery-contract'],
    envelope({
      recordId: recordIds['delivery-contract'],
      payload: contract,
      createdAt: instants.initial,
    }),
    instants.initial
  );
  const correctedContractRecord = observation(
    comments['delivery-contract'],
    envelope({
      recordId: recordIds['delivery-contract'],
      payload: acceptedContract,
      createdAt: instants.corrected,
    }),
    instants.corrected
  );
  const coordinationRecord = observation(
    comments.coordination,
    envelope({
      recordId: recordIds.coordination,
      payload: placeholder('coordination'),
      createdAt: instants.initial,
    }),
    instants.initial
  );
  const initialEvidenceRecord = observation(
    comments['evidence-projection'],
    envelope({
      recordId: recordIds['evidence-projection'],
      payload: initialEvidence,
      createdAt: instants.initial,
    }),
    instants.initial
  );
  const correctedEvidenceRecord = observation(
    comments['evidence-projection'],
    envelope({
      recordId: recordIds['evidence-projection'],
      payload: correctedEvidence,
      createdAt: instants.corrected,
    }),
    instants.corrected
  );
  const timingRecord = observation(
    comments.timing,
    envelope({
      recordId: recordIds.timing,
      payload: placeholder('timing'),
      createdAt: instants.initial,
    }),
    instants.initial
  );
  const submissionRecord = observation(
    comments.submission,
    envelope({
      recordId: recordIds.submission,
      payload: { schema: 'aitm.verification-submission/v1', logicalId: 'ac-1' },
      recordType: 'verification-submitted',
      createdAt: instants.corrected,
    }),
    instants.corrected
  );
  const directory = {
    issueNodeId: issue.issueNodeId,
    updatedAt: instants.initial,
    directory: createIssueDirectory({
      issueNodeId: issue.issueNodeId,
      singletons: {
        'delivery-contract': comments['delivery-contract'],
        coordination: comments.coordination,
        'evidence-projection': comments['evidence-projection'],
        timing: comments.timing,
      },
    }),
  };
  const repositoryInitial = { ...repository, updatedAt: instants.initial };
  const repositoryFinal = { ...repository, updatedAt: instants.corrected };
  const issueInitial = {
    ...issue,
    repositoryNodeId: repository.repositoryNodeId,
    updatedAt: instants.initial,
  };
  const issueFinal = { ...issueInitial, updatedAt: instants.corrected };
  const contractEntry = (record, payload) => ({
    issueNodeId: issue.issueNodeId,
    commentNodeId: comments['delivery-contract'],
    updatedAt: record.updatedAt,
    payloadHash: hashRecordPayload(payload),
    contract: payload,
  });
  const projectionEntry = (record, projection) => ({
    issueNodeId: issue.issueNodeId,
    kind: 'evidence-projection',
    commentNodeId: comments['evidence-projection'],
    updatedAt: record.updatedAt,
    payloadHash: hashRecordPayload(projection),
    projection,
  });
  const cursor = (updatedAt) => ({
    repositoryNodeId: repository.repositoryNodeId,
    issuesUpdatedAt: updatedAt,
    commentsUpdatedAt: updatedAt,
    overlapSeconds: 120,
  });
  const base = {
    repositories: [repositoryInitial],
    issues: [issueInitial],
    directories: [directory],
    contracts: [contractEntry(initialContractRecord, contract)],
    records: [initialContractRecord, coordinationRecord, initialEvidenceRecord, timingRecord],
    projections: [projectionEntry(initialEvidenceRecord, initialEvidence)],
    cursorHints: [cursor(instants.initial)],
  };
  const overlap = {
    repositories: [repositoryInitial, repositoryFinal],
    issues: [issueInitial, issueFinal],
    directories: [directory],
    contracts: [
      contractEntry(initialContractRecord, contract),
      contractEntry(correctedContractRecord, acceptedContract),
    ],
    records: [
      initialContractRecord,
      correctedContractRecord,
      initialEvidenceRecord,
      correctedEvidenceRecord,
      submissionRecord,
    ],
    projections: [
      projectionEntry(initialEvidenceRecord, initialEvidence),
      projectionEntry(correctedEvidenceRecord, correctedEvidence),
    ],
    cursorHints: [cursor(instants.initial), cursor(instants.corrected)],
  };
  const full = {
    repositories: [repositoryFinal],
    issues: [issueFinal],
    directories: [directory],
    contracts: [contractEntry(correctedContractRecord, acceptedContract)],
    records: [
      correctedContractRecord,
      coordinationRecord,
      correctedEvidenceRecord,
      timingRecord,
      submissionRecord,
    ],
    projections: [projectionEntry(correctedEvidenceRecord, correctedEvidence)],
    cursorHints: [cursor(instants.corrected)],
  };
  return { base, overlap, full };
}

test('exports all seven deterministic Insights collections with validated record hashes', () => {
  const { full } = buildFixturePages();
  const exported = exportInsightsRecordSet(full);

  assert.equal(exported.schema, 'aitm.insights-record-set/v1');
  for (const [collection, count] of Object.entries(fixture.expectedCounts)) {
    assert.equal(exported[collection].length, count, collection);
  }
  const reversed = Object.fromEntries(
    Object.entries(full).map(([key, values]) => [key, [...values].reverse()])
  );
  assert.deepEqual(exportInsightsRecordSet(reversed), exported);
});

test('overlapping incremental pages retain corrections and new accepted records', () => {
  const { base, overlap } = buildFixturePages();
  const merged = mergeInsightsRecordSets(exportInsightsRecordSet(base), overlap);

  assert.equal(merged.contracts[0].contract.revision, 2);
  assert.deepEqual(merged.contracts[0].contract.acceptedRecordIds, [recordIds.submission]);
  assert.ok(merged.records.some(({ envelope: item }) => item.recordId === recordIds.submission));
  assert.equal(merged.projections[0].projection.revision, 2);
});

test('full rebuild and incremental materialization produce the same canonical read model', () => {
  const { base, overlap, full } = buildFixturePages();
  const incremental = mergeInsightsRecordSets(exportInsightsRecordSet(base), overlap);

  assert.deepEqual(incremental, exportInsightsRecordSet(full));
});

test('equal-time conflicts and duplicate record identities fail closed', () => {
  const { full } = buildFixturePages();
  assert.throws(
    () =>
      exportInsightsRecordSet({
        ...full,
        repositories: [
          ...full.repositories,
          { ...full.repositories[0], nameWithOwner: 'kburson/conflict' },
        ],
      }),
    /insights-export:conflict/
  );
  assert.throws(
    () =>
      exportInsightsRecordSet({
        ...full,
        records: [
          ...full.records,
          { ...full.records[0], commentNodeId: 'IC_kwDOConflictingRecordIdentity' },
        ],
      }),
    /insights-export:record-id/
  );
  const renamedSubmission = observation(
    comments.submission,
    envelope({
      recordId: '01000000000000000000000007',
      payload: { schema: 'aitm.verification-submission/v1', logicalId: 'ac-1' },
      recordType: 'verification-submitted',
      createdAt: '2026-08-08T14:03:00.000Z',
    }),
    '2026-08-08T14:03:00.000Z'
  );
  assert.throws(
    () =>
      exportInsightsRecordSet({
        ...full,
        records: [...full.records, renamedSubmission],
      }),
    /insights-export:record-id/
  );
  assert.throws(
    () =>
      exportInsightsRecordSet({
        ...full,
        records: full.records.filter(
          ({ envelope: item }) => item.recordId !== recordIds.submission
        ),
      }),
    /insights-export:accepted-record-reference/
  );
});

test('the IndexedDB ingestion guide makes browser state explicitly non-authoritative', async () => {
  const guide = await readFile(guideUrl, 'utf8');
  assert.match(guide, /IndexedDB cannot satisfy any AITM gate/i);
  assert.match(guide, /delete.*IndexedDB.*full rebuild/is);
  assert.match(guide, /cursor.*optimization.*not proof/is);
});
