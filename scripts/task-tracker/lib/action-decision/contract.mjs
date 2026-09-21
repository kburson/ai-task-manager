import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { actionDescriptorFor, listLifecycleActions } from '../lifecycle-policy/actions.mjs';
import { stateIds } from '../lifecycle-policy/states.mjs';
import {
  listRemediations,
  remediationDefinitionFor,
  validateRemediation,
} from './remediations.mjs';

export const ACTION_DECISION_SCHEMA_V1 = 'aitm.action-decision/v1';
export const ACTION_DECISION_SCHEMA = 'aitm.action-decision/v2';
export const ACTION_VOCABULARY_VERSION = 'aitm.action-vocabulary/v2';
export const BOUNDARY_PRODUCER_IDS = Object.freeze([
  'authority-collection',
  'action-navigation',
  'action-result-validation',
]);
export const AUTHORITY_RESOURCE_IDS = Object.freeze([
  'issue-body',
  'issue-comment',
  'project-board',
  'delivery',
  'timing-log',
  'workflow-policy',
  'local-config',
  'session-state',
  'worktree',
  'github-user',
  'occupancy',
  'migration-journal',
]);
export const REGISTERED_GUARD_IDS = Object.freeze(
  Object.keys(
    JSON.parse(readFileSync(new URL('./legacy-refusals.json', import.meta.url), 'utf8')).guards
  ).sort()
);

const noArgs = () =>
  Object.freeze({
    required: Object.freeze([]),
    optional: Object.freeze([]),
    properties: Object.freeze({}),
  });
const args = (required, properties, optional = []) =>
  Object.freeze({
    required: Object.freeze(required),
    optional: Object.freeze(optional),
    properties: Object.freeze(properties),
  });
const enumType = (...values) => Object.freeze({ type: 'enum', values: Object.freeze(values) });
const stringType = Object.freeze({ type: 'string' });
const headType = Object.freeze({ type: 'head' });

const definition = ({
  code,
  domain,
  producers,
  severity,
  statuses,
  phases,
  argumentSchema = noArgs(),
  disposition = 'no-automatic-remediation',
}) =>
  Object.freeze({
    code,
    domain,
    allowedProducerIds: Object.freeze(producers),
    severity,
    legalStatuses: Object.freeze(statuses),
    legalPhases: Object.freeze(phases),
    argumentSchema,
    disposition,
  });

const decisionIndeterminate = (code, producers, argumentSchema = noArgs()) =>
  definition({
    code,
    domain: 'decision-blocker',
    producers,
    severity: 'error',
    statuses: ['indeterminate'],
    phases: ['collection', 'navigation', 'evaluation', 'validation'],
    argumentSchema,
  });

const decisionBlocked = (code, producers, values = {}) =>
  definition({
    code,
    domain: 'decision-blocker',
    producers,
    severity: 'error',
    statuses: ['blocked'],
    phases: ['evaluation'],
    ...values,
  });

const sourceArg = enumType(...AUTHORITY_RESOURCE_IDS);
const authoritySubject = Object.freeze({ type: 'authority-subject' });
const registeredGuard = Object.freeze(['registered-guard']);

