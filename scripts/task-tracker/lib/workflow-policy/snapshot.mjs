// @story #1627 #1787 #1794
import { createHash } from 'node:crypto';

import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { stateIds, stateIndex as lifecycleStateIndex } from '../lifecycle-policy/index.mjs';
import { computeScopeIdentity } from './scope-identity.mjs';
import {
  resolveDeliveryExceptionChain,
  resolveWorkflowExceptionRecords,
} from './exception-record.mjs';
import { partitionWorkflowExceptions } from './exception-partitions.mjs';

export const WORKFLOW_STATES = stateIds();

const REQUIREMENT_STAGE = Object.freeze([
  ['planning.deep-dive', 'plan'],
  ['planning.metadata', 'plan'],
  ['planning.planned-estimate', 'plan'],
  ['planning.forecast', 'plan'],
  ['approval.plan', 'plan'],
  ['delivery.ownership', 'develop'],
  ['delivery.dependencies', 'develop'],
  ['delivery.issue-binding', 'develop'],
  ['delivery.state-contiguity', 'develop'],
  ['delivery.tests', 'test'],
  ['delivery.verification-evidence', 'test'],
  ['review.design', 'review'],
  ['review.implementation', 'review'],
  ['review.peer', 'review'],
  ['review.semantic-resident', 'review'],
  ['approval.human-completion', 'done'],
  ['delivery.commit-provenance', 'done'],
  ['delivery.ci', 'done'],
  ['delivery.safe-delivery', 'done'],
  ['delivery.external-protection', 'done'],
]);

function fail(category) {
  throw new TypeError(`workflow-preflight-snapshot:${category}`);
}

function stateIndex(state) {
  const index = lifecycleStateIndex(String(state));
  if (index < 0) fail('state');
  return index;
}

function satisfied(reference) {
  return Object.freeze({ state: 'satisfied', reference });
}

function evidenceFromBody(body) {
  const evidence = {};
  if (/<!--\s*aitm-deep-dive-complete\b/.test(body)) {
    evidence['planning.deep-dive'] = satisfied('issue-body://aitm-deep-dive-complete');
  }
  if (/^## Plan Metadata\s*$/m.test(body)) {
    evidence['planning.metadata'] = satisfied('issue-body://plan-metadata');
  }
  if (/<!--\s*aitm-estimation-forecast-ready\b/.test(body)) {
    evidence['planning.planned-estimate'] = satisfied(
      'issue-body://aitm-estimation-forecast-ready'
    );
    evidence['planning.forecast'] = satisfied('issue-body://aitm-estimation-forecast-ready');
  }
  if (/<!--\s*aitm-plan-approved\b/.test(body)) {
    evidence['approval.plan'] = satisfied('issue-body://aitm-plan-approved');
  }
  if (/<!--\s*aitm-review-approved\b/.test(body)) {
    evidence['approval.human-completion'] = satisfied('issue-body://aitm-review-approved');
  }
  return evidence;
}

function authorityRevisions(grouped, ordinaryHistory = [], deliveryHistory = new Map()) {
  const ordinaryDispositions = new Map(
    ordinaryHistory.map((item) => [item.recordId, item.disposition])
  );
  const revisions = grouped.ordinary.map(({ envelope }) =>
    Object.freeze({
      recordId: envelope.recordId,
      revision: envelope.payload.revision,
      disposition: ordinaryDispositions.get(envelope.recordId) || envelope.payload.status,
      reference: envelope.payload.approvalEvidence.reference,
    })
  );
  for (const [partitionKey, records] of grouped.delivery) {
    const dispositions = new Map(
      (deliveryHistory.get(partitionKey)?.history ?? []).map((item) => [
        item.recordId,
        item.disposition,
      ])
    );
    for (const { envelope } of records) {
      revisions.push(
        Object.freeze({
          recordId: envelope.recordId,
          revision: envelope.payload.revision,
          disposition: dispositions.get(envelope.recordId) || envelope.payload.status,
          reference: envelope.payload.approvalEvidence.reference,
          kind: 'delivery',
          partitionKey,
        })
      );
    }
  }
  return Object.freeze(
    revisions.sort(
      (left, right) => left.revision - right.revision || left.recordId.localeCompare(right.recordId)
    )
  );
}

export function baselineRequirementsThrough(targetState) {
  const targetIndex = stateIndex(targetState);
  return Object.freeze(
    REQUIREMENT_STAGE.filter(([, stage]) => stateIndex(stage) <= targetIndex).map(([id]) => id)
  );
}

export function requirementStage(requirementId) {
  const item = REQUIREMENT_STAGE.find(([id]) => id === requirementId);
  if (!item) fail('requirement');
  return item[1];
}

