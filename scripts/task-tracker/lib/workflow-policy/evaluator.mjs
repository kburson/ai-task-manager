import {
  WORKFLOW_POLICY_CAPABILITY,
  requirementById,
  validateConstraints,
  validateWaiverIds,
} from './catalog.mjs';

export const POLICY_OUTCOMES = Object.freeze({
  SATISFIED: 'satisfied',
  WAIVED: 'waived',
  MISSING: 'missing',
  NOT_APPLICABLE: 'not-applicable',
});

function conflict(code, detail = null) {
  return Object.freeze({ code, ...(detail == null ? {} : { detail }) });
}

function validateRecord(record, context) {
  const conflicts = [];
  if (!record || typeof record !== 'object') return { conflicts: [conflict('malformed-record')] };
  if (record.disposition !== 'active')
    conflicts.push(conflict('record-not-active', record.disposition));
  if (String(record.repository || '').toLowerCase() !== context.repository.toLowerCase()) {
    conflicts.push(conflict('record-repository-mismatch'));
  }
  if (Number(record.issue) !== Number(context.issue))
    conflicts.push(conflict('record-issue-mismatch'));
  if (record.scopeIdentity !== context.scopeIdentity)
    conflicts.push(conflict('record-scope-stale'));
  if (record.expiresAt != null) {
    const expiry = Date.parse(record.expiresAt);
    if (!Number.isFinite(expiry)) conflicts.push(conflict('record-expiry-invalid'));
    else if (expiry <= context.nowMs) conflicts.push(conflict('record-expired'));
  }
  if (!record.authority?.reference || !record.authority?.verificationLevel) {
    conflicts.push(conflict('record-authority-unresolved'));
  }
  let requirementIds = [];
  let constraints = [];
  try {
    requirementIds = validateWaiverIds(record.requirementIds);
  } catch (error) {
    conflicts.push(conflict('record-requirements-invalid', error.message));
  }
  try {
    constraints = validateConstraints(record.constraints);
  } catch (error) {
    conflicts.push(conflict('record-constraints-invalid', error.message));
  }
  return { conflicts, requirementIds, constraints };
}

function evidenceDecision(id, evidence = {}) {
  const observed = evidence[id];
  if (observed?.state === 'satisfied') {
    return {
      id,
      outcome: POLICY_OUTCOMES.SATISFIED,
      evaluation: 'evaluated',
      reasonCode: 'evidence-satisfied',
      ...(observed.reference ? { evidenceReference: observed.reference } : {}),
    };
  }
  if (observed?.state === 'not-applicable') {
    if (!observed.policyReference) {
      return {
        id,
        outcome: POLICY_OUTCOMES.MISSING,
        evaluation: 'evaluated',
        reasonCode: 'applicability-policy-reference-missing',
        remediation: `provide an applicability policy reference for ${id}`,
      };
    }
    return {
      id,
      outcome: POLICY_OUTCOMES.NOT_APPLICABLE,
      evaluation: 'evaluated',
      reasonCode: observed.reasonCode || 'baseline-not-applicable',
      policyReference: observed.policyReference,
    };
  }
  const pending = observed?.state === 'pending-future-evidence';
  return {
    id,
    outcome: POLICY_OUTCOMES.MISSING,
    evaluation: pending ? 'pending-future-evidence' : 'evaluated',
    reasonCode: pending ? 'future-evidence-required' : 'evidence-missing',
    ...(observed?.remediation ? { remediation: observed.remediation } : {}),
  };
}

export function evaluateWorkflowPolicy(input = {}) {
  const repository = String(input.repository || '');
  const issue = Number(input.issue);
  const scopeIdentity = String(input.scopeIdentity || '');
  const nowMs = Date.parse(input.now || new Date().toISOString());
  if (!repository || !Number.isSafeInteger(issue) || issue <= 0 || !scopeIdentity) {
    throw new TypeError('workflow-policy:evaluation-context');
  }
  if (!Number.isFinite(nowMs)) throw new TypeError('workflow-policy:evaluation-time');
  const baseline = Array.isArray(input.baselineRequirementIds)
    ? input.baselineRequirementIds.map((id) => requirementById(id).id)
    : [];
  const records = Array.isArray(input.records) ? input.records : [];
  const conflicts = [];
  let active = null;
  let waiverIds = [];
  let constraints = [];
  const activeRecords = records.filter((record) => record?.disposition === 'active');
  if (activeRecords.length > 1) {
    conflicts.push(
      conflict(
        'ambiguous-active-records',
        activeRecords.map(({ recordId }) => recordId)
      )
    );
  } else if (records.length > 0) {
    active = activeRecords[0] || records[0];
    const validation = validateRecord(active, { repository, issue, scopeIdentity, nowMs });
    conflicts.push(...validation.conflicts);
    if (validation.conflicts.length === 0) {
      waiverIds = validation.requirementIds;
      constraints = validation.constraints;
    }
  }
  const waiverSet = new Set(waiverIds);
  const authority = active
    ? Object.freeze({
        recordId: active.recordId,
        revision: Number(active.revision),
        reference: active.authority?.reference,
        verificationLevel: active.authority?.verificationLevel,
      })
    : null;
  const decisions = baseline.map((id) => {
    if (waiverSet.has(id)) {
      return Object.freeze({
        id,
        outcome: POLICY_OUTCOMES.WAIVED,
        evaluation: 'evaluated',
        reasonCode: 'exception-requirement-waived',
        authority,
      });
    }
    return Object.freeze(evidenceDecision(id, input.evidence));
  });
  const prohibitions = constraints
    .filter(({ effect }) => effect === 'deny')
    .map(({ id, effect }) =>
      Object.freeze({
        id,
        effect,
        reasonCode: 'exception-constraint-deny',
        authority,
      })
    );
  const enforcedProhibition =
    String(input.activity || '').startsWith('managed-provider:') && prohibitions.length > 0;
  const blockers = [
    ...conflicts,
    ...decisions
      .filter(
        ({ outcome, evaluation }) =>
          outcome === POLICY_OUTCOMES.MISSING && evaluation === 'evaluated'
      )
      .map(({ id, remediation }) =>
        Object.freeze({
          code: 'requirement-missing',
          requirementId: id,
          remediation: remediation || `satisfy requirement ${id}`,
        })
      ),
    ...(enforcedProhibition
      ? prohibitions.map(({ id }) =>
          Object.freeze({
            code: 'execution-prohibited',
            constraintId: id,
            remediation:
              'remove or supersede the active deny constraint through an authorized revision',
          })
        )
      : []),
  ];
  return Object.freeze({
    schema: 'aitm.workflow-policy-evaluation/v1',
    capability: WORKFLOW_POLICY_CAPABILITY,
    repository,
    issue,
    state: input.state || null,
    activity: input.activity || null,
    status: blockers.length > 0 ? 'blocked' : 'policy-compatible',
    decisions: Object.freeze(decisions),
    prohibitions: Object.freeze(prohibitions),
    conflicts: Object.freeze(conflicts),
    blockers: Object.freeze(blockers),
  });
}