export const CODE_DEFINITIONS = Object.freeze({
  'guard-error': decisionIndeterminate('guard-error', [
    'registered-guard',
    'action-result-validation',
  ]),
  'guard-result-invalid': decisionIndeterminate('guard-result-invalid', [
    'registered-guard',
    'action-result-validation',
  ]),
  'unknown-vocabulary': decisionIndeterminate('unknown-vocabulary', [
    'action-navigation',
    'action-result-validation',
  ]),
  'action-not-explain-ready': decisionIndeterminate('action-not-explain-ready', [
    'action-navigation',
  ]),
  'authority-read-failed': decisionIndeterminate(
    'authority-read-failed',
    ['authority-collection'],
    args(
      ['source', 'reason'],
      {
        source: sourceArg,
        reason: enumType('timeout', 'rate-limited', 'unavailable', 'incomplete', 'invalid'),
        subject: authoritySubject,
      },
      ['subject']
    )
  ),
  'authority-read-skipped': decisionIndeterminate(
    'authority-read-skipped',
    ['authority-collection'],
    args(['source'], { source: sourceArg, subject: authoritySubject }, ['subject'])
  ),
  'state-unavailable': decisionIndeterminate(
    'state-unavailable',
    ['action-navigation'],
    args(['reason'], { reason: enumType('unknown', 'conflicting') })
  ),
  'guard-effect-forbidden': decisionIndeterminate('guard-effect-forbidden', registeredGuard),
  'attribution-authority-unavailable': decisionIndeterminate('attribution-authority-unavailable', [
    'authority-collection',
  ]),
  'unclassified-refusal': decisionBlocked('unclassified-refusal', registeredGuard),
  'session-bind-mismatch': decisionBlocked('session-bind-mismatch', ['authority-collection'], {
    phases: ['collection'],
  }),
  'test-verification-commands-missing': decisionBlocked(
    'test-verification-commands-missing',
    ['authority-collection'],
    { phases: ['collection'] }
  ),
  'test-verification-command-invalid': decisionBlocked(
    'test-verification-command-invalid',
    ['authority-collection'],
    {
      phases: ['collection'],
      argumentSchema: args(['command', 'reason'], { command: stringType, reason: stringType }),
    }
  ),
  'test-head-mismatch': decisionBlocked('test-head-mismatch', ['authority-collection'], {
    phases: ['collection'],
    argumentSchema: args(['expected', 'actual'], { expected: headType, actual: headType }),
  }),
  'test-receipt-malformed': decisionBlocked('test-receipt-malformed', ['authority-collection'], {
    phases: ['collection'],
  }),
  'test-directory-evidence-invalid': decisionBlocked(
    'test-directory-evidence-invalid',
    ['authority-collection'],
    {
      phases: ['collection'],
    }
  ),
  'test-provider-invalid': decisionBlocked('test-provider-invalid', ['authority-collection'], {
    phases: ['collection'],
    argumentSchema: args(['reason'], { reason: stringType }),
  }),
  'review-preflight-refused': decisionBlocked(
    'review-preflight-refused',
    ['authority-collection'],
    {
      phases: ['collection'],
      argumentSchema: args(['category'], {
        category: enumType(
          'worktree-dirty',
          'commit-trail',
          'test-evidence',
          'epic-child',
          'acceptance-evidence',
          'deliverable'
        ),
      }),
    }
  ),
  'review-test-evidence-refused': decisionBlocked(
    'review-test-evidence-refused',
    ['authority-collection'],
    {
      phases: ['collection'],
      argumentSchema: args(['reason'], {
        reason: enumType(
          'directory-test-evidence-missing',
          'receipt-malformed',
          'head-unresolvable',
          'fingerprint-unresolvable',
          'test-started-sha-mismatch',
          'dod-verified-sha-mismatch',
          'stage-mismatch',
          'issue-mismatch',
          'sha-mismatch',
          'vc-set-mismatch',
          'node-major-mismatch',
          'platform-mismatch',
          'lockfile-mismatch',
          'config-mismatch',
          'sandbox-dirty',
          'command-identity-mismatch',
          'command-missing',
          'command-duplicate',
          'command-red'
        ),
      }),
    }
  ),
  'resume-not-paused': decisionBlocked('resume-not-paused', ['authority-collection'], {
    phases: ['collection'],
  }),
  'worktree-mismatch': decisionBlocked('worktree-mismatch', ['authority-collection'], {
    phases: ['collection'],
  }),
  'state-drift': decisionBlocked('state-drift', ['authority-collection'], {
    phases: ['collection'],
  }),
  'ownership-mismatch': decisionBlocked('ownership-mismatch', ['authority-collection'], {
    phases: ['collection'],
  }),
  'occupancy-conflict': decisionBlocked('occupancy-conflict', ['authority-collection'], {
    phases: ['collection'],
  }),
  'migration-freeze': decisionBlocked(
    'migration-freeze',
    ['registered-guard', 'authority-collection'],
    { phases: ['evaluation', 'collection'] }
  ),
  'plan-approval-missing': decisionBlocked('plan-approval-missing', registeredGuard, {
    disposition: 'registered-remediation',
  }),
  'review-approval-missing': decisionBlocked('review-approval-missing', registeredGuard, {
    argumentSchema: args(['head'], { head: headType }),
    disposition: 'registered-remediation',
  }),
  'normalization-authority-drift': definition({
    code: 'normalization-authority-drift',
    domain: 'execution-normalization',
    producers: ['action-result-validation'],
    severity: 'error',
    statuses: ['indeterminate'],
    phases: ['execution'],
  }),
  'normalization-persist-failed': definition({
    code: 'normalization-persist-failed',
    domain: 'execution-normalization',
    producers: ['action-result-validation'],
    severity: 'error',
    statuses: ['indeterminate'],
    phases: ['execution'],
  }),
  'normalization-readback-failed': definition({
    code: 'normalization-readback-failed',
    domain: 'execution-normalization',
    producers: ['action-result-validation'],
    severity: 'error',
    statuses: ['indeterminate'],
    phases: ['execution'],
  }),
  'guidance-catalog-invalid': definition({
    code: 'guidance-catalog-invalid',
    domain: 'guidance-admission',
    producers: ['guidance-admission'],
    severity: 'error',
    statuses: [],
    phases: ['admission'],
  }),
  'guidance-catalog-untracked': definition({
    code: 'guidance-catalog-untracked',
    domain: 'guidance-admission',
    producers: ['guidance-admission'],
    severity: 'error',
    statuses: [],
    phases: ['admission'],
  }),
  'unknown-agent-operation': definition({
    code: 'unknown-agent-operation',
    domain: 'guidance-admission',
    producers: ['guidance-admission'],
    severity: 'error',
    statuses: [],
    phases: ['admission'],
  }),
  'guidance-source-diverged': definition({
    code: 'guidance-source-diverged',
    domain: 'operational-warning',
    producers: ['guidance-admission'],
    severity: 'warning',
    statuses: ['ready', 'blocked', 'indeterminate'],
    phases: ['presentation'],
    argumentSchema: args(['source', 'digest'], {
      source: enumType('.ai-task-manager/aitm-guidance.yml'),
      digest: Object.freeze({ type: 'digest' }),
    }),
    disposition: 'none',
  }),
  'legacy-guard-warning': definition({
    code: 'legacy-guard-warning',
    domain: 'operational-warning',
    producers: registeredGuard,
    severity: 'warning',
    statuses: ['ready', 'blocked', 'indeterminate'],
    phases: ['evaluation'],
    argumentSchema: args(['guardId'], { guardId: stringType }),
    disposition: 'none',
  }),
  'test-develop-finalization-pending': definition({
    code: 'test-develop-finalization-pending',
    domain: 'operational-warning',
    producers: ['authority-collection'],
    severity: 'warning',
    statuses: ['ready', 'blocked', 'indeterminate'],
    phases: ['collection'],
    disposition: 'none',
  }),
  'guidance-annotation-failed': definition({
    code: 'guidance-annotation-failed',
    domain: 'audit-warning',
    producers: ['guidance-annotation'],
    severity: 'warning',
    statuses: [],
    phases: ['post-success'],
    disposition: 'none',
  }),
});

