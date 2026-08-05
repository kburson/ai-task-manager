// @story #1081
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  createDraftContract,
  renderDeliveryContract,
} from '../../../../lib/github-records/delivery-contract.mjs';
import {
  ContractSourceError,
  resolveContractSource,
} from '../../../../lib/github-records/contract-source.mjs';
import {
  createIssueDirectory,
  renderIssueDirectory,
} from '../../../../lib/github-records/issue-directory.mjs';
import {
  createAitmRecordEnvelope,
  renderAitmRecord,
} from '../../../../lib/github-records/record-envelope.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1081;
const contractNodeId = 'IC_kwDOContractSource';
const contractRecordId = '01J00000000000000000000000';
const coordinatorGrantId = '01J00000000000000000000001';

const legacyBody = [
  '## Acceptance Criteria',
  '',
  '- [x] Users can sign in. <!-- aitm-verified vc-list="vc:1" -->',
  '',
  '## Verification Commands',
  '',
  '- [x] `npm test` <!-- id=1 -->',
  '',
  '## Definition of Done',
  '',
  '### Functional (verified at Test)',
  '',
  '- [x] Automated tests pass <!-- dod:functional:tests -->',
  '',
].join('\n');

function directoryBody() {
  return `${legacyBody}\n${renderIssueDirectory(
    createIssueDirectory({
      issueNodeId: 'I_kwDOContractSourceIssue',
      singletons: {
        'delivery-contract': contractNodeId,
        coordination: 'IC_kwDOContractCoordination',
        'evidence-projection': 'IC_kwDOContractEvidence',
        timing: 'IC_kwDOContractTiming',
      },
    })
  )}\n`;
}

function deliveryContract(overrides = {}) {
  return createDraftContract({
    recordId: contractRecordId,
    authorityEpoch: 1,
    coordinatorGrantId,
    acceptanceCriteria: [{ logicalId: 'ac-1', text: 'Users can sign in.' }],
    verificationCommands: [{ logicalId: 'vc-1', command: 'npm test' }],
    definitionOfDone: [{ logicalId: 'dod-tests', text: 'Automated tests pass' }],
    lifecycleProjection: {
      acceptanceCriteria: { 'ac-1': true },
      verificationCommands: { 'vc-1': true },
      definitionOfDone: { 'dod-tests': true },
    },
    acceptedRecordIds: [],
    ...overrides,
  });
}

function contractRecord({ contract = deliveryContract(), recordOverrides = {} } = {}) {
  const visibleMarkdown = renderDeliveryContract({ contract }).markdown;
  const envelope = createAitmRecordEnvelope({
    recordType: 'singleton-projection',
    repository,
    issue,
    payload: contract,
    actor: 'test/coordinator',
    recordId: contractRecordId,
    grantId: coordinatorGrantId,
    createdAt: '2026-08-05T00:00:00.000Z',
  });
  const record = {
    commentNodeId: contractNodeId,
    envelope,
    body: renderAitmRecord({ envelope, visibleMarkdown }),
    updatedAt: '2026-08-05T00:00:00.000Z',
  };
  return Object.freeze({ ...record, ...recordOverrides });
}

test('equivalent legacy and directory contracts produce the same immutable core model', async () => {
  const legacy = await resolveContractSource({ repository, issue, issueBody: legacyBody });
  const github = await resolveContractSource({
    repository,
    issue,
    issueBody: directoryBody(),
    readContractRecord: async ({ commentNodeId }) => {
      assert.equal(commentNodeId, contractNodeId);
      return contractRecord();
    },
  });

  assert.equal(legacy.sourceKind, 'legacy-body/v1');
  assert.equal(github.sourceKind, 'github-records/v1');
  assert.deepEqual(github.contract, legacy.contract);
  assert.equal(Object.isFrozen(legacy), true);
  assert.equal(Object.isFrozen(legacy.contract), true);
  assert.equal(Object.isFrozen(legacy.contract.acceptanceCriteria), true);
});

