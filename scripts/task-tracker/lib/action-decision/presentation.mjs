// @story #1662
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { actionDescriptorFor } from '../lifecycle-policy/actions.mjs';
import {
  BOUNDARY_PRODUCER_IDS,
  REGISTERED_GUARD_IDS,
  validateActionDecision,
  validateBlocker,
  validateHumanDecision,
  validateWarning,
} from './contract.mjs';

export const EXPLANATION_SCHEMA = 'aitm.action-explanation/v1';

// This is a closed wire contract. Any field or semantic change, including an
// additive one, requires a new outer major plus renewed adapter, alias, shared-
// contract, and context-measurement certification. Flags select only the two
// modes declared here; the internal decision version changes independently.

const PRESENTATION_KEYS = Object.freeze([
  'issue',
  'actionId',
  'status',
  'blockers',
  'normalizations',
  'warnings',
  'humanDecision',
]);
const STATUSES = Object.freeze(['ready', 'blocked', 'indeterminate']);
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const PROHIBITIONS = new Set([
  'bypass_guard',
  'execute_free_text',
  'reuse_stale_decision',
  'invoke_internal_mutator',
]);

function fail(path, detail = 'invalid') {
  throw new TypeError(`action-presentation:${path}:${detail}`);
}

function parse(value, path) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    fail(path, 'json');
  }
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
  if (typeof value !== 'string' || value === '' || value.trim() !== value) fail(path, 'string');
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

function validateProjectedNormalization(value, index) {
  const path = `normalizations[${index}]`;
  exact(value, ['normalizerId', 'decisions', 'disposition'], path);
  if (value.normalizerId !== 'functional-dod-derived/v1') {
    fail(`${path}.normalizerId`, 'enum');
  }
  if (value.disposition !== 'persist-on-execute') fail(`${path}.disposition`, 'enum');
  if (!Array.isArray(value.decisions) || value.decisions.length === 0) {
    fail(`${path}.decisions`, 'nonempty-array');
  }
  const order = ['acs', 'checkboxes'];
  let prior = -1;
  value.decisions.forEach((entry, decisionIndex) => {
    const decisionPath = `${path}.decisions[${decisionIndex}]`;
    exact(entry, ['key', 'derivationRule', 'stamp', 'tick'], decisionPath);
    const position = order.indexOf(entry.key);
    if (position < 0 || position <= prior) fail(`${path}.decisions`, 'order');
    prior = position;
    if (entry.derivationRule !== `derive-${entry.key}/v1`) {
      fail(`${decisionPath}.derivationRule`, 'enum');
    }
    if (typeof entry.stamp !== 'boolean' || typeof entry.tick !== 'boolean') {
      fail(decisionPath, 'booleans');
    }
  });
}

function validateWarningOrder(warnings) {
  let evaluatorWarningSeen = false;
  for (const warning of warnings) {
    if (warning.code === 'legacy-guard-warning') evaluatorWarningSeen = true;
    if (warning.code === 'guidance-source-diverged' && evaluatorWarningSeen) {
      fail('warnings', 'order');
    }
  }
}