const NO_AUTOMATIC_REASONS = Object.freeze([
  'legacy-guard-requires-human-investigation',
  'authority-investigation-required',
  'state-investigation-required',
  'result-investigation-required',
  'action-not-explain-ready',
]);
const STATUSES = Object.freeze(['ready', 'blocked', 'indeterminate']);
const LIFECYCLE_STATES = Object.freeze(stateIds());
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const HEAD = /^[a-f0-9]{40,64}$/;

function fail(path, detail = 'invalid') {
  throw new TypeError(`action-decision:${path}:${detail}`);
}

function record(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'object');
  return value;
}

function exact(value, keys, path) {
  record(value, path);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(path, 'keys');
  }
}

function nonemptyString(value, path) {
  if (typeof value !== 'string' || value.trim() !== value || value === '') fail(path, 'string');
}

function instant(value, path) {
  nonemptyString(value, path);
  if (Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value)
    fail(path, 'instant');
}

function validateArgs(value, schema, path) {
  record(value, path);
  const required = [...schema.required].sort();
  const actual = Object.keys(value).sort();
  const allowed = new Set([...schema.required, ...(schema.optional ?? [])]);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    actual.some((key) => !allowed.has(key))
  ) {
    fail(path, 'keys');
  }
  for (const [key, type] of Object.entries(schema.properties)) {
    if (!Object.hasOwn(value, key)) continue;
    const member = value[key];
    if (type.type === 'enum' && !type.values.includes(member)) fail(`${path}.${key}`, 'enum');
    if (type.type === 'string') nonemptyString(member, `${path}.${key}`);
    if (type.type === 'positive-integer' && (!Number.isInteger(member) || member <= 0)) {
      fail(`${path}.${key}`, 'positive-integer');
    }
    if (type.type === 'digest' && !DIGEST.test(member)) fail(`${path}.${key}`, 'digest');
    if (type.type === 'head' && !HEAD.test(member)) fail(`${path}.${key}`, 'full-head');
    if (type.type === 'authority-subject') {
      exact(member, ['issue'], `${path}.${key}`);
      if (!Number.isInteger(member.issue) || member.issue <= 0) {
        fail(`${path}.${key}.issue`, 'positive-integer');
      }
    }
  }
}