test('directory authority failures never fall back to a valid legacy body', async () => {
  const validRecord = contractRecord();
  const cases = [
    {
      name: 'unavailable singleton',
      expected: 'unavailable',
      readContractRecord: async () => {
        throw new Error('network unavailable');
      },
    },
    {
      name: 'mismatched comment node',
      expected: 'record',
      readContractRecord: async () => ({
        ...validRecord,
        commentNodeId: 'IC_kwDODifferentContract',
      }),
    },
    {
      name: 'unsupported record envelope schema',
      expected: 'record',
      readContractRecord: async () => ({
        ...validRecord,
        envelope: { ...validRecord.envelope, schema: 'aitm.record/v0' },
      }),
    },
    {
      name: 'mismatched repository',
      expected: 'record',
      readContractRecord: async () => ({
        ...validRecord,
        envelope: { ...validRecord.envelope, repository: 'other/repository' },
      }),
    },
    {
      name: 'invalid Delivery Contract',
      expected: 'contract',
      readContractRecord: async () => ({
        ...validRecord,
        envelope: {
          ...validRecord.envelope,
          payload: { ...validRecord.envelope.payload, unexpected: true },
        },
      }),
    },
    {
      name: 'projection mismatch',
      expected: 'projection',
      readContractRecord: async () => ({
        ...validRecord,
        body: validRecord.body.replaceAll('Users can sign in.', 'Visible body was changed.'),
      }),
    },
  ];

  for (const scenario of cases) {
    await assert.rejects(
      resolveContractSource({
        repository,
        issue,
        issueBody: directoryBody(),
        readContractRecord: scenario.readContractRecord,
      }),
      (error) =>
        error instanceof ContractSourceError &&
        error.category === scenario.expected &&
        error.message === `contract-source:${scenario.expected}`,
      scenario.name
    );
  }
});

test('normalized record output preserves stable ordering, state, references, and immutability', async () => {
  const acceptedRecordIds = ['01J00000000000000000000003', '01J00000000000000000000002'];
  const contract = deliveryContract({
    acceptanceCriteria: [
      { logicalId: 'ac-second', text: 'Second visible criterion.' },
      { logicalId: 'ac-first', text: 'First visible criterion.' },
    ],
    verificationCommands: [
      { logicalId: 'vc-second', command: 'npm run test:slow' },
      { logicalId: 'vc-first', command: 'npm test' },
    ],
    definitionOfDone: [
      { logicalId: 'dod-second', text: 'Second completion item.' },
      { logicalId: 'dod-first', text: 'First completion item.' },
    ],
    lifecycleProjection: {
      acceptanceCriteria: { 'ac-first': true },
      verificationCommands: { 'vc-second': true },
      definitionOfDone: { 'dod-first': true },
    },
    acceptedRecordIds,
  });

  const result = await resolveContractSource({
    repository,
    issue,
    issueBody: directoryBody(),
    readContractRecord: async () => contractRecord({ contract }),
  });

  assert.deepEqual(
    result.contract.acceptanceCriteria.map(({ logicalId, checked }) => ({ logicalId, checked })),
    [
      { logicalId: 'ac-second', checked: false },
      { logicalId: 'ac-first', checked: true },
    ]
  );
  assert.deepEqual(
    result.contract.verificationCommands.map(({ logicalId, checked }) => ({
      logicalId,
      checked,
    })),
    [
      { logicalId: 'vc-second', checked: true },
      { logicalId: 'vc-first', checked: false },
    ]
  );
  assert.deepEqual(result.contract.acceptedRecordIds, acceptedRecordIds.toSorted());
  assert.deepEqual(result.authority, {
    contractRecordId,
    contractEpoch: 1,
    authorityEpoch: 1,
    coordinatorGrantId,
    commentNodeId: contractNodeId,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.contract), true);
  assert.equal(Object.isFrozen(result.contract.acceptanceCriteria), true);
  assert.equal(Object.isFrozen(result.contract.acceptanceCriteria[0]), true);
  assert.equal(Object.isFrozen(result.contract.acceptedRecordIds), true);
  assert.equal(Object.isFrozen(result.authority), true);
  assert.throws(() => result.contract.acceptanceCriteria.push({}), TypeError);
});

test('legacy compatibility IDs and ordering are deterministic', async () => {
  const first = await resolveContractSource({ repository, issue, issueBody: legacyBody });
  const second = await resolveContractSource({ repository, issue, issueBody: legacyBody });

  assert.deepEqual(first, second);
  assert.deepEqual(first.contract.acceptanceCriteria, [
    { logicalId: 'ac-1', text: 'Users can sign in.', checked: true },
  ]);
  assert.deepEqual(first.contract.verificationCommands, [
    { logicalId: 'vc-1', command: 'npm test', checked: true },
  ]);
  assert.deepEqual(first.contract.definitionOfDone, [
    { logicalId: 'dod-tests', text: 'Automated tests pass', checked: true },
  ]);
});
