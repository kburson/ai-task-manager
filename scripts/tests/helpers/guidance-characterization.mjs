// @story #1658
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { assertHumanRequestCoupling } from './guidance-characterization-coupling.mjs';
import { validateCandidatePresentation } from './guidance-characterization-presentation.mjs';

const ACTIONS = new Set(['bind', 'resume', 'promote', 'test', 'review', 'deliver', 'close']);
const STATUSES = new Set(['ready', 'blocked', 'indeterminate']);
const REASONS = new Set(['timeout', 'rate-limited', 'unavailable', 'incomplete', 'invalid']);
const SOURCES = new Set(['issue-body', 'issue-comment', 'project-board', 'delivery', 'timing-log']);
const GUARDS = new Set([
  'candidate-precondition',
  'candidate-cross-issue',
  'registered-legacy-guard',
  'authority-collection',
  'action-navigation',
  'action-result-validation',
]);
const GUIDANCE_IDS = new Set([
  ...[...ACTIONS].map((actionId) => `action.${actionId}`),
  'navigation.unresolved',
  'state.done',
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

function snapshotDigest(value, normalizations = []) {
  return digest({
    state: value.state,
    head: value.head,
    startedAt: value.startedAt,
    completedAt: value.completedAt,
    observations: value.observations,
    normalizationInputs: normalizations.map(({ inputDigest, normalizerId }) => ({
      normalizerId,
      inputDigest,
    })),
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

function validateAuthoritySubject(value) {
  exact(value, ['issue'], 'blocker-subject');
  positiveInteger(value.issue, 'blocker-subject');
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
        'legacy-guard-requires-human-investigation',
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
    const keys = Object.hasOwn(blocker.args, 'subject')
      ? ['reason', 'source', 'subject']
      : ['reason', 'source'];
    validateArgs(blocker.args, keys, 'blocker-args');
    if (!SOURCES.has(blocker.args.source)) fail('blocker-source');
    if (!REASONS.has(blocker.args.reason)) fail('blocker-reason');
    if (Object.hasOwn(blocker.args, 'subject')) validateAuthoritySubject(blocker.args.subject);
  } else if (blocker.code === 'authority-read-skipped') {
    if (blocker.guardId !== 'authority-collection') fail('producer-code-pair');
    const keys = Object.hasOwn(blocker.args, 'subject') ? ['source', 'subject'] : ['source'];
    validateArgs(blocker.args, keys, 'blocker-args');
    if (!SOURCES.has(blocker.args.source)) fail('blocker-source');
    if (Object.hasOwn(blocker.args, 'subject')) validateAuthoritySubject(blocker.args.subject);
  } else if (blocker.code === 'unclassified-refusal') {
    if (blocker.guardId !== 'registered-legacy-guard') fail('producer-code-pair');
    validateArgs(blocker.args, [], 'blocker-args');
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
    if (blocker.args.repository !== 'kburson/ai-task-manager') fail('blocker-repository');
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

function validateAuthoritySubjects(blockers) {
  const bySource = new Map();
  for (const blocker of blockers) {
    if (!new Set(['authority-read-failed', 'authority-read-skipped']).has(blocker.code)) continue;
    const group = bySource.get(blocker.args.source) ?? [];
    group.push(blocker);
    bySource.set(blocker.args.source, group);
  }
  for (const group of bySource.values()) {
    if (group.length < 2) continue;
    const subjects = new Set();
    for (const blocker of group) {
      if (!blocker.args.subject) fail('blocker-subject-required');
      const identity = JSON.stringify(blocker.args.subject);
      if (subjects.has(identity)) fail('blocker-subject-duplicate');
      subjects.add(identity);
    }
  }
}

function validateRemediationCoupling(blocker, decision) {
  const remediation = blocker.remediation;
  if (blocker.code === 'precondition-missing') {
    if (
      remediation?.id !== 'satisfy-precondition' ||
      remediation.args.issue !== decision.issue ||
      remediation.args.actionId !== decision.actionId
    ) {
      fail('remediation-coupling');
    }
  } else if (
    blocker.code === 'plan-approval-missing' ||
    blocker.code === 'cross-issue-plan-approval-missing'
  ) {
    const issue =
      blocker.code === 'cross-issue-plan-approval-missing' ? blocker.args.issue : decision.issue;
    if (remediation?.id !== 'record-plan-approval' || remediation.args.issue !== issue) {
      fail('remediation-coupling');
    }
  } else if (blocker.code === 'review-approval-missing') {
    if (
      remediation?.id !== 'request-review-approval' ||
      remediation.args.issue !== decision.issue ||
      remediation.args.head !== blocker.args.head ||
      remediation.args.head !== decision.snapshot.head
    ) {
      fail('remediation-coupling');
    }
  } else {
    const expectedReason = new Map([
      ['authority-read-failed', 'authority-investigation-required'],
      ['authority-read-skipped', 'authority-investigation-required'],
      ['unclassified-refusal', 'legacy-guard-requires-human-investigation'],
      ['state-unavailable', 'state-investigation-required'],
      ['guard-result-invalid', 'result-investigation-required'],
    ]).get(blocker.code);
    if (expectedReason && blocker.noAutomaticRemediation?.reason !== expectedReason) {
      fail('remediation-coupling');
    }
  }
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

function validateWarningOrder(values) {
  let sawLegacy = false;
  for (const value of values) {
    if (value.code === 'legacy-guard-warning') sawLegacy = true;
    if (value.code === 'guidance-source-diverged' && sawLegacy) fail('warning-order');
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
    action(request.subject.actionId, 'human-subject-action', {
      nullable: request.kind === 'manual-investigation',
    });
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

function validateSnapshot(value, normalizations, issue) {
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
  const identities = new Set();
  for (const observation of value.observations) {
    exact(observation, ['digest', 'identity', 'observedAt', 'source'], 'observation-shape');
    if (!SOURCES.has(observation.source)) fail('observation-source');
    string(observation.identity, 'observation-identity');
    if (identities.has(observation.identity)) fail('observation-identity-duplicate');
    identities.add(observation.identity);
    instant(observation.observedAt, 'observation-time');
    if (observation.observedAt < value.startedAt || observation.observedAt > value.completedAt) {
      fail('observation-window');
    }
    const identityIssue = /^(?:issue|evidence):(\d+)(?::\d+)?$/.exec(observation.identity);
    if (!identityIssue || Number(identityIssue[1]) !== issue) fail('observation-identity-issue');
    digestValue(observation.digest, 'observation-digest');
  }
  if (value.digest !== snapshotDigest(value, normalizations)) fail('snapshot-digest');
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
  if (!Array.isArray(decision.blockers)) fail('blockers');
  decision.blockers.forEach(validateBlocker);
  validateAuthoritySubjects(decision.blockers);
  decision.blockers.forEach((blocker) => validateRemediationCoupling(blocker, decision));
  if (decision.status === 'ready' && decision.blockers.length !== 0) fail('ready-blockers');
  if (decision.status !== 'ready' && decision.blockers.length === 0) fail('not-ready-blockers');
  if (!Array.isArray(decision.normalizations)) fail('normalizations');
  decision.normalizations.forEach(validateNormalization);
  validateSnapshot(decision.snapshot, decision.normalizations, decision.issue);
  if (!Array.isArray(decision.warnings)) fail('warnings');
  decision.warnings.forEach(validateWarning);
  validateWarningOrder(decision.warnings);
  validateHumanDecision(decision.humanDecision, decision);
  assertHumanRequestCoupling(decision);
  if (decision.status === 'ready' && decision.humanDecision !== null) fail('ready-human-decision');
  if (!Array.isArray(decision.guidanceIds) || decision.guidanceIds.length === 0) {
    fail('guidance-ids');
  }
  for (const id of decision.guidanceIds) {
    if (!GUIDANCE_IDS.has(id)) fail('guidance-id');
  }
  const unresolvedNavigation = decision.blockers.some(({ code }) => code === 'state-unavailable');
  if (decision.snapshot.state === 'done' && decision.status !== 'ready') fail('terminal-status');
  if (decision.snapshot.state === 'done' && decision.actionId !== null) fail('terminal-action');
  if (unresolvedNavigation && decision.actionId !== null) fail('navigation-action');
  if (decision.actionId === null && decision.snapshot.state !== 'done' && !unresolvedNavigation) {
    fail('null-action');
  }
  const expectedGuidanceId =
    decision.actionId !== null
      ? `action.${decision.actionId}`
      : decision.snapshot.state === 'done'
        ? 'state.done'
        : 'navigation.unresolved';
  if (decision.guidanceIds.length !== 1 || decision.guidanceIds[0] !== expectedGuidanceId) {
    fail('guidance-coupling');
  }
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
    decision.snapshot.digest = snapshotDigest(decision.snapshot, decision.normalizations);
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
  decision.snapshot.digest = snapshotDigest(decision.snapshot, decision.normalizations);
  decision.guidanceIds = ['state.done'];
  return validateCandidateDecision(decision);
}

export function buildCrossIssueCandidateDecision({ fixture, targetFixture }) {
  const decision = buildCandidateDecision({ fixture, scenario: 'ready' });
  if (fixture.issue === targetFixture.issue) fail('cross-issue-target');
  decision.status = 'blocked';
  decision.blockers = [
    {
      guardId: 'candidate-cross-issue',
      code: 'cross-issue-plan-approval-missing',
      args: {
        repository: 'kburson/ai-task-manager',
        issue: targetFixture.issue,
        actionId: targetFixture.actionId,
      },
      remediation: { id: 'record-plan-approval', args: { issue: targetFixture.issue } },
    },
  ];
  decision.humanDecision = {
    requests: [
      {
        kind: 'plan-approval',
        actor: 'configured-approver',
        subject: { issue: targetFixture.issue, actionId: targetFixture.actionId },
        args: {},
      },
    ],
  };
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
    const instruction =
      decision.actionId === null
        ? decision.snapshot.state === 'done'
          ? [{ terminal_state: 'done' }, { recommendation: null }]
          : [
              { navigation: 'unresolved' },
              { recommendation: null },
              { if_blocked: 'use_returned_remediation_ids' },
            ]
        : [
            { query: decision.actionId },
            { require_status: 'ready' },
            { if_blocked: 'use_returned_remediation_ids' },
            { execute: decision.actionId },
            { execution_revalidates: true },
          ];
    return {
      id,
      digest: GUIDANCE_DIGEST,
      status: 'expanded',
      agent: {
        instruction,
      },
    };
  });
}

function validateGuidanceInstruction(entry, result) {
  const expectedId =
    result.actionId !== null
      ? `action.${result.actionId}`
      : result.status === 'ready'
        ? 'state.done'
        : 'navigation.unresolved';
  if (entry.id !== expectedId) fail('guidance-coupling');
  if (entry.digest !== GUIDANCE_DIGEST) fail('guidance-digest');
  if (entry.status === 'not-modified') return;
  const expected =
    result.actionId !== null
      ? [
          { query: result.actionId },
          { require_status: 'ready' },
          { if_blocked: 'use_returned_remediation_ids' },
          { execute: result.actionId },
          { execution_revalidates: true },
        ]
      : result.status === 'ready'
        ? [{ terminal_state: 'done' }, { recommendation: null }]
        : [
            { navigation: 'unresolved' },
            { recommendation: null },
            { if_blocked: 'use_returned_remediation_ids' },
          ];
  if (JSON.stringify(entry.agent.instruction) !== JSON.stringify(expected)) {
    fail('guidance-instruction');
  }
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
  return validateCandidateExplanation(envelope, { admissionWarnings });
}

export function validateCandidateExplanation(envelope, { admissionWarnings = [] } = {}) {
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
  if (!Array.isArray(envelope.guidance) || envelope.guidance.length !== 1) fail('guidance');
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
    validateGuidanceInstruction(entry, envelope.result);
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
    const expected = presentation(envelope.fullDecision, admissionWarnings);
    if (JSON.stringify(expected) !== JSON.stringify(envelope.result)) {
      fail('diagnostic-operational-equivalence');
    }
  }
  return envelope;
}

export function projectOverrideMutationEffect({ valid, mutationSucceeded, alreadyAnnotated }) {
  const { mutationAllowed, warningEmitted, annotationWritten } = projectOverrideProtocol({
    diverged: true,
    valid,
    mutationSucceeded,
    alreadyAnnotated,
    digest: SOURCE_DIGEST,
    receiptDigest: null,
    contextReset: false,
  });
  return { mutationAllowed, warningEmitted, annotationWritten };
}

function measureText(text) {
  return {
    characters: text.length,
    bytes: Buffer.byteLength(text, 'utf8'),
  };
}

export function measureStaticFiles(files) {
  const measured = files.map(({ id, text }) => {
    const counts = measureText(text);
    return { id, ...counts, proxyTokens: Math.ceil(counts.characters / 4) };
  });
  return {
    files: measured,
    totals: measured.reduce(
      (total, file) => ({
        characters: total.characters + file.characters,
        bytes: total.bytes + file.bytes,
        proxyTokens: total.proxyTokens + file.proxyTokens,
      }),
      { characters: 0, bytes: 0, proxyTokens: 0 }
    ),
  };
}

export function measureTrafficParts(parts) {
  const measured = parts.map(({ category, text }) => ({ category, ...measureText(text) }));
  const totals = measured.reduce(
    (total, part) => ({
      characters: total.characters + part.characters,
      bytes: total.bytes + part.bytes,
    }),
    { characters: 0, bytes: 0 }
  );
  return {
    parts: measured,
    totals: { ...totals, proxyTokens: Math.ceil(totals.characters / 4) },
  };
}

const CANDIDATE_WORKFLOW_SCHEDULE = Object.freeze([
  {
    legacyScenarioId: 'bind-success',
    action: 'bind',
    outcome: 'success',
    scenario: 'ready',
    boundary: 'first-expanded',
  },
  {
    legacyScenarioId: 'bind-refusal',
    action: 'bind',
    outcome: 'refusal',
    scenario: 'blocked',
    boundary: 'refusal-remediation',
  },
  {
    legacyScenarioId: 'bind-success',
    action: 'bind',
    outcome: 'success',
    scenario: 'ready',
    boundary: 'repeat-matching-receipt',
    receiptDigest: GUIDANCE_DIGEST,
    comparableLane: false,
    execute: false,
  },
  {
    legacyScenarioId: 'resume-success',
    action: 'resume',
    outcome: 'success',
    scenario: 'ready',
    boundary: 'routine',
  },
  {
    legacyScenarioId: 'resume-refusal',
    action: 'resume',
    outcome: 'refusal',
    scenario: 'blocked',
    boundary: 'refusal-remediation',
  },
  {
    legacyScenarioId: 'promote-success',
    action: 'promote',
    outcome: 'success',
    scenario: 'ready',
    boundary: 'routine',
  },
  {
    legacyScenarioId: 'promote-refusal',
    action: 'promote',
    outcome: 'refusal',
    scenario: 'blocked',
    boundary: 'changed-stale-receipt',
    receiptDigest: `sha256:${'0'.repeat(64)}`,
  },
  {
    legacyScenarioId: 'promote-success',
    action: 'promote',
    outcome: 'success',
    scenario: 'ready',
    boundary: 'post-compaction',
    comparableLane: false,
    execute: false,
  },
  {
    legacyScenarioId: 'test-success',
    action: 'test',
    outcome: 'success',
    scenario: 'ready',
    boundary: 'routine',
  },
  {
    legacyScenarioId: 'test-refusal',
    action: 'test',
    outcome: 'refusal',
    scenario: 'indeterminate',
    boundary: 'explicit-diagnostic',
    diagnostic: true,
  },
  {
    legacyScenarioId: 'review-success',
    action: 'review',
    outcome: 'success',
    scenario: 'ready',
    boundary: 'routine',
  },
  {
    legacyScenarioId: 'review-refusal',
    action: 'review',
    outcome: 'refusal',
    scenario: 'blocked',
    boundary: 'refusal-remediation',
  },
  {
    legacyScenarioId: 'deliver-success',
    action: 'deliver',
    outcome: 'success',
    scenario: 'ready',
    boundary: 'external-approval-after',
  },
  {
    legacyScenarioId: 'deliver-refusal',
    action: 'deliver',
    outcome: 'refusal',
    scenario: 'effective-policy-human-request',
    boundary: 'external-approval-before',
  },
  {
    legacyScenarioId: 'close-success',
    action: 'close',
    outcome: 'success',
    scenario: 'ready',
    boundary: 'routine',
  },
  {
    legacyScenarioId: 'close-refusal',
    action: 'close',
    outcome: 'refusal',
    scenario: 'blocked',
    boundary: 'refusal-remediation',
  },
]);

export function buildCandidateWorkflow({ adapter, fixtures, legacyTranscript }) {
  if (!new Set(['claude', 'codex']).has(adapter)) fail('measurement-adapter');
  const legacyByScenario = new Map(
    legacyTranscript.entries.map((entry) => [entry.scenarioId, entry])
  );
  const entries = CANDIDATE_WORKFLOW_SCHEDULE.map((step, index) => {
    const fixture = fixtures[step.action];
    const legacy = legacyByScenario.get(step.legacyScenarioId);
    if (!fixture || !legacy) fail('measurement-schedule-source');
    const decision = buildCandidateDecision({ fixture, scenario: step.scenario });
    const knownGuidance = step.receiptDigest
      ? [{ id: `action.${step.action}`, digest: step.receiptDigest }]
      : [];
    const routine = renderCandidateExplanation({ decision, knownGuidance });
    const diagnostic = step.diagnostic
      ? renderCandidateExplanation({
          decision,
          knownGuidance,
          diagnostic: true,
          diagnosticMessages: [
            {
              guardId: 'authority-collection',
              text: 'deterministic authority fixture requires explicit investigation',
              untrusted: true,
            },
          ],
        })
      : null;
    const guidance = routine.guidance[0];
    const receiptInput = step.receiptDigest
      ? `aitm-guidance-loaded:action.${step.action}:${step.receiptDigest}\n`
      : '';
    const receiptOutput =
      guidance.status === 'expanded'
        ? `aitm-guidance-loaded:${guidance.id}:${guidance.digest}\n`
        : '';
    const shouldExecute =
      step.execute !== false && step.outcome === 'success' && decision.status === 'ready';
    return {
      sequence: index + 1,
      scenarioId:
        step.comparableLane === false
          ? `${step.legacyScenarioId}:${step.boundary}`
          : step.legacyScenarioId,
      legacyScenarioId: step.legacyScenarioId,
      comparableLane: step.comparableLane !== false,
      boundary: step.boundary,
      action: step.action,
      outcome: step.outcome,
      commandInput: `npx aitm explain ${fixture.issue} --action ${step.action}${
        step.receiptDigest ? ` --known action.${step.action}@${step.receiptDigest}` : ''
      } --json\n`,
      receiptInput,
      stdout: `${JSON.stringify(routine)}\n`,
      stderr: '',
      receiptOutput,
      diagnosticOutput: diagnostic ? `${JSON.stringify(diagnostic)}\n` : '',
      execution: shouldExecute
        ? {
            commandInput: `${legacy.command.executable} ${legacy.command.argv.join(' ')}\n`,
            stdout: legacy.stdout,
            stderr: legacy.stderr,
          }
        : null,
    };
  });
  return {
    schema: 'aitm.guidance-candidate-transcript/v1',
    captureKind: 'candidate-model-not-actual-cli',
    adapter,
    sourceCommit: legacyTranscript.sourceCommit,
    authorityFixtureSha256: legacyTranscript.authorityFixtureSha256,
    scenarioSha256: legacyTranscript.scenarioSha256,
    entries,
  };
}

function sha256Text(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function readJson(projectRoot, relativePath) {
  return JSON.parse(readFileSync(path.join(projectRoot, relativePath), 'utf8'));
}

function candidateStaticSource(projectRoot, adapter) {
  const planPath = 'docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance.md';
  const plan = readFileSync(path.join(projectRoot, planPath), 'utf8');
  const extract = (pattern, id) => {
    const match = pattern.exec(plan);
    if (!match) fail(`measurement-static-source-${id}`);
    return match[1];
  };
  const values = [
    {
      id: 'shim',
      sourcePath: 'skill/SKILL.md',
      sourceSection: 'complete-file',
      text: readFileSync(path.join(projectRoot, 'skill/SKILL.md'), 'utf8'),
    },
    {
      id: 'router-proposal',
      sourcePath: planPath,
      sourceSection: 'Appendix A.1 router',
      text: extract(/const router = `([\s\S]*?)`;/, 'router'),
    },
    {
      id: 'pickup-proposal',
      sourcePath: planPath,
      sourceSection: 'Appendix A.1 pickup',
      text: extract(/const pickup = `([\s\S]*?)`;/, 'pickup'),
    },
    {
      id: 'adapter-proposal',
      sourcePath: planPath,
      sourceSection: `Appendix A.1 adapter.${adapter}`,
      text: extract(new RegExp(adapter + ': `([\\s\\S]*?)`,'), `adapter-${adapter}`),
    },
  ];
  const measured = measureStaticFiles(values);
  return {
    files: measured.files.map((file, index) => ({
      ...file,
      sourcePath: values[index].sourcePath,
      sourceSection: values[index].sourceSection,
      sha256: sha256Text(values[index].text),
    })),
    totals: measured.totals,
  };
}

function candidateTraffic(transcript) {
  const text = (selector) => transcript.entries.map(selector).join('');
  const measurement = measureTrafficParts([
    {
      category: 'command-input',
      text: text((entry) => entry.commandInput + (entry.execution?.commandInput ?? '')),
    },
    { category: 'receipt-input', text: text((entry) => entry.receiptInput) },
    {
      category: 'operational-stdout',
      text: text((entry) => entry.stdout + (entry.execution?.stdout ?? '')),
    },
    {
      category: 'operational-stderr',
      text: text((entry) => entry.stderr + (entry.execution?.stderr ?? '')),
    },
    { category: 'receipt-output', text: text((entry) => entry.receiptOutput) },
    { category: 'explicit-diagnostics', text: text((entry) => entry.diagnosticOutput) },
  ]);
  return { categories: measurement.parts, totals: measurement.totals };
}

function legacyTraffic(candidateTranscript, legacyTranscript) {
  const byScenario = new Map(legacyTranscript.entries.map((entry) => [entry.scenarioId, entry]));
  const comparable = candidateTranscript.entries.filter(({ comparableLane }) => comparableLane);
  const text = (selector) =>
    comparable.map(({ legacyScenarioId }) => selector(byScenario.get(legacyScenarioId))).join('');
  const measurement = measureTrafficParts([
    {
      category: 'command-input',
      text: text((entry) => `${JSON.stringify(entry.command)}\n`),
    },
    { category: 'operational-stdout', text: text((entry) => entry.stdout) },
    { category: 'operational-stderr', text: text((entry) => entry.stderr) },
  ]);
  return { categories: measurement.parts, totals: measurement.totals };
}

function totalContext(staticMeasurement, trafficMeasurement) {
  return {
    characters: staticMeasurement.totals.characters + trafficMeasurement.totals.characters,
    bytes: staticMeasurement.totals.bytes + trafficMeasurement.totals.bytes,
    proxyTokens: staticMeasurement.totals.proxyTokens + trafficMeasurement.totals.proxyTokens,
  };
}

function measureSerialized(text) {
  const counts = measureText(text);
  return { ...counts, proxyTokens: Math.ceil(counts.characters / 4) };
}

function buildHeavyExplanation(fixture) {
  const decision = buildCandidateDecision({ fixture, scenario: 'blocked', evidenceCopies: 8 });
  decision.blockers = Array.from({ length: 7 }, (_, index) => ({
    guardId: 'candidate-precondition',
    code: 'precondition-missing',
    args: { requirement: `close-authority-${index + 1}` },
    remediation: {
      id: 'satisfy-precondition',
      args: { issue: fixture.issue, actionId: fixture.actionId },
    },
  }));
  validateCandidateDecision(decision);
  return `${JSON.stringify(renderCandidateExplanation({ decision }))}\n`;
}

function buildActionCardinality({ fixtures, inventory }) {
  const inventoryByAction = new Map(inventory.actions.map((entry) => [entry.id, entry]));
  return {
    schema: 'aitm.guidance-action-cardinality/v1',
    fixtureKind: 'observed-candidate-model',
    actions: [...ACTIONS].map((actionId) => {
      const fixture = fixtures[actionId];
      const scenarios = fixture.scenarios.map((scenario) => {
        const decision = buildCandidateDecision({ fixture, scenario });
        return {
          scenario,
          blockers: decision.blockers.length,
          warnings: decision.warnings.length,
          normalizations: decision.normalizations.length,
          humanRequests: decision.humanDecision?.requests.length ?? 0,
          observations: decision.snapshot.observations.length,
        };
      });
      const actionInventory = inventoryByAction.get(actionId);
      return {
        action: actionId,
        observedFixtures: scenarios,
        simultaneousReachability: scenarios.filter(
          ({ blockers, warnings, normalizations, humanRequests }) =>
            blockers + warnings + normalizations + humanRequests > 0
        ),
        perSiteFanOut: actionInventory.observations.map((observation) => ({
          site: observation.id,
          refusals: observation.refusals.length,
          warnings: observation.warnings.length,
          humanObligations: observation.humanObligations.length,
        })),
      };
    }),
    finiteHeavyInputs: {
      action: 'close',
      attempts: 2,
      blockersPerAttempt: 7,
      observationsPerAttempt: 8,
    },
    unboundedDimensions: [
      'body-length',
      'child-count',
      'dependency-count',
      'pagination',
      'retry-history',
    ],
  };
}

function buildSerializationSensitivity({ fixtures, transcripts }) {
  const deliver = fixtures.deliver;
  const evidenceOne = JSON.stringify(
    renderCandidateExplanation({
      decision: buildCandidateDecision({ fixture: deliver, scenario: 'blocked' }),
    })
  );
  const evidenceMany = JSON.stringify(
    renderCandidateExplanation({
      decision: buildCandidateDecision({
        fixture: deliver,
        scenario: 'blocked',
        evidenceCopies: 12,
      }),
    })
  );
  const ready = measureSerialized(
    JSON.stringify(
      renderCandidateExplanation({
        decision: buildCandidateDecision({ fixture: deliver, scenario: 'ready' }),
      })
    )
  );
  const blocked = measureSerialized(evidenceOne);
  const heavyAttempt = buildHeavyExplanation(fixtures.close);
  const heavyText = `${heavyAttempt}${heavyAttempt}`;
  return {
    schema: 'aitm.guidance-serialization-sensitivity/v1',
    captureKind: 'candidate-model-not-actual-cli',
    evidenceOnlyGrowth: {
      inputObservations: { first: 1, expanded: 12 },
      routine: {
        first: measureSerialized(evidenceOne),
        expanded: measureSerialized(evidenceMany),
        charactersDelta: evidenceMany.length - evidenceOne.length,
      },
    },
    operationalGrowth: {
      blocked: {
        ready,
        blocked,
        charactersDelta: blocked.characters - ready.characters,
      },
    },
    boundaries: Object.fromEntries(
      Object.entries(transcripts).map(([adapter, transcript]) => [
        adapter,
        transcript.entries.map(
          ({
            boundary,
            commandInput,
            receiptInput,
            stdout,
            stderr,
            receiptOutput,
            diagnosticOutput,
          }) => ({
            boundary,
            measurement: measureSerialized(
              `${commandInput}${receiptInput}${stdout}${stderr}${receiptOutput}${diagnosticOutput}`
            ),
          })
        ),
      ])
    ),
    heavyCase: {
      inputs: {
        action: 'close',
        attempts: 2,
        blockersPerAttempt: 7,
        observationsPerAttempt: 8,
      },
      measurement: measureSerialized(heavyText),
    },
  };
}

export function buildCandidateMeasurementArtifacts({ projectRoot }) {
  const baseline = readJson(projectRoot, 'scripts/tests/fixtures/1558/legacy-baseline.json');
  const inventory = readJson(
    projectRoot,
    'scripts/tests/fixtures/1558/action-observation-inventory.json'
  );
  const fixtures = Object.fromEntries(
    [...ACTIONS].map((actionId) => [
      actionId,
      readJson(
        projectRoot,
        `scripts/tests/fixtures/1558/action-decision-fixtures/${actionId}.json`
      ),
    ])
  );
  const transcripts = Object.fromEntries(
    ['claude', 'codex'].map((adapter) => {
      const legacyTranscript = readJson(
        projectRoot,
        `scripts/tests/fixtures/1558/legacy-workflow/transcripts/${adapter}.json`
      );
      return [adapter, buildCandidateWorkflow({ adapter, fixtures, legacyTranscript })];
    })
  );
  const responseMeasurements = {
    clean: measureSerialized(
      JSON.stringify(
        renderCandidateExplanation({
          decision: buildCandidateDecision({ fixture: fixtures.deliver, scenario: 'ready' }),
        })
      )
    ),
    blocked: measureSerialized(
      JSON.stringify(
        renderCandidateExplanation({
          decision: buildCandidateDecision({ fixture: fixtures.deliver, scenario: 'blocked' }),
        })
      )
    ),
  };
  const planPath = 'docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance.md';
  const oraclePath = 'scripts/tests/helpers/guidance-characterization.mjs';
  const contextComparison = {
    schema: 'aitm.guidance-context-comparison/v1',
    comparisonKind: 'early-candidate-characterization-not-feasibility-authority',
    identities: {
      legacy: {
        sourceCommit: baseline.source.commit,
        scenarioSha256: transcripts.codex.scenarioSha256,
        authorityFixtureSha256: transcripts.codex.authorityFixtureSha256,
        transcriptSha256: Object.fromEntries(
          baseline.adapters.map(({ id, transcriptSha256 }) => [id, transcriptSha256])
        ),
      },
      candidate: {
        oracle: {
          sourcePath: oraclePath,
          sourceCommit: '3579a72100642e42e3268e3dcf7de63aa691a3ac',
          sha256: sha256Text(readFileSync(path.join(projectRoot, oraclePath))),
        },
        plan: {
          sourcePath: planPath,
          sourceSection: 'Appendix A.1 Candidate protocol and illustrative traffic',
          sourceCommit: '9589337aaf7cd6b13c1f69e28095af82e9df2ecd',
          sha256: sha256Text(readFileSync(path.join(projectRoot, planPath))),
        },
        fixtureSourceCommit: '627907fb43fd2ee1dd8fc6718bcb3499d068b775',
        fixtureSetSha256: digest(fixtures),
        serializer: 'guidance-characterization/candidate-workflow-v1',
        // This is a frozen early-candidate artifact. Its runtime describes the
        // original capture, so regeneration must not substitute the CI host.
        runtime: { node: 'v26.8.1', platform: 'darwin', architecture: 'arm64' },
      },
    },
    assumptions: {
      captureKind: 'candidate-model-not-actual-cli',
      staticObligations:
        'Provisional exact Appendix A.1 proposed text; this is not a certified complete retained-obligation map.',
      replacementOwner:
        'WBS 24 must replace this provisional static assumption with the reviewed obligation map before release evidence.',
      latency: 'No service latency is inferred from deterministic fixture traffic.',
    },
    fixedBudgets: {
      routerPlusPickup: { absolute: 5000, working: 4000 },
      clean: { absolute: 300, working: 240 },
      blocked: { absolute: 500, working: 400 },
      fullLifecycle: { absolute: 7000, working: 5600 },
    },
    adapters: {},
  };
  for (const adapter of ['claude', 'codex']) {
    const legacyAdapter = baseline.adapters.find(({ id }) => id === adapter);
    const legacyTranscript = readJson(
      projectRoot,
      `scripts/tests/fixtures/1558/legacy-workflow/transcripts/${adapter}.json`
    );
    const legacyStatic = {
      files: legacyAdapter.loadedText.map(
        ({ role: id, sourcePath, characters, bytes, proxyTokens, sha256 }) => ({
          id,
          sourcePath,
          characters,
          bytes,
          proxyTokens,
          sha256,
        })
      ),
      totals: {
        characters: legacyAdapter.staticCharacters,
        bytes: legacyAdapter.loadedText.reduce((sum, file) => sum + file.bytes, 0),
        proxyTokens: legacyAdapter.staticProxyTokens,
      },
    };
    const candidateStatic = candidateStaticSource(projectRoot, adapter);
    const candidateTrafficMeasurement = candidateTraffic(transcripts[adapter]);
    const legacyTrafficMeasurement = legacyTraffic(transcripts[adapter], legacyTranscript);
    const candidateTotal = totalContext(candidateStatic, candidateTrafficMeasurement);
    const legacyTotal = totalContext(legacyStatic, legacyTrafficMeasurement);
    contextComparison.adapters[adapter] = {
      legacy: { static: legacyStatic, traffic: legacyTrafficMeasurement, total: legacyTotal },
      candidate: {
        captureKind: 'candidate-model-not-actual-cli',
        transcriptPath: `scripts/tests/fixtures/1558/candidate-workflow/${adapter}.json`,
        transcriptSha256: sha256Text(`${JSON.stringify(transcripts[adapter], null, 2)}\n`),
        static: candidateStatic,
        responses: responseMeasurements,
        traffic: candidateTrafficMeasurement,
        total: candidateTotal,
      },
      delta: {
        characters: candidateTotal.characters - legacyTotal.characters,
        bytes: candidateTotal.bytes - legacyTotal.bytes,
        proxyTokens: candidateTotal.proxyTokens - legacyTotal.proxyTokens,
      },
      remainingMargins: {
        routerPlusPickup: {
          absolute: 5000 - candidateStatic.totals.proxyTokens,
          working: 4000 - candidateStatic.totals.proxyTokens,
        },
        clean: {
          absolute: 300 - responseMeasurements.clean.proxyTokens,
          working: 240 - responseMeasurements.clean.proxyTokens,
        },
        blocked: {
          absolute: 500 - responseMeasurements.blocked.proxyTokens,
          working: 400 - responseMeasurements.blocked.proxyTokens,
        },
        fullLifecycle: {
          absolute: 7000 - candidateTotal.proxyTokens,
          working: 5600 - candidateTotal.proxyTokens,
        },
      },
    };
  }
  return {
    transcripts,
    actionCardinality: buildActionCardinality({ fixtures, inventory }),
    serializationSensitivity: buildSerializationSensitivity({ fixtures, transcripts }),
    contextComparison,
  };
}

export function validateCandidateMeasurementArtifacts(artifacts, { projectRoot }) {
  const expected = buildCandidateMeasurementArtifacts({ projectRoot });
  if (JSON.stringify(artifacts) !== JSON.stringify(expected)) {
    fail('measurement-artifact-drift');
  }
  return artifacts;
}

const PROJECT_OVERRIDE_WARNING = `AITM project guidance override active.\nSource: .ai-task-manager/aitm-guidance.yml\nThe guidance differs from the installed published catalog. Executable guards\nremain authoritative; this repository owns and reviews the local guidance.`;

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
  const warningEmitted =
    active && (contextReset === true || receiptDigest === null || receiptDigest !== digest);
  return {
    mutationAllowed: valid === true,
    warningEmitted,
    warningText: warningEmitted ? PROJECT_OVERRIDE_WARNING : null,
    sourceReceipt: active ? `aitm-guidance-source:project-owned-diverged:${digest}` : null,
    annotationWritten: active && mutationSucceeded === true && alreadyAnnotated !== true,
  };
}

export const candidateConstants = Object.freeze({
  FULL_HEAD,
  GUIDANCE_DIGEST,
  PROJECT_OVERRIDE_WARNING,
  SOURCE_DIGEST,
});