function producerAllowed(producerId, allowed, registeredGuardIds = REGISTERED_GUARD_IDS) {
  if (allowed.includes(producerId)) return true;
  return allowed.includes('registered-guard') && registeredGuardIds.includes(producerId);
}

function producerPhase(producerId, definition, registeredGuardIds) {
  if (producerId === 'authority-collection') return 'collection';
  if (producerId === 'action-navigation') return 'navigation';
  if (producerId === 'action-result-validation') {
    return definition.domain === 'execution-normalization' ? 'execution' : 'validation';
  }
  if (producerId === 'guidance-admission') {
    return definition.domain === 'operational-warning' ? 'presentation' : 'admission';
  }
  if (producerId === 'guidance-annotation') return 'post-success';
  if (registeredGuardIds.includes(producerId)) return 'evaluation';
  return null;
}

function validateProducer(producerId, definition, path, registeredGuardIds) {
  if (!producerAllowed(producerId, definition.allowedProducerIds, registeredGuardIds)) {
    fail(path, 'producer');
  }
  const phase = producerPhase(producerId, definition, registeredGuardIds);
  if (phase === null || !definition.legalPhases.includes(phase)) fail(path, 'phase');
}

function validateDisposition(blocker, definition, path) {
  const hasRemediation = Object.hasOwn(blocker, 'remediation');
  const hasManual = Object.hasOwn(blocker, 'noAutomaticRemediation');
  if (hasRemediation === hasManual) fail(path, 'disposition');
  if (definition.disposition === 'registered-remediation' && !hasRemediation) {
    fail(path, 'remediation-required');
  }
  if (definition.disposition === 'no-automatic-remediation' && !hasManual) {
    fail(path, 'manual-disposition-required');
  }
  if (hasRemediation) validateRemediation(blocker.remediation);
  if (hasManual) {
    exact(blocker.noAutomaticRemediation, ['reason'], `${path}.noAutomaticRemediation`);
    if (!NO_AUTOMATIC_REASONS.includes(blocker.noAutomaticRemediation.reason)) {
      fail(`${path}.noAutomaticRemediation.reason`, 'enum');
    }
  }
}

export function validateBlocker(
  value,
  {
    status,
    path = 'blocker',
    registeredGuardIds = REGISTERED_GUARD_IDS,
    mixedStatus = false,
    schema = ACTION_DECISION_SCHEMA,
  } = {}
) {
  record(value, path);
  const hasRemediation = Object.hasOwn(value, 'remediation');
  const hasManual = Object.hasOwn(value, 'noAutomaticRemediation');
  if (hasRemediation === hasManual) fail(path, 'disposition');
  const disposition = Object.hasOwn(value, 'remediation')
    ? 'remediation'
    : 'noAutomaticRemediation';
  exact(value, ['guardId', 'code', 'args', disposition], path);
  nonemptyString(value.guardId, `${path}.guardId`);
  const definition = CODE_DEFINITIONS[value.code];
  if (!definition || !['decision-blocker', 'execution-normalization'].includes(definition.domain)) {
    fail(`${path}.code`, 'domain');
  }
  if (
    !definition.legalStatuses.includes(status) &&
    !(
      mixedStatus &&
      status === 'indeterminate' &&
      definition.domain === 'decision-blocker' &&
      definition.legalStatuses.includes('blocked')
    )
  )
    fail(`${path}.code`, 'status');
  if (
    schema === ACTION_DECISION_SCHEMA_V1 &&
    value.code === 'guard-error' &&
    value.guardId === 'action-result-validation'
  ) {
    fail(`${path}.guardId`, 'producer');
  }
  validateProducer(value.guardId, definition, `${path}.guardId`, registeredGuardIds);
  validateArgs(value.args, definition.argumentSchema, `${path}.args`);
  validateDisposition(value, definition, path);
  return structuredClone(value);
}

export function validateWarning(
  value,
  { status, path = 'warning', producerId = null, registeredGuardIds = REGISTERED_GUARD_IDS } = {}
) {
  exact(value, ['code', 'args'], path);
  const definition = CODE_DEFINITIONS[value.code];
  if (!definition || definition.domain !== 'operational-warning') fail(`${path}.code`, 'domain');
  if (!definition.legalStatuses.includes(status)) fail(`${path}.code`, 'status');
  validateArgs(value.args, definition.argumentSchema, `${path}.args`);
  const effectiveProducer =
    producerId ??
    (definition.allowedProducerIds.includes('registered-guard')
      ? value.args.guardId
      : definition.allowedProducerIds.length === 1
        ? definition.allowedProducerIds[0]
        : null);
  if (effectiveProducer === null) fail(`${path}.code`, 'producer');
  if (
    producerId !== null &&
    value.args.guardId !== undefined &&
    value.args.guardId !== producerId
  ) {
    fail(`${path}.args.guardId`, 'producer');
  }
  validateProducer(effectiveProducer, definition, `${path}.code`, registeredGuardIds);
  return structuredClone(value);
}

