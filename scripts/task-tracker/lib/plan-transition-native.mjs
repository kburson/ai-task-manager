// @story #2069
// Phase authority comes from the coordinator's live owner/lock/journal boundary.
import { createHash } from 'node:crypto';
import { canonicalRecordJson as json } from './github-records/canonical-json.mjs';
import { readNativeTransitionBoundary } from './story-cache/transition-batch.mjs';
import { hydrateJournalSnapshot, validateRecoveryJournal } from './story-cache/journal.mjs';
import { materializeBodyTemplate } from './story-cache/body-template.mjs';
import { compareSnapshots } from './story-cache/snapshot-compare.mjs';
import { rebindNativePlanApproval } from './plan-approval-staging.mjs';
import { readNativePlanForecastSelection } from './estimation/native-plan-selection.mjs';
import {
  derivePlanDecompositionProjection,
  planProjectionResources,
} from './plan-decomposition-projection.mjs';
import { computeScopeIdentity } from './workflow-policy/scope-identity.mjs';
import { readCandidateForecastReady } from './plan-approved-guard.mjs';
import {
  resolvePlanTransitionAuthority,
  parsePlanTransitionAuthorityComment,
  readPlanTransitionAuthorityWrapperIds,
  renderPlanTransitionCandidateAuthority,
  renderPlanTransitionAuthorityComment,
  verifyPlanTransitionAuthorityScope,
} from './plan-transition-authority.mjs';
import { isCanonicalPlanApprovalAuditComment } from './plan-approval-audit.mjs';
import { planPlannedEstimateGate } from './refine-estimate-comment.mjs';
import {
  validatePlanCandidateForecast,
  requireUniqueRefineEstimateComment,
  readPlanCandidateForecastFacts,
} from './plan-exit-planned-estimate-guard.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const clone = (value) => JSON.parse(json(value));
const inputs = new WeakMap();
const nativePorts = new WeakSet();
const nativeSources = new WeakMap();
export function nativePlanGuardSources(ports) {
  if (!nativePorts.has(ports)) refuse('native-validators-required');
  return nativeSources.get(ports);
}
export function nativePlanAuthorityValidator(ports, name) {
  if (
    !nativePorts.has(ports) ||
    !['validateFrozenIntent', 'validatePreStatus', 'validateIssue'].includes(name)
  )
    refuse('native-validators-required');
  return ports[name];
}
function refuse(reason) {
  throw new Error('plan-candidate:' + reason);
}
/** No constructor can authorize a supplied marker, vector or alleged provider outcome. */
export function createNativePlanAuthorityPorts({ deps = {}, evidenceStore } = {}) {
  const at = (phase) => async (input) => {
    const candidate = Object.freeze({
      boundary: input.boundary,
      phase,
      body: input.candidate?.body,
      title: input.candidate?.title,
    });
    inputs.set(candidate, { deps, evidenceStore });
    try {
      return await verifyPlanTransitionAuthorityScope({ candidate });
    } finally {
      inputs.delete(candidate);
    }
  };
  const ports = Object.freeze({
    validateFrozenIntent: at('frozen-intent'),
    validatePreStatus: at('pre-status'),
    validateIssue: at('final-body'),
  });
  nativePorts.add(ports);
  nativeSources.set(ports, Object.freeze({ ...deps }));
  return ports;
}
export async function verifyNativePlanCandidate({ candidate, baselineEquality, confirmedEffects }) {
  const ports = inputs.get(candidate);
  if (!ports) refuse('native-candidate-admission');
  const native = await readNativeTransitionBoundary(candidate.boundary, { phase: candidate.phase });
  const { record, transition, statusKey, cfg, store, claim, workflowPolicy, sessionPolicy } =
    native;
  const batch = validateRecoveryJournal(record);
  if (transition.from !== 'plan' || transition.to !== 'develop') refuse('transition');
  const baseline = hydrateJournalSnapshot(batch.baseline, record.payloads);
  const equality = compareSnapshots(baseline, native.snapshot);
  if (!equality.equal)
    throw Object.assign(new Error('plan-candidate:baseline-drift'), { changes: equality.changes });
  if (baselineEquality !== undefined || confirmedEffects !== undefined) refuse('caller-evidence');
  const status = batch.effects.find((effect) => effect.key === statusKey);
  const issue = batch.effects.find((effect) => effect.kind === 'issue-update');
  const required = batch.effects.filter((effect) => effect !== status && effect !== issue);
  if (
    !status ||
    !issue ||
    status.kind !== 'project-field-update' ||
    required.some((effect) => !status.dependencies.includes(effect.key)) ||
    status.dependencies.length !== required.length
  )
    refuse('status-dependencies');
  if (candidate.phase === 'frozen-intent') {
    if (
      batch.status !== 'prepared' ||
      batch.effects.some((effect) => effect.attempted || effect.outcome !== null)
    )
      refuse('frozen-intent');
  } else {
    if (
      required.some((effect) => effect.outcome?.state !== 'confirmed') ||
      issue.attempted ||
      issue.outcome !== null
    )
      refuse('unconfirmed-prerequisites');
    if (
      candidate.phase === 'pre-status'
        ? status.attempted || status.outcome !== null
        : status.outcome?.state !== 'confirmed'
    )
      refuse('status-phase');
  }
  let body = batch.bodyTemplate.body;
  if (candidate.phase === 'final-body') {
    const realized = materializeBodyTemplate({
      template: batch.bodyTemplate,
      expectedDigest: hash(json(batch.bodyTemplate)),
      effects: batch.effects,
    });
    body = realized.candidate.body;
    if (candidate.body !== body || candidate.title !== realized.candidate.title)
      refuse('materialized-intent');
  } else if (candidate.body !== undefined && candidate.body !== body) refuse('frozen-body');
  const identity = baseline.identity;
  const scopeIdentity = computeScopeIdentity({
    repository: identity.repository,
    issue: identity.issueNumber,
    body,
  });
  if (
    !native.approvalAdmission ||
    native.approvalAdmission.scopeIdentity !== scopeIdentity ||
    native.approvalAdmission.body !== issue.candidate.body ||
    native.approvalAdmission.sourceDigest !== hash(issue.candidate.body)
  )
    refuse('native-guard-scope');
  if (workflowPolicy && workflowPolicy.scopeIdentity !== scopeIdentity) refuse('policy-scope');
  const snapshot = hydrateJournalSnapshot(record.generation.baseSnapshot, record.payloads);
  const comments = new Map(
    snapshot.inventory.map((id) => [id, { id, body: snapshot.resources['comment:' + id].body }])
  );
  if (candidate.phase === 'frozen-intent') {
    const fields = new Map(snapshot.fields.map((row) => [row.fieldId, row]));
    for (const effect of required) {
      if (effect.kind === 'project-field-update')
        fields.set(effect.target.fieldId, clone(effect.candidate));
      else {
        const text =
          typeof effect.candidate === 'string' ? effect.candidate : effect.candidate.body;
        const id = effect.kind === 'comment-create' ? effect.key : effect.target.commentNodeId;
        comments.set(id, { id, body: text });
      }
    }
    snapshot.fields = [...fields.values()];
    snapshot.fieldsDigest = hash(
      json({ canonicalizationVersion: 'aitm.canonical-json/v1', fields: snapshot.fields })
    );
  }
  const rows = [...comments.values()];
  const decomposition = native.approvalAdmission.decomposition;
  if (!decomposition) refuse('decomposition-admission');
  const projected = await derivePlanDecompositionProjection({
    source: decomposition.source,
    identity,
    cfg,
    projectDir: claim.worktree,
    ...planProjectionResources({
      record,
      body,
      effects: batch.effects,
      statusKey: native.statusKey,
    }),
    assessedAt: decomposition.assessment.assessedAt,
    deps: { readPlanAtCommit: ports.deps.readPlanAtCommit },
  });
  if (
    projected.inputDigest !== decomposition.inputDigest ||
    json(projected.assessment) !== json(decomposition.assessment) ||
    projected.projection.status !== 'current'
  )
    refuse('decomposition-confirmed-inputs');
  const matches = rows.filter((row) =>
    readPlanTransitionAuthorityWrapperIds(row.body).includes(transition.id)
  );
  if (matches.length !== 1) refuse('authority-record');
  const authorityEffects = required.filter(
    (effect) =>
      ['comment-create', 'comment-update'].includes(effect.kind) &&
      readPlanTransitionAuthorityWrapperIds(
        typeof effect.candidate === 'string' ? effect.candidate : effect.candidate.body
      ).includes(transition.id)
  );
  if (authorityEffects.length !== 1) refuse('required-authority-effect');
  const authorityEffect = authorityEffects[0];
  const authorityId =
    candidate.phase === 'frozen-intent'
      ? authorityEffect.kind === 'comment-create'
        ? authorityEffect.key
        : authorityEffect.target.commentNodeId
      : authorityEffect.outcome?.providerId;
  if (matches[0].id !== authorityId || hash(matches[0].body) !== authorityEffect.intendedDigest)
    refuse('required-authority-effect');
  const authority = parsePlanTransitionAuthorityComment(matches[0].body);
  const expected = resolvePlanTransitionAuthority({
    repository: identity.repository,
    issue: identity.issueNumber,
    transitionId: transition.id,
    body,
    cfg,
    sessionPolicy,
    workflowPolicy,
    scopeIdentity,
    recordedAt: native.approvalAdmission.recordedAt,
  });
  if (
    json(authority) !== json(expected) ||
    (matches[0].body !== renderPlanTransitionCandidateAuthority(expected) &&
      !(
        baseline.inventory.includes(matches[0].id) &&
        matches[0].body === renderPlanTransitionAuthorityComment(expected)
      ))
  )
    refuse('authority-record-mismatch');
  let admitted = {
    repository: identity.repository,
    issue: identity.issueNumber,
    projectDir: claim.worktree,
    cfg,
    scopeIdentity,
    approved: { forecastRecordId: readCandidateForecastReady(body) },
    planObservation: null,
    currentForecastSelection: null,
  };
  if (
    expected.outcome === 'satisfied' ||
    record.generation.working[issue.key]?.capabilityRef?.startsWith('plan-approved:')
  ) {
    const rebound = await rebindNativePlanApproval({ store, claim, cfg, body, deps: ports.deps });
    admitted = rebound.admitted;
    if (
      admitted.approved.mode === 'full-auto' &&
      rows.filter((row) =>
        isCanonicalPlanApprovalAuditComment(row.body, {
          issueNumber: identity.issueNumber,
          ts: admitted.approved.ts,
        })
      ).length !== 1
    )
      refuse('full-auto-audit');
  } else if (
    workflowPolicy?.decision?.('planning.forecast')?.outcome !== 'waived' &&
    (readCandidateForecastReady(body) !== null || cfg.estimationRubricIssue > 0)
  ) {
    Object.assign(admitted, readPlanCandidateForecastFacts({ body, projectDir: claim.worktree }));
    const publishedFacts = readPlanCandidateForecastFacts({
      body: baseline.resources[issue.key].body,
      projectDir: claim.worktree,
    });
    if (
      admitted.approved.forecastRecordId === null ||
      admitted.approved.forecastRecordId !== publishedFacts.approved.forecastRecordId
    )
      refuse('forecast-published-freeze');
    admitted.currentForecastSelection = await readNativePlanForecastSelection({
      identity,
      body,
      projectDir: claim.worktree,
      cfg,
      readPlanAtCommit: ports.deps.readPlanAtCommit,
    });
  }
  if (workflowPolicy?.decision?.('planning.planned-estimate')?.outcome !== 'waived') {
    const estimate = await planPlannedEstimateGate({
      cfg,
      issueNumber: identity.issueNumber,
      deps: {
        listComments: async () => [requireUniqueRefineEstimateComment(rows, identity.issueNumber)],
      },
    });
    if (!estimate.ok) refuse('planned-estimate');
  }
  if (workflowPolicy?.decision?.('planning.forecast')?.outcome !== 'waived') {
    const forecast = validatePlanCandidateForecast({
      admitted,
      body,
      snapshot,
      comments: rows,
      evidenceStore: ports.evidenceStore,
      estimateRequired:
        workflowPolicy?.decision?.('planning.planned-estimate')?.outcome !== 'waived',
    });
    if (!forecast.ok) refuse('forecast:' + forecast.blockers.join(';'));
  }
  return Object.freeze({
    verified: true,
    authority: 'candidate',
    publishedBody: false,
    scopeIdentity,
  });
}
