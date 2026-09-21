// @story #1729
// Complete shared guard orchestration. Per-action read-only adapters remain
// explicit: a missing adapter cannot advertise readiness.
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';

import { actionDescriptorFor, actionPolicyFor } from '../lifecycle-policy/actions.mjs';
import { hasAttributingCommit as defaultHasAttributingCommit } from '../commit-attribution.mjs';
import { computeScopeIdentity } from '../workflow-policy/scope-identity.mjs';
import { requirementIdsForGuardRefusals } from '../workflow-policy/enforcement.mjs';
import {
  ACTION_DECISION_SCHEMA,
  REGISTERED_GUARD_IDS,
  validateActionDecision,
} from './contract.mjs';

/**
 * Read-only remote-tip authority for a later close adapter. The caller owns
 * the Git command transport; this seam never fetches, updates refs, or accepts
 * a remote-tracking ref as a substitute for the current remote tip.
 */
const unavailableTrunkAuthority = (reason) =>
  Object.freeze({
    status: 'indeterminate',
    code: 'attribution-authority-unavailable',
    reason,
  });

const validTrunkRef = (ref) =>
  typeof ref === 'string' && /^refs\/heads\/[A-Za-z0-9._/-]+$/.test(ref) && !ref.includes('..');

async function verifyLocalGraph({ sha, cwd, execGit }) {
  const output = async (args) => {
    const result = await execGit(args, { cwd });
    return typeof result === 'string' ? result : result?.stdout;
  };
  const shallow = (await output(['rev-parse', '--is-shallow-repository']))?.trim();
  if (shallow !== 'false') return unavailableTrunkAuthority('shallow-or-unknown');
  await output(['cat-file', '-e', `${sha}^{commit}`]);
  const graph = await output(['rev-list', '--objects', '--missing=print', sha]);
  if (!graph || !graph.split('\n').some((line) => line.startsWith(sha))) {
    return unavailableTrunkAuthority('object-graph-invalid');
  }
  if (graph.split('\n').some((line) => line.startsWith('?'))) {
    return unavailableTrunkAuthority('object-graph-incomplete');
  }
  return null;
}

export async function readExactTrunkTip({ remote, ref, cwd, execGit } = {}) {
  if (
    typeof remote !== 'string' ||
    !/^[A-Za-z0-9._-]+$/.test(remote) ||
    !validTrunkRef(ref) ||
    typeof execGit !== 'function'
  )
    return unavailableTrunkAuthority('unsupported-ref');
  const output = async (args) => {
    const result = await execGit(args, { cwd });
    return typeof result === 'string' ? result : result?.stdout;
  };
  try {
    const remoteOutput = await output(['ls-remote', '--exit-code', remote, ref]);
    const lines = String(remoteOutput ?? '')
      .trim()
      .split('\n');
    if (lines.length !== 1) return unavailableTrunkAuthority('remote-tip-invalid');
    const match = /^([a-f0-9]{40,64})\s+([^\s]+)$/.exec(lines[0]);
    if (!match || match[2] !== ref) return unavailableTrunkAuthority('remote-tip-invalid');
    const sha = match[1];
    const graphFailure = await verifyLocalGraph({ sha, cwd, execGit });
    if (graphFailure) return graphFailure;
    return Object.freeze({
      status: 'observed',
      remote,
      ref,
      sha,
      objectComplete: true,
      shallow: false,
    });
  } catch {
    return unavailableTrunkAuthority('remote-or-local-read-failed');
  }
}

/** A configured local branch is a different, explicitly labeled authority. */
export async function readLocalTrunkTip({ localRef, cwd, execGit } = {}) {
  const qualifiedRef =
    typeof localRef === 'string' && !localRef.startsWith('refs/')
      ? `refs/heads/${localRef}`
      : localRef;
  if (!validTrunkRef(qualifiedRef) || typeof execGit !== 'function') {
    return unavailableTrunkAuthority('unsupported-ref');
  }
  try {
    const result = await execGit(['rev-parse', '--verify', `${qualifiedRef}^{commit}`], { cwd });
    const sha = (typeof result === 'string' ? result : result?.stdout)?.trim();
    if (!/^[a-f0-9]{40,64}$/.test(sha ?? '')) {
      return unavailableTrunkAuthority('local-tip-invalid');
    }
    const graphFailure = await verifyLocalGraph({ sha, cwd, execGit });
    if (graphFailure) return graphFailure;
    return Object.freeze({
      status: 'observed',
      authority: 'local',
      ref: qualifiedRef,
      sha,
      objectComplete: true,
      shallow: false,
    });
  } catch {
    return unavailableTrunkAuthority('local-read-failed');
  }
}

