import { createHash, createPublicKey, verify } from 'node:crypto';

import { AprError } from '../errors.mjs';
import {
  canonicalChallengeBytes,
  digestChallenge,
  digestGrantParameters,
} from './canonicalize.mjs';

const PREVENTION_STRENGTHS = new Set([
  'hardware-presence',
  'host-verified',
  'cryptographic-external',
]);
const SIGNER_STRENGTHS = new Set([
  ...PREVENTION_STRENGTHS,
  'cryptographic-local',
  'unverified-test',
]);

function fail(code, message, recovery, details = {}) {
  throw new AprError(code, message, { recovery, details });
}

function protocolOf(review) {
  const protocol = review?.protocol ?? review;
  if (!protocol || typeof protocol !== 'object') {
    fail(
      'APR_GRANT_INVALID',
      'Review authority is required.',
      'Read the current review and retry.'
    );
  }
  return protocol;
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('APR_GRANT_INVALID', `${label} must be an object.`, 'Use the documented grant envelope.');
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(
      'APR_GRANT_INVALID',
      `${label} does not match its closed schema.`,
      'Use the documented grant envelope.',
      { fields: actual }
    );
  }
}

function challengeCore(challenge) {
  return {
    schema: challenge.schema,
    challenge_id: challenge.challenge_id,
    review_id: challenge.review_id,
    intervention_id: challenge.intervention_id,
    protocol_revision: challenge.protocol_revision,
    action: challenge.action,
    parameters_digest: challenge.parameters_digest,
    nonce: challenge.nonce,
    expires_at: challenge.expires_at,
  };
}

export function effectiveAuthorityStrength({ signerStrength, assuranceGrade, policy, commitMode }) {
  if (!SIGNER_STRENGTHS.has(signerStrength)) {
    fail(
      'APR_AUTHORITY_POLICY',
      'Signer assurance strength is unsupported.',
      'Use a verifier adapter with a documented assurance strength.'
    );
  }
  let effective;
  if (assuranceGrade === 'hardened') {
    effective = signerStrength;
  } else if (assuranceGrade === 'mutable-local') {
    effective = signerStrength === 'unverified-test' ? 'unverified-test' : 'cryptographic-local';
  } else if (assuranceGrade === 'test-fixture') {
    effective = signerStrength === 'unverified-test' ? 'unverified-test' : null;
  } else {
    effective = null;
  }
  if (!effective) {
    fail(
      'APR_AUTHORITY_POLICY',
      'Signer and verifier assurance boundaries are incompatible.',
      'Use the verifier configured for this review and its documented signer boundary.'
    );
  }
  if (effective === 'unverified-test') {
    if (commitMode !== 'no-commit') {
      fail(
        'APR_AUTHORITY_POLICY',
        'Test-only authority is forbidden in normal commit mode.',
        'Use no-commit mode for deterministic authority fixtures.'
      );
    }
    return effective;
  }
  if (policy === 'prevention-required' && !PREVENTION_STRENGTHS.has(effective)) {
    fail(
      'APR_AUTHORITY_POLICY',
      'Detection-grade authority does not satisfy prevention-required policy.',
      'Use a hardened verifier boundary or start a new review under an explicitly permitted policy.'
    );
  }
  if (!['prevention-required', 'detection-allowed'].includes(policy)) {
    fail(
      'APR_AUTHORITY_POLICY',
      'Authority policy does not permit protected actions.',
      'Continue ordinary consensus or start a review with Human Authority configured.'
    );
  }
  return effective;
}

function canonicalAuthorization(grant) {
  const authorization = grant.authorization;
  const sourceField = {
    'detached-signature': 'signature',
    'host-approval': 'receipt',
    'test-fixture': 'signature',
  }[authorization?.source];
  if (!sourceField) {
    fail(
      'APR_GRANT_INVALID',
      'Grant authorization source is unsupported.',
      'Use a detached signature or the configured official host approval receipt.'
    );
  }
  exactKeys(
    authorization,
    ['source', 'signer_id', 'signer_fingerprint', 'verifier_fingerprint', sourceField],
    'Grant authorization'
  );
  for (const field of ['signer_id', 'signer_fingerprint', 'verifier_fingerprint']) {
    if (typeof authorization[field] !== 'string' || !authorization[field]) {
      fail('APR_GRANT_INVALID', `Grant ${field} is invalid.`, 'Use the complete signed grant.');
    }
  }
  if (
    sourceField === 'signature' &&
    (typeof authorization.signature !== 'string' ||
      !authorization.signature ||
      !/^[A-Za-z0-9_-]+$/.test(authorization.signature))
  ) {
    fail(
      'APR_GRANT_INVALID',
      'Grant signature is not base64url.',
      'Use a detached base64url signature.'
    );
  }
  if (
    sourceField === 'receipt' &&
    !(
      (typeof authorization.receipt === 'string' && authorization.receipt) ||
      (authorization.receipt &&
        typeof authorization.receipt === 'object' &&
        !Array.isArray(authorization.receipt))
    )
  ) {
    fail(
      'APR_GRANT_INVALID',
      'Host approval receipt is invalid.',
      'Use the complete host receipt.'
    );
  }
  return authorization;
}

