// @story #1851
import {
  createRevisionEvent,
  revisionRecord,
} from '../../task-tracker/lib/criteria-revision/records.mjs';
import { createHash } from 'node:crypto';
import {
  deriveProposal,
  renderApprovalStatement,
} from '../../task-tracker/lib/criteria-revision/proposal.mjs';
import { canonicalRecordJson } from '../../task-tracker/lib/github-records/canonical-json.mjs';
import {
  createDraftContract,
  sealContract,
  renderDeliveryContract,
} from '../../task-tracker/lib/github-records/delivery-contract.mjs';
const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const executor = {
  adapter: 'codex-session/v1',
  sessionId: 'synthetic-session',
  worktree: process.cwd(),
  branch: 'codex/synthetic-criteria',
};
const binding = { identity: 'scope', hash: hash('Synthetic scope') };
const proof =
  'exit="0" sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ts="2026-09-30T00:00:00Z" key="synthetic"';
const oldCommand = 'node --test old-hook.test.mjs';
const independentCommand = 'node --test independent.test.mjs';
function observation(body) {
  return {
    schema: 'aitm.criteria-revision-observation/v1',
    repository: 'example/criteria',
    issue: 124,
    writerDomain: { hostId: 'synthetic-host', commonDirectory: process.cwd() },
    executor: { ...executor },
    stage: 'develop',
    issueState: 'open',
    delivery: { state: 'none', records: [] },
    sourceKind: 'legacy-body',
    body: { bytes: body, version: 1 },
    contract: null,
    capsule: null,
    grant: null,
    protectedSourceBindings: [{ ...binding }],
    criterionBindings: [],
    proofRecords: [],
    revisionRecords: { complete: true, records: [] },
    identities: null,
    retiredIdentities: [],
    revision: 0,
    revisionId: null,
  };
}
function finish(observed, edits) {
  const context = {
    observation: observed,
    edits,
    reason: 'Replace obsolete model hooks',
    mode: 'revision',
    priorTransaction: null,
    executor: structuredClone(observed.executor),
    operationId: 'op-1',
    transactionId: 'tx-1',
  };
  const proposal = deriveProposal(context),
    statement = renderApprovalStatement(proposal);
  const authorizationSource = {
    schema: 'aitm.authorization-source/v1',
    adapter: 'codex-session/v1',
    sessionId: executor.sessionId,
    messageId: 'synthetic-message',
    statementHash: hash(statement),
  };
  const rawUserMessage = {
    id: authorizationSource.messageId,
    sessionId: executor.sessionId,
    role: 'user',
    content: [{ type: 'input_text', text: statement }],
    principal: null,
    injection: [false],
    origin: 'codex-session-transcript',
  };
  const request = {
    schema: 'aitm.criteria-revision/v1',
    action: 'apply',
    proposal,
    authorizationSource,
  };
  const resumeObservation = structuredClone(observed);
  const prepared = createRevisionEvent({ request, predecessorEventId: null });
  resumeObservation.revisionRecords.records.push(revisionRecord(prepared));
  const resumeContext = {
    ...context,
    observation: resumeObservation,
    mode: 'resume',
    priorTransaction: { transactionId: 'tx-1', eventId: prepared.eventId },
    edits: { acceptanceCriteria: [], verificationCommands: [] },
    operationId: 'op-2',
  };
  const resumeProposal = deriveProposal(resumeContext),
    resumeStatement = renderApprovalStatement(resumeProposal);
  const resumeRequest = {
    schema: 'aitm.criteria-revision/v1',
    action: 'recover',
    proposal: resumeProposal,
    authorizationSource: {
      ...authorizationSource,
      messageId: 'synthetic-recovery-message',
      statementHash: hash(resumeStatement),
    },
  };
  const currentApproval = {
    schema: 'aitm.plan-approval-binding/v1',
    revisionId: proposal.after.revisionId,
    semanticContractDigest: proposal.after.semanticContractDigest,
    contractEpoch: observed.contract ? observed.contract.value.contractEpoch + 1 : null,
    sourceBindings: ['user-story', 'story-intent', 'linked-plan'].map((identity) => ({
      identity,
      hash: hash(`synthetic ${identity}`),
    })),
    provenance: {
      mode: 'full-auto',
      authorityReference: 'synthetic-agent-approval',
      auditReference: 'synthetic-approval-audit',
    },
  };
  return {
    observation: observed,
    edits,
    context,
    proposal,
    request,
    resumeContext,
    resumeProposal,
    resumeRequest,
    authorizationSource,
    rawUserMessage,
    resumeRawUserMessage: {
      ...rawUserMessage,
      id: resumeRequest.authorizationSource.messageId,
      content: [{ type: 'input_text', text: resumeStatement }],
    },
    currentApproval,
    oldApproval: {
      ...currentApproval,
      revisionId: 'older-revision',
      semanticContractDigest: hash('older contract'),
      contractEpoch: observed.contract?.value.contractEpoch ?? null,
    },
    contract: observed.contract?.value ?? null,
    grant: observed.grant,
  };
}
export function makeLegacyRevisionFixture() {
  const body = [
    '## Scope',
    'Synthetic scope',
    '## Acceptance Criteria',
    `- [x] Old model hooks <!-- aitm-verified vc-list="vc:1" ${proof} -->`,
    `- [x] Shared model guard <!-- aitm-verified vc-list="vc:1" ${proof} -->`,
    `- [x] Independent requirement <!-- aitm-verified vc-list="vc:2" ${proof} -->`,
    '## Verification Commands',
    `- [x] \`${oldCommand}\` <!-- id=1 --> <!-- aitm-verified cmd="\`${oldCommand}\`" ${proof} -->`,
    `- [x] \`${independentCommand}\` <!-- id=2 --> <!-- aitm-verified cmd="\`${independentCommand}\`" ${proof} -->`,
    '## Definition of Done',
    '### Functional',
    `- [x] Shared DoD <!-- aitm-verified cmd="\`${oldCommand}\`" ${proof} -->`,
    `- [x] Independent DoD <!-- aitm-verified cmd="\`${independentCommand}\`" ${proof} -->`,
    '### Lifecycle',
    '- [x] Agent Review Passed',
    '- [x] Final Review Passed',
    '<!-- aitm-plan-approved ts="2026-09-30T00:00:00Z" mode="full-auto" -->',
    '<!-- aitm-test-receipt identity="synthetic-test" -->',
    '<!-- aitm-review-approved ts="2026-09-30T00:00:00Z" -->',
    '<!-- aitm-entered-develop ts="2026-09-30T00:00:00Z" -->',
    '<!-- aitm-timing-log synthetic="yes" -->',
    '<!-- aitm-body-version version="1" -->',
    '',
  ].join('\n');
  const oldBytes = body.split('\n')[3];
  return finish(observation(body), {
    acceptanceCriteria: [
      {
        operation: 'replace',
        occurrence: 1,
        oldBytes,
        oldHash: hash(oldBytes),
        replacements: [
          { text: 'Supported model hooks', declaration: { kind: 'vc-list', vcIds: ['1'] } },
        ],
      },
    ],
    verificationCommands: [
      {
        operation: 'replace',
        id: '1',
        oldCommand,
        oldHash: hash(oldCommand),
        command: 'node --test supported-hook.test.mjs',
      },
    ],
  });
}
export function makeCanonicalRevisionFixture() {
  const draft = createDraftContract({
    recordId: '01J00000000000000000000000',
    authorityEpoch: 1,
    coordinatorGrantId: '01J00000000000000000000001',
    acceptanceCriteria: [
      { logicalId: 'ac-hook', text: 'Old model hooks' },
      { logicalId: 'ac-independent', text: 'Independent requirement' },
    ],
    verificationCommands: [
      { logicalId: 'vc-hook', command: oldCommand },
      { logicalId: 'vc-independent', command: independentCommand },
    ],
    definitionOfDone: [{ logicalId: 'dod-shared', text: 'Shared DoD' }],
    lifecycleProjection: {
      acceptanceCriteria: { 'ac-hook': true, 'ac-independent': true },
      verificationCommands: { 'vc-hook': true },
      definitionOfDone: { 'dod-shared': true },
    },
    acceptedRecordIds: ['01J00000000000000000000002'],
  });
  const contract = sealContract({
    contract: draft,
    authorityEpoch: 1,
    coordinatorGrantId: draft.coordinatorGrantId,
  }).contract;
  const observed = observation(
    '## Scope\nSynthetic scope\n' +
      renderDeliveryContract({ contract }).markdown +
      '\n<!-- aitm-body-version version="1" -->\n'
  );
  observed.sourceKind = 'canonical-contract';
  observed.contract = { value: contract, bytes: canonicalRecordJson(contract) };
  observed.capsule = { head: '01J00000000000000000000002', bytes: 'synthetic capsule bytes' };
  const nativeGrant = {
    schema: 'aitm.coordinator-grant/v1',
    grantId: contract.coordinatorGrantId,
    scope: { scopeRootIssue: 124, includedIssues: [], excludedIssues: [] },
    coordinator: { actor: 'synthetic-coordinator', platform: 'codex', session: executor.sessionId },
    parentGrantId: null,
    issuer: null,
    epoch: 1,
    operations: ['amend-contract'],
    branchBoundary: [executor.branch, 'trunk'],
    integrationBoundary: { sourceBranches: [executor.branch], destinationBranches: ['trunk'] },
    activatedAt: '2026-09-30T00:00:00.000Z',
    expiresAt: null,
  };
  observed.grant = {
    identity: nativeGrant.grantId,
    epoch: 1,
    coordinator: nativeGrant.coordinator,
    bytes: canonicalRecordJson(nativeGrant),
  };
  observed.criterionBindings = [
    { criterionIdentity: 'ac-hook', vcIds: ['vc-hook'], sourceBindings: [{ ...binding }] },
    {
      criterionIdentity: 'ac-independent',
      vcIds: ['vc-independent'],
      sourceBindings: [{ ...binding }],
    },
    { criterionIdentity: 'dod-shared', vcIds: ['vc-hook'], sourceBindings: [{ ...binding }] },
  ];
  observed.proofRecords = [
    {
      kind: 'ac-proof',
      identity: 'canonical-independent-proof',
      bytes: 'synthetic accepted independent proof',
      criterionIdentity: 'ac-independent',
    },
    {
      kind: 'plan-approval',
      identity: 'canonical-plan-approval',
      bytes: 'synthetic old Plan approval',
      criterionIdentity: null,
    },
  ];
  const oldBytes = canonicalRecordJson(contract.acceptanceCriteria[0]);
  const fixture = finish(observed, {
    acceptanceCriteria: [
      {
        operation: 'replace',
        occurrence: 1,
        oldBytes,
        oldHash: hash(oldBytes),
        replacements: [
          { text: 'Supported model hooks', declaration: { kind: 'vc-list', vcIds: ['vc-hook'] } },
        ],
      },
    ],
    verificationCommands: [
      {
        operation: 'replace',
        id: 'vc-hook',
        oldCommand,
        oldHash: hash(oldCommand),
        command: 'node --test supported-hook.test.mjs',
      },
    ],
  });
  fixture.nativeGrant = nativeGrant;
  return fixture;
}