/** Read-only message attribution against the exact verified remote tip. */
export async function evaluateExactTrunkAttribution({
  issue,
  remote,
  ref,
  localRef,
  cwd,
  execGit,
  hasAttributingCommit = defaultHasAttributingCommit,
} = {}) {
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) {
    return Object.freeze({
      status: 'indeterminate',
      code: 'attribution-authority-unavailable',
      reason: 'repository-path-required',
    });
  }
  if (localRef !== undefined && (remote !== undefined || ref !== undefined)) {
    return unavailableTrunkAuthority('ambiguous-authority');
  }
  const tip =
    localRef === undefined
      ? await readExactTrunkTip({ remote, ref, cwd, execGit })
      : await readLocalTrunkTip({ localRef, cwd, execGit });
  if (tip.status !== 'observed') return tip;
  try {
    const attributed = await hasAttributingCommit(issue, { refs: [tip.sha], cwd });
    if (typeof attributed !== 'boolean') throw new TypeError('attribution result is not boolean');
    return Object.freeze({ status: attributed ? 'attributed' : 'not-attributed', tip });
  } catch {
    return Object.freeze({
      status: 'indeterminate',
      code: 'attribution-authority-unavailable',
      reason: 'attribution-read-failed',
    });
  }
}

export async function observeExactTrunkAttribution({ attempt, issue, scope, remote, ref } = {}) {
  const unavailable = (reason) =>
    Object.freeze({
      status: 'indeterminate',
      cause: {
        guardId: 'authority-collection',
        code: 'attribution-authority-unavailable',
        args: {},
        noAutomaticRemediation: { reason: 'authority-investigation-required' },
      },
      reason,
    });
  if (!attempt || typeof attempt.observe !== 'function') return unavailable('missing-attempt');
  let observation;
  try {
    observation = await attempt.observe({
      resource: 'delivery',
      identity: `evidence:${issue}:2`,
      scope,
    });
  } catch {
    return unavailable('delivery-read-failed');
  }
  if (observation.status !== 'observed') return unavailable('delivery-read-failed');
  const value = observation.value;
  if (
    value?.status !== 'observed' ||
    value.remote !== remote ||
    value.ref !== ref ||
    !/^[a-f0-9]{40,64}$/.test(value.sha ?? '') ||
    value.objectComplete !== true ||
    value.shallow !== false
  )
    return unavailable('tip-or-graph-incompatible');
  return Object.freeze({ status: 'observed', value, observation });
}

export function indeterminateRefreshResult({ guardResult, refusals, issueNumber }) {
  return {
    ...guardResult,
    ok: false,
    status: 'indeterminate',
    refusals: [
      ...refusals,
      {
        id: 'authority-collection',
        guardId: 'authority-collection',
        code: 'authority-read-failed',
        args: { source: 'issue-body', reason: 'invalid', subject: { issue: issueNumber } },
        noAutomaticRemediation: { reason: 'authority-investigation-required' },
        reason: 'fresh issue body guard evaluation failed',
      },
    ],
  };
}

function completeGuardResult(result) {
  return Boolean(
    result &&
    typeof result === 'object' &&
    ['ready', 'blocked', 'indeterminate'].includes(result.status) &&
    result.ok === (result.status === 'ready') &&
    Array.isArray(result.refusals) &&
    (result.status !== 'ready' || result.refusals.length === 0) &&
    (result.status === 'ready' || result.refusals.length > 0) &&
    Object.hasOwn(result, 'humanDecision') &&
    (result.humanDecision === null || Array.isArray(result.humanDecision?.requests)) &&
    (result.warns === undefined || Array.isArray(result.warns))
  );
}

function invalidGuardResult() {
  return {
    ok: false,
    status: 'indeterminate',
    refusals: [
      {
        id: 'action-result-validation',
        guardId: 'action-result-validation',
        code: 'guard-result-invalid',
        args: {},
        noAutomaticRemediation: { reason: 'result-investigation-required' },
        reason: 'complete guard result was malformed',
      },
    ],
    humanDecision: null,
  };
}

function thrownGuardResult() {
  return {
    ok: false,
    status: 'indeterminate',
    refusals: [
      {
        id: 'action-result-validation',
        guardId: 'action-result-validation',
        code: 'guard-error',
        args: {},
        noAutomaticRemediation: { reason: 'result-investigation-required' },
        reason: 'shared guard evaluator threw',
      },
    ],
    humanDecision: null,
  };
}

