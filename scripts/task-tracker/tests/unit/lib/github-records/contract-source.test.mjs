// @story #1081 #1119 #1121
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { parseAcceptanceCriteria } from '../../../../lib/code-complete-gate.mjs';
import { validateBodyWithContractSource } from '../../../../lib/body-gates.mjs';
import {
  projectEvidenceChecklist,
  resolveEvidenceChecklist,
} from '../../../../lib/evidence-markers.mjs';
import {
  projectFunctionalDodEvidence,
  resolveFunctionalDodEvidence,
} from '../../../../lib/functional-dod-evidence.mjs';
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
const dodDeclaration =
  'Automated tests pass <!-- aitm-verified vc-list="vc:1" --> <!-- dod:functional:tests -->';

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
  `- [x] ${dodDeclaration}`,
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
    acceptanceCriteria: [
      {
        logicalId: 'ac-1',
        text: 'Users can sign in. <!-- aitm-verified vc-list="vc:1" -->',
      },
    ],
    verificationCommands: [{ logicalId: 'vc-1', command: 'npm test' }],
    definitionOfDone: [{ logicalId: 'dod-tests', text: dodDeclaration }],
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

test('normalized ACs preserve evidence declarations and the historic parser export', async () => {
  const declaration = 'Users can sign in. <!-- aitm-verified vc-list="vc:1" -->';
  const legacy = await resolveContractSource({ repository, issue, issueBody: legacyBody });
  const github = await resolveContractSource({
    repository,
    issue,
    issueBody: directoryBody(),
    readContractRecord: async () =>
      contractRecord({
        contract: deliveryContract({
          acceptanceCriteria: [{ logicalId: 'ac-1', text: declaration }],
        }),
      }),
  });

  assert.equal(parseAcceptanceCriteria(legacyBody)?.[0]?.label, declaration);
  assert.equal(legacy.contract.acceptanceCriteria[0].declaration, declaration);
  assert.equal(github.contract.acceptanceCriteria[0].declaration, declaration);
  assert.equal(legacy.contract.acceptanceCriteria[0].text, 'Users can sign in.');
  assert.equal(github.contract.acceptanceCriteria[0].text, 'Users can sign in.');
  assert.equal(Object.isFrozen(github.contract.acceptanceCriteria[0]), true);
});

test('normalized DoD items preserve evidence declarations for both source kinds', async () => {
  const legacy = await resolveContractSource({ repository, issue, issueBody: legacyBody });
  const github = await resolveContractSource({
    repository,
    issue,
    issueBody: directoryBody(),
    readContractRecord: async () => contractRecord(),
  });

  assert.deepEqual(legacy.contract.definitionOfDone[0], {
    logicalId: 'dod-tests',
    text: 'Automated tests pass',
    declaration: dodDeclaration,
    checked: true,
  });
  assert.deepEqual(github.contract.definitionOfDone, legacy.contract.definitionOfDone);
});

test('evidence projections preserve equivalent logical evidence across source kinds', async () => {
  const acceptedRecordIds = ['01J00000000000000000000003', '01J00000000000000000000002'];
  const legacySource = await resolveContractSource({ repository, issue, issueBody: legacyBody });
  const githubSource = await resolveContractSource({
    repository,
    issue,
    issueBody: directoryBody(),
    readContractRecord: async () =>
      contractRecord({ contract: deliveryContract({ acceptedRecordIds }) }),
  });
  const legacy = projectEvidenceChecklist(legacySource);
  const github = projectEvidenceChecklist(githubSource);

  assert.deepEqual(legacy.acceptanceCriteria, [
    {
      logicalId: 'ac-1',
      checked: true,
      label: 'Users can sign in.',
      declaration: 'Users can sign in. <!-- aitm-verified vc-list="vc:1" -->',
      evidenceCommands: ['npm test'],
    },
  ]);
  assert.deepEqual(legacy.functionalDodItems, [
    {
      logicalId: 'dod-tests',
      checked: true,
      label: 'Automated tests pass',
      declaration: dodDeclaration,
      evidenceCommands: ['npm test'],
    },
  ]);
  assert.deepEqual(legacy.verificationCommands, [
    { logicalId: 'vc-1', command: 'npm test', checked: true },
  ]);
  assert.deepEqual(github.acceptanceCriteria, legacy.acceptanceCriteria);
  assert.deepEqual(github.functionalDodItems, legacy.functionalDodItems);
  assert.deepEqual(github.verificationCommands, legacy.verificationCommands);
  assert.equal(legacy.sourceKind, 'legacy-body/v1');
  assert.equal(legacy.authority, null);
  assert.deepEqual(legacy.acceptedRecordIds, []);
  assert.equal(github.sourceKind, 'github-records/v1');
  assert.deepEqual(github.authority, githubSource.authority);
  assert.deepEqual(github.acceptedRecordIds, acceptedRecordIds.toSorted());
  assert.equal(Object.isFrozen(github), true);
  assert.equal(Object.isFrozen(github.acceptanceCriteria), true);
  assert.equal(Object.isFrozen(github.acceptanceCriteria[0]), true);
  assert.equal(Object.isFrozen(github.acceptedRecordIds), true);
  assert.equal(Object.isFrozen(github.authority), true);
});

