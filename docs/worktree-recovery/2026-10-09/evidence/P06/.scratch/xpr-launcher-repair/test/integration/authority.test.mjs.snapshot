import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalChallengeBytes,
  digestChallenge,
  digestGrantParameters,
} from '../../src/authority/canonicalize.mjs';
import {
  challengeRequestedEvent,
  challengeSupersededEvent,
  requestChallenge,
} from '../../src/authority/challenge.mjs';
import { effectiveAuthorityStrength, verifyAndConsumeGrant } from '../../src/authority/verify.mjs';
import { run } from '../../src/cli/run.mjs';
import { fingerprintSession } from '../../src/identity/registry.mjs';
import { reduceEvents } from '../../src/protocol/reducer.mjs';
import { readReview } from '../../src/protocol/service.mjs';
import {
  FINGERPRINTS,
  claim,
  createReviewWorkspace,
  event,
  interventionEvents,
  participant,
  reviewerTurnEvents,
} from '../helpers/review-fixture.mjs';

const now = new Date('2026-09-08T12:00:00.000Z');
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
const verifierFingerprint = `sha256:${createHash('sha256')
  .update(publicKey.export({ type: 'spki', format: 'der' }))
  .digest('hex')}`;

const continueParameters = Object.freeze({
  additional_turns: 2,
  resulting_effective_maximum: 4,
  resume_role: 'reviewer',
  focus_path: null,
  focus_digest: null,
});

function authority({
  policy = 'detection-allowed',
  assuranceGrade = 'mutable-local',
  commitMode = 'normal',
  verifierKind = 'ed25519',
  signerStrength = verifierKind === 'host'
    ? 'host-verified'
    : assuranceGrade === 'test-fixture'
      ? 'unverified-test'
      : 'cryptographic-local',
} = {}) {
  return {
    commitMode,
    value: {
      authority_policy: policy,
      challenge_ttl_ms: 15 * 60 * 1000,
      verifier: {
        kind: verifierKind,
        verifier_id: 'human:kendrick-test',
        verifier_fingerprint: verifierFingerprint,
        public_key: verifierKind === 'ed25519' ? publicKeyPem : null,
        assurance_grade: assuranceGrade,
        signer_strength: signerStrength,
      },
    },
  };
}

function withAuthority(events, options = {}) {
  const configured = authority(options);
  return events.map((item, index) =>
    index === 0
      ? {
          ...item,
          payload: {
            ...item.payload,
            commit_mode: configured.commitMode,
            authority: configured.value,
            startup: {
              ...item.payload.startup,
              no_commit_baseline:
                configured.commitMode === 'no-commit'
                  ? {
                      head: '1'.repeat(40),
                      index_digest: `sha256:${'2'.repeat(64)}`,
                      worktree_digest: `sha256:${'3'.repeat(64)}`,
                      changed_paths: [],
                    }
                  : null,
            },
          },
        }
      : item
  );
}

function stateWithChallenge(options = {}) {
  const baseEvents = withAuthority(interventionEvents('turn-budget-exhausted'), options);
  const base = reduceEvents(baseEvents);
  const challenge = requestChallenge(base, 'continue', continueParameters, now);
  const requested = challengeRequestedEvent(base, challenge, FINGERPRINTS.reviewer, now);
  const events = [...baseEvents, requested];
  return { base, challenge, events, state: reduceEvents(events) };
}

function detachedGrant(challenge, parameters = continueParameters) {
  return {
    schema: 'ai-peer-review.grant/v1',
    challenge,
    parameters,
    authorization: {
      source: 'detached-signature',
      signer_id: 'human:kendrick-test',
      signer_fingerprint: verifierFingerprint,
      verifier_fingerprint: verifierFingerprint,
      signature: sign(null, canonicalChallengeBytes(challenge), privateKey).toString('base64url'),
    },
  };
}

