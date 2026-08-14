#!/usr/bin/env node
// @story #1084

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  executeContractWrite,
  planContractWrite,
  writeDirectoryContractOperation,
} from '../../../../task-tracker/lib/github-records/contract-write.mjs';
import { createDraftContract } from '../../../../task-tracker/lib/github-records/delivery-contract.mjs';
import {
  createIssueDirectory,
  renderIssueDirectory,
} from '../../../../task-tracker/lib/github-records/issue-directory.mjs';
import { parseAitmRecord } from '../../../../task-tracker/lib/github-records/record-envelope.mjs';

const IDS = {
  contract: '01KZ0000000000000000000001',
  grant: '01KZ0000000000000000000002',
  check: '01KZ0000000000000000000003',
  seal: '01KZ0000000000000000000004',
  invalidate: '01KZ0000000000000000000005',
};

function draftContract() {
  return createDraftContract({
    recordId: IDS.contract,
    authorityEpoch: 3,
    coordinatorGrantId: IDS.grant,
    acceptanceCriteria: [{ logicalId: 'ac-1', text: 'Directory writes avoid the body' }],
    verificationCommands: [{ logicalId: 'vc-1', command: 'npm test' }],
    definitionOfDone: [{ logicalId: 'dod-tests', text: 'All tests pass' }],
  });
}

function directoryBody() {
  return renderIssueDirectory(
    createIssueDirectory({
      issueNodeId: 'ISSUE_1084',
      singletons: {
        'delivery-contract': 'CONTRACT_COMMENT',
        coordination: 'COORDINATION_COMMENT',
        'evidence-projection': 'EVIDENCE_COMMENT',
        timing: 'TIMING_COMMENT',
      },
    })
  );
}

function fakeDirectoryStore(initialContract = draftContract()) {
  let contract = initialContract;
  const records = [];
  let projectionWrites = 0;
  return {
    records,
    get contract() {
      return contract;
    },
    get projectionWrites() {
      return projectionWrites;
    },
    deps: {
      readContractRecord: async () => ({ envelope: { payload: contract } }),
      listRecords: async () => [...records],
      createIssueComment: async ({ body }) => {
        const commentNodeId = `COMMENT_${records.length + 1}`;
        records.push({
          ...parseAitmRecord({
            commentNodeId,
            body,
            expectedRepository: 'owner/repo',
            expectedIssue: 1084,
          }),
          body,
        });
        return { commentNodeId };
      },
      readBackComment: async ({ commentNodeId }) =>
        records.find((record) => record.commentNodeId === commentNodeId),
      updateProjection: async ({ contract: next }) => {
        projectionWrites += 1;
        contract = next;
      },
    },
  };
}

test('legacy bodies stay on their body lane while directory checks only update records', async () => {
  const legacy = await writeDirectoryContractOperation({
    repository: 'owner/repo',
    issue: 1084,
    issueBody: 'legacy issue body',
    action: 'set-check',
    kind: 'acceptanceCriteria',
    label: 'Directory writes avoid the body',
  });
  assert.equal(legacy.status, 'legacy');

  const store = fakeDirectoryStore();
  const result = await writeDirectoryContractOperation({
    repository: 'owner/repo',
    issue: 1084,
    issueBody: directoryBody(),
    action: 'set-check',
    kind: 'acceptanceCriteria',
    label: 'Directory writes avoid the body',
    deps: store.deps,
  });
  assert.equal(result.status, 'directory-written');
  assert.equal(store.records.length, 1);
  assert.equal(store.contract.lifecycleProjection.acceptanceCriteria['ac-1'], true);
  assert.equal(store.projectionWrites, 1);
});