function validateSnapshot(value, normalizations, issue) {
  exact(value, ['state', 'head', 'digest', 'startedAt', 'completedAt', 'observations'], 'snapshot');
  nonemptyString(value.state, 'snapshot.state');
  if (!HEAD.test(value.head)) fail('snapshot.head', 'full-head');
  if (!DIGEST.test(value.digest)) fail('snapshot.digest', 'digest');
  instant(value.startedAt, 'snapshot.startedAt');
  instant(value.completedAt, 'snapshot.completedAt');
  if (Date.parse(value.completedAt) < Date.parse(value.startedAt)) fail('snapshot', 'window');
  if (!Array.isArray(value.observations) || value.observations.length === 0) {
    fail('snapshot.observations', 'nonempty-array');
  }
  const identities = new Set();
  value.observations.forEach((observation, index) => {
    const path = `snapshot.observations[${index}]`;
    record(observation, path);
    const hasDigest = Object.hasOwn(observation, 'digest');
    const hasRevision = Object.hasOwn(observation, 'revision');
    if (hasDigest === hasRevision) fail(path, 'digest-or-revision');
    exact(
      observation,
      ['source', 'identity', 'observedAt', hasDigest ? 'digest' : 'revision'],
      path
    );
    if (!AUTHORITY_RESOURCE_IDS.includes(observation.source)) fail(`${path}.source`, 'enum');
    nonemptyString(observation.identity, `${path}.identity`);
    if (identities.has(observation.identity)) fail(`${path}.identity`, 'duplicate');
    identities.add(observation.identity);
    const localIdentity = [
      'local-config',
      'session-state',
      'worktree',
      'github-user',
      'occupancy',
      'migration-journal',
    ].includes(observation.source);
    const identityIssue = localIdentity
      ? new RegExp(`^${observation.source}:(\\d+)$`).exec(observation.identity)
      : /^(?:issue|evidence):(\d+)(?::\d+)?$/.exec(observation.identity);
    if (!identityIssue || Number(identityIssue[1]) !== issue) {
      fail(`${path}.identity`, 'issue');
    }
    instant(observation.observedAt, `${path}.observedAt`);
    if (
      Date.parse(observation.observedAt) < Date.parse(value.startedAt) ||
      Date.parse(observation.observedAt) > Date.parse(value.completedAt)
    ) {
      fail(`${path}.observedAt`, 'window');
    }
    if (hasDigest && !DIGEST.test(observation.digest)) fail(`${path}.digest`, 'digest');
    if (hasRevision) nonemptyString(observation.revision, `${path}.revision`);
  });
  const expectedDigest = `sha256:${createHash('sha256')
    .update(
      JSON.stringify({
        state: value.state,
        head: value.head,
        startedAt: value.startedAt,
        completedAt: value.completedAt,
        observations: value.observations,
        normalizationInputs: normalizations.map(({ inputDigest, normalizerId }) => ({
          normalizerId,
          inputDigest,
        })),
      })
    )
    .digest('hex')}`;
  if (value.digest !== expectedDigest) fail('snapshot.digest', 'content');
}

function requiredHumanRequests(decision) {
  return decision.blockers.flatMap((blocker) => {
    if (blocker.code === 'plan-approval-missing') {
      return [
        {
          kind: 'plan-approval',
          subject: { issue: blocker.remediation.args.issue, actionId: 'promote' },
          args: {},
        },
      ];
    }
    if (blocker.code === 'review-approval-missing') {
      return [
        {
          kind: 'review-approval',
          subject: { issue: blocker.remediation.args.issue, actionId: decision.actionId },
          args: { head: blocker.args.head },
        },
      ];
    }
    if (
      [
        'authority-read-failed',
        'authority-read-skipped',
        'unclassified-refusal',
        'state-unavailable',
      ].includes(blocker.code)
    ) {
      return [
        {
          kind: 'manual-investigation',
          subject: {
            issue: blocker.args.subject?.issue ?? decision.issue,
            actionId: decision.actionId,
          },
          args: { guardId: blocker.guardId, code: blocker.code },
        },
      ];
    }
    return [];
  });
}

