// @story #1770
// Fixed observation-port accounting. Each named side performs a fresh
// collection; neither side borrows the other's memo or claims live CLI timing.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { annotateSuccessfulGuidanceMutation } from '../../../guidance/annotation.mjs';
import { createObservationAttempt } from '../../task-tracker/lib/action-decision/observations.mjs';
import { evaluateAction } from '../../task-tracker/lib/action-decision/evaluate.mjs';
import { presentActionDecision } from '../../task-tracker/lib/action-decision/presentation.mjs';
import { computeScopeIdentity } from '../../task-tracker/lib/workflow-policy/scope-identity.mjs';
import { measureFixedActionAuthorityReads } from './action-authority-cost.mjs';
import { measureFixedExplanationAuthorityReads } from './action-explanation-authority-cost.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const BASELINE_PATH = 'scripts/tests/fixtures/1558/action-authority-cost.json';
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const read = (relative) => readFileSync(path.join(ROOT, relative));
const ISSUE = 1770;
const REPOSITORY = 'example/project';
const BODY =
  '## User Story\nRelease reviewer\n\n## Scope\nMeasure authority\n\n## Acceptance Criteria\n- [ ] Reads match';
const SCOPE = computeScopeIdentity({ repository: REPOSITORY, issue: ISSUE, body: BODY });
const NOW = () => '2026-09-23T00:00:00.000Z';

function counts(action) {
  const perResource = {};
  for (const { resource } of action.requests) {
    perResource[resource] = (perResource[resource] ?? 0) + 1;
  }
  return {
    physicalReads: action.requestCount,
    requestKeys: action.requestKeys,
    perResource,
    retryCount: 0,
    additionalPageCount: 0,
    transportScope: 'fixed-observation-port-no-transport-pagination',
  };
}

async function namedRefresh() {
  let physicalReads = 0;
  const attempt = createObservationAttempt({
    repository: REPOSITORY,
    issue: ISSUE,
    boundaryId: `authority-refresh:${ISSUE}`,
    now: NOW,
    read: async (request) => {
      physicalReads++;
      return { ...request, value: { number: ISSUE, body: BODY } };
    },
  });
  const query = { resource: 'issue-body', identity: `issue:${ISSUE}`, scope: SCOPE };
  await attempt.observe(query);
  await attempt.observe(query);
  const before = physicalReads;
  await attempt.observe({ ...query, refresh: true });
  attempt.finish();
  if (before !== 1 || physicalReads !== 2) throw new Error('authority: refresh accounting drift');
  return {
    resource: 'issue-body',
    physicalReadsBefore: before,
    physicalReadsAfter: physicalReads,
    reason: 'explicit-refresh-request',
  };
}

async function workflowPolicy() {
  const refusal = {
    id: 'plan-exit-plan-approved',
    guardId: 'plan-exit-plan-approved',
    code: 'plan-approval-missing',
    args: {},
    remediation: { id: 'record-plan-approval', args: { issue: ISSUE } },
    reason: 'approval missing',
  };
  async function evaluate({ waivable, unrelated }) {
    const requests = [];
    const attempt = createObservationAttempt({
      repository: REPOSITORY,
      issue: ISSUE,
      boundaryId: `authority-policy:${waivable}:${ISSUE}`,
      now: NOW,
      read: async (request) => {
        requests.push(request.resource);
        if (request.resource === 'issue-body') {
          return { ...request, value: { number: ISSUE, body: BODY } };
        }
        if (request.resource !== 'workflow-policy')
          throw new Error('unexpected authority resource');
        return {
          ...request,
          value: {
            schema: 'aitm.workflow-boundary-policy/v1',
            status: 'policy-compatible',
            repository: REPOSITORY,
            issue: ISSUE,
            scopeIdentity: SCOPE,
            decisions: [{ id: waivable ? 'approval.plan' : 'unrelated.guard', outcome: 'waived' }],
          },
        };
      },
    });
    const decision = await evaluateAction({
      actionId: 'promote',
      repository: REPOSITORY,
      issue: ISSUE,
      inputs: { state: 'plan', head: 'a'.repeat(40), body: BODY },
      attempt,
      deps: {
        effectAttempts: () => [],
        runReadOnlyGuards: async (_from, _to, context) =>
          (!waivable && !unrelated) || context.workflowPolicy?.isWaived('approval.plan')
            ? { ok: true, status: 'ready', refusals: [], humanDecision: null }
            : {
                ok: false,
                status: unrelated ? 'indeterminate' : 'blocked',
                refusals: [
                  unrelated
                    ? {
                        id: 'action-result-validation',
                        guardId: 'action-result-validation',
                        code: 'guard-error',
                        args: {},
                        noAutomaticRemediation: { reason: 'result-investigation-required' },
                        reason: 'unrelated guard failed',
                      }
                    : refusal,
                ],
                humanDecision: null,
              },
      },
    });
    if (decision.status !== (unrelated ? 'indeterminate' : 'ready')) {
      throw new Error('authority: policy fixture verdict drift');
    }
    const readsBeforePresentation = requests.length;
    presentActionDecision({
      decision,
      admissionWarnings: [],
      suppressSourceWarning: false,
    });
    return {
      policyReads: requests.filter((resource) => resource === 'workflow-policy').length,
      diagnosticExtraReads: requests.length - readsBeforePresentation,
    };
  }
  const baseline = await evaluate({ waivable: false, unrelated: false });
  const unrelated = await evaluate({ waivable: false, unrelated: true });
  const waiver = await evaluate({ waivable: true, unrelated: false });
  if (baseline.policyReads !== 0 || unrelated.policyReads !== 0 || waiver.policyReads !== 1) {
    throw new Error('authority: workflow policy enrichment drift');
  }
  return {
    accounting: {
      readyBaselinePhysicalReads: baseline.policyReads,
      waivableFailurePhysicalReads: waiver.policyReads,
      requirementIds: ['approval.plan'],
      unrelatedRequirementReads: unrelated.policyReads,
    },
    diagnosticExtraReads:
      baseline.diagnosticExtraReads + unrelated.diagnosticExtraReads + waiver.diagnosticExtraReads,
  };
}

