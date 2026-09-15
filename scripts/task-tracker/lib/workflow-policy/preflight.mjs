// @story #1627
import { WORKFLOW_POLICY_CAPABILITY } from './catalog.mjs';
import { evaluateWorkflowPolicy } from './evaluator.mjs';

function freezeItems(items) {
  return Object.freeze(items.map((item) => Object.freeze({ ...item })));
}

function uniqueRemediation(items) {
  return Object.freeze(
    [...new Set(items.map(({ remediation }) => remediation).filter(Boolean))].map((action) =>
      Object.freeze({ action })
    )
  );
}

function externalUnknowns(snapshot) {
  const unknowns = [];
  if (
    snapshot.baselineRequirementIds.includes('delivery.external-protection') &&
    snapshot.externalProtection.state === 'unknown'
  ) {
    unknowns.push({
      code: 'external-protection-unknown',
      requirementId: 'delivery.external-protection',
      ...(snapshot.externalProtection.reference
        ? { reference: snapshot.externalProtection.reference }
        : {}),
      remediation: 'inspect the live hosting-provider protection and required-review state',
    });
  }
  if (snapshot.runtimeCapability !== WORKFLOW_POLICY_CAPABILITY) {
    unknowns.push({
      code: 'runtime-capability-unsupported',
      requirementId: null,
      reference: snapshot.runtimeCapability || 'unavailable',
      remediation: `install a runtime advertising ${WORKFLOW_POLICY_CAPABILITY}`,
    });
  }
  return freezeItems(unknowns);
}

export function evaluateWorkflowPreflight(snapshot) {
  const evaluation = evaluateWorkflowPolicy({
    repository: snapshot.repository,
    issue: snapshot.issue,
    scopeIdentity: snapshot.scopeIdentity,
    now: snapshot.now,
    state: snapshot.currentState,
    activity: `workflow-transition:${snapshot.targetState}`,
    baselineRequirementIds: snapshot.baselineRequirementIds,
    evidence: snapshot.evidence,
    records: snapshot.evaluatorRecords,
  });
  const exceptionBlockers =
    snapshot.exceptionStatus === 'invalid'
      ? snapshot.exceptionConflicts.map((item) => ({
          ...item,
          remediation: 'repair the ambiguous or malformed workflow-exception history',
        }))
      : [];
  const blockers = freezeItems([
    ...evaluation.blockers,
    ...snapshot.issueConflicts,
    ...exceptionBlockers,
  ]);
  const pendingFutureEvidence = freezeItems(
    evaluation.decisions
      .filter(
        ({ id, outcome, evaluation: state }) =>
          outcome === 'missing' &&
          state === 'pending-future-evidence' &&
          !(
            id === 'delivery.external-protection' && snapshot.externalProtection.state === 'unknown'
          )
      )
      .map(({ id, remediation }) => ({
        requirementId: id,
        remediation: remediation || `satisfy ${id} before the requested target`,
      }))
  );
  const unknowns = externalUnknowns(snapshot);
  const status =
    blockers.length > 0 ? 'blocked' : unknowns.length > 0 ? 'indeterminate' : 'policy-compatible';
  const requirements = freezeItems(evaluation.decisions);
  const waivers = freezeItems(requirements.filter(({ outcome }) => outcome === 'waived'));
  const prohibitions = freezeItems(evaluation.prohibitions);
  const remediation = uniqueRemediation([...blockers, ...pendingFutureEvidence, ...unknowns]);

  return Object.freeze({
    schema: 'aitm.workflow-preflight-report/v1',
    status,
    advisory: true,
    conditionalOnFutureState: true,
    advisoryNote:
      'This report is advisory. Revalidate authority and live evidence at every later mutation boundary.',
    repository: snapshot.repository,
    issue: snapshot.issue,
    currentState: snapshot.currentState,
    targetState: snapshot.targetState,
    capability: snapshot.runtimeCapability,
    inspectedAt: snapshot.now,
    authorityRevisions: snapshot.authorityRevisions,
    requirements,
    waivers,
    prohibitions,
    blockers,
    pendingFutureEvidence,
    externalUnknowns: unknowns,
    remediation,
    provenance: Object.freeze({
      snapshotHash: snapshot.snapshotHash,
      scopeIdentity: snapshot.scopeIdentity,
      repositoryHead: snapshot.repositorySnapshot.headSha || null,
      projectFields: snapshot.projectFields,
      dependencies: snapshot.dependencies,
      sessionPolicy: snapshot.sessionPolicy,
      exceptionStatus: snapshot.exceptionStatus,
    }),
  });
}