export function validateHumanDecision(value, decision) {
  const required = requiredHumanRequests(decision);
  if (value === null) {
    if (required.length > 0) fail('humanDecision', 'required');
    return;
  }
  exact(value, ['requests'], 'humanDecision');
  if (!Array.isArray(value.requests) || value.requests.length === 0) {
    fail('humanDecision.requests', 'nonempty-array');
  }
  value.requests.forEach((request, index) => {
    const path = `humanDecision.requests[${index}]`;
    validateHumanRequest(request, { path });
    if (request.kind === 'manual-investigation') {
      const match = decision.blockers.some(
        (blocker) => blocker.guardId === request.args.guardId && blocker.code === request.args.code
      );
      if (!match) fail(path, 'blocker-match');
    }
  });
  if (value.requests.length !== required.length) fail('humanDecision', 'request-coupling');
  required.forEach((expected, index) => {
    const request = value.requests[index];
    if (
      request.kind !== expected.kind ||
      request.subject.issue !== expected.subject.issue ||
      request.subject.actionId !== expected.subject.actionId ||
      canonicalRecordJson(request.args) !== canonicalRecordJson(expected.args)
    ) {
      fail(`humanDecision.requests[${index}]`, 'blocker-coupling');
    }
  });
}

export function validateHumanRequest(request, { path = 'humanRequest' } = {}) {
  exact(request, ['kind', 'actor', 'subject', 'args'], path);
  if (!['plan-approval', 'review-approval', 'manual-investigation'].includes(request.kind)) {
    fail(`${path}.kind`, 'enum');
  }
  const actor = request.kind === 'manual-investigation' ? 'human-operator' : 'configured-approver';
  if (request.actor !== actor) fail(`${path}.actor`, 'role');
  exact(request.subject, ['issue', 'actionId'], `${path}.subject`);
  if (!Number.isInteger(request.subject.issue) || request.subject.issue <= 0) {
    fail(`${path}.subject.issue`, 'positive-integer');
  }
  if (request.subject.actionId !== null && !actionDescriptorFor(request.subject.actionId)) {
    fail(`${path}.subject.actionId`, 'unknown');
  }
  if (request.subject.actionId === null && request.kind !== 'manual-investigation') {
    fail(`${path}.subject.actionId`, 'null');
  }
  const schema =
    request.kind === 'plan-approval'
      ? noArgs()
      : request.kind === 'review-approval'
        ? args(['head'], { head: Object.freeze({ type: 'head' }) })
        : args(['guardId', 'code'], { guardId: stringType, code: stringType });
  validateArgs(request.args, schema, `${path}.args`);
  if (request.kind === 'review-approval' && !HEAD.test(request.args.head)) {
    fail(`${path}.args.head`, 'full-head');
  }
  return structuredClone(request);
}

function validateNormalizations(value) {
  if (!Array.isArray(value)) fail('normalizations', 'array');
  for (const [index, normalization] of value.entries()) {
    const path = `normalizations[${index}]`;
    exact(
      normalization,
      ['normalizerId', 'inputDigest', 'decisions', 'decisionDigest', 'disposition'],
      path
    );
    if (normalization.normalizerId !== 'functional-dod-derived/v1') {
      fail(`${path}.normalizerId`, 'enum');
    }
    if (!DIGEST.test(normalization.inputDigest)) fail(`${path}.inputDigest`, 'digest');
    if (!Array.isArray(normalization.decisions) || normalization.decisions.length === 0) {
      fail(`${path}.decisions`, 'nonempty-array');
    }
    const keyOrder = ['acs', 'checkboxes'];
    let previous = -1;
    normalization.decisions.forEach((decision, decisionIndex) => {
      const decisionPath = `${path}.decisions[${decisionIndex}]`;
      exact(decision, ['derivationRule', 'key', 'stamp', 'tick'], decisionPath);
      const position = keyOrder.indexOf(decision.key);
      if (position === -1 || position <= previous) fail(`${path}.decisions`, 'order');
      previous = position;
      if (decision.derivationRule !== `derive-${decision.key}/v1`) {
        fail(`${decisionPath}.derivationRule`, 'enum');
      }
      if (typeof decision.stamp !== 'boolean' || typeof decision.tick !== 'boolean') {
        fail(decisionPath, 'booleans');
      }
    });
    if (!DIGEST.test(normalization.decisionDigest)) fail(`${path}.decisionDigest`, 'digest');
    const expectedDigest = `sha256:${createHash('sha256')
      .update(
        canonicalRecordJson({
          normalizerId: normalization.normalizerId,
          decisions: normalization.decisions,
        })
      )
      .digest('hex')}`;
    if (normalization.decisionDigest !== expectedDigest) {
      fail(`${path}.decisionDigest`, 'content');
    }
    if (normalization.disposition !== 'persist-on-execute') fail(`${path}.disposition`, 'enum');
  }
}

