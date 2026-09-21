// @story #1751
import { readLastKnownState } from '../../gh-timing-comment.mjs';
import { actionPolicyFor } from '../lifecycle-policy/actions.mjs';
import { forwardTarget } from '../lifecycle-policy/executable-transitions.mjs';
import { runGuards } from '../guard-registry.mjs';
import { sessionNetworkSkipped } from '../verb-preflight.mjs';
import { resolveStoryIntentSource } from '../story-intent-source.mjs';
import { resolveProjectDir } from '../project-dir.mjs';
import { loadSession } from '../session-store.mjs';
import { currentSessionId } from '../../word-counter.mjs';
import '../guard-bootstrap.mjs';
import {
  createGithubWorkflowBoundaryRuntime,
  loadWorkflowBoundary,
} from '../workflow-policy/enforcement.mjs';
import { evaluateCompleteGuards } from './evaluate.mjs';

const EARLY_STATES = new Set(['backlog', 'refine', 'ready-for-plan', 'plan']);

const authorityFailure = (source, issue, reason = 'unavailable') => ({
  guardId: 'authority-collection',
  code: 'authority-read-failed',
  args: { source, reason, subject: { issue } },
  noAutomaticRemediation: { reason: 'authority-investigation-required' },
});

const authoritySkipped = (source, issue) => ({
  guardId: 'authority-collection',
  code: 'authority-read-skipped',
  args: { source, subject: { issue } },
  noAutomaticRemediation: { reason: 'authority-investigation-required' },
});

const unavailableState = (reason) => ({
  guardId: 'action-navigation',
  code: 'state-unavailable',
  args: { reason },
  noAutomaticRemediation: { reason: 'state-investigation-required' },
});

const blockerFromRefusal = (refusal) => ({
  guardId: refusal.guardId ?? refusal.id,
  code: refusal.code ?? 'unclassified-refusal',
  args: refusal.args ?? {},
  ...(refusal.remediation
    ? { remediation: refusal.remediation }
    : {
        noAutomaticRemediation: refusal.noAutomaticRemediation ?? {
          reason: 'legacy-guard-requires-human-investigation',
        },
      }),
});

const verdict = (status, blockers = [], target = null) => ({
  status,
  blockers,
  target,
  delegate: { status: 'pending', executable: false },
});

/** One complete guard path for both a read-only decision and locked execution. */
export function evaluateEarlyPromoteGuards({
  fromState,
  toState,
  context,
  runGuards: runGuardsPort = runGuards,
  loadPolicy,
} = {}) {
  if (!EARLY_STATES.has(fromState) || forwardTarget(fromState) !== toState) {
    throw new TypeError('promote-readiness:early-edge');
  }
  return evaluateCompleteGuards({
    fromState,
    toState,
    context,
    runGuards: runGuardsPort,
    loadPolicy,
  });
}