async function postSuccessAnnotation() {
  const admission = {
    trust: 'project-owned-diverged',
    validation: { source: { catalogFileDigest: `sha256:${'a'.repeat(64)}` } },
  };
  async function probe({ mutationSucceeded, existing, trust = admission.trust }) {
    let lookups = 0;
    let writes = 0;
    await annotateSuccessfulGuidanceMutation({
      admission: { ...admission, trust },
      issue: ISSUE,
      repository: REPOSITORY,
      projectDir: ROOT,
      mutationSucceeded,
      deps: {
        withLock: async (_options, fn) => fn(),
        listComments: async () => {
          lookups++;
          return {
            issueId: 'issue-node',
            comments: existing ? [{ body: '<!-- aitm-guidance-override:v1 ' }] : [],
          };
        },
        postComment: async () => {
          writes++;
          return { id: 'comment-node' };
        },
      },
    });
    return { lookups, writes };
  }
  return {
    ordinarySuccess: await probe({
      mutationSucceeded: true,
      existing: false,
      trust: 'project-owned',
    }),
    divergedExisting: await probe({ mutationSucceeded: true, existing: true }),
    divergedAbsent: await probe({ mutationSucceeded: true, existing: false }),
    phase: 'after-durable-success',
  };
}

function timingSummary(input, kind) {
  if (input?.kind !== kind || !Array.isArray(input.samplesMs) || input.samplesMs.length < 5) {
    throw new Error(`authority: invalid ${kind} timing input`);
  }
  const samplesMs = input.samplesMs;
  if (samplesMs.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error(`authority: invalid ${kind} timing sample`);
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const medianMs = sorted[Math.ceil(sorted.length * 0.5) - 1];
  const p95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1];
  const ciCeilingMs = Math.ceil(p95Ms * 1.25);
  return {
    ...input,
    sampleCount: samplesMs.length,
    medianMs,
    p95Ms,
    ciCeilingMs,
    ceilingBasis: 'recorded-p95-with-at-least-20-percent-headroom',
  };
}

export async function buildAuthorityAfterReport({ timingBytes } = {}) {
  if (!Buffer.isBuffer(timingBytes)) throw new TypeError('authority: timing bytes required');
  const timing = JSON.parse(timingBytes);
  const baselineBytes = read(BASELINE_PATH);
  const baseline = JSON.parse(baselineBytes);
  const explain = await measureFixedExplanationAuthorityReads();
  const executor = await measureFixedActionAuthorityReads();
  const actions = baseline.actions.map(({ id, ceiling, requestCount }) => {
    const left = explain.actions.find((action) => action.id === id);
    const right = executor.actions.find((action) => action.id === id);
    if (!left || !right || left.status !== 'ready' || right.status !== 'ready') {
      throw new Error(`authority: missing ready action ${id}`);
    }
    const explainCounts = counts(left);
    const executorCounts = counts(right);
    const pairedEqual = JSON.stringify(explainCounts) === JSON.stringify(executorCounts);
    if (
      !pairedEqual ||
      explainCounts.physicalReads !== requestCount ||
      explainCounts.physicalReads * 5 > ceiling * 4
    ) {
      throw new Error(`authority: read parity or ceiling drift for ${id}`);
    }
    return {
      id,
      explain: explainCounts,
      executor: executorCounts,
      pairedEqual,
      ciRequestCeiling: ceiling,
    };
  });
  const policy = await workflowPolicy();
  return {
    schema: 'aitm.guidance-authority-after/v1',
    classification: 'fixed-stub-collection-and-controlled-live-timing',
    sources: {
      actionBaselinePath: BASELINE_PATH,
      actionBaselineSha256: sha256(baselineBytes),
      timingPath: 'scripts/tests/fixtures/1558/authority-after-timing.json',
      timingSha256: sha256(timingBytes),
    },
    deterministic: {
      method: 'separate-explanation-evaluator-and-direct-executor-collector-attempts',
      limitation:
        'Fixed observation-port fixture at the shared read seam; not public-CLI transport.',
      actions,
      totals: {
        explainPhysicalReads: actions.reduce(
          (sum, action) => sum + action.explain.physicalReads,
          0
        ),
        executorPhysicalReads: actions.reduce(
          (sum, action) => sum + action.executor.physicalReads,
          0
        ),
      },
      separateInvocations: { collectionCount: 2, crossInvocationReuse: false },
      sameInvocationDiagnostic: { extraPhysicalReads: policy.diagnosticExtraReads },
      namedRefresh: await namedRefresh(),
      workflowPolicy: policy.accounting,
      postSuccessAnnotation: await postSuccessAnnotation(),
    },
    timing: {
      localCache: timingSummary(timing.localCache, 'local-cache'),
      localStub: timingSummary(timing.localStub, 'local-stub'),
      controlledLive: timingSummary(timing.controlledLive, 'controlled-read-only'),
    },
  };
}
