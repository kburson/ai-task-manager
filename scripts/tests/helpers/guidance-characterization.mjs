// @story #1658
import { createHash } from 'node:crypto';

import { assertHumanRequestCoupling } from './guidance-characterization-coupling.mjs';
import { validateCandidatePresentation } from './guidance-characterization-presentation.mjs';

const ACTIONS = new Set(['bind', 'resume', 'promote', 'test', 'review', 'deliver', 'close']);
const STATUSES = new Set(['ready', 'blocked', 'indeterminate']);
const REASONS = new Set(['timeout', 'rate-limited', 'unavailable', 'incomplete', 'invalid']);
const SOURCES = new Set(['issue-body', 'issue-comment', 'project-board', 'delivery', 'timing-log']);
const GUARDS = new Set([
  'candidate-precondition',
  'candidate-cross-issue',
  'authority-collection',
  'action-navigation',
  'action-result-validation',
]);
const GUIDANCE_DIGEST = `sha256:${'7'.repeat(64)}`;
const SOURCE_DIGEST = `sha256:${'8'.repeat(64)}`;
const FULL_HEAD = '1234567890abcdef1234567890abcdef12345678';

function fail(reason) {
  throw new TypeError(`guidance-candidate:${reason}`);
}

function exact(value, keys, reason) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(reason);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(reason);
  }
}

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function snapshotDigest(value) {
  return digest({
    state: value.state,
    head: value.head,
    startedAt: value.startedAt,
    completedAt: value.completedAt,
    observations: value.observations,
  });
}

function positiveInteger(value, reason) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(reason);
}

function string(value, reason) {
  if (typeof value !== 'string' || value === '' || value.trim() !== value) fail(reason);
}

function digestValue(value, reason) {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) fail(reason);
}

function instant(value, reason) {
  if (typeof value !== 'string' || new Date(value).toISOString() !== value) fail(reason);
}

function action(value, reason, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (!ACTIONS.has(value)) fail(reason);
}

function validateArgs(value, keys, reason) {
  exact(value, keys, reason);
  return value;
}

function validateDisposition(blocker) {
  const hasRemediation = Object.hasOwn(blocker, 'remediation');
  const hasClosed = Object.hasOwn(blocker, 'noAutomaticRemediation');
  if (hasRemediation === hasClosed) fail('blocker-disposition');
  if (hasRemediation) {
    exact(blocker.remediation, ['args', 'id'], 'remediation-shape');
    if (blocker.remediation.id === 'satisfy-precondition') {
      validateArgs(blocker.remediation.args, ['actionId', 'issue'], 'remediation-args');
      positiveInteger(blocker.remediation.args.issue, 'remediation-issue');
      action(blocker.remediation.args.actionId, 'remediation-action');
    } else if (blocker.remediation.id === 'record-plan-approval') {
      validateArgs(blocker.remediation.args, ['issue'], 'remediation-args');
      positiveInteger(blocker.remediation.args.issue, 'remediation-issue');
    } else if (blocker.remediation.id === 'request-review-approval') {
      validateArgs(blocker.remediation.args, ['head', 'issue'], 'remediation-args');
      positiveInteger(blocker.remediation.args.issue, 'remediation-issue');
      if (!/^[0-9a-f]{40}$/.test(blocker.remediation.args.head)) fail('remediation-head');
    } else {
      fail('remediation-id');
    }
  } else {
    exact(blocker.noAutomaticRemediation, ['reason'], 'no-remediation-shape');
    if (
      !new Set([
        'authority-investigation-required',
        'state-investigation-required',
        'result-investigation-required',
      ]).has(blocker.noAutomaticRemediation.reason)
    ) {
      fail('no-remediation-reason');
    }
  }
}

