// @story #1908 #1986 — Pure current-value classification and closed wire validation.
import { createHash } from 'node:crypto';
import { stateIds } from './lifecycle-policy/index.mjs';
import {
  classifyDecomposition,
  collectDecompositionSignals,
  decompositionPolicyIdentity,
  normalizeDecompositionHours,
} from './decomposition-policy.mjs';

export const DECOMPOSITION_INPUT_SCHEMA = 'aitm.decomposition-input/v1';
export const DECOMPOSITION_ASSESSMENT_SCHEMA = 'aitm.decomposition-assessment/v1';
export const DECOMPOSITION_PUBLICATION_SCHEMA = 'aitm.decomposition-publication/v1';
export const DECOMPOSITION_KINDS = Object.freeze([
  'code',
  'docs-only',
  'audit',
  'research',
  'spike',
  'epic',
]);
export const DECOMPOSITION_STATUSES = Object.freeze([
  'story-ok',
  'needs-decomposition-review',
  'must-decompose',
  'epic-readiness-required',
  'pending',
  'indeterminate',
]);
export const DECOMPOSITION_UNAVAILABLE_REASONS = Object.freeze([
  'kind-invalid',
  'kind-duplicate',
  'project-unavailable',
  'estimate-unavailable',
  'size-unavailable',
  'plan-unavailable',
  'policy-unavailable',
  'scope-unavailable',
  'forecast-unavailable',
  'children-unavailable',
  'authority-conflict',
  'authority-truncated',
]);
export const DECOMPOSITION_WRITER_IDS = Object.freeze([
  'inflate-estimate',
  'plan-estimate-adaptive',
  'plan-estimate-compatibility',
  'refine',
  'project-tether',
  'apply-reevaluate',
  'apply-refinement-estimate',
  'migrate-project',
  'bind-issues-to-new-project',
  'issue-body',
  'cancel-plan',
  'shelve',
  'event-field',
]);
export const DECOMPOSITION_EFFECT_RESOURCES = Object.freeze([
  'project-estimate',
  'project-size',
  'body-fields',
  'comment',
  'forecast',
  'plan-appendix',
  'ready-marker',
  'assessment',
]);
export const DECOMPOSITION_CAPABILITIES = Object.freeze([
  'inspect',
  'checkpoint',
  'decomposition-prepare',
  'governed-decomposition',
  'scoped-implementation',
  'scoped-deliverable',
  'scoped-completion',
  'publication-reconcile',
  'authority-recover',
]);
const BASE = ['inspect', 'checkpoint', 'decomposition-prepare', 'governed-decomposition'];
const SUBJECT_KEYS = ['repository', 'issue', 'projectId', 'projectItemId'];
const PLAN_KEYS = ['path', 'commit', 'section', 'digest', 'availability'];
const INPUT_KEYS = [
  'schema',
  'subject',
  'kind',
  'estimate',
  'size',
  'plan',
  'policy',
  'scopeDigest',
  'observations',
  'availability',
  'epicReadiness',
];
const ASSESSMENT_KEYS = [
  'schema',
  'subject',
  'inputDigest',
  'kind',
  'estimate',
  'size',
  'plan',
  'policyDigest',
  'scopeDigest',
  'signals',
  'status',
  'capabilities',
  'blockers',
  'observations',
  'assessedAt',
];
const PUBLICATION_KEYS = [
  'schema',
  'subject',
  'operationId',
  'writerId',
  'beforeInputDigest',
  'intendedInputDigest',
  'proposal',
  'effects',
  'status',
  'supersedes',
  'createdAt',
  'updatedAt',
];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function decompositionError(category) {
  throw new TypeError(`decomposition:${category}`);
}
export function exactDecompositionKeys(value, keys, category) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    decompositionError(category);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i]))
    decompositionError(category);
}
export function canonicalDecompositionJson(value) {
  const ordered = (v) =>
    Array.isArray(v)
      ? v.map(ordered)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((key) => [key, ordered(v[key])])
          )
        : v;
  return JSON.stringify(ordered(value));
}
const same = (a, b) => canonicalDecompositionJson(a) === canonicalDecompositionJson(b);
const hash = (value) => createHash('sha256').update(value).digest('hex');
function text(value, category, limit = 256, nullable = false) {
  if (nullable && value === null) return;
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > limit ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    decompositionError(category);
}
function digest(value, category, nullable = false) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) decompositionError(category);
}
function positive(value, category) {
  if (!Number.isSafeInteger(value) || value <= 0) decompositionError(category);
}
function timestamp(value, category) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    decompositionError(category);
  const actual = new Date(value).toISOString();
  if (actual !== value && actual.replace('.000Z', 'Z') !== value) decompositionError(category);
}
function boundedArray(value, category) {
  if (!Array.isArray(value) || value.length > 32) decompositionError(category);
}
function uuid(value, category) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) decompositionError(category);
}
function subject(value, { incomplete = false } = {}) {
  exactDecompositionKeys(value, SUBJECT_KEYS, 'subject-keys');
  if (
    typeof value.repository !== 'string' ||
    !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(value.repository)
  )
    decompositionError('subject-repository');
  positive(value.issue, 'subject-issue');
  for (const key of ['projectId', 'projectItemId']) {
    text(value[key], `subject-${key}`, 256, incomplete);
    if (value[key] !== null && /\s/.test(value[key])) decompositionError(`subject-${key}`);
  }
}
function estimate(value, normalize = false) {
  exactDecompositionKeys(value, ['basis', 'hours', 'proposalId'], 'estimate-keys');
  if (!['published', 'proposed', 'unset'].includes(value.basis))
    decompositionError('estimate-basis');
  if (value.basis === 'unset') {
    if (value.hours !== null || value.proposalId !== null) decompositionError('estimate-unset');
  } else {
    if (typeof value.hours !== 'number' || !Number.isFinite(value.hours) || value.hours < 0)
      decompositionError('estimate-hours');
    if (normalize) value.hours = normalizeDecompositionHours(value.hours);
    if (!Number.isSafeInteger(value.hours)) decompositionError('estimate-hours-grid');
    if (value.basis === 'proposed') text(value.proposalId, 'estimate-proposal');
    else if (value.proposalId !== null) decompositionError('estimate-proposal');
  }
}
function size(value) {
  if (value !== null && !['XS', 'S', 'M', 'L', 'XL'].includes(value)) decompositionError('size');
}
function safePlanPath(value) {
  return (
    typeof value === 'string' &&
    !/^(?:\/|[a-z]:|\\)/i.test(value) &&
    !value.split(/[\\/]/).some((part) => part === '..' || part === '') &&
    !value.includes('\\')
  );
}
function plan(value, runtime = false) {
  exactDecompositionKeys(value, runtime ? [...PLAN_KEYS, 'content'] : PLAN_KEYS, 'plan-keys');
  if (!['absent', 'available', 'unavailable'].includes(value.availability))
    decompositionError('plan-availability');
  for (const key of ['path', 'section'])
    text(value[key], `plan-${key}`, key === 'path' ? 1024 : 256, true);
  if (value.commit !== null && !/^[0-9a-f]{40}$/.test(value.commit))
    decompositionError('plan-commit');
  digest(value.digest, 'plan-digest', true);
  if (
    value.availability === 'absent' &&
    PLAN_KEYS.filter((key) => key !== 'availability').some((key) => value[key] !== null)
  )
    decompositionError('plan-absent');
  if (value.availability === 'available') {
    if (!value.path || !value.digest || !safePlanPath(value.path))
      decompositionError('plan-identity');
    if (runtime && typeof value.content !== 'string') decompositionError('plan-content');
    if (runtime && hash(value.content) !== value.digest) decompositionError('plan-content-digest');
  } else if (runtime && value.content !== null) decompositionError('plan-content');
}
function observations(value) {
  boundedArray(value, 'observations');
  const seen = new Set();
  for (const item of value) {
    exactDecompositionKeys(
      item,
      ['resource', 'identity', 'revision', 'digest'],
      'observation-keys'
    );
    if (typeof item.resource !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(item.resource))
      decompositionError('observation-resource');
    text(item.identity, 'observation-identity');
    text(item.revision, 'observation-revision', 256, true);
    if (/\s/.test(item.identity) || (item.revision !== null && /\s/.test(item.revision)))
      decompositionError('observation-reference');
    digest(item.digest, 'observation-digest', true);
    const key = `${item.resource}\0${item.identity}`;
    if (seen.has(key)) decompositionError('observations-duplicate');
    seen.add(key);
  }
}
function policy(value) {
  exactDecompositionKeys(value, ['classifierVersion', 'thresholds', 'digest'], 'policy-keys');
  text(value.classifierVersion, 'policy-version');
  digest(value.digest, 'policy-digest');
  exactDecompositionKeys(
    value.thresholds,
    Object.keys(decompositionPolicyIdentity().thresholds),
    'policy-thresholds'
  );
  for (const threshold of Object.values(value.thresholds)) positive(threshold, 'policy-threshold');
}
function readiness(value, kind) {
  exactDecompositionKeys(
    value,
    ['availability', 'planning', 'completion', 'digest', 'children'],
    'readiness-keys'
  );
  boundedArray(value.children, 'readiness-children');
  if (kind !== 'epic') {
    if (
      value.availability !== 'not-applicable' ||
      value.planning !== null ||
      value.completion !== null ||
      value.digest !== null ||
      value.children.length !== 0
    )
      decompositionError('readiness-not-applicable');
    return;
  }
  if (!['observed', 'unavailable'].includes(value.availability))
    decompositionError('readiness-availability');
  digest(value.digest, 'readiness-digest', value.availability === 'unavailable');
  if (value.availability === 'unavailable') {
    if (value.planning !== null || value.completion !== null || value.children.length !== 0)
      decompositionError('readiness-unavailable');
    return;
  }
  if (
    typeof value.planning !== 'boolean' ||
    typeof value.completion !== 'boolean' ||
    (value.completion && !value.planning)
  )
    decompositionError('readiness-boundaries');
  const seen = new Set();
  for (const item of value.children) {
    exactDecompositionKeys(
      item,
      [
        'issue',
        'sourcePlanCommit',
        'sourcePlanSection',
        'refinementDigest',
        'rank',
        'blockedBy',
        'state',
        'disposition',
      ],
      'readiness-child-keys'
    );
    positive(item.issue, 'readiness-child-issue');
    if (seen.has(item.issue)) decompositionError('readiness-child-duplicate');
    seen.add(item.issue);
    if (item.sourcePlanCommit !== null && !/^[0-9a-f]{40}$/.test(item.sourcePlanCommit))
      decompositionError('readiness-child-commit');
    text(item.sourcePlanSection, 'readiness-child-section', 256, true);
    digest(item.refinementDigest, 'readiness-child-refinement', true);
    if (item.rank !== null && (!Number.isFinite(item.rank) || item.rank < 0))
      decompositionError('readiness-child-rank');
    boundedArray(item.blockedBy, 'readiness-child-dependencies');
    for (const dep of item.blockedBy) positive(dep, 'readiness-child-dependency');
    if (
      new Set(item.blockedBy).size !== item.blockedBy.length ||
      item.blockedBy.includes(item.issue)
    )
      decompositionError('readiness-child-dependencies');
    if (
      !stateIds().includes(item.state) ||
      ![null, 'completed', 'not_planned'].includes(item.disposition)
    )
      decompositionError('readiness-child-state');
    const terminal =
      item.state === 'done' && ['completed', 'not_planned'].includes(item.disposition);
    if (value.completion && !terminal) decompositionError('readiness-completion');
    if (
      value.planning &&
      !terminal &&
      (!['ready-for-plan', 'plan', 'develop', 'test', 'review'].includes(item.state) ||
        !item.sourcePlanCommit ||
        !item.sourcePlanSection ||
        !item.refinementDigest ||
        item.rank === null)
    )
      decompositionError('readiness-planning');
  }
  if ((value.planning || value.completion) && value.children.length === 0)
    decompositionError('readiness-empty');
}
export function normalizeDecompositionInputs(snapshot) {
  exactDecompositionKeys(snapshot, INPUT_KEYS, 'input-keys');
  if (snapshot.schema !== DECOMPOSITION_INPUT_SCHEMA) decompositionError('input-schema');
  const input = structuredClone(snapshot);
  exactDecompositionKeys(input.subject, SUBJECT_KEYS, 'subject-keys');
  if (typeof input.subject.repository === 'string')
    input.subject.repository = input.subject.repository.trim().toLowerCase();
  subject(input.subject, { incomplete: true });
  exactDecompositionKeys(input.availability, ['status', 'reasons'], 'availability-keys');
  if (
    !['complete', 'incomplete'].includes(input.availability.status) ||
    !Array.isArray(input.availability.reasons) ||
    input.availability.reasons.length > 32 ||
    new Set(input.availability.reasons).size !== input.availability.reasons.length ||
    input.availability.reasons.some((reason) => !DECOMPOSITION_UNAVAILABLE_REASONS.includes(reason))
  )
    decompositionError('availability');
  if (input.availability.status === 'complete' && input.availability.reasons.length)
    decompositionError('availability-conflict');
  const reasons = new Set(input.availability.reasons);
  if (input.kind === null) input.kind = 'code';
  else if (!DECOMPOSITION_KINDS.includes(input.kind)) {
    reasons.add(
      Array.isArray(input.kind) && input.kind.length > 1 ? 'kind-duplicate' : 'kind-invalid'
    );
    input.kind = 'code';
  }
  if (!input.subject.projectId || !input.subject.projectItemId) reasons.add('project-unavailable');
  estimate(input.estimate, true);
  size(input.size);
  exactDecompositionKeys(input.plan, [...PLAN_KEYS, 'content'], 'plan-keys');
  if (input.plan.availability === 'available' && !safePlanPath(input.plan.path)) {
    input.plan.availability = 'unavailable';
    input.plan.content = null;
  }
  plan(input.plan, true);
  if (input.plan.availability === 'unavailable') reasons.add('plan-unavailable');
  policy(input.policy);
  if (!same(input.policy, decompositionPolicyIdentity())) reasons.add('policy-unavailable');
  digest(input.scopeDigest, 'scope-digest');
  observations(input.observations);
  readiness(input.epicReadiness, input.kind);
  if (input.epicReadiness.availability === 'unavailable') reasons.add('children-unavailable');
  if (input.availability.status === 'incomplete' && reasons.size === 0)
    decompositionError('availability-reason-required');
  input.availability = {
    status: reasons.size ? 'incomplete' : 'complete',
    reasons: [...reasons].sort(),
  };
  return input;
}
export function decompositionInputDigest(input) {
  return hash(canonicalDecompositionJson(normalizeDecompositionInputs(input)));
}