export function validateActionPresentation(input) {
  const value = parse(input, 'root');
  exact(value, PRESENTATION_KEYS, 'root');
  if (!Number.isInteger(value.issue) || value.issue <= 0) fail('issue', 'positive-integer');
  const descriptor = value.actionId === null ? null : actionDescriptorFor(value.actionId);
  if (value.actionId !== null && descriptor === null) fail('actionId', 'unknown');
  if (!STATUSES.includes(value.status)) fail('status', 'enum');

  if (!Array.isArray(value.blockers)) fail('blockers', 'array');
  if (value.status === 'ready' && value.blockers.length !== 0) fail('blockers', 'ready-empty');
  if (value.status !== 'ready' && value.blockers.length === 0) {
    fail('blockers', 'nonempty');
  }
  value.blockers.forEach((blocker, index) =>
    validateBlocker(blocker, { status: value.status, path: `blockers[${index}]` })
  );
  validateAuthoritySubjects(value.blockers);

  const unresolvedNavigation = value.blockers.some(({ code }) => code === 'state-unavailable');
  const unknownVocabulary = value.blockers.some(({ code }) => code === 'unknown-vocabulary');
  if (unresolvedNavigation && value.actionId !== null) fail('actionId', 'navigation');
  if (
    value.actionId === null &&
    value.status !== 'ready' &&
    !unresolvedNavigation &&
    !unknownVocabulary
  ) {
    fail('actionId', 'null');
  }

  if (!Array.isArray(value.normalizations)) fail('normalizations', 'array');
  value.normalizations.forEach(validateProjectedNormalization);
  if (!Array.isArray(value.warnings)) fail('warnings', 'array');
  value.warnings.forEach((warning, index) =>
    validateWarning(warning, { status: value.status, path: `warnings[${index}]` })
  );
  validateWarningOrder(value.warnings);
  if (value.status === 'ready' && value.humanDecision !== null) {
    fail('humanDecision', 'ready-null');
  }
  validateHumanDecision(value.humanDecision, value);
  return value;
}

function validateAdmissionWarnings(admissionWarnings, { suppressSourceWarning }) {
  if (!Array.isArray(admissionWarnings)) fail('admissionWarnings', 'array');
  if (typeof suppressSourceWarning !== 'boolean') fail('suppressSourceWarning', 'boolean');
  return admissionWarnings.flatMap((warning, index) => {
    validateWarning(warning, {
      status: 'indeterminate',
      path: `admissionWarnings[${index}]`,
      producerId: 'guidance-admission',
    });
    if (suppressSourceWarning && warning.code === 'guidance-source-diverged') return [];
    return [structuredClone(warning)];
  });
}

function fallbackIdentity(decision) {
  if (!Number.isInteger(decision?.issue) || decision.issue <= 0) {
    fail('fallback.issue', 'positive-integer');
  }
  if (typeof decision.actionId !== 'string' || actionDescriptorFor(decision.actionId) === null) {
    fail('fallback.actionId', 'registered');
  }
  return { issue: decision.issue, actionId: decision.actionId };
}

function invalidDecisionPresentation(decision, admissionWarnings) {
  const identity = fallbackIdentity(decision);
  return {
    ...identity,
    status: 'indeterminate',
    blockers: [
      {
        guardId: 'action-result-validation',
        code: 'guard-result-invalid',
        args: {},
        noAutomaticRemediation: { reason: 'result-investigation-required' },
      },
    ],
    normalizations: [],
    warnings: admissionWarnings,
    humanDecision: null,
  };
}

export function presentActionDecision({
  decision,
  admissionWarnings = [],
  suppressSourceWarning = false,
} = {}) {
  const presentedAdmissionWarnings = validateAdmissionWarnings(admissionWarnings, {
    suppressSourceWarning,
  });
  let validated;
  try {
    validated = validateActionDecision(decision);
  } catch {
    return validateActionPresentation(
      invalidDecisionPresentation(decision, presentedAdmissionWarnings)
    );
  }

  const result = {
    issue: validated.issue,
    actionId: validated.blockers.some(({ code }) => code === 'unknown-vocabulary')
      ? null
      : validated.actionId,
    status: validated.status,
    blockers: structuredClone(validated.blockers),
    normalizations: validated.normalizations.map(({ normalizerId, decisions, disposition }) => ({
      normalizerId,
      decisions: structuredClone(decisions),
      disposition,
    })),
    warnings: [...presentedAdmissionWarnings, ...structuredClone(validated.warnings)],
    humanDecision: structuredClone(validated.humanDecision),
  };
  return validateActionPresentation(result);
}