/** Complete early-edge readiness; observations and policy ports are read-only. */
export async function collectEarlyPromoteReadiness({
  issue,
  fromState,
  body,
  attempt,
  ports = {},
} = {}) {
  if (!Number.isSafeInteger(issue) || issue <= 0) throw new TypeError('promote-readiness:issue');
  if (!attempt || typeof attempt.observe !== 'function')
    throw new TypeError('promote-readiness:attempt');
  if (typeof ports.scope !== 'string' || ports.scope.length === 0)
    throw new TypeError('promote-readiness:scope');

  const policy = actionPolicyFor('promote', fromState);
  if (policy.kind === 'unknown-state' || policy.kind === 'bootstrap') {
    return verdict('indeterminate', [unavailableState('unknown')]);
  }
  if (policy.kind === 'refused') {
    return verdict('indeterminate', [
      {
        guardId: 'action-navigation',
        code: 'action-not-explain-ready',
        args: {},
        noAutomaticRemediation: { reason: 'action-not-explain-ready' },
      },
    ]);
  }
  if (!EARLY_STATES.has(fromState)) {
    return verdict(
      'indeterminate',
      [
        {
          guardId: 'action-navigation',
          code: 'action-not-explain-ready',
          args: {},
          noAutomaticRemediation: { reason: 'action-not-explain-ready' },
        },
      ],
      policy.target ?? null
    );
  }
  const target = forwardTarget(fromState);
  if (policy.target !== target || !target) {
    return verdict('indeterminate', [unavailableState('conflicting')]);
  }
  if (ports.skipNetwork || sessionNetworkSkipped()) {
    return verdict(
      'indeterminate',
      [authoritySkipped('issue-body', issue), authoritySkipped('project-board', issue)],
      target
    );
  }

  const observations = await Promise.all([
    attempt.observe({ resource: 'issue-body', identity: `issue:${issue}:1`, scope: ports.scope }),
    attempt.observe({
      resource: 'project-board',
      identity: `issue:${issue}:2`,
      scope: ports.scope,
    }),
    attempt.observe({
      resource: 'migration-journal',
      identity: `migration-journal:${issue}`,
      scope: ports.scope,
    }),
  ]);
  const [bodyObservation, boardObservation, migrationObservation] = observations;
  const missing = observations
    .filter((observation) => observation.status !== 'observed')
    .map((observation) => observation.cause ?? authorityFailure(observation.resource, issue));
  if (missing.length > 0) return verdict('indeterminate', missing, target);
  if (
    bodyObservation.value?.number !== issue ||
    bodyObservation.value.body !== body ||
    typeof body !== 'string'
  ) {
    return verdict('indeterminate', [authorityFailure('issue-body', issue, 'invalid')], target);
  }
  const marker = readLastKnownState(body).state;
  if (marker !== fromState || boardObservation.value?.state !== fromState) {
    return verdict('indeterminate', [unavailableState('conflicting')], target);
  }
  if (migrationObservation.value?.active !== false) {
    if (migrationObservation.value?.active === true) {
      return verdict(
        'blocked',
        [
          {
            guardId: 'authority-collection',
            code: 'migration-freeze',
            args: {},
            noAutomaticRemediation: { reason: 'state-investigation-required' },
          },
        ],
        target
      );
    }
    return verdict(
      'indeterminate',
      [authorityFailure('migration-journal', issue, 'invalid')],
      target
    );
  }

  const cfg = ports.cfg;
  if (!cfg || typeof cfg.repo !== 'string') {
    return verdict(
      'indeterminate',
      [authorityFailure('local-config', issue, 'incomplete')],
      target
    );
  }
  const context = {
    issueNumber: issue,
    repo: cfg.repo,
    fromState,
    toState: target,
    body,
    cfg,
    deps: {
      ...(ports.deps ?? {}),
      resolveStoryIntent: ports.resolveStoryIntent ?? resolveStoryIntentSource,
      // The legacy dependency guard projects disposition after its read.
      // Explanation keeps that guard's refusal logic but not its write.
      reconcileDependencyDisposition: async () => {},
    },
    projectDir:
      ports.projectDir ??
      (ports.resolveProjectDir ?? resolveProjectDir)({ issue, deps: ports.deps ?? {} }),
    sessionPolicy:
      ports.sessionPolicy ??
      (ports.loadSession ?? loadSession)((ports.currentSessionId ?? currentSessionId)()),
    readOnly: true,
  };
  const loadPolicy =
    ports.loadPolicy ??
    (async ({ requirementIds }) =>
      loadWorkflowBoundary({
        repository: cfg.repo,
        issue,
        body,
        requirementIds,
        activity: `workflow-transition:${target}`,
        state: fromState,
        now: new Date().toISOString(),
        runtime:
          ports.workflowPolicyRuntime ??
          createGithubWorkflowBoundaryRuntime({ repository: cfg.repo }),
      }));
  const { guardResult } = await evaluateEarlyPromoteGuards({
    fromState,
    toState: target,
    context,
    runGuards: ports.runGuards ?? runGuards,
    loadPolicy,
  });
  return verdict(guardResult.status, guardResult.refusals.map(blockerFromRefusal), target);
}