function effects(value, reconciled = false) {
  boundedArray(value, 'publication-effects');
  if (value.length === 0) decompositionError('publication-effects-empty');
  const ids = new Set();
  for (const item of value) {
    exactDecompositionKeys(
      item,
      ['id', 'resource', 'targetIdentity', 'intendedDigest', 'status', 'observedDigest'],
      'effect-keys'
    );
    if (typeof item.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(item.id) || ids.has(item.id))
      decompositionError('effect-id');
    ids.add(item.id);
    if (!DECOMPOSITION_EFFECT_RESOURCES.includes(item.resource))
      decompositionError('effect-resource');
    text(item.targetIdentity, 'effect-target');
    digest(item.intendedDigest, 'effect-intended');
    digest(item.observedDigest, 'effect-observed', true);
    if (!['pending', 'confirmed', 'failed', 'unknown'].includes(item.status))
      decompositionError('effect-status');
    if (item.status === 'confirmed' && item.observedDigest !== item.intendedDigest)
      decompositionError('effect-confirmation');
    if (item.status === 'pending' && item.observedDigest !== null)
      decompositionError('effect-pending');
    if (
      reconciled &&
      (!['confirmed', 'failed'].includes(item.status) || item.observedDigest === null)
    )
      decompositionError('effect-reconciliation');
  }
}
export function validateDecompositionPublication(value) {
  exactDecompositionKeys(value, PUBLICATION_KEYS, 'publication-keys');
  if (value.schema !== DECOMPOSITION_PUBLICATION_SCHEMA) decompositionError('publication-schema');
  subject(value.subject);
  uuid(value.operationId, 'publication-operation');
  if (!DECOMPOSITION_WRITER_IDS.includes(value.writerId)) decompositionError('publication-writer');
  digest(value.beforeInputDigest, 'publication-before');
  digest(value.intendedInputDigest, 'publication-intended');
  exactDecompositionKeys(value.proposal, ['estimate', 'size'], 'publication-proposal');
  estimate(value.proposal.estimate);
  size(value.proposal.size);
  effects(value.effects);
  if (!['pending', 'complete', 'superseded'].includes(value.status))
    decompositionError('publication-status');
  if (value.status === 'complete' && value.effects.some((effect) => effect.status !== 'confirmed'))
    decompositionError('publication-incomplete-effects');
  if (value.status === 'superseded') effects(value.effects, true);
  if (value.supersedes !== null) {
    exactDecompositionKeys(value.supersedes, ['operationId', 'effects'], 'publication-supersedes');
    uuid(value.supersedes.operationId, 'publication-supersedes-operation');
    if (value.supersedes.operationId === value.operationId)
      decompositionError('publication-supersedes-self');
    effects(value.supersedes.effects, true);
  }
  timestamp(value.createdAt, 'publication-created');
  timestamp(value.updatedAt, 'publication-updated');
  if (Date.parse(value.updatedAt) < Date.parse(value.createdAt))
    decompositionError('publication-time-order');
  return value;
}
function readinessObservation(value) {
  const entries = value.observations.filter((entry) => entry.resource === 'epic-readiness');
  if (
    entries.length !== 1 ||
    entries[0].identity !== `${value.subject.repository}#${value.subject.issue}`
  )
    decompositionError('assessment-readiness-observation');
  const entry = entries[0];
  if (entry.revision === 'unavailable' && entry.digest === null) return null;
  const flags = /^planning:([01]);completion:([01])$/.exec(entry.revision);
  if (!flags || !entry.digest || (flags[2] === '1' && flags[1] !== '1'))
    decompositionError('assessment-readiness-observation');
  return { planning: flags[1] === '1', completion: flags[2] === '1' };
}
function expectedCapabilities(value, publication = null) {
  if (publication?.status === 'pending' || value.status === 'pending')
    return [...BASE, 'publication-reconcile'];
  if (value.status === 'indeterminate')
    return ['inspect', 'checkpoint', 'decomposition-prepare', 'authority-recover'];
  if (value.status === 'must-decompose' || value.estimate.basis === 'unset') return [...BASE];
  if (value.status === 'epic-readiness-required') {
    const flags = readinessObservation(value);
    const result = [...BASE];
    if (flags?.completion) result.push('scoped-deliverable', 'scoped-completion');
    return result;
  }
  return [...BASE, 'scoped-implementation', 'scoped-deliverable', 'scoped-completion'];
}
function expectedStatus(value) {
  if (value.blockers.some((item) => item.code === 'publication-pending')) return 'pending';
  if (value.blockers.some((item) => DECOMPOSITION_UNAVAILABLE_REASONS.includes(item.code)))
    return 'indeterminate';
  if (value.kind === 'epic') return 'epic-readiness-required';
  if (value.signals.some((signal) => signal.level === 'must-split')) return 'must-decompose';
  return value.signals.some((signal) => signal.level === 'review')
    ? 'needs-decomposition-review'
    : 'story-ok';
}
export function validateDecompositionAssessment(value) {
  exactDecompositionKeys(value, ASSESSMENT_KEYS, 'assessment-keys');
  if (value.schema !== DECOMPOSITION_ASSESSMENT_SCHEMA) decompositionError('assessment-schema');
  if (!DECOMPOSITION_STATUSES.includes(value.status) || !DECOMPOSITION_KINDS.includes(value.kind))
    decompositionError('assessment-status-kind');
  subject(value.subject, { incomplete: ['indeterminate', 'pending'].includes(value.status) });
  for (const key of ['inputDigest', 'policyDigest', 'scopeDigest'])
    digest(value[key], `assessment-${key}`);
  estimate(value.estimate);
  size(value.size);
  plan(value.plan);
  observations(value.observations);
  timestamp(value.assessedAt, 'assessment-time');
  boundedArray(value.signals, 'assessment-signals');
  const codes = new Set();
  for (const item of value.signals) {
    exactDecompositionKeys(item, ['code', 'value', 'threshold', 'level'], 'assessment-signal-keys');
    if (
      ![
        'size-xl',
        'estimate-hours',
        'task-count',
        'verification-groups',
        'xl-verification-groups',
      ].includes(item.code) ||
      codes.has(item.code)
    )
      decompositionError('assessment-signals');
    codes.add(item.code);
    if (
      item.code !== 'size-xl' &&
      (!Number.isSafeInteger(item.value) || item.value < 0 || !Number.isSafeInteger(item.threshold))
    )
      decompositionError('assessment-signal-value');
  }
  const signalValue = (code) => value.signals.find((entry) => entry.code === code)?.value ?? 0;
  const verificationGroups = Math.max(
    signalValue('verification-groups'),
    signalValue('xl-verification-groups')
  );
  const expectedSignals = collectDecompositionSignals({
    size: value.size,
    estimateHours: value.kind === 'epic' ? null : value.estimate.hours,
    // Every command-bearing group belongs to a task, including groups whose
    // task-count signal was maliciously removed from the compact record.
    taskCount: Math.max(signalValue('task-count'), verificationGroups),
    verificationGroupCount: verificationGroups,
  });
  if (!same(value.signals, expectedSignals)) decompositionError('assessment-signals');
  boundedArray(value.blockers, 'assessment-blockers');
  const blockers = new Set();
  for (const item of value.blockers) {
    exactDecompositionKeys(item, ['code', 'resource'], 'assessment-blocker-keys');
    if (
      ![
        ...DECOMPOSITION_UNAVAILABLE_REASONS,
        'publication-pending',
        'epic-planning-required',
        'epic-completion-required',
      ].includes(item.code) ||
      blockers.has(item.code)
    )
      decompositionError('assessment-blockers');
    text(item.resource, 'assessment-blocker-resource', 64);
    blockers.add(item.code);
  }
  if (value.kind === 'epic') {
    const flags = readinessObservation(value);
    if (
      blockers.has('epic-planning-required') !== (flags?.planning === false) ||
      blockers.has('epic-completion-required') !== (flags?.completion === false) ||
      (!flags && !blockers.has('children-unavailable'))
    )
      decompositionError('assessment-readiness-blockers');
  } else if (
    value.observations.some((item) => item.resource === 'epic-readiness') ||
    blockers.has('epic-planning-required') ||
    blockers.has('epic-completion-required')
  )
    decompositionError('assessment-readiness-kind');
  if (value.plan.availability === 'unavailable' && !blockers.has('plan-unavailable'))
    decompositionError('assessment-plan-unavailable');
  if (
    (!value.subject.projectId || !value.subject.projectItemId) &&
    !blockers.has('project-unavailable')
  )
    decompositionError('assessment-project-unavailable');
  const publicationObservations = value.observations.filter(
    (entry) => entry.resource === 'publication'
  );
  const currentPublication = publicationObservations[0];
  if (
    publicationObservations.length > 1 ||
    (currentPublication &&
      (!UUID_RE.test(currentPublication.identity) ||
        currentPublication.digest === null ||
        !['pending', 'complete', 'superseded'].includes(currentPublication.revision))) ||
    blockers.has('publication-pending') !== (currentPublication?.revision === 'pending')
  )
    decompositionError('assessment-publication-observation');
  if (value.status !== expectedStatus(value)) decompositionError('assessment-status');
  if (!same(value.capabilities, expectedCapabilities(value)))
    decompositionError('assessment-capabilities');
  return value;
}
export function deriveDecompositionCapabilities(assessment, publication = null) {
  validateDecompositionAssessment(assessment);
  if (publication !== null) {
    validateDecompositionPublication(publication);
    if (!same(assessment.subject, publication.subject)) decompositionError('mixed-subjects');
  }
  return expectedCapabilities(assessment, publication);
}
export function assessDecomposition(snapshot, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options))
    decompositionError('assessment-options');
  exactDecompositionKeys(
    options,
    Object.keys(options).filter((key) => ['publication', 'assessedAt'].includes(key)),
    'assessment-options'
  );
  const { publication = null, assessedAt = new Date().toISOString() } = options;
  const input = normalizeDecompositionInputs(snapshot);
  if (publication !== null) {
    validateDecompositionPublication(publication);
    if (!same(input.subject, publication.subject)) decompositionError('mixed-subjects');
  }
  const classified = classifyDecomposition({
    size: input.size,
    estimateHours: input.kind === 'epic' ? null : input.estimate.hours,
    planText: input.plan.content ?? '',
  });
  const blockers = input.availability.reasons.map((code) => ({
    code,
    resource: code.replace(/-(?:unavailable|invalid|duplicate|conflict|truncated)$/, ''),
  }));
  const observations = [...input.observations];
  function observe(entry) {
    const existing = observations.find(
      (item) => item.resource === entry.resource && item.identity === entry.identity
    );
    if (existing && !same(existing, entry)) decompositionError('observation-conflict');
    if (!existing) observations.push(entry);
  }
  if (input.kind === 'epic') {
    const ready = input.epicReadiness;
    observe({
      resource: 'epic-readiness',
      identity: `${input.subject.repository}#${input.subject.issue}`,
      revision:
        ready.availability === 'observed'
          ? `planning:${Number(ready.planning)};completion:${Number(ready.completion)}`
          : 'unavailable',
      digest: ready.digest,
    });
    if (ready.planning === false)
      blockers.push({ code: 'epic-planning-required', resource: 'epic-readiness' });
    if (ready.completion === false)
      blockers.push({ code: 'epic-completion-required', resource: 'epic-readiness' });
  }
  if (publication?.status === 'pending') {
    blockers.push({ code: 'publication-pending', resource: 'publication' });
    observe({
      resource: 'publication',
      identity: publication.operationId,
      revision: 'pending',
      digest: publication.intendedInputDigest,
    });
  }
  const { content: _content, ...compactPlan } = input.plan;
  const result = {
    schema: DECOMPOSITION_ASSESSMENT_SCHEMA,
    subject: input.subject,
    inputDigest: decompositionInputDigest(input),
    kind: input.kind,
    estimate: input.estimate,
    size: input.size,
    plan: compactPlan,
    policyDigest: input.policy.digest,
    scopeDigest: input.scopeDigest,
    signals: classified.signals,
    status: null,
    capabilities: [],
    blockers,
    observations,
    assessedAt,
  };
  result.status = expectedStatus(result);
  result.capabilities = expectedCapabilities(result);
  return validateDecompositionAssessment(result);
}