function verifyDetached(authorization, challenge, verifier) {
  if (verifier.kind !== 'ed25519' || typeof verifier.public_key !== 'string') {
    fail(
      'APR_AUTHORITY_UNAVAILABLE',
      'The pinned verifier cannot validate detached Ed25519 grants.',
      'Use the authority mechanism pinned at review startup.'
    );
  }
  if (authorization.signer_fingerprint !== verifier.verifier_fingerprint) {
    fail(
      'APR_GRANT_MISMATCH',
      'Grant signer does not match pinned review authority.',
      'Sign with the key pinned at review startup.'
    );
  }
  if (authorization.signer_id !== verifier.verifier_id) {
    fail(
      'APR_GRANT_MISMATCH',
      'Grant signer identity does not match pinned review authority.',
      'Sign with the identity pinned at review startup.'
    );
  }
  let publicKey;
  try {
    publicKey = createPublicKey(verifier.public_key);
  } catch {
    fail(
      'APR_AUTHORITY_UNAVAILABLE',
      'The pinned Ed25519 public key is invalid.',
      'Repair the startup authority through the documented recovery flow.'
    );
  }
  const publicKeyFingerprint = `sha256:${createHash('sha256')
    .update(publicKey.export({ type: 'spki', format: 'der' }))
    .digest('hex')}`;
  if (publicKeyFingerprint !== verifier.verifier_fingerprint) {
    fail(
      'APR_GRANT_MISMATCH',
      'Pinned public key bytes do not match the verifier fingerprint.',
      'Use the exact public verifier pinned at review startup.'
    );
  }
  let valid = false;
  try {
    valid = verify(
      null,
      canonicalChallengeBytes(challenge),
      publicKey,
      Buffer.from(authorization.signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) {
    fail(
      'APR_GRANT_SIGNATURE',
      'Detached grant signature is invalid.',
      'Sign the exact challenge bytes.'
    );
  }
  return {
    signer_id: authorization.signer_id,
    signer_fingerprint: authorization.signer_fingerprint,
  };
}

function verifyHostReceipt(authorization, challenge, verifier, hostVerifier) {
  if (verifier.kind !== 'host' || typeof hostVerifier !== 'function') {
    fail(
      'APR_AUTHORITY_UNAVAILABLE',
      'The pinned official host verifier is unavailable.',
      'Run this command through the host that was pinned at review startup.'
    );
  }
  let result;
  try {
    result = hostVerifier({
      receipt: authorization.receipt,
      challenge: canonicalChallengeBytes(challenge),
      verifier,
    });
  } catch {
    result = null;
  }
  if (
    !result ||
    result.valid !== true ||
    result.signer_id !== authorization.signer_id ||
    result.signer_fingerprint !== authorization.signer_fingerprint ||
    !SIGNER_STRENGTHS.has(result.strength) ||
    result.strength === 'unverified-test' ||
    result.strength !== verifier.signer_strength
  ) {
    fail(
      'APR_GRANT_SIGNATURE',
      'Official host approval receipt is invalid.',
      'Approve the exact challenge through the configured host and retry.'
    );
  }
  return result;
}

function selectedChallenge(protocol, challenge) {
  const candidate = (protocol.challenges ?? []).find(
    (item) => item.challenge_id === challenge.challenge_id
  );
  if (!candidate) {
    fail(
      'APR_GRANT_MISMATCH',
      'Grant challenge is not present in event authority.',
      'Request a challenge from the current review and retry.'
    );
  }
  let exact = false;
  try {
    exact = canonicalChallengeBytes(challengeCore(candidate)).equals(
      canonicalChallengeBytes(challenge)
    );
  } catch {
    exact = false;
  }
  if (!exact) {
    fail(
      'APR_GRANT_MISMATCH',
      'Grant challenge differs from event authority.',
      'Sign the exact canonical challenge emitted by request-grant.'
    );
  }
  if (candidate.consumed_at) {
    fail('APR_GRANT_REPLAYED', 'Grant challenge was already consumed.', 'Request a new challenge.');
  }
  if (candidate.superseded_at) {
    fail('APR_GRANT_REPLAYED', 'Grant challenge was superseded.', 'Request a new challenge.');
  }
  return candidate;
}

export function verifyAndConsumeGrant(review, grant, expected = {}) {
  const protocol = protocolOf(review);
  exactKeys(grant, ['schema', 'challenge', 'parameters', 'authorization'], 'Grant');
  if (grant.schema !== 'ai-peer-review.grant/v1') {
    fail('APR_GRANT_INVALID', 'Grant schema is invalid.', 'Use ai-peer-review.grant/v1.');
  }
  const challenge = grant.challenge;
  try {
    canonicalChallengeBytes(challenge);
  } catch (cause) {
    fail(
      'APR_GRANT_INVALID',
      'Grant challenge is not canonical.',
      'Sign the exact canonical challenge emitted by request-grant.',
      { cause: cause.code ?? cause.message }
    );
  }
  const candidate = selectedChallenge(protocol, challenge);
  const now =
    expected.now instanceof Date ? new Date(expected.now.valueOf()) : new Date(expected.now);
  if (Number.isNaN(now.valueOf())) {
    fail(
      'APR_GRANT_INVALID',
      'Grant verification time is invalid.',
      'Provide a valid clock instant.'
    );
  }
  if (now.valueOf() >= Date.parse(challenge.expires_at)) {
    fail('APR_GRANT_EXPIRED', 'Grant challenge has expired.', 'Request and sign a new challenge.');
  }
  const action = expected.action;
  let parametersDigest;
  try {
    parametersDigest = digestGrantParameters(action, expected.parameters);
  } catch (cause) {
    fail(
      'APR_GRANT_MISMATCH',
      'Expected protected parameters are invalid.',
      'Use the exact parameters emitted with the challenge.',
      { cause: cause.code ?? cause.message }
    );
  }
  let grantDigest;
  try {
    grantDigest = digestGrantParameters(action, grant.parameters);
  } catch (cause) {
    fail(
      'APR_GRANT_MISMATCH',
      'Grant parameters are invalid.',
      'Use the exact parameters emitted with the challenge.',
      { cause: cause.code ?? cause.message }
    );
  }
  if (
    challenge.review_id !== protocol.review_id ||
    challenge.protocol_revision !== protocol.revision ||
    challenge.intervention_id !== protocol.intervention?.intervention_id ||
    challenge.action !== action ||
    challenge.parameters_digest !== parametersDigest ||
    grantDigest !== parametersDigest
  ) {
    fail(
      'APR_GRANT_MISMATCH',
      'Grant does not bind the current review authority and parameters.',
      'Request and sign a challenge for the exact current action.'
    );
  }
  const configuration = protocol.authority;
  const verifier = configuration?.verifier;
  if (!verifier) {
    fail(
      'APR_AUTHORITY_UNAVAILABLE',
      'Pinned review authority is unavailable.',
      'Start a review with a public verifier or official host authority.'
    );
  }
  const authorization = canonicalAuthorization(grant);
  if (authorization.verifier_fingerprint !== verifier.verifier_fingerprint) {
    fail(
      'APR_GRANT_MISMATCH',
      'Grant verifier does not match pinned review authority.',
      'Use the verifier pinned at review startup.'
    );
  }
  const verification =
    authorization.source === 'detached-signature' || authorization.source === 'test-fixture'
      ? verifyDetached(authorization, challenge, verifier)
      : verifyHostReceipt(authorization, challenge, verifier, expected.hostVerifier);
  const strength = effectiveAuthorityStrength({
    signerStrength: verifier.signer_strength,
    assuranceGrade: verifier.assurance_grade,
    policy: configuration.authority_policy,
    commitMode: protocol.commit_mode,
  });
  void candidate;
  return Object.freeze({
    source: authorization.source,
    strength,
    signer_id: verification.signer_id,
    signer_fingerprint: verification.signer_fingerprint,
    challenge_digest: digestChallenge(challenge),
    verified_at: now.toISOString(),
  });
}