function validateAuthoritySubjects(blockers) {
  const bySource = new Map();
  for (const blocker of blockers) {
    if (!['authority-read-failed', 'authority-read-skipped'].includes(blocker.code)) continue;
    const group = bySource.get(blocker.args.source) ?? [];
    group.push(blocker);
    bySource.set(blocker.args.source, group);
  }
  for (const group of bySource.values()) {
    if (group.length < 2) continue;
    const subjects = new Set();
    for (const blocker of group) {
      if (!blocker.args.subject) fail('blockers.subject', 'required');
      const identity = canonicalRecordJson(blocker.args.subject);
      if (subjects.has(identity)) fail('blockers.subject', 'duplicate');
      subjects.add(identity);
    }
  }
}

function validateWarningOrder(warnings) {
  let sawEvaluatorWarning = false;
  for (const warning of warnings) {
    if (warning.code === 'legacy-guard-warning') sawEvaluatorWarning = true;
    if (warning.code === 'guidance-source-diverged' && sawEvaluatorWarning) {
      fail('warnings', 'warning-order');
    }
  }
}

export function validateActionDecision(value) {
  exact(
    value,
    [
      'schema',
      'issue',
      'actionId',
      'status',
      'snapshot',
      'blockers',
      'normalizations',
      'warnings',
      'humanDecision',
      'guidanceIds',
    ],
    'root'
  );
  if (![ACTION_DECISION_SCHEMA_V1, ACTION_DECISION_SCHEMA].includes(value.schema)) fail('schema');
  if (!Number.isInteger(value.issue) || value.issue <= 0) fail('issue', 'positive-integer');
  if (value.actionId !== null) nonemptyString(value.actionId, 'actionId');
  if (!STATUSES.includes(value.status)) fail('status', 'enum');
  if (!Array.isArray(value.blockers)) fail('blockers', 'array');
  if (value.status === 'ready' && value.blockers.length !== 0) fail('blockers', 'ready-empty');
  if (value.status !== 'ready' && value.blockers.length === 0) fail('blockers', 'nonempty');
  const mixedStatus =
    value.schema === ACTION_DECISION_SCHEMA &&
    value.status === 'indeterminate' &&
    value.blockers.some(({ code }) =>
      CODE_DEFINITIONS[code]?.legalStatuses.includes('indeterminate')
    );
  value.blockers.forEach((blocker, index) =>
    validateBlocker(blocker, {
      status: value.status,
      path: `blockers[${index}]`,
      mixedStatus,
      schema: value.schema,
    })
  );
  const actionDescriptor = value.actionId === null ? null : actionDescriptorFor(value.actionId);
  const unknownVocabulary = value.blockers.some(({ code }) => code === 'unknown-vocabulary');
  const unresolvedNavigation = value.blockers.some(({ code }) => code === 'state-unavailable');
  if (value.actionId !== null && actionDescriptor === null && !unknownVocabulary) {
    fail('actionId', 'unknown');
  }
  if (actionDescriptor !== null && unknownVocabulary)
    fail('blockers', 'unknown-vocabulary-coupling');
  validateAuthoritySubjects(value.blockers);
  validateNormalizations(value.normalizations);
  validateSnapshot(value.snapshot, value.normalizations, value.issue);
  if (!LIFECYCLE_STATES.includes(value.snapshot.state) && !unresolvedNavigation) {
    fail('snapshot.state', 'unknown-without-navigation-blocker');
  }
  if (!Array.isArray(value.warnings)) fail('warnings', 'array');
  value.warnings.forEach((warning, index) =>
    validateWarning(warning, { status: value.status, path: `warnings[${index}]` })
  );
  validateWarningOrder(value.warnings);
  if (value.status === 'ready' && value.humanDecision !== null) {
    fail('humanDecision', 'ready-null');
  }
  validateHumanDecision(value.humanDecision, value);
  if (!Array.isArray(value.guidanceIds)) fail('guidanceIds', 'array');
  value.guidanceIds.forEach((guidanceId, index) =>
    nonemptyString(guidanceId, `guidanceIds[${index}]`)
  );
  for (const blocker of value.blockers) {
    if (!blocker.remediation) continue;
    const remediation = remediationDefinitionFor(blocker.remediation.id);
    if (remediation?.humanRequired && value.humanDecision === null) {
      fail('humanDecision', 'required');
    }
    if (
      blocker.code === 'plan-approval-missing' &&
      blocker.remediation.id !== 'record-plan-approval'
    ) {
      fail('blockers.remediation', 'coupling');
    }
    if (blocker.code === 'review-approval-missing') {
      if (
        blocker.remediation.id !== 'request-review-approval' ||
        blocker.remediation.args.issue !== value.issue ||
        blocker.remediation.args.head !== blocker.args.head ||
        blocker.args.head !== value.snapshot.head
      ) {
        fail('blockers.remediation', 'coupling');
      }
    }
  }
  if (value.snapshot.state === 'done' && value.status !== 'ready') fail('status', 'terminal');
  if (value.snapshot.state === 'done' && value.actionId !== null) fail('actionId', 'terminal');
  if (unresolvedNavigation && value.actionId !== null) fail('actionId', 'navigation');
  if (value.actionId === null && value.snapshot.state !== 'done' && !unresolvedNavigation) {
    fail('actionId', 'null');
  }
  const expectedGuidanceId =
    actionDescriptor !== null
      ? actionDescriptor.guidanceId
      : unknownVocabulary
        ? 'navigation.unknown'
        : value.snapshot.state === 'done'
          ? 'state.done'
          : 'navigation.unresolved';
  if (value.guidanceIds.length !== 1 || value.guidanceIds[0] !== expectedGuidanceId) {
    fail('guidanceIds', 'coupling');
  }
  return structuredClone(value);
}