export async function buildWorkflowPreflightSnapshot({
  repository,
  issue,
  targetState,
  now,
  runtime,
} = {}) {
  if (
    typeof repository !== 'string' ||
    repository.length === 0 ||
    !Number.isSafeInteger(issue) ||
    issue <= 0 ||
    typeof now !== 'string' ||
    !Number.isFinite(Date.parse(now)) ||
    !runtime
  ) {
    fail('input');
  }
  stateIndex(targetState);

  const issueSnapshot = await runtime.readIssue(issue);
  const records = await runtime.listRecords(issue);
  const repositorySnapshot = await runtime.readRepository();
  const dependencies = await runtime.readDependencies(issue);
  const sessionPolicy = await runtime.readSessionPolicy();
  const runtimeCapability = await runtime.readRuntimeCapability();
  if (
    issueSnapshot?.number !== issue ||
    typeof issueSnapshot.body !== 'string' ||
    !Array.isArray(records) ||
    !Array.isArray(dependencies)
  ) {
    fail('read-shape');
  }

  const currentState = String(issueSnapshot.currentState || '').toLowerCase();
  const currentIndex = stateIndex(currentState);
  const targetIndex = stateIndex(targetState);
  if (targetIndex < currentIndex) fail('target-before-current');
  const scopeIdentity = computeScopeIdentity({ repository, issue, body: issueSnapshot.body });
  const exception = resolveWorkflowExceptionRecords({
    records,
    repository,
    issue,
    currentScopeIdentity: scopeIdentity,
    now,
  });
  const grouped = partitionWorkflowExceptions({ records, repository, issue });
  const deliveryHistory = new Map(
    [...grouped.delivery.keys()].map((partitionKey) => [
      partitionKey,
      resolveDeliveryExceptionChain({
        records,
        partitionKey,
        repository,
        issue,
        scopeIdentity,
        now,
      }),
    ])
  );
  const baselineRequirementIds = baselineRequirementsThrough(targetState);
  const evidence = {
    ...evidenceFromBody(issueSnapshot.body),
    ...(issueSnapshot.evidence || {}),
    ...(repositorySnapshot?.evidence || {}),
  };
  if (
    baselineRequirementIds.includes('approval.plan') &&
    sessionPolicy?.gateAnalysisToDevelopment === false
  ) {
    evidence['approval.plan'] = satisfied(
      sessionPolicy.source || 'session-policy://automatic-plan-authorization'
    );
  }
  if (baselineRequirementIds.includes('delivery.dependencies') && dependencies.length === 0) {
    evidence['delivery.dependencies'] = satisfied('issue-snapshot://no-blocking-dependencies');
  }
  for (const requirementId of baselineRequirementIds) {
    if (evidence[requirementId]) continue;
    evidence[requirementId] =
      stateIndex(requirementStage(requirementId)) > currentIndex
        ? {
            state: 'pending-future-evidence',
            remediation: `satisfy ${requirementId} at or before ${requirementStage(requirementId)}`,
          }
        : { state: 'missing' };
  }
  const externalProtection = repositorySnapshot?.externalProtection || { state: 'unknown' };
  if (externalProtection.state === 'satisfied') {
    evidence['delivery.external-protection'] = satisfied(
      externalProtection.reference || 'repository://external-protection'
    );
  } else if (externalProtection.state === 'unknown') {
    evidence['delivery.external-protection'] = {
      state: 'pending-future-evidence',
      remediation: 'inspect the live hosting-provider protection and required-review state',
    };
  }

  const evaluatorRecords =
    exception.status === 'none' || exception.status === 'invalid'
      ? []
      : [exception.active || exception.head].filter(Boolean);
  const revisions = authorityRevisions(grouped, exception.history, deliveryHistory);
  const deliveryConflicts = [...deliveryHistory.entries()].flatMap(([partitionKey, chain]) =>
    chain.status === 'invalid'
      ? chain.conflicts.map((conflict) => ({ ...conflict, partitionKey }))
      : []
  );
  const snapshotHash = `sha256:${createHash('sha256')
    .update(
      canonicalRecordJson({
        repository,
        issue,
        targetState,
        now,
        scopeIdentity,
        currentState,
        projectFields: issueSnapshot.projectFields || {},
        headSha: repositorySnapshot?.headSha || null,
        dependencies,
        runtimeCapability,
        authorityRevisions: revisions,
      })
    )
    .digest('hex')}`;

  return Object.freeze({
    repository,
    issue,
    now,
    currentState,
    targetState,
    scopeIdentity,
    baselineRequirementIds,
    evidence: Object.freeze(evidence),
    evaluatorRecords: Object.freeze(evaluatorRecords),
    exceptionStatus: exception.status,
    exceptionConflicts: exception.conflicts,
    authorityRevisions: revisions,
    issueConflicts: Object.freeze([...(issueSnapshot.conflicts || []), ...deliveryConflicts]),
    projectFields: Object.freeze({ ...(issueSnapshot.projectFields || {}) }),
    repositorySnapshot: Object.freeze({ ...(repositorySnapshot || {}) }),
    dependencies: Object.freeze([...dependencies]),
    sessionPolicy: Object.freeze({ ...(sessionPolicy || {}) }),
    runtimeCapability,
    externalProtection: Object.freeze({ ...externalProtection }),
    snapshotHash,
  });
}