function validateBlocker(blocker) {
  const disposition = Object.hasOwn(blocker, 'remediation')
    ? 'remediation'
    : 'noAutomaticRemediation';
  exact(blocker, ['args', 'code', 'guardId', disposition], 'blocker-shape');
  string(blocker.guardId, 'blocker-guard');
  string(blocker.code, 'blocker-code');
  if (blocker.code === 'authority-read-failed') {
    if (blocker.guardId !== 'authority-collection') fail('producer-code-pair');
    validateArgs(blocker.args, ['reason', 'source'], 'blocker-args');
    string(blocker.args.source, 'blocker-source');
    if (!REASONS.has(blocker.args.reason)) fail('blocker-reason');
  } else if (blocker.code === 'state-unavailable') {
    if (blocker.guardId !== 'action-navigation') fail('producer-code-pair');
    validateArgs(blocker.args, ['reason'], 'blocker-args');
    if (!new Set(['unknown', 'conflicting']).has(blocker.args.reason)) fail('state-reason');
  } else if (blocker.code === 'guard-result-invalid') {
    if (blocker.guardId !== 'action-result-validation') fail('producer-code-pair');
    validateArgs(blocker.args, [], 'blocker-args');
  } else if (blocker.code === 'precondition-missing') {
    if (blocker.guardId !== 'candidate-precondition') fail('producer-code-pair');
    validateArgs(blocker.args, ['requirement'], 'blocker-args');
    string(blocker.args.requirement, 'blocker-requirement');
  } else if (blocker.code === 'cross-issue-plan-approval-missing') {
    if (blocker.guardId !== 'candidate-cross-issue') fail('producer-code-pair');
    validateArgs(blocker.args, ['actionId', 'issue', 'repository'], 'blocker-args');
    positiveInteger(blocker.args.issue, 'blocker-subject');
    action(blocker.args.actionId, 'blocker-action');
    string(blocker.args.repository, 'blocker-repository');
  } else if (blocker.code === 'plan-approval-missing') {
    if (blocker.guardId !== 'candidate-precondition') fail('producer-code-pair');
    validateArgs(blocker.args, [], 'blocker-args');
  } else if (blocker.code === 'review-approval-missing') {
    if (blocker.guardId !== 'candidate-precondition') fail('producer-code-pair');
    validateArgs(blocker.args, ['head'], 'blocker-args');
    if (!/^[0-9a-f]{40}$/.test(blocker.args.head)) fail('blocker-head');
  } else {
    fail('blocker-code');
  }
  validateDisposition(blocker);
}

function validateNormalization(value) {
  exact(
    value,
    ['decisionDigest', 'decisions', 'disposition', 'inputDigest', 'normalizerId'],
    'normalization-shape'
  );
  if (value.normalizerId !== 'functional-dod-derived/v1') fail('normalizer-id');
  digestValue(value.inputDigest, 'normalization-input-digest');
  digestValue(value.decisionDigest, 'normalization-decision-digest');
  if (value.disposition !== 'persist-on-execute') fail('normalization-disposition');
  if (!Array.isArray(value.decisions) || value.decisions.length === 0)
    fail('normalization-decisions');
  const order = ['acs', 'checkboxes'];
  let previous = -1;
  for (const decision of value.decisions) {
    exact(decision, ['derivationRule', 'key', 'stamp', 'tick'], 'normalization-decision');
    const position = order.indexOf(decision.key);
    if (position < 0 || position <= previous) fail('normalization-order');
    previous = position;
    if (decision.derivationRule !== `derive-${decision.key}/v1`) fail('normalization-rule');
    if (typeof decision.stamp !== 'boolean' || typeof decision.tick !== 'boolean') {
      fail('normalization-booleans');
    }
  }
  if (
    value.decisionDigest !==
    digest({ normalizerId: 'functional-dod-derived/v1', decisions: value.decisions })
  ) {
    fail('normalization-decision-digest');
  }
}

function validateWarning(value) {
  exact(value, ['args', 'code'], 'warning-shape');
  if (value.code === 'guidance-source-diverged') {
    validateArgs(value.args, ['digest', 'source'], 'warning-args');
    if (value.args.source !== '.ai-task-manager/aitm-guidance.yml') fail('warning-source');
    digestValue(value.args.digest, 'warning-digest');
  } else if (value.code === 'legacy-guard-warning') {
    validateArgs(value.args, ['guardId'], 'warning-args');
    if (!GUARDS.has(value.args.guardId)) fail('warning-guard');
  } else {
    fail('warning-code');
  }
}