function hostGrant(challenge, parameters = continueParameters) {
  return {
    schema: 'ai-peer-review.grant/v1',
    challenge,
    parameters,
    authorization: {
      source: 'host-approval',
      signer_id: 'human:kendrick-host',
      signer_fingerprint: `sha256:${'7'.repeat(64)}`,
      verifier_fingerprint: verifierFingerprint,
      receipt: 'opaque-host-receipt',
    },
  };
}

function fixtureGrant(challenge, parameters = continueParameters) {
  const grant = detachedGrant(challenge, parameters);
  return {
    ...grant,
    authorization: { ...grant.authorization, source: 'test-fixture' },
  };
}

function verify(state, grant, overrides = {}) {
  return verifyAndConsumeGrant(state, grant, {
    action: 'continue',
    parameters: continueParameters,
    now,
    signerStrength: 'cryptographic-local',
    ...overrides,
  });
}

test('challenge and human-decision schemas expose closed v1 authority records', () => {
  const challenge = JSON.parse(
    readFileSync(new URL('../../schemas/grant-challenge-v1.json', import.meta.url))
  );
  const decision = JSON.parse(
    readFileSync(new URL('../../schemas/human-decision-v1.json', import.meta.url))
  );
  assert.equal(challenge.$id, 'ai-peer-review.grant-challenge/v1');
  assert.equal(challenge.additionalProperties, false);
  assert.deepEqual(challenge.required, [
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
  assert.equal(decision.$id, 'ai-peer-review.human-decision/v1');
  assert.equal(decision.additionalProperties, false);
  assert.equal(decision.properties.human_attestation.additionalProperties, false);
});

test('pin-verifier challenge is available before review creation without an intervention', () => {
  const configured = authority({
    policy: 'prevention-required',
    assuranceGrade: 'hardened',
    signerStrength: 'cryptographic-external',
  });
  const parameters = {
    verifier_fingerprint: verifierFingerprint,
    assurance_grade: 'hardened',
    authority_policy: 'prevention-required',
    artifact_path: 'docs/spec.md',
    artifact_kind: 'spec',
    reviews_root: 'docs/reviews',
    path_template: 'docs/reviews/{artifact}-{review_id}',
    issue_id: null,
    maximum_turns: 4,
    commit_mode: 'normal',
  };
  const challenge = requestChallenge(
    {
      review_id: 'bootstrap-review',
      revision: 0,
      state: null,
      authority: configured.value,
      challenges: [],
      intervention: null,
    },
    'pin-verifier',
    parameters,
    now
  );
  assert.equal(challenge.action, 'pin-verifier');
  assert.equal(challenge.intervention_id, null);
  assert.equal(challenge.protocol_revision, 0);
  assert.equal(challenge.parameters_digest, digestGrantParameters('pin-verifier', parameters));
});

test('challenge binds exact intervention authority and reuses only an identical live request', () => {
  const { base, challenge, events, state } = stateWithChallenge();
  assert.equal(challenge.review_id, base.protocol.review_id);
  assert.equal(challenge.intervention_id, base.protocol.intervention.intervention_id);
  assert.equal(challenge.protocol_revision, base.protocol.revision);
  assert.equal(challenge.action, 'continue');
  assert.equal(challenge.parameters_digest, digestGrantParameters('continue', continueParameters));
  assert.match(challenge.nonce, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(challenge.expires_at, '2026-09-08T12:15:00.000Z');
  assert.equal(state.protocol.revision, base.protocol.revision);
  assert.equal(state.protocol.challenges[0].requested_by, FINGERPRINTS.reviewer);
  assert.deepEqual(requestChallenge(state, 'continue', continueParameters, now), challenge);
  assert.throws(
    () => requestChallenge(state, 'continue', { ...continueParameters, additional_turns: 3 }, now),
    (error) => error.code === 'APR_CHALLENGE_ACTIVE'
  );
  assert.equal(events.at(-1).revision, base.protocol.revision);
});

test('detached verification returns complete detection-grade attestation', () => {
  const { state, challenge } = stateWithChallenge();
  const attestation = verify(state, detachedGrant(challenge));
  assert.deepEqual(attestation, {
    source: 'detached-signature',
    strength: 'cryptographic-local',
    signer_id: 'human:kendrick-test',
    signer_fingerprint: verifierFingerprint,
    challenge_digest: `sha256:${createHash('sha256')
      .update(canonicalChallengeBytes(challenge))
      .digest('hex')}`,
    verified_at: now.toISOString(),
  });
});

test('detached authority cannot elevate signer strength or substitute signer identity', () => {
  const { state, challenge } = stateWithChallenge({
    policy: 'prevention-required',
    assuranceGrade: 'hardened',
    signerStrength: 'cryptographic-local',
  });
  assert.throws(
    () =>
      verifyAndConsumeGrant(state, detachedGrant(challenge), {
        action: 'continue',
        parameters: continueParameters,
        now,
        signerStrength: 'hardware-presence',
      }),
    (error) => error.code === 'APR_AUTHORITY_POLICY'
  );
  const substituted = detachedGrant(challenge);
  substituted.authorization.signer_id = 'human:untrusted-label';
  assert.throws(
    () =>
      verifyAndConsumeGrant(state, substituted, {
        action: 'continue',
        parameters: continueParameters,
        now,
      }),
    (error) => error.code === 'APR_GRANT_MISMATCH'
  );
});

test('official host receipt verification delegates exact pinned authority', () => {
  const { state, challenge } = stateWithChallenge({
    assuranceGrade: 'hardened',
    verifierKind: 'host',
  });
  const grant = hostGrant(challenge);
  let observed;
  const attestation = verifyAndConsumeGrant(state, grant, {
    action: 'continue',
    parameters: continueParameters,
    now,
    hostVerifier: (input) => {
      observed = input;
      return {
        valid: true,
        signer_id: grant.authorization.signer_id,
        signer_fingerprint: grant.authorization.signer_fingerprint,
        strength: 'host-verified',
      };
    },
  });
  assert.deepEqual(observed, {
    receipt: grant.authorization.receipt,
    challenge: canonicalChallengeBytes(challenge),
    verifier: state.protocol.authority.verifier,
  });
  assert.deepEqual(attestation, {
    source: 'host-approval',
    strength: 'host-verified',
    signer_id: grant.authorization.signer_id,
    signer_fingerprint: grant.authorization.signer_fingerprint,
    challenge_digest: digestChallenge(challenge),
    verified_at: now.toISOString(),
  });
});

test('test fixture signatures remain exclusive to no-commit reviews', () => {
  const { state, challenge } = stateWithChallenge({
    assuranceGrade: 'test-fixture',
    commitMode: 'no-commit',
  });
  const attestation = verifyAndConsumeGrant(state, fixtureGrant(challenge), {
    action: 'continue',
    parameters: continueParameters,
    now,
  });
  assert.equal(attestation.source, 'test-fixture');
  assert.equal(attestation.strength, 'unverified-test');

  const normal = { ...state, protocol: { ...state.protocol, commit_mode: 'normal' } };
  assert.throws(
    () =>
      verifyAndConsumeGrant(normal, fixtureGrant(challenge), {
        action: 'continue',
        parameters: continueParameters,
        now,
      }),
    (error) => error.code === 'APR_AUTHORITY_POLICY'
  );
});

test('effective authority is the weaker signer and verifier boundary', () => {
  for (const [signerStrength, assuranceGrade, policy, commitMode, accepted, effective] of [
    ['hardware-presence', 'hardened', 'prevention-required', 'normal', true, 'hardware-presence'],
    ['host-verified', 'hardened', 'prevention-required', 'normal', true, 'host-verified'],
    ['cryptographic-external', 'mutable-local', 'prevention-required', 'normal', false, null],
    [
      'cryptographic-local',
      'mutable-local',
      'detection-allowed',
      'normal',
      true,
      'cryptographic-local',
    ],
    ['unverified-test', 'test-fixture', 'detection-allowed', 'no-commit', true, 'unverified-test'],
    ['unverified-test', 'test-fixture', 'detection-allowed', 'normal', false, null],
  ]) {
    if (accepted) {
      assert.equal(
        effectiveAuthorityStrength({ signerStrength, assuranceGrade, policy, commitMode }),
        effective
      );
    } else {
      assert.throws(
        () => effectiveAuthorityStrength({ signerStrength, assuranceGrade, policy, commitMode }),
        (error) => error.code === 'APR_AUTHORITY_POLICY'
      );
    }
  }
});

test('verification rejects replay, expiry, and every exact binding mismatch', () => {
  const { state, challenge, events } = stateWithChallenge();
  const grant = detachedGrant(challenge);
  assert.throws(
    () => verify(state, grant, { now: new Date(challenge.expires_at) }),
    (error) => error.code === 'APR_GRANT_EXPIRED'
  );
  for (const altered of [
    { ...grant, challenge: { ...challenge, review_id: 'other-review' } },
    { ...grant, challenge: { ...challenge, protocol_revision: challenge.protocol_revision + 1 } },
    { ...grant, challenge: { ...challenge, nonce: 'different-nonce' } },
    { ...grant, parameters: { ...continueParameters, additional_turns: 3 } },
    {
      ...grant,
      authorization: { ...grant.authorization, verifier_fingerprint: `sha256:${'9'.repeat(64)}` },
    },
  ]) {
    assert.throws(
      () => verify(state, altered),
      (error) => error.code.startsWith('APR_GRANT_')
    );
  }

  const substitute = generateKeyPairSync('ed25519');
  const substitutedState = {
    ...state,
    protocol: {
      ...state.protocol,
      authority: {
        ...state.protocol.authority,
        verifier: {
          ...state.protocol.authority.verifier,
          public_key: substitute.publicKey.export({ type: 'spki', format: 'pem' }),
        },
      },
    },
  };
  const substitutedGrant = {
    ...grant,
    authorization: {
      ...grant.authorization,
      signature: sign(null, canonicalChallengeBytes(challenge), substitute.privateKey).toString(
        'base64url'
      ),
    },
  };
  assert.throws(
    () => verify(substitutedState, substitutedGrant),
    (error) => error.code === 'APR_GRANT_MISMATCH'
  );

  const attestation = verify(state, grant);
  const authorized = event('continued-to-reviewer', {
    sequence: events.length + 1,
    revision: state.protocol.revision + 1,
    payload: {
      intervention_id: state.protocol.intervention.intervention_id,
      additional_turns: 2,
      effective_max_turns: 4,
      parameters: continueParameters,
      attestation,
    },
  });
  const consumed = reduceEvents([...events, authorized]);
  assert.equal(consumed.protocol.challenges[0].consumed_at, authorized.at);
  assert.throws(
    () => verify(consumed, grant),
    (error) => error.code === 'APR_GRANT_REPLAYED'
  );
  assert.throws(
    () =>
      reduceEvents([
        ...events,
        {
          ...authorized,
          payload: { ...authorized.payload, additional_turns: 100 },
        },
      ]),
    (error) => error.code === 'APR_INVALID_TRANSITION'
  );
});

test('only the requesting participant can supersede its own live challenge', () => {
  const { state, challenge, events } = stateWithChallenge();
  assert.throws(
    () =>
      reduceEvents([
        ...events,
        challengeSupersededEvent(
          state,
          challenge.challenge_id,
          FINGERPRINTS.author,
          new Date('2026-09-08T12:01:00Z')
        ),
      ]),
    (error) => error.code === 'APR_INVALID_TRANSITION'
  );
  const supersededEvent = challengeSupersededEvent(
    state,
    challenge.challenge_id,
    FINGERPRINTS.reviewer,
    new Date('2026-09-08T12:01:00Z')
  );
  const superseded = reduceEvents([...events, supersededEvent]);
  assert.equal(superseded.protocol.challenges[0].superseded_at, supersededEvent.at);
});

test('request-grant CLI appends once under lock and emits reusable challenge bytes', async (t) => {
  const requesterFingerprint = fingerprintSession('openai', 'cli-reviewer-session');
  const events = withAuthority(interventionEvents('turn-budget-exhausted')).map((item) =>
    item.type === 'reviewer-joined'
      ? {
          ...item,
          payload: {
            ...item.payload,
            reviewer: { ...item.payload.reviewer, session_fingerprint: requesterFingerprint },
          },
        }
      : item.type === 'turn-claimed'
        ? {
            ...item,
            actor: requesterFingerprint,
            payload: {
              ...item.payload,
              claim: { ...item.payload.claim, session_fingerprint: requesterFingerprint },
            },
          }
        : item
  );
  const fixture = await createReviewWorkspace({ repository: null, events });
  t.after(fixture.cleanup);
  const output = [];
  const errors = [];
  const io = {
    cwd: fixture.root,
    env: {
      CODEX_SESSION_ID: 'cli-reviewer-session',
      CODEX_MODEL_ID: 'gpt-test',
    },
    now,
    stdout: { write: (value) => output.push(value) },
    stderr: { write: (value) => errors.push(value) },
  };
  const argv = [
    'request-grant',
    fixture.workspace,
    '--action',
    'continue',
    '--additional-turns',
    '2',
    '--resulting-effective-maximum',
    '4',
    '--resume-role',
    'reviewer',
  ];
  assert.equal(await run(argv, io), 0);
  const first = JSON.parse(output.at(-1));
  assert.equal(first.schema, 'ai-peer-review.request-grant-result/v1');
  assert.equal(
    Buffer.from(first.canonical_challenge, 'base64').equals(
      canonicalChallengeBytes(first.challenge)
    ),
    true
  );
  const afterFirst = await readReview(fixture.workspace);
  assert.equal(afterFirst.protocol.challenges.length, 1);
  assert.equal(await run(argv, io), 0);
  const afterRetry = await readReview(fixture.workspace);
  assert.equal(afterRetry.protocol.sequence, afterFirst.protocol.sequence);
  assert.equal(errors.length, 0);
});

test('unavailable authority blocks protected challenges but not ordinary consensus', () => {
  const unavailable = {
    authority_policy: 'unavailable',
    challenge_ttl_ms: 15 * 60 * 1000,
    verifier: null,
  };
  const events = interventionEvents('turn-budget-exhausted').map((item, index) =>
    index === 0 ? { ...item, payload: { ...item.payload, authority: unavailable } } : item
  );
  const unavailableState = reduceEvents(events);
  assert.throws(
    () => requestChallenge(unavailableState, 'continue', continueParameters, now),
    (error) => error.code === 'APR_AUTHORITY_UNAVAILABLE'
  );
  const forgedChallenge = {
    schema: 'ai-peer-review.grant-challenge/v1',
    challenge_id: 'challenge-forged',
    review_id: unavailableState.protocol.review_id,
    intervention_id: unavailableState.protocol.intervention.intervention_id,
    protocol_revision: unavailableState.protocol.revision,
    action: 'continue',
    parameters_digest: digestGrantParameters('continue', continueParameters),
    nonce: 'f'.repeat(43),
    expires_at: '2026-09-09T12:00:00.000Z',
  };
  assert.throws(
    () =>
      reduceEvents([
        ...events,
        event('challenge-requested', {
          sequence: events.length + 1,
          revision: unavailableState.protocol.revision,
          actor: FINGERPRINTS.author,
          payload: { challenge: forgedChallenge },
        }),
      ]),
    (error) => error.code === 'APR_INVALID_TRANSITION'
  );
  const consensus = withAuthority(reviewerTurnEvents(), { policy: 'detection-allowed' });
  consensus.push(
    event('turn-claimed', {
      sequence: consensus.length + 1,
      revision: consensus.at(-1).revision,
      actor: FINGERPRINTS.reviewer,
      payload: { claim: claim('reviewer') },
    }),
    event('reviewer-accepted', {
      sequence: consensus.length + 2,
      revision: consensus.at(-1).revision + 1,
      actor: FINGERPRINTS.reviewer,
    })
  );
  assert.equal(reduceEvents(consensus).protocol.state, 'acceptance-pending');
  assert.equal(participant('author').role, 'author');
});
