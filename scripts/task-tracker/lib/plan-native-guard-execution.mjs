// @story #2069
// Genuine registry evaluation for the private, unpublished Plan transition.
import { createHash } from 'node:crypto';
import { readNativeTransitionBoundary } from './story-cache/transition-batch.mjs';
import { hydrateJournalSnapshot } from './story-cache/journal.mjs';
import { nativePlanGuardSources } from './plan-transition-native.mjs';
import { evaluateCompleteGuards } from './action-decision/evaluate.mjs';
import { runGuards } from './guard-registry.mjs';
import './guard-bootstrap.mjs';
import { loadWorkflowBoundary, evaluateWorkflowBoundary } from './workflow-policy/enforcement.mjs';
import { parseAitmRecord } from './github-records/record-envelope.mjs';
import { resolveStoryIntentSource } from './story-intent-source.mjs';
import { rebindNativePlanApproval } from './plan-approval-staging.mjs';
import { loadConfig } from '../config.mjs';
import { loadSession } from './session-store.mjs';
import { resolveSessionId } from './session-id.mjs';
import { computeScopeIdentity } from './workflow-policy/scope-identity.mjs';
import { parsePlanApprovedMarker } from './markers.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { requireUniqueRefineEstimateComment } from './plan-exit-planned-estimate-guard.mjs';
import { fieldIdFor } from '../project-fields.mjs';
import { deriveDependencyProjection } from './dependency-disposition.mjs';
import { isTerminalDisposition } from './terminal-disposition.mjs';
const grants = new WeakMap();
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function refuse(reason) {
  throw new Error('native-plan-guards:' + reason);
}
export function readNativePlanGuardAdmission(grant, { batchId, publicationGeneration } = {}) {
  const value = grants.get(grant);
  if (!value || value.batchId !== batchId || value.publicationGeneration !== publicationGeneration)
    refuse('admission');
  return value;
}
export async function runNativePlanGuardExecution(boundary) {
  const native = await readNativeTransitionBoundary(boundary, { phase: 'native-guards' });
  const { record, store, claim } = native;
  const batch = record.generation.batch;
  const identity = record.generation.identity;
  if (
    batch.transition.from !== 'plan' ||
    batch.transition.to !== 'develop' ||
    batch.status !== 'prepared' ||
    batch.effects.some((effect) => effect.attempted || effect.outcome !== null)
  )
    refuse('intent');
  const issue = batch.effects.find((effect) => effect.kind === 'issue-update');
  const body = issue.candidate.body;
  const sources = nativePlanGuardSources(native.nativePlanAuthority);
  const cfg = loadConfig({ projectDir: claim.worktree });
  for (const key of [
    'repo',
    'projectId',
    'kanbanFieldId',
    'kanbanOptionPlan',
    'kanbanOptionDevelop',
    'estimationRubricIssue',
    'gateAnalysisToDevelopment',
  ]) {
    if (cfg[key] !== native.cfg[key]) refuse('configuration-drift');
  }
  const published = hydrateJournalSnapshot(batch.baseline, record.payloads);
  const comments = new Map(
    published.inventory.map((id) => [id, { id, body: published.resources['comment:' + id].body }])
  );
  const fields = new Map(published.fields.map((row) => [row.fieldId, row]));
  for (const effect of batch.effects) {
    if (effect.key === native.statusKey || effect.kind === 'issue-update') continue;
    if (effect.kind === 'project-field-update') fields.set(effect.target.fieldId, effect.candidate);
    else
      comments.set(effect.kind === 'comment-create' ? effect.key : effect.target.commentNodeId, {
        id: effect.kind === 'comment-create' ? effect.key : effect.target.commentNodeId,
        body: typeof effect.candidate === 'string' ? effect.candidate : effect.candidate.body,
      });
  }
  const rows = [...comments.values()];
  let rebound = null;
  if (record.generation.working[issue.key]?.capabilityRef?.startsWith('plan-approved:'))
    rebound = await rebindNativePlanApproval({ store, claim, cfg: native.cfg, deps: sources });
  const policyRecords = published.inventory
    .filter((id) => /<!--\s*aitm-record/.test(published.resources['comment:' + id].body))
    .map((id) =>
      parseAitmRecord({
        commentNodeId: id,
        body: published.resources['comment:' + id].body,
        expectedRepository: identity.repository,
        expectedIssue: identity.issueNumber,
      })
    );
  let decompositionAdmission = null;
  const context = {
    issueNumber: identity.issueNumber,
    repo: identity.repository,
    fromState: 'plan',
    toState: 'develop',
    body,
    cfg,
    projectDir: claim.worktree,
    invokingDir: claim.worktree,
    readOnly: true,
    sessionPolicy: loadSession(resolveSessionId()),
    fetchBlockerState: sources.fetchBlockerState,
    deps: {
      resolveStoryIntent: resolveStoryIntentSource,
      resolveTrunkSha: sources.resolveTrunkSha,
      fetchParentIssue: sources.fetchParentIssue,
      epicChildren: { fetchSiblings: sources.fetchEpicChildren },
      dependencyReadiness: { nativeDependencies: { pexec: sources.runGithubRead } },
      reconcileDependencyDisposition: async ({ observation, observationError }) => {
        if (observationError || !observation) refuse('disposition-observation-unavailable');
        const fieldId = fieldIdFor(cfg, 'disposition');
        const original = published.fields.find((row) => row.fieldId === fieldId);
        const planned = fields.get(fieldId);
        if (!fieldId || original?.type !== 'SINGLE_SELECT' || !planned)
          refuse('disposition-field-unavailable');
        const before = original.value?.name ?? '';
        const after = planned.value?.name ?? '';
        if (isTerminalDisposition(before)) {
          if (after !== before) refuse('disposition-terminal-change');
          return;
        }
        if (!['', 'BLOCKED'].includes(before)) refuse('disposition-unexpected-current');
        const projection = deriveDependencyProjection(observation);
        if (projection.status === 'unknown') refuse('disposition-observation-unavailable');
        const target = projection.status === 'ready' ? '' : 'BLOCKED';
        const effect = batch.effects.find(
          (entry) => entry.kind === 'project-field-update' && entry.target.fieldId === fieldId
        );
        if (
          after !== target ||
          (before !== target &&
            (!effect ||
              !batch.effects
                .find((entry) => entry.key === native.statusKey)
                .dependencies.includes(effect.key)))
        )
          refuse('disposition-effect-required');
      },
      ownership: {
        fetchCurrentUser: sources.fetchCurrentUser,
        fetchSnapshot: async () => ({ state: 'plan', assignees: published.assignees }),
      },
      decomposition: {
        graphql: sources.graphql,
        readPlanAtCommit: sources.readPlanAtCommit,
        nativePlanApprovalCapability: rebound?.capability,
        nativePlanBoundary: boundary,
        onNativeProjection: (value) => {
          decompositionAdmission = JSON.parse(JSON.stringify(value));
        },
      },
      plannedEstimate: {
        listComments: async () => {
          return [requireUniqueRefineEstimateComment(rows, identity.issueNumber)];
        },
        forecastProjection: async () => {
          const forecasts = rows
            .filter((row) => /<!--\s*aitm-record/.test(row.body))
            .map((row) =>
              parseAitmRecord({
                commentNodeId: row.id,
                body: row.body,
                expectedRepository: identity.repository,
                expectedIssue: identity.issueNumber,
              })
            )
            .filter((row) => row.envelope.recordType === 'estimation-forecast');
          const superseded = new Set(
            forecasts.map((row) => row.envelope.supersedes).filter(Boolean)
          );
          const ready = parsePlanApprovedMarker(body)?.forecastRecordId;
          const selected = forecasts.find((row) => row.envelope.recordId === ready);
          return {
            forecast: selected
              ? {
                  recordId: ready,
                  payload: selected.envelope.payload,
                  supersededBy: superseded.has(ready) ? true : null,
                }
              : null,
            activeForecastRecordIds: forecasts
              .filter((row) => !superseded.has(row.envelope.recordId))
              .map((row) => row.envelope.recordId),
            board: {
              size: fields.get(fieldIdFor(cfg, 'size'))?.value?.name ?? null,
              estimate: fields.get(fieldIdFor(cfg, 'estimate'))?.value ?? null,
            },
            bodyFields: parseIssueFieldDb(body).values,
          };
        },
      },
    },
  };
  const instant = batch.effects
    .find((effect) => effect.candidate?.schema === 'aitm.story-timing-candidate/v1')
    .candidate.timing.events.find((event) => event.transitionId === batch.transition.id).timestamp;
  const complete = await evaluateCompleteGuards({
    fromState: 'plan',
    toState: 'develop',
    context,
    runGuards,
    guardPhasePolicy: { includeExitGuards: true, includeEntryGuards: true },
    loadPolicy: ({ requirementIds }) =>
      loadWorkflowBoundary({
        repository: identity.repository,
        issue: identity.issueNumber,
        body,
        requirementIds,
        activity: 'workflow-transition:develop',
        state: 'plan',
        now: new Date().toISOString(),
        runtime: { listRecords: async () => policyRecords },
      }),
  });
  if (!complete.guardResult.ok) return { exit: 4, guardRefusals: complete.guardResult.refusals };
  const waived =
    complete.guardContext.workflowPolicy?.decisions.filter(
      (decision) => decision.outcome === 'waived'
    ) ?? [];
  const checkCurrentTime = () => {
    if (!waived.length) return;
    const current = evaluateWorkflowBoundary({
      repository: identity.repository,
      issue: identity.issueNumber,
      body,
      records: policyRecords,
      requirementIds: waived.map((decision) => decision.id),
      activity: 'workflow-transition:develop',
      state: 'plan',
      now: new Date().toISOString(),
    });
    if (
      current.status !== 'policy-compatible' ||
      waived.some((decision) => {
        const renewed = current.decision(decision.id);
        return (
          renewed?.outcome !== 'waived' ||
          JSON.stringify(renewed.authority) !== JSON.stringify(decision.authority)
        );
      })
    )
      refuse('expired-admission');
  };
  checkCurrentTime();
  const deepFreeze = (value) => {
    if (value && typeof value === 'object') {
      for (const item of Object.values(value)) deepFreeze(item);
      Object.freeze(value);
    }
    return value;
  };
  if (!decompositionAdmission) refuse('decomposition-admission');
  const grant = Object.freeze({});
  grants.set(
    grant,
    Object.freeze({
      batchId: batch.batchId,
      publicationGeneration: batch.publicationGeneration,
      body,
      scopeIdentity: computeScopeIdentity({
        repository: identity.repository,
        issue: identity.issueNumber,
        body,
      }),
      sourceDigest: hash(body),
      workflowPolicy: complete.guardContext.workflowPolicy ?? null,
      sessionPolicy: context.sessionPolicy,
      recordedAt: instant,
      checkCurrentTime,
      decomposition: deepFreeze(decompositionAdmission),
    })
  );
  return { exit: null, nativePlanAdmission: grant };
}