function validateHumanDecision(value, decision) {
  if (value === null) return;
  exact(value, ['requests'], 'human-decision-shape');
  if (!Array.isArray(value.requests) || value.requests.length === 0) fail('human-requests');
  for (const request of value.requests) {
    exact(request, ['actor', 'args', 'kind', 'subject'], 'human-request-shape');
    exact(request.subject, ['actionId', 'issue'], 'human-subject-shape');
    positiveInteger(request.subject.issue, 'human-subject-issue');
    action(request.subject.actionId, 'human-subject-action', { nullable: true });
    if (request.kind === 'plan-approval') {
      if (request.actor !== 'configured-approver') fail('human-actor');
      validateArgs(request.args, [], 'human-args');
    } else if (request.kind === 'review-approval') {
      if (request.actor !== 'configured-approver') fail('human-actor');
      validateArgs(request.args, ['head'], 'human-args');
      if (!/^[0-9a-f]{40}$/.test(request.args.head)) fail('human-head');
    } else if (request.kind === 'manual-investigation') {
      if (request.actor !== 'human-operator') fail('human-actor');
      validateArgs(request.args, ['code', 'guardId'], 'human-args');
    } else {
      fail('human-kind');
    }
    if (request.subject.issue !== decision.issue) {
      const matched = decision.blockers.some(
        (blocker) =>
          blocker.args?.issue === request.subject.issue &&
          blocker.args?.actionId === request.subject.actionId
      );
      if (!matched) fail('human-cross-issue');
    }
  }
}

function validateSnapshot(value) {
  exact(
    value,
    ['completedAt', 'digest', 'head', 'observations', 'startedAt', 'state'],
    'snapshot-shape'
  );
  string(value.state, 'snapshot-state');
  if (!/^[0-9a-f]{40}$/.test(value.head)) fail('snapshot-head');
  digestValue(value.digest, 'snapshot-digest');
  instant(value.startedAt, 'snapshot-start');
  instant(value.completedAt, 'snapshot-complete');
  if (value.startedAt > value.completedAt) fail('snapshot-window');
  if (!Array.isArray(value.observations) || value.observations.length === 0) {
    fail('snapshot-observations');
  }
  for (const observation of value.observations) {
    exact(observation, ['digest', 'identity', 'observedAt', 'source'], 'observation-shape');
    if (!SOURCES.has(observation.source)) fail('observation-source');
    string(observation.identity, 'observation-identity');
    instant(observation.observedAt, 'observation-time');
    digestValue(observation.digest, 'observation-digest');
  }
  if (value.digest !== snapshotDigest(value)) fail('snapshot-digest');
}

export function validateCandidateDecision(decision) {
  exact(
    decision,
    [
      'actionId',
      'blockers',
      'guidanceIds',
      'humanDecision',
      'issue',
      'normalizations',
      'schema',
      'snapshot',
      'status',
      'warnings',
    ],
    'decision-shape'
  );
  if (decision.schema !== 'aitm.action-decision/v1') fail('decision-schema');
  positiveInteger(decision.issue, 'decision-issue');
  action(decision.actionId, 'decision-action', { nullable: true });
  if (!STATUSES.has(decision.status)) fail('decision-status');
  validateSnapshot(decision.snapshot);
  if (!Array.isArray(decision.blockers)) fail('blockers');
  decision.blockers.forEach(validateBlocker);
  if (decision.status === 'ready' && decision.blockers.length !== 0) fail('ready-blockers');
  if (decision.status !== 'ready' && decision.blockers.length === 0) fail('not-ready-blockers');
  if (!Array.isArray(decision.normalizations)) fail('normalizations');
  decision.normalizations.forEach(validateNormalization);
  if (!Array.isArray(decision.warnings)) fail('warnings');
  decision.warnings.forEach(validateWarning);
  validateHumanDecision(decision.humanDecision, decision);
  assertHumanRequestCoupling(decision);
  if (decision.status === 'ready' && decision.humanDecision !== null) fail('ready-human-decision');
  if (!Array.isArray(decision.guidanceIds) || decision.guidanceIds.length === 0) {
    fail('guidance-ids');
  }
  for (const id of decision.guidanceIds) string(id, 'guidance-id');
  return decision;
}