export async function evaluateCompleteGuards({
  fromState,
  toState,
  context,
  runGuards,
  loadPolicy,
  guardPhasePolicy,
} = {}) {
  if (typeof runGuards !== 'function') throw new TypeError('action-evaluator:guards');
  if (!context || typeof context !== 'object') throw new TypeError('action-evaluator:context');
  const baselineContext = { ...context };
  let baseline;
  try {
    baseline = await runGuards(fromState, toState, baselineContext, guardPhasePolicy);
  } catch {
    return { guardResult: thrownGuardResult(), guardContext: baselineContext, requirementIds: [] };
  }
  if (!completeGuardResult(baseline)) {
    return { guardResult: invalidGuardResult(), guardContext: baselineContext, requirementIds: [] };
  }
  const requirementIds = requirementIdsForGuardRefusals(baseline?.refusals);
  if (requirementIds.length === 0) {
    return { guardResult: baseline, guardContext: baselineContext, requirementIds };
  }
  if (typeof loadPolicy !== 'function') throw new TypeError('action-evaluator:policy-port');
  let workflowPolicy;
  try {
    workflowPolicy = await loadPolicy({
      requirementIds,
      fromState,
      toState,
      context: baselineContext,
    });
  } catch {
    workflowPolicy = { status: 'indeterminate' };
  }
  if (!workflowPolicy || workflowPolicy.status === 'indeterminate') {
    const issue = Number(context.issueNumber);
    const fallbackCause = {
      id: 'authority-collection',
      guardId: 'authority-collection',
      code: 'authority-read-failed',
      args: { source: 'workflow-policy', reason: 'unavailable', subject: { issue } },
      noAutomaticRemediation: { reason: 'authority-investigation-required' },
      reason: 'workflow policy authority unavailable',
    };
    const observedCause = workflowPolicy?.cause;
    const cause =
      observedCause?.code === 'authority-read-failed' &&
      observedCause.guardId === 'authority-collection' &&
      observedCause.args?.source === 'workflow-policy' &&
      observedCause.args.subject?.issue === issue
        ? { id: 'authority-collection', ...observedCause, reason: fallbackCause.reason }
        : fallbackCause;
    return {
      guardResult: {
        ...baseline,
        ok: false,
        status: 'indeterminate',
        refusals: [...baseline.refusals, cause],
      },
      guardContext: baselineContext,
      requirementIds,
    };
  }
  const enrichedContext = { ...context, workflowPolicy };
  let guardResult;
  try {
    guardResult = await runGuards(fromState, toState, enrichedContext, guardPhasePolicy);
  } catch {
    guardResult = thrownGuardResult();
  }
  if (!completeGuardResult(guardResult)) guardResult = invalidGuardResult();
  return { guardResult, guardContext: enrichedContext, requirementIds };
}

function snapshotFromBundle({ state, head, bundle }) {
  const observations = bundle.observations.map((observation) => ({
    source: observation.resource,
    identity: observation.identity,
    observedAt: observation.observedAt,
    digest: observation.digest,
  }));
  const core = {
    state,
    head,
    startedAt: bundle.startedAt,
    completedAt: bundle.completedAt,
    observations,
    normalizationInputs: bundle.normalizationInputs.map(({ normalizerId, inputDigest }) => ({
      normalizerId,
      inputDigest,
    })),
  };
  return {
    state,
    head,
    digest: `sha256:${createHash('sha256').update(JSON.stringify(core)).digest('hex')}`,
    startedAt: bundle.startedAt,
    completedAt: bundle.completedAt,
    observations,
  };
}

/**
 * Evaluate one action with a command-local observation attempt. Until a
 * conformance-tested read-only adapter exists, return a typed pending verdict.
 */
