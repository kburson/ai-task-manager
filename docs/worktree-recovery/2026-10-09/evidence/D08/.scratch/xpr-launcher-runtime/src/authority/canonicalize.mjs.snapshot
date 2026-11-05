import { createHash } from 'node:crypto';
import path from 'node:path';

import { AprError } from '../errors.mjs';

const PARAMETER_PREFIX = 'ai-peer-review.grant-parameters/v1\n';
const CHALLENGE_PREFIX = 'ai-peer-review.grant-challenge/v1\n';
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const GIT_OBJECT_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const frozen = (values) => Object.freeze([...values]);

export const GRANT_PARAMETER_FIELDS = Object.freeze(
  Object.assign(Object.create(null), {
    'pin-verifier': frozen([
      'verifier_fingerprint',
      'assurance_grade',
      'authority_policy',
      'artifact_path',
      'artifact_kind',
      'reviews_root',
      'path_template',
      'issue_id',
      'maximum_turns',
      'commit_mode',
    ]),
    continue: frozen([
      'additional_turns',
      'resulting_effective_maximum',
      'resume_role',
      'focus_path',
      'focus_digest',
    ]),
    supplement: frozen(['content_digest', 'target_role', 'target_turn']),
    'accept-over-objections': frozen([
      'artifact_path',
      'artifact_blob',
      'artifact_digest',
      'final_round',
      'reviewer_response_path',
      'reviewer_response_digest',
      'unresolved_finding_ids',
      'human_rationale_digest',
    ]),
    'replace-participant': frozen([
      'role',
      'outgoing_claim_id',
      'outgoing_session_fingerprint',
      'incoming_session_fingerprint',
    ]),
  })
);

function invalid(message, details = {}) {
  return new AprError('APR_GRANT_PARAMETERS_INVALID', message, {
    recovery: 'Use the exact documented fields and canonical values for the protected action.',
    details,
  });
}

function canonicalString(value, field) {
  if (
    typeof value !== 'string' ||
    !value ||
    !value.isWellFormed() ||
    value !== value.normalize('NFC')
  ) {
    throw invalid(`${field} must be a non-empty NFC string.`, { field });
  }
  return value;
}

function enumValue(value, allowed, field) {
  canonicalString(value, field);
  if (!allowed.includes(value))
    throw invalid(`${field} is outside its closed vocabulary.`, { field });
  return value;
}

function positiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw invalid(`${field} must be a safe positive integer.`, { field });
  }
  return value;
}

function digest(value, field) {
  if (typeof value !== 'string' || !DIGEST_RE.test(value)) {
    throw invalid(`${field} must be a lowercase SHA-256 digest.`, { field });
  }
  return value;
}

function identifier(value, field) {
  if (typeof value !== 'string' || !ID_RE.test(value)) {
    throw invalid(`${field} must be a canonical identifier.`, { field });
  }
  return value;
}

function repositoryPath(value, field) {
  canonicalString(value, field);
  if (
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('//') ||
    path.posix.normalize(value) !== value ||
    value.split('/').some((part) => part === '.' || part === '..' || !part)
  ) {
    throw invalid(`${field} must be a canonical repository-relative POSIX path.`, { field });
  }
  return value;
}

function exactInput(action, input) {
  if (!Object.hasOwn(GRANT_PARAMETER_FIELDS, action)) {
    throw invalid('Protected action or parameter object is invalid.', { action });
  }
  const fields = GRANT_PARAMETER_FIELDS[action];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw invalid('Protected action or parameter object is invalid.', { action });
  }
  const keys = Object.keys(input).sort();
  const expected = [...fields].sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index]) ||
    Object.getOwnPropertySymbols(input).length
  ) {
    throw invalid('Protected action parameters do not match the closed field catalog.', {
      action,
      fields: keys,
    });
  }
  return input;
}

function validatePinVerifier(input) {
  digest(input.verifier_fingerprint, 'verifier_fingerprint');
  enumValue(
    input.assurance_grade,
    ['hardened', 'mutable-local', 'test-fixture'],
    'assurance_grade'
  );
  enumValue(
    input.authority_policy,
    ['prevention-required', 'detection-allowed'],
    'authority_policy'
  );
  repositoryPath(input.artifact_path, 'artifact_path');
  enumValue(input.artifact_kind, ['spec', 'plan'], 'artifact_kind');
  repositoryPath(input.reviews_root, 'reviews_root');
  repositoryPath(input.path_template, 'path_template');
  if (input.issue_id !== null) positiveInteger(input.issue_id, 'issue_id');
  positiveInteger(input.maximum_turns, 'maximum_turns');
  enumValue(input.commit_mode, ['normal', 'no-commit'], 'commit_mode');
}