function baseDecision(fixture) {
  const observation = {
    source: 'issue-body',
    identity: `issue:${fixture.issue}`,
    observedAt: '2026-09-17T18:00:00.500Z',
    digest: digest({ action: fixture.actionId, issue: fixture.issue }),
  };
  return {
    schema: 'aitm.action-decision/v1',
    issue: fixture.issue,
    actionId: fixture.actionId,
    status: 'ready',
    snapshot: {
      state: fixture.state,
      head: FULL_HEAD,
      digest: digest({
        action: fixture.actionId,
        issue: fixture.issue,
        observations: [observation],
      }),
      startedAt: '2026-09-17T18:00:00.000Z',
      completedAt: '2026-09-17T18:00:01.000Z',
      observations: [observation],
    },
    blockers: [],
    normalizations: [],
    warnings: [],
    humanDecision: null,
    guidanceIds: [`action.${fixture.actionId}`],
  };
}

function preconditionBlocker(fixture) {
  return {
    guardId: 'candidate-precondition',
    code: 'precondition-missing',
    args: { requirement: `${fixture.actionId}-authority` },
    remediation: {
      id: 'satisfy-precondition',
      args: { issue: fixture.issue, actionId: fixture.actionId },
    },
  };
}

export function buildCandidateDecision({ fixture, scenario, evidenceCopies = 1 }) {
  exact(
    fixture,
    ['actionId', 'issue', 'policyRequest', 'scenarios', 'schema', 'state'],
    'fixture-shape'
  );
  if (fixture.schema !== 'aitm.guidance-action-fixtures/v1') fail('fixture-schema');
  action(fixture.actionId, 'fixture-action');
  positiveInteger(fixture.issue, 'fixture-issue');
  string(fixture.state, 'fixture-state');
  if (
    !new Set(['manual-investigation', 'plan-approval', 'review-approval']).has(
      fixture.policyRequest
    )
  ) {
    fail('fixture-policy-request');
  }
  if (!fixture.scenarios.includes(scenario)) fail('fixture-scenario');
  const decision = baseDecision(fixture);
  decision.snapshot.observations = Array.from({ length: evidenceCopies }, (_, index) => ({
    ...decision.snapshot.observations[0],
    source: index === 0 ? 'issue-body' : 'issue-comment',
    identity: index === 0 ? `issue:${fixture.issue}` : `evidence:${fixture.issue}:${index}`,
  }));
  decision.snapshot.digest = snapshotDigest(decision.snapshot);
  if (scenario === 'blocked') {
    decision.status = 'blocked';
    decision.blockers = [preconditionBlocker(fixture)];
  } else if (scenario === 'indeterminate') {
    decision.status = 'indeterminate';
    decision.blockers = [
      {
        guardId: 'authority-collection',
        code: 'authority-read-failed',
        args: { source: 'issue-body', reason: 'timeout' },
        noAutomaticRemediation: { reason: 'authority-investigation-required' },
      },
    ];
    decision.humanDecision = {
      requests: [
        {
          kind: 'manual-investigation',
          actor: 'human-operator',
          subject: { issue: fixture.issue, actionId: fixture.actionId },
          args: { guardId: 'authority-collection', code: 'authority-read-failed' },
        },
      ],
    };
  } else if (scenario === 'warning') {
    decision.warnings = [
      {
        code: 'guidance-source-diverged',
        args: { source: '.ai-task-manager/aitm-guidance.yml', digest: SOURCE_DIGEST },
      },
      { code: 'legacy-guard-warning', args: { guardId: 'candidate-precondition' } },
      { code: 'legacy-guard-warning', args: { guardId: 'candidate-precondition' } },
    ];
  } else if (scenario === 'normalization') {
    const decisions = [
      { key: 'acs', derivationRule: 'derive-acs/v1', stamp: true, tick: true },
      {
        key: 'checkboxes',
        derivationRule: 'derive-checkboxes/v1',
        stamp: true,
        tick: false,
      },
    ];
    decision.normalizations = [
      {
        normalizerId: 'functional-dod-derived/v1',
        inputDigest: digest({ body: fixture.issue }),
        decisions,
        decisionDigest: digest({ normalizerId: 'functional-dod-derived/v1', decisions }),
        disposition: 'persist-on-execute',
      },
    ];
  } else if (scenario === 'effective-policy-human-request') {
    if (fixture.policyRequest === 'manual-investigation') {
      decision.status = 'indeterminate';
      decision.blockers = [
        {
          guardId: 'authority-collection',
          code: 'authority-read-failed',
          args: { source: 'project-board', reason: 'incomplete' },
          noAutomaticRemediation: { reason: 'authority-investigation-required' },
        },
      ];
      decision.humanDecision = {
        requests: [
          {
            kind: 'manual-investigation',
            actor: 'human-operator',
            subject: { issue: fixture.issue, actionId: fixture.actionId },
            args: { guardId: 'authority-collection', code: 'authority-read-failed' },
          },
        ],
      };
    } else if (fixture.policyRequest === 'plan-approval') {
      decision.status = 'blocked';
      decision.blockers = [
        {
          guardId: 'candidate-precondition',
          code: 'plan-approval-missing',
          args: {},
          remediation: { id: 'record-plan-approval', args: { issue: fixture.issue } },
        },
      ];
      decision.humanDecision = {
        requests: [
          {
            kind: 'plan-approval',
            actor: 'configured-approver',
            subject: { issue: fixture.issue, actionId: 'promote' },
            args: {},
          },
        ],
      };
    } else {
      decision.status = 'blocked';
      decision.blockers = [
        {
          guardId: 'candidate-precondition',
          code: 'review-approval-missing',
          args: { head: FULL_HEAD },
          remediation: {
            id: 'request-review-approval',
            args: { issue: fixture.issue, head: FULL_HEAD },
          },
        },
      ];
      decision.humanDecision = {
        requests: [
          {
            kind: 'review-approval',
            actor: 'configured-approver',
            subject: { issue: fixture.issue, actionId: fixture.actionId },
            args: { head: FULL_HEAD },
          },
        ],
      };
    }
  }
  return validateCandidateDecision(decision);
}