function fullyInventoried(legacyInventory, guardId) {
  const guard = legacyInventory?.guards?.[guardId];
  return guard?.complete === true && Array.isArray(guard.sites) && guard.sites.length > 0;
}

export function normalizeRefusal(value, { guardId, legacyInventory, registeredGuardIds } = {}) {
  nonemptyString(guardId, 'normalize.guardId');
  record(value, 'normalize.refusal');
  registeredGuardIds ??= Object.keys(legacyInventory?.guards ?? {}).sort();
  const typed =
    Object.hasOwn(value, 'args') ||
    Object.hasOwn(value, 'remediation') ||
    Object.hasOwn(value, 'noAutomaticRemediation');
  if (typed) {
    const blocker = {
      guardId,
      code: value.code,
      args: value.args,
      ...(Object.hasOwn(value, 'remediation') ? { remediation: value.remediation } : {}),
      ...(Object.hasOwn(value, 'noAutomaticRemediation')
        ? { noAutomaticRemediation: value.noAutomaticRemediation }
        : {}),
    };
    const definition = CODE_DEFINITIONS[blocker.code];
    const status = definition?.legalStatuses?.[0];
    return validateBlocker(blocker, {
      status,
      path: 'normalize.refusal',
      registeredGuardIds,
    });
  }
  if (!fullyInventoried(legacyInventory, guardId)) {
    fail('normalize.refusal', `guard ${guardId} is not fully inventoried`);
  }
  return {
    guardId,
    code: 'unclassified-refusal',
    args: {},
    noAutomaticRemediation: { reason: 'legacy-guard-requires-human-investigation' },
  };
}

export function actionNavigationRefusal(actionId) {
  const action = actionDescriptorFor(actionId);
  if (action?.explainReady) return null;
  if (action) {
    return {
      guardId: 'action-navigation',
      code: 'action-not-explain-ready',
      args: {},
      noAutomaticRemediation: { reason: 'action-not-explain-ready' },
    };
  }
  return {
    guardId: 'action-navigation',
    code: 'unknown-vocabulary',
    args: {},
    noAutomaticRemediation: { reason: 'result-investigation-required' },
  };
}

export function vocabularyDigest({
  actions = listLifecycleActions(),
  boundaryProducerIds = BOUNDARY_PRODUCER_IDS,
  authorityResourceIds = AUTHORITY_RESOURCE_IDS,
  codeDefinitions = CODE_DEFINITIONS,
  remediations = listRemediations(),
} = {}) {
  const value = {
    schema: ACTION_VOCABULARY_VERSION,
    actions,
    boundaryProducerIds,
    authorityResourceIds,
    codeDefinitions,
    remediations,
  };
  return `sha256:${createHash('sha256').update(canonicalRecordJson(value)).digest('hex')}`;
}