function validateContinue(input) {
  positiveInteger(input.additional_turns, 'additional_turns');
  positiveInteger(input.resulting_effective_maximum, 'resulting_effective_maximum');
  enumValue(input.resume_role, ['author', 'reviewer'], 'resume_role');
  const bothNull = input.focus_path === null && input.focus_digest === null;
  const bothPresent =
    typeof input.focus_path === 'string' && typeof input.focus_digest === 'string';
  if (!bothNull && !bothPresent) {
    throw invalid('focus_path and focus_digest must both be explicit null or both be present.');
  }
  if (bothPresent) {
    repositoryPath(input.focus_path, 'focus_path');
    digest(input.focus_digest, 'focus_digest');
  }
}

function validateSupplement(input) {
  digest(input.content_digest, 'content_digest');
  enumValue(input.target_role, ['author', 'reviewer'], 'target_role');
  positiveInteger(input.target_turn, 'target_turn');
}

function validateOverride(input) {
  repositoryPath(input.artifact_path, 'artifact_path');
  if (typeof input.artifact_blob !== 'string' || !GIT_OBJECT_RE.test(input.artifact_blob)) {
    throw invalid('artifact_blob must be a Git object ID.', { field: 'artifact_blob' });
  }
  digest(input.artifact_digest, 'artifact_digest');
  positiveInteger(input.final_round, 'final_round');
  repositoryPath(input.reviewer_response_path, 'reviewer_response_path');
  digest(input.reviewer_response_digest, 'reviewer_response_digest');
  if (
    !Array.isArray(input.unresolved_finding_ids) ||
    input.unresolved_finding_ids.length === 0 ||
    new Set(input.unresolved_finding_ids).size !== input.unresolved_finding_ids.length
  ) {
    throw invalid('unresolved_finding_ids must be an ordered non-empty unique array.');
  }
  input.unresolved_finding_ids.forEach((value) => identifier(value, 'unresolved_finding_ids'));
  digest(input.human_rationale_digest, 'human_rationale_digest');
}

function validateReplacement(input) {
  enumValue(input.role, ['author', 'reviewer'], 'role');
  identifier(input.outgoing_claim_id, 'outgoing_claim_id');
  digest(input.outgoing_session_fingerprint, 'outgoing_session_fingerprint');
  digest(input.incoming_session_fingerprint, 'incoming_session_fingerprint');
  if (input.outgoing_session_fingerprint === input.incoming_session_fingerprint) {
    throw invalid('Participant replacement requires a different incoming fingerprint.');
  }
}

const VALIDATORS = Object.freeze(
  Object.assign(Object.create(null), {
    'pin-verifier': validatePinVerifier,
    continue: validateContinue,
    supplement: validateSupplement,
    'accept-over-objections': validateOverride,
    'replace-participant': validateReplacement,
  })
);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}

export function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function canonicalGrantParameters(action, input) {
  const value = exactInput(action, input);
  VALIDATORS[action](value);
  return Buffer.from(`${PARAMETER_PREFIX}${JSON.stringify(canonical(value))}`, 'utf8');
}

export function digestGrantParameters(action, input) {
  return sha256(canonicalGrantParameters(action, input));
}

const CHALLENGE_FIELDS = frozen([
  'schema',
  'challenge_id',
  'review_id',
  'intervention_id',
  'protocol_revision',
  'action',
  'parameters_digest',
  'nonce',
  'expires_at',
]);

export function canonicalChallengeBytes(challenge) {
  if (!challenge || typeof challenge !== 'object' || Array.isArray(challenge)) {
    throw invalid('Challenge must be an object.');
  }
  const keys = Object.keys(challenge).sort();
  const expected = [...CHALLENGE_FIELDS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw invalid('Challenge does not match its closed schema.');
  }
  if (challenge.schema !== 'ai-peer-review.grant-challenge/v1')
    throw invalid('Challenge schema is invalid.');
  identifier(challenge.challenge_id, 'challenge_id');
  identifier(challenge.review_id, 'review_id');
  if (challenge.intervention_id !== null) identifier(challenge.intervention_id, 'intervention_id');
  if (!Number.isSafeInteger(challenge.protocol_revision) || challenge.protocol_revision < 0) {
    throw invalid('protocol_revision must be a safe non-negative integer.');
  }
  if (!Object.hasOwn(GRANT_PARAMETER_FIELDS, challenge.action)) {
    throw invalid('Challenge action is invalid.');
  }
  digest(challenge.parameters_digest, 'parameters_digest');
  if (typeof challenge.nonce !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(challenge.nonce)) {
    throw invalid('Challenge nonce is invalid.');
  }
  const parsed = new Date(challenge.expires_at);
  if (
    typeof challenge.expires_at !== 'string' ||
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString() !== challenge.expires_at
  ) {
    throw invalid('Challenge expiry is invalid.');
  }
  return Buffer.from(`${CHALLENGE_PREFIX}${JSON.stringify(canonical(challenge))}`, 'utf8');
}

export function digestChallenge(challenge) {
  return sha256(canonicalChallengeBytes(challenge));
}