export function buildTerminalCandidateDecision({ fixture }) {
  const decision = buildCandidateDecision({ fixture, scenario: 'ready' });
  decision.actionId = null;
  decision.snapshot.state = 'done';
  decision.snapshot.digest = snapshotDigest(decision.snapshot);
  decision.guidanceIds = ['state.done'];
  return validateCandidateDecision(decision);
}

function presentation(decision, admissionWarnings = []) {
  validateCandidateDecision(decision);
  const warnings = [...admissionWarnings, ...decision.warnings];
  warnings.forEach(validateWarning);
  return {
    issue: decision.issue,
    actionId: decision.actionId,
    status: decision.status,
    blockers: structuredClone(decision.blockers),
    normalizations: decision.normalizations.map(({ normalizerId, decisions, disposition }) => ({
      normalizerId,
      decisions: structuredClone(decisions),
      disposition,
    })),
    warnings: structuredClone(warnings),
    humanDecision: structuredClone(decision.humanDecision),
  };
}

function guidance(decision, knownGuidance) {
  return decision.guidanceIds.map((id) => {
    const receipt = knownGuidance.find((entry) => entry.id === id);
    if (receipt?.digest === GUIDANCE_DIGEST) {
      return { id, digest: GUIDANCE_DIGEST, status: 'not-modified' };
    }
    return {
      id,
      digest: GUIDANCE_DIGEST,
      status: 'expanded',
      agent: {
        instruction: [
          { query: decision.actionId },
          { require_status: 'ready' },
          { if_blocked: 'use_returned_remediation_ids' },
          { execute: decision.actionId },
          { execution_revalidates: true },
        ],
      },
    };
  });
}