export function indeterminateWorkflowPreflightReport({
  repository,
  issue,
  targetState,
  inspectedAt,
  error,
} = {}) {
  const remediation = 'restore the required read-only repository and issue inspection capability';
  const externalUnknowns = freezeItems([
    {
      code: 'snapshot-read-indeterminate',
      requirementId: null,
      reference: error?.message || 'workflow-preflight:unavailable',
      remediation,
    },
  ]);
  return Object.freeze({
    schema: 'aitm.workflow-preflight-report/v1',
    status: 'indeterminate',
    advisory: true,
    conditionalOnFutureState: true,
    advisoryNote:
      'This report is advisory. Revalidate authority and live evidence at every later mutation boundary.',
    repository,
    issue,
    currentState: null,
    targetState,
    capability: WORKFLOW_POLICY_CAPABILITY,
    inspectedAt,
    authorityRevisions: Object.freeze([]),
    requirements: Object.freeze([]),
    waivers: Object.freeze([]),
    prohibitions: Object.freeze([]),
    blockers: Object.freeze([]),
    pendingFutureEvidence: Object.freeze([]),
    externalUnknowns,
    remediation: Object.freeze([Object.freeze({ action: remediation })]),
    provenance: Object.freeze({
      snapshotHash: null,
      scopeIdentity: null,
      repositoryHead: null,
      projectFields: Object.freeze({}),
      dependencies: Object.freeze([]),
      sessionPolicy: Object.freeze({}),
      exceptionStatus: 'indeterminate',
    }),
  });
}

function detail(item) {
  const parts = [item.code || item.id || item.requirementId];
  if (item.requirementId && item.code) parts.push(`requirement=${item.requirementId}`);
  if (item.reference) parts.push(`reference=${item.reference}`);
  if (item.remediation) parts.push(`remediation=${item.remediation}`);
  return parts.filter(Boolean).join(' ');
}

export function formatWorkflowPreflightReport(report, { json = false } = {}) {
  if (json) return JSON.stringify(report, null, 2);
  const lines = [
    `Workflow preflight: ${report.status}`,
    `Repository: ${report.repository}`,
    `Issue: #${report.issue}`,
    `State: ${report.currentState} -> ${report.targetState}`,
    `Capability: ${report.capability}`,
    `Snapshot: ${report.provenance.snapshotHash}`,
    report.advisoryNote,
    'Authority revisions:',
    ...(report.authorityRevisions.length === 0
      ? ['- none']
      : report.authorityRevisions.map(
          (item) =>
            `- ${item.recordId} revision=${item.revision} disposition=${item.disposition} reference=${item.reference}`
        )),
    'Requirements:',
    ...report.requirements.map(
      (item) => `- ${item.id}: ${item.outcome} evaluation=${item.evaluation}`
    ),
    'Waivers:',
    ...(report.waivers.length === 0
      ? ['- none']
      : report.waivers.map((item) => `- ${detail(item)}`)),
    'Prohibitions:',
    ...(report.prohibitions.length === 0
      ? ['- none']
      : report.prohibitions.map((item) => `- ${detail(item)}`)),
    'Blockers:',
    ...(report.blockers.length === 0
      ? ['- none']
      : report.blockers.map((item) => `- ${detail(item)}`)),
    'Pending future evidence:',
    ...(report.pendingFutureEvidence.length === 0
      ? ['- none']
      : report.pendingFutureEvidence.map((item) => `- ${detail(item)}`)),
    'External unknowns:',
    ...(report.externalUnknowns.length === 0
      ? ['- none']
      : report.externalUnknowns.map((item) => `- ${detail(item)}`)),
    'Remediation:',
    ...(report.remediation.length === 0
      ? ['- none']
      : report.remediation.map(({ action }) => `- ${action}`)),
  ];
  return lines.join('\n');
}