test('evidence adapter resolves once, honors directory authority, and fails closed', async () => {
  let resolveCalls = 0;
  const source = await resolveContractSource({ repository, issue, issueBody: legacyBody });
  const resolved = await resolveEvidenceChecklist({
    repository,
    issue,
    issueBody: legacyBody,
    deps: {
      resolveContractSource: async () => {
        resolveCalls += 1;
        return source;
      },
    },
  });
  assert.equal(resolveCalls, 1);
  assert.deepEqual(resolved, projectEvidenceChecklist(source));

  const directory = await resolveEvidenceChecklist({
    repository,
    issue,
    issueBody: directoryBody(),
    readContractRecord: async () =>
      contractRecord({
        contract: deliveryContract({
          lifecycleProjection: {
            acceptanceCriteria: { 'ac-1': false },
            verificationCommands: { 'vc-1': false },
            definitionOfDone: { 'dod-tests': false },
          },
        }),
      }),
  });
  assert.equal(directory.acceptanceCriteria[0].checked, false);
  assert.equal(directory.functionalDodItems[0].checked, false);
  assert.equal(directory.verificationCommands[0].checked, false);

  const unavailable = new Error('contract-source:unavailable');
  let failureCalls = 0;
  await assert.rejects(
    resolveEvidenceChecklist({
      repository,
      issue,
      issueBody: legacyBody,
      deps: {
        resolveContractSource: async () => {
          failureCalls += 1;
          throw unavailable;
        },
      },
    }),
    (error) => error === unavailable
  );
  assert.equal(failureCalls, 1);
});

test('Functional DoD projections preserve canonical keys and unknown logical IDs', async () => {
  const legacySource = await resolveContractSource({ repository, issue, issueBody: legacyBody });
  const legacy = projectFunctionalDodEvidence(legacySource);

  assert.deepEqual(legacy.items, [
    {
      logicalId: 'dod-tests',
      key: 'tests',
      checked: true,
      label: 'Automated tests pass',
      declaration: dodDeclaration,
      evidenceCommands: ['npm test'],
      evidenceMarker: null,
      classification: 'stampable',
    },
  ]);

  const proofDeclaration =
    'Custom completion proof <!-- aitm-verified cmd="`npm test`" exit="0" sha="abc123" ts="2026-08-07T00:00:00.000Z" -->';
  const acceptedRecordIds = ['01J00000000000000000000002'];
  const githubSource = await resolveContractSource({
    repository,
    issue,
    issueBody: directoryBody(),
    readContractRecord: async () =>
      contractRecord({
        contract: deliveryContract({
          definitionOfDone: [{ logicalId: 'dod-custom-proof', text: proofDeclaration }],
          lifecycleProjection: {
            acceptanceCriteria: { 'ac-1': true },
            verificationCommands: { 'vc-1': true },
            definitionOfDone: { 'dod-custom-proof': true },
          },
          acceptedRecordIds,
        }),
      }),
  });
  const github = projectFunctionalDodEvidence(githubSource);

  assert.deepEqual(github.items, [
    {
      logicalId: 'dod-custom-proof',
      key: null,
      checked: true,
      label: 'Custom completion proof',
      declaration: proofDeclaration,
      evidenceCommands: ['npm test'],
      evidenceMarker: {
        key: 'custom-proof',
        cmd: '`npm test`',
        exit: 0,
        sha: 'abc123',
        ts: '2026-08-07T00:00:00.000Z',
      },
      classification: null,
    },
  ]);
  assert.deepEqual(github.acceptedRecordIds, acceptedRecordIds);
  assert.deepEqual(github.authority, githubSource.authority);
  assert.equal(Object.isFrozen(github), true);
  assert.equal(Object.isFrozen(github.items), true);
  assert.equal(Object.isFrozen(github.items[0]), true);
  assert.equal(Object.isFrozen(github.acceptedRecordIds), true);
  assert.equal(Object.isFrozen(github.authority), true);
});