export function renderCandidateExplanation({
  decision,
  diagnostic = false,
  knownGuidance = [],
  admissionWarnings = [],
  diagnosticMessages = [],
} = {}) {
  const result = presentation(decision, admissionWarnings);
  const envelope = {
    schema: 'aitm.action-explanation/v1',
    result,
    guidance: guidance(decision, knownGuidance),
  };
  if (diagnostic) {
    envelope.fullDecision = structuredClone(decision);
    envelope.diagnosticMessages = structuredClone(diagnosticMessages);
  }
  return validateCandidateExplanation(envelope);
}

export function validateCandidateExplanation(envelope) {
  const diagnostic = Object.hasOwn(envelope ?? {}, 'fullDecision');
  exact(
    envelope,
    diagnostic
      ? ['diagnosticMessages', 'fullDecision', 'guidance', 'result', 'schema']
      : ['guidance', 'result', 'schema'],
    'explanation-shape'
  );
  if (envelope.schema !== 'aitm.action-explanation/v1') fail('explanation-schema');
  exact(
    envelope.result,
    ['actionId', 'blockers', 'humanDecision', 'issue', 'normalizations', 'status', 'warnings'],
    'presentation-shape'
  );
  validateCandidatePresentation(envelope.result);
  if (!Array.isArray(envelope.guidance) || envelope.guidance.length === 0) fail('guidance');
  for (const entry of envelope.guidance) {
    if (entry.status === 'expanded') {
      exact(entry, ['agent', 'digest', 'id', 'status'], 'guidance-shape');
      exact(entry.agent, ['instruction'], 'guidance-agent');
      if (!Array.isArray(entry.agent.instruction) || entry.agent.instruction.length === 0) {
        fail('guidance-instruction');
      }
    } else if (entry.status === 'not-modified') {
      exact(entry, ['digest', 'id', 'status'], 'guidance-shape');
    } else {
      fail('guidance-status');
    }
    digestValue(entry.digest, 'guidance-digest');
  }
  if (diagnostic) {
    validateCandidateDecision(envelope.fullDecision);
    if (!Array.isArray(envelope.diagnosticMessages)) fail('diagnostic-messages');
    for (const message of envelope.diagnosticMessages) {
      exact(message, ['guardId', 'text', 'untrusted'], 'diagnostic-message');
      string(message.guardId, 'diagnostic-guard');
      string(message.text, 'diagnostic-text');
      if (message.untrusted !== true) fail('diagnostic-trust');
    }
    const expected = presentation(envelope.fullDecision);
    const actualWithoutAdmission = {
      ...envelope.result,
      warnings:
        expected.warnings.length === 0
          ? []
          : envelope.result.warnings.slice(-expected.warnings.length),
    };
    if (JSON.stringify(expected) !== JSON.stringify(actualWithoutAdmission)) {
      fail('diagnostic-operational-equivalence');
    }
  }
  return envelope;
}

export function projectOverrideMutationEffect({ valid, mutationSucceeded, alreadyAnnotated }) {
  return projectOverrideProtocol({
    diverged: true,
    valid,
    mutationSucceeded,
    alreadyAnnotated,
    digest: SOURCE_DIGEST,
    receiptDigest: null,
    contextReset: false,
  });
}

export function projectOverrideProtocol({
  diverged,
  valid,
  mutationSucceeded,
  alreadyAnnotated,
  digest,
  receiptDigest,
  contextReset,
}) {
  digestValue(digest, 'override-digest');
  if (receiptDigest !== null) digestValue(receiptDigest, 'override-receipt-digest');
  const active = diverged === true && valid === true;
  return {
    mutationAllowed: valid === true,
    warningEmitted:
      active && (contextReset === true || receiptDigest === null || receiptDigest !== digest),
    annotationWritten: active && mutationSucceeded === true && alreadyAnnotated !== true,
  };
}

export const candidateConstants = Object.freeze({ FULL_HEAD, GUIDANCE_DIGEST, SOURCE_DIGEST });