export async function evaluateAction({
  actionId,
  repository,
  issue,
  inputs,
  attempt,
  deps = {},
} = {}) {
  if (!attempt || typeof attempt.observe !== 'function' || typeof attempt.finish !== 'function') {
    throw new TypeError('action-evaluator:attempt');
  }
  const descriptor = actionDescriptorFor(actionId);
  const body = inputs?.body;
  const scope = computeScopeIdentity({ repository, issue, body });
  const bodyObservation = await attempt.observe({
    resource: 'issue-body',
    identity: `issue:${issue}`,
    scope,
  });
  const pending = {
    guardId: 'action-navigation',
    code: 'action-not-explain-ready',
    args: {},
    noAutomaticRemediation: { reason: 'action-not-explain-ready' },
  };
  const invalid = {
    guardId: 'action-result-validation',
    code: 'guard-result-invalid',
    args: {},
    noAutomaticRemediation: { reason: 'result-investigation-required' },
  };
  let status = 'indeterminate';
  let blockers = bodyObservation.status === 'observed' ? [] : [bodyObservation.cause];
  let normalizations = [];
  let warnings = [];
  let humanDecision = null;
  if (bodyObservation.status === 'observed' && descriptor?.explainReady) {
    const policy = actionPolicyFor(actionId, inputs.state);
    if (!policy.ok || typeof deps.runReadOnlyGuards !== 'function') {
      blockers.push(pending);
    } else if (typeof deps.effectAttempts !== 'function') {
      blockers.push(invalid);
    } else {
      try {
        const fromState = inputs.state;
        const toState = policy.target ?? inputs.toState;
        if (!toState) throw new TypeError('action-evaluator:target');
        const { guardResult } = await evaluateCompleteGuards({
          fromState,
          toState,
          context: {
            issueNumber: issue,
            repo: repository,
            fromState,
            toState,
            body: bodyObservation.value.body,
            observe: attempt.observe,
          },
          runGuards: deps.runReadOnlyGuards,
          loadPolicy: async ({ requirementIds }) => {
            const policyObservation = await attempt.observe({
              resource: 'workflow-policy',
              identity: `evidence:${issue}:1`,
              scope,
            });
            if (policyObservation.status !== 'observed') {
              return { status: 'indeterminate', cause: policyObservation.cause };
            }
            const policy = policyObservation.value;
            const requested = new Set(requirementIds);
            if (
              policy?.schema !== 'aitm.workflow-boundary-policy/v1' ||
              !['policy-compatible', 'blocked'].includes(policy.status) ||
              policy.repository !== repository ||
              policy.issue !== issue ||
              policy.scopeIdentity !== scope ||
              !Array.isArray(policy.decisions) ||
              policy.decisions.length !== requested.size ||
              policy.decisions.some(
                (item) =>
                  !requested.has(item?.id) ||
                  !['satisfied', 'waived', 'missing', 'not-applicable'].includes(item?.outcome)
              ) ||
              new Set(policy.decisions.map(({ id }) => id)).size !== requested.size
            )
              return { status: 'indeterminate' };
            return {
              ...policy,
              decision: (id) => policy.decisions.find((item) => item.id === id) ?? null,
              isWaived: (id) =>
                policy.decisions.find((item) => item.id === id)?.outcome === 'waived',
            };
          },
        });
        if (
          !guardResult ||
          !['ready', 'blocked', 'indeterminate'].includes(guardResult.status) ||
          !Array.isArray(guardResult.refusals) ||
          guardResult.ok !== (guardResult.status === 'ready')
        ) {
          throw new TypeError('action-evaluator:guard-result');
        }
        status = guardResult.status;
        blockers = guardResult.refusals.map((refusal) => ({
          guardId: refusal.guardId ?? refusal.id,
          code: refusal.code,
          args: refusal.args,
          ...(refusal.remediation
            ? { remediation: refusal.remediation }
            : { noAutomaticRemediation: refusal.noAutomaticRemediation }),
        }));
        warnings = (guardResult.warns ?? []).map(({ code, args }) => ({ code, args }));
        normalizations = guardResult.normalizations ?? [];
        humanDecision = guardResult.humanDecision ?? null;
      } catch {
        status = 'indeterminate';
        blockers = [invalid];
        normalizations = [];
        warnings = [];
        humanDecision = null;
      }
    }
  } else if (bodyObservation.status === 'observed') {
    blockers.push(pending);
  }
  let attemptedEffects = [];
  if (typeof deps.effectAttempts === 'function') {
    try {
      attemptedEffects = deps.effectAttempts();
    } catch {
      attemptedEffects = null;
    }
  }
  if (!Array.isArray(attemptedEffects)) {
    status = 'indeterminate';
    blockers = [invalid];
    normalizations = [];
    warnings = [];
    humanDecision = null;
  } else if (attemptedEffects.length > 0) {
    const guardId = attemptedEffects[0]?.guardId;
    status = 'indeterminate';
    blockers = REGISTERED_GUARD_IDS.includes(guardId)
      ? [
          {
            guardId,
            code: 'guard-effect-forbidden',
            args: {},
            noAutomaticRemediation: { reason: 'result-investigation-required' },
          },
        ]
      : [invalid];
    normalizations = [];
    warnings = [];
    humanDecision = null;
  }
  const manualCauses = blockers.filter(
    ({ code }) => code === 'authority-read-failed' || code === 'authority-read-skipped'
  );
  if (manualCauses.length > 0) {
    const requests = [...(humanDecision?.requests ?? [])];
    for (const blocker of manualCauses) {
      requests.push({
        kind: 'manual-investigation',
        actor: 'human-operator',
        subject: { issue: blocker.args.subject?.issue ?? issue, actionId },
        args: { guardId: blocker.guardId, code: blocker.code },
      });
    }
    humanDecision = { requests };
  }
  const bundle = attempt.finish({
    normalizationInputs: normalizations.map(({ normalizerId, inputDigest }) => ({
      normalizerId,
      inputDigest,
    })),
  });
  const decision = {
    schema: ACTION_DECISION_SCHEMA,
    issue,
    actionId,
    status,
    snapshot: snapshotFromBundle({ state: inputs.state, head: inputs.head, bundle }),
    blockers,
    normalizations,
    warnings,
    humanDecision,
    guidanceIds: [descriptor?.guidanceId ?? 'navigation.unknown'],
  };
  return Object.freeze(validateActionDecision(decision));
}