test('Functional DoD adapter resolves exactly once and propagates failures', async () => {
  const source = await resolveContractSource({ repository, issue, issueBody: legacyBody });
  let resolveCalls = 0;
  const resolved = await resolveFunctionalDodEvidence({
    repository,
    issue,
    issueBody: legacyBody,
    deps: {
      resolveContractSource: async () => {
        resolveCalls += 1;
        return source;
      },
    },
  });
  assert.equal(resolveCalls, 1);
  assert.deepEqual(resolved, projectFunctionalDodEvidence(source));

  const unavailable = new Error('contract-source:unavailable');
  let failureCalls = 0;
  await assert.rejects(
    resolveFunctionalDodEvidence({
      repository,
      issue,
      issueBody: legacyBody,
      deps: {
        resolveContractSource: async () => {
          failureCalls += 1;
          throw unavailable;
        },
      },
    }),
    (error) => error === unavailable
  );
  assert.equal(failureCalls, 1);
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
    {
      logicalId: 'ac-1',
      text: 'Users can sign in.',
      declaration: 'Users can sign in. <!-- aitm-verified vc-list="vc:1" -->',
      checked: true,
    },
  ]);
  assert.deepEqual(first.contract.verificationCommands, [
    { logicalId: 'vc-1', command: 'npm test', checked: true },
  ]);
  assert.deepEqual(first.contract.definitionOfDone, [
    {
      logicalId: 'dod-tests',
      text: 'Automated tests pass',
      declaration: dodDeclaration,
      checked: true,
    },
  ]);
});

test('body-gate adapter makes equivalent legacy and directory VC decisions', async () => {
  const uncheckedLegacyBody = legacyBody.replace('- [x] `npm test`', '- [ ] `npm test`');
  const checkedLegacy = await validateBodyWithContractSource({
    repository,
    issue,
    issueBody: legacyBody,
  });
  const checkedDirectory = await validateBodyWithContractSource({
    repository,
    issue,
    issueBody: directoryBody(),
    readContractRecord: async () => contractRecord(),
  });
  const uncheckedLegacy = await validateBodyWithContractSource({
    repository,
    issue,
    issueBody: uncheckedLegacyBody,
  });
  const uncheckedDirectory = await validateBodyWithContractSource({
    repository,
    issue,
    issueBody: directoryBody(),
    readContractRecord: async () =>
      contractRecord({
        contract: deliveryContract({
          lifecycleProjection: {
            acceptanceCriteria: { 'ac-1': true },
            verificationCommands: { 'vc-1': false },
            definitionOfDone: { 'dod-tests': true },
          },
        }),
      }),
  });

  assert.deepEqual(checkedLegacy, { ok: true });
  assert.deepEqual(checkedDirectory, checkedLegacy);
  assert.equal(uncheckedLegacy.ok, false);
  assert.equal(uncheckedDirectory.ok, false);
  assert.deepEqual(
    uncheckedDirectory.refusedRules.map(({ rule }) => rule),
    uncheckedLegacy.refusedRules.map(({ rule }) => rule)
  );
});

test('body-gate adapter resolves once and refuses directory failures without body fallback', async () => {
  let resolveCalls = 0;
  const unavailable = await validateBodyWithContractSource({
    repository,
    issue,
    issueBody: directoryBody(),
    deps: {
      resolveContractSource: async () => {
        resolveCalls += 1;
        throw new Error('contract-source:unavailable');
      },
    },
  });

  assert.equal(resolveCalls, 1);
  assert.deepEqual(unavailable, {
    ok: false,
    refusedRules: [
      {
        rule: 'verification-commands',
        reason: 'contract-source-failed: contract-source:unavailable',
      },
    ],
  });

  const projectionMismatch = await validateBodyWithContractSource({
    repository,
    issue,
    issueBody: directoryBody(),
    readContractRecord: async () => ({
      ...contractRecord(),
      body: contractRecord().body.replaceAll('Users can sign in.', 'Projection drift.'),
    }),
  });
  assert.deepEqual(projectionMismatch, {
    ok: false,
    refusedRules: [
      {
        rule: 'verification-commands',
        reason: 'contract-source-failed: contract-source:projection',
      },
    ],
  });
});