test('an interrupted append replays by repairing projection without a duplicate capsule', async () => {
  const store = fakeDirectoryStore();
  await assert.rejects(
    () =>
      writeDirectoryContractOperation({
        repository: 'owner/repo',
        issue: 1084,
        issueBody: directoryBody(),
        action: 'record-evidence',
        kind: 'definitionOfDone',
        logicalId: 'dod-tests',
        evidence: { result: 'passed', sha: 'a'.repeat(40) },
        crashAt: ({ phase }) => {
          if (phase === 'after-capsule') throw new Error('simulated interruption');
        },
        deps: store.deps,
      }),
    /simulated interruption/
  );
  assert.equal(store.records.length, 1);
  assert.equal(store.projectionWrites, 0);

  const repaired = await writeDirectoryContractOperation({
    repository: 'owner/repo',
    issue: 1084,
    issueBody: directoryBody(),
    action: 'record-evidence',
    kind: 'definitionOfDone',
    logicalId: 'dod-tests',
    evidence: { result: 'passed', sha: 'a'.repeat(40) },
    deps: store.deps,
  });
  assert.equal(repaired.replayed, true);
  assert.equal(store.records.length, 1);
  assert.equal(store.contract.lifecycleProjection.definitionOfDone['dod-tests'], true);
});

test('an interruption after projection replays without another capsule or projection write', async () => {
  const store = fakeDirectoryStore();
  await assert.rejects(
    () =>
      writeDirectoryContractOperation({
        repository: 'owner/repo',
        issue: 1084,
        issueBody: directoryBody(),
        action: 'set-check',
        kind: 'acceptanceCriteria',
        logicalId: 'ac-1',
        crashAt: ({ phase }) => {
          if (phase === 'after-projection') throw new Error('projection interruption');
        },
        deps: store.deps,
      }),
    /projection interruption/
  );
  assert.equal(store.records.length, 1);
  assert.equal(store.projectionWrites, 1);
  const replayed = await writeDirectoryContractOperation({
    repository: 'owner/repo',
    issue: 1084,
    issueBody: directoryBody(),
    action: 'set-check',
    kind: 'acceptanceCriteria',
    logicalId: 'ac-1',
    deps: store.deps,
  });
  assert.equal(replayed.replayed, true);
  assert.equal(store.records.length, 1);
  assert.equal(store.projectionWrites, 1);
});

test('a stale writer cannot overwrite a newer contract revision or epoch', async () => {
  const contract = draftContract();
  const plan = planContractWrite({
    repository: 'owner/repo',
    issue: 1084,
    contract,
    action: 'set-check',
    kind: 'acceptanceCriteria',
    logicalId: 'ac-1',
    recordId: IDS.check,
  });
  const newer = { ...contract, revision: contract.revision + 1 };
  await assert.rejects(
    () =>
      executeContractWrite({
        plan,
        deps: {
          appendRecord: async ({ envelope }) => ({ envelope }),
          readProjection: async () => newer,
          updateProjection: async () => assert.fail('stale projection must not be written'),
        },
      }),
    /contract-write:stale-contract/
  );
});

test('Plan sealing and demotion invalidation preserve authority and reset old proof', async () => {
  let current = draftContract();
  const projection = {
    value: current,
    async readProjection() {
      return this.value;
    },
    async updateProjection({ contract }) {
      this.value = contract;
    },
    async appendRecord({ envelope }) {
      return { envelope };
    },
  };
  const seal = planContractWrite({
    repository: 'owner/repo',
    issue: 1084,
    contract: current,
    action: 'seal',
    recordId: IDS.seal,
  });
  await executeContractWrite({ plan: seal, deps: projection });
  current = projection.value;
  assert.equal(current.status, 'sealed');

  const checked = planContractWrite({
    repository: 'owner/repo',
    issue: 1084,
    contract: current,
    action: 'set-check',
    kind: 'acceptanceCriteria',
    logicalId: 'ac-1',
    recordId: IDS.check,
  });
  await executeContractWrite({ plan: checked, deps: projection });
  current = projection.value;
  assert.equal(current.acceptedRecordIds.length, 1);

  const invalidate = planContractWrite({
    repository: 'owner/repo',
    issue: 1084,
    contract: current,
    action: 'invalidate',
    recordId: IDS.invalidate,
  });
  await executeContractWrite({ plan: invalidate, deps: projection });
  assert.equal(projection.value.contractEpoch, current.contractEpoch + 1);
  assert.deepEqual(projection.value.acceptedRecordIds, []);
  assert.deepEqual(projection.value.lifecycleProjection.acceptanceCriteria, {});
});