function validateGuidance(guidance) {
  if (!Array.isArray(guidance) || guidance.length !== 1) fail('guidance', 'single-entry-array');
  const entry = guidance[0];
  if (entry?.status === 'expanded') {
    exact(entry, ['id', 'digest', 'status', 'agent'], 'guidance[0]');
    exact(entry.agent, ['instruction'], 'guidance[0].agent');
    if (!Array.isArray(entry.agent.instruction) || entry.agent.instruction.length === 0) {
      fail('guidance[0].agent.instruction', 'nonempty-array');
    }
    entry.agent.instruction.forEach((operation, index) => {
      const path = `guidance[0].agent.instruction[${index}]`;
      record(operation, path);
      const keys = Object.keys(operation);
      if (keys.length !== 1) fail(path, 'operation');
      const [name] = keys;
      const value = operation[name];
      if (name === 'query' || name === 'execute') {
        if (actionDescriptorFor(value) === null) fail(path, 'action');
      } else if (name === 'never') {
        if (!PROHIBITIONS.has(value)) fail(path, 'prohibition');
      } else if (!(
        (name === 'require_status' && value === 'ready') ||
        (name === 'if_blocked' && value === 'use_returned_remediation_ids') ||
        (name === 'execution_revalidates' && value === true) ||
        (name === 'terminal_state' && value === 'done') ||
        (name === 'navigation' && value === 'unresolved') ||
        (name === 'recommendation' && value === null)
      )) {
        fail(path, 'operation');
      }
    });
  } else if (entry?.status === 'not-modified') {
    exact(entry, ['id', 'digest', 'status'], 'guidance[0]');
  } else {
    fail('guidance[0].status', 'enum');
  }
  nonemptyString(entry.id, 'guidance[0].id');
  if (!DIGEST.test(entry.digest)) fail('guidance[0].digest', 'digest');
}

function validateDiagnosticMessages(messages) {
  if (!Array.isArray(messages)) fail('diagnosticMessages', 'array');
  const allowedProducers = new Set([...BOUNDARY_PRODUCER_IDS, ...REGISTERED_GUARD_IDS]);
  messages.forEach((message, index) => {
    const path = `diagnosticMessages[${index}]`;
    exact(message, ['guardId', 'text', 'untrusted'], path);
    nonemptyString(message.guardId, `${path}.guardId`);
    if (!allowedProducers.has(message.guardId)) fail(`${path}.guardId`, 'producer');
    nonemptyString(message.text, `${path}.text`);
    if (message.untrusted !== true) fail(`${path}.untrusted`, 'true');
  });
}

function admissionWarningsFromDiagnostic(result, fullDecision) {
  if (result.warnings.length < fullDecision.warnings.length) {
    fail('result.warnings', 'diagnostic-equivalence');
  }
  const count = result.warnings.length - fullDecision.warnings.length;
  const admissionWarnings = result.warnings.slice(0, count);
  if (
    canonicalRecordJson(result.warnings.slice(count)) !== canonicalRecordJson(fullDecision.warnings)
  ) {
    fail('result.warnings', 'diagnostic-equivalence');
  }
  return admissionWarnings;
}

export function validateExplanationEnvelope(input, { diagnostic = false } = {}) {
  if (typeof diagnostic !== 'boolean') fail('diagnostic', 'boolean');
  const envelope = parse(input, 'envelope');
  exact(
    envelope,
    diagnostic
      ? ['schema', 'result', 'guidance', 'fullDecision', 'diagnosticMessages']
      : ['schema', 'result', 'guidance'],
    'envelope'
  );
  if (envelope.schema !== EXPLANATION_SCHEMA) fail('schema', 'unsupported');
  const result = validateActionPresentation(envelope.result);
  validateGuidance(envelope.guidance);

  if (diagnostic) {
    const fullDecision = validateActionDecision(envelope.fullDecision);
    if (envelope.guidance[0].id !== fullDecision.guidanceIds[0]) {
      fail('guidance[0].id', 'diagnostic-coupling');
    }
    validateDiagnosticMessages(envelope.diagnosticMessages);
    const admissionWarnings = admissionWarningsFromDiagnostic(result, fullDecision);
    const expected = presentActionDecision({ decision: fullDecision, admissionWarnings });
    if (canonicalRecordJson(expected) !== canonicalRecordJson(result)) {
      fail('result', 'diagnostic-equivalence');
    }
  }
  return envelope;
}
