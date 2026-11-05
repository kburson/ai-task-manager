import { AprError } from '../errors.mjs';
import { validateRuntimeDescriptor } from '../startup/runtime.mjs';
import {
  canonicalGrantParameters,
  digestChallenge,
  digestGrantParameters,
} from '../authority/canonicalize.mjs';

const definitions = {
  'review-created': {
    advancesRevision: true,
    fields: [
      'commit_mode',
      'max_turns',
      'claim_ttl_ms',
      'authority',
      'artifact',
      'author',
      'startup',
    ],
    optionalFields: ['phases'],
  },
  'reviewer-joined': {
    advancesRevision: true,
    fields: ['reviewer', 'transport_capability', 'repository_boundary'],
  },
  'reviewer-revisions-requested': {
    advancesRevision: true,
    fields: ['turn', 'response', 'finding_ids'],
  },
  'reviewer-accepted': { advancesRevision: true, fields: ['turn', 'response', 'finding_ids'] },
  'author-revision-committed': {
    advancesRevision: true,
    fields: ['turn', 'response', 'artifact', 'commit', 'repository_boundary'],
  },
  'author-revision-sealed-no-commit': {
    advancesRevision: true,
    fields: ['turn', 'response', 'artifact', 'snapshot', 'repository_boundary'],
  },
  'author-closing-round-committed': {
    advancesRevision: true,
    fields: [
      'turn',
      'response',
      'artifact',
      'commit',
      'repository_boundary',
      'intervention_id',
      'reason',
      'interrupted_state',
    ],
  },
  'author-closing-round-sealed-no-commit': {
    advancesRevision: true,
    fields: [
      'turn',
      'response',
      'artifact',
      'snapshot',
      'repository_boundary',
      'intervention_id',
      'reason',
      'interrupted_state',
    ],
  },
  'finalization-started': { advancesRevision: true, fields: [] },
  'acceptance-committed': { advancesRevision: true, fields: ['terminal'] },
  'acceptance-sealed-no-commit': { advancesRevision: true, fields: ['terminal'] },
  'phase-acceptance-committed': {
    advancesRevision: true,
    fields: ['cursor', 'kind', 'artifact', 'manifest', 'commit'],
  },
  'phase-acceptance-sealed-no-commit': {
    advancesRevision: true,
    fields: ['cursor', 'kind', 'artifact', 'manifest', 'snapshot'],
  },
  'phase-artifact-committed': {
    advancesRevision: true,
    fields: ['cursor', 'kind', 'artifact', 'commit', 'repository_boundary'],
  },
  'phase-artifact-sealed-no-commit': {
    advancesRevision: true,
    fields: ['cursor', 'kind', 'artifact', 'snapshot', 'repository_boundary'],
  },
  'intervention-entered': {
    advancesRevision: true,
    fields: ['intervention_id', 'reason', 'interrupted_state'],
  },
  'continued-to-reviewer': {
    advancesRevision: true,
    fields: [
      'intervention_id',
      'additional_turns',
      'effective_max_turns',
      'parameters',
      'attestation',
    ],
  },
  'continued-to-author': {
    advancesRevision: true,
    fields: [
      'intervention_id',
      'additional_turns',
      'effective_max_turns',
      'parameters',
      'attestation',
    ],
  },
  'same-session-reclaim': {
    advancesRevision: false,
    fields: ['intervention_id', 'old_claim', 'new_claim'],
  },
  'participant-replaced': {
    advancesRevision: true,
    fields: [
      'intervention_id',
      'role',
      'outgoing_claim',
      'incoming_participant',
      'parameters',
      'attestation',
    ],
  },
  'override-committed': {
    advancesRevision: true,
    fields: ['intervention_id', 'terminal', 'parameters', 'attestation'],
  },
  'override-sealed-no-commit': {
    advancesRevision: true,
    fields: ['intervention_id', 'terminal', 'parameters', 'attestation'],
  },
  abandoned: { advancesRevision: true, fields: ['intervention_id', 'reason', 'retained_paths'] },
  superseded: {
    advancesRevision: true,
    fields: ['reason', 'successor_review_id', 'retained_paths'],
  },
  'turn-claimed': { advancesRevision: false, fields: ['claim'] },
  'identity-changed': { advancesRevision: false, fields: ['role', 'identity'] },
  'challenge-requested': { advancesRevision: false, fields: ['challenge'] },
  'challenge-superseded': { advancesRevision: false, fields: ['challenge_id'] },
  'supplement-registered': { advancesRevision: true, fields: ['supplement'] },
  'delivery-written': { advancesRevision: false, fields: ['delivery'] },
  'delivery-acknowledged': { advancesRevision: false, fields: ['delivery_id'] },
};

export const EVENT_DEFINITIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(definitions).map(([type, definition]) => [
      type,
      Object.freeze({
        ...definition,
        fields: Object.freeze([...definition.fields]),
        ...(definition.optionalFields
          ? { optionalFields: Object.freeze([...definition.optionalFields]) }
          : {}),
      }),
    ])
  )
);
export const EVENT_TYPES = Object.freeze(Object.keys(EVENT_DEFINITIONS));

const TOP_LEVEL_FIELDS = Object.freeze([
  'schema',
  'review_id',
  'sequence',
  'revision',
  'type',
  'actor',
  'at',
  'payload',
]);
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FINGERPRINT_RE = /^sha256:[0-9a-f]{64}$/;
const GIT_OBJECT_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const RFC3339_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function invalid(reason, details = {}) {
  return new AprError('APR_EVENT_INVALID', `Invalid peer-review event: ${reason}.`, {
    recovery:
      'Recreate the event from the current review state using the documented event contract.',
    details: { reason, ...details },
  });
}

function isPlainObject(value) {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  );
}

function assertJsonValue(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return;
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw invalid('cyclic payload');
    const next = new Set(ancestors).add(value);
    value.forEach((entry) => assertJsonValue(entry, next));
    return;
  }
  if (isPlainObject(value)) {
    if (ancestors.has(value)) throw invalid('cyclic payload');
    const next = new Set(ancestors).add(value);
    Object.entries(value).forEach(([key, entry]) => {
      if (!key || !key.normalize('NFC').isWellFormed()) throw invalid('payload key');
      assertJsonValue(entry, next);
    });
    return;
  }
  throw invalid('non-JSON payload value');
}

function exactKeys(value, expected, label) {
  if (!isPlainObject(value)) throw invalid(`${label} object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw invalid(`${label} fields`, { actual, expected: wanted });
  }
}

function assertEnum(value, allowed, label) {
  if (!allowed.includes(value)) throw invalid(label);
}

function assertIdentifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER_RE.test(value)) throw invalid(label);
}

function assertFingerprint(value, label) {
  if (typeof value !== 'string' || !FINGERPRINT_RE.test(value)) throw invalid(label);
}

function assertTimestamp(value, label) {
  if (typeof value !== 'string' || !RFC3339_RE.test(value)) throw invalid(label);
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw invalid(label);
  const canonical = new Date(parsed).toISOString();
  if (value !== canonical && value !== canonical.replace('.000Z', 'Z')) {
    throw invalid(label);
  }
}

function assertPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw invalid(label);
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw invalid(label);
}

function assertString(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    !value.isWellFormed() ||
    value !== value.normalize('NFC')
  ) {
    throw invalid(label);
  }
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !FINGERPRINT_RE.test(value)) throw invalid(label);
}

function assertGitObject(value, label) {
  if (typeof value !== 'string' || !GIT_OBJECT_RE.test(value)) throw invalid(label);
}

function assertPath(value, label) {
  assertString(value, label);
  if (
    value.startsWith('/') ||
    value.includes('\\') ||
    value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw invalid(label);
  }
}

function assertIdentifierArray(value, label) {
  if (!Array.isArray(value)) throw invalid(label);
  value.forEach((entry) => assertIdentifier(entry, label));
  if (new Set(value).size !== value.length) throw invalid(label);
}

function assertPathArray(value, label) {
  if (!Array.isArray(value)) throw invalid(label);
  value.forEach((entry) => assertPath(entry, label));
  if (new Set(value).size !== value.length) throw invalid(label);
}

function validateParticipant(value, label) {
  exactKeys(
    value,
    [
      'role',
      'host',
      'provider',
      'model_id',
      'model_display',
      'session_fingerprint',
      'identity_source',
      'joined_at',
    ],
    label
  );
  assertEnum(value.role, ['author', 'reviewer'], `${label} role`);
  assertEnum(value.host, ['codex', 'claude-code', 'grok', 'other'], `${label} host`);
  assertEnum(value.provider, ['openai', 'anthropic', 'xai', 'other'], `${label} provider`);
  assertString(value.model_id, `${label} model_id`);
  assertString(value.model_display, `${label} model_display`);
  assertFingerprint(value.session_fingerprint, `${label} session_fingerprint`);
  assertEnum(value.identity_source, ['runtime', 'declared'], `${label} identity_source`);
  assertTimestamp(value.joined_at, `${label} joined_at`);
}

function validateArtifact(value, label, { initial = false } = {}) {
  exactKeys(
    value,
    initial ? ['path', 'head', 'blob', 'digest'] : ['path', 'blob', 'digest'],
    label
  );
  assertPath(value.path, `${label} path`);
  if (initial) assertGitObject(value.head, `${label} head`);
  assertGitObject(value.blob, `${label} blob`);
  assertDigest(value.digest, `${label} digest`);
}

function validateRepositoryBoundary(value, label) {
  exactKeys(value, ['head', 'branch', 'index_digest', 'refs_digest', 'worktree_digest'], label);
  assertGitObject(value.head, `${label} head`);
  assertString(value.branch, `${label} branch`);
  assertDigest(value.index_digest, `${label} index_digest`);
  assertDigest(value.refs_digest, `${label} refs_digest`);
  assertDigest(value.worktree_digest, `${label} worktree_digest`);
}

function validateStartup(value) {
  if (!isPlainObject(value)) throw invalid('review-created startup object');
  const startupFields = [
    'context',
    'context_digest',
    'destination',
    'author_startup_digest',
    'reviewer_invitation_digest',
    'transport_mode',
    'author_transport_capability',
    'no_commit_baseline',
    'bootstrap',
  ];
  if (Object.hasOwn(value, 'runtime')) startupFields.push('runtime');
  exactKeys(value, startupFields, 'review-created startup');
  const context = value.context;
  const contextFields = [
    'schema',
    'review_id',
    'repository_root',
    'artifact_kind',
    'artifact_name',
    'review_date',
    'reviews_root',
    'review_path_template',
    'issue',
  ];
  if (Object.hasOwn(context, 'record_id')) contextFields.push('record_id');
  exactKeys(context, contextFields, 'review-created startup context');
  if (context.schema !== 'ai-peer-review.context/v1') throw invalid('startup context schema');
  assertIdentifier(context.review_id, 'startup context review_id');
  if (context.record_id !== undefined) {
    assertIdentifier(context.record_id, 'startup context record_id');
  }
  assertString(context.repository_root, 'startup context repository_root');
  assertEnum(context.artifact_kind, ['spec', 'plan'], 'startup context artifact_kind');
  assertIdentifier(context.artifact_name, 'startup context artifact_name');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(context.review_date)) throw invalid('startup review_date');
  assertPath(context.reviews_root, 'startup context reviews_root');
  assertString(context.review_path_template, 'startup context review_path_template');
  if (context.issue !== null) assertPositiveInteger(context.issue, 'startup context issue');
  assertDigest(value.context_digest, 'startup context_digest');
  assertPath(value.destination, 'startup destination');
  assertDigest(value.author_startup_digest, 'startup author_startup_digest');
  assertDigest(value.reviewer_invitation_digest, 'startup reviewer_invitation_digest');
  assertEnum(
    value.transport_mode,
    ['manual', 'resume-only', 'automatic-required'],
    'startup transport_mode'
  );
  if (value.runtime !== undefined) {
    try {
      validateRuntimeDescriptor(value.runtime);
    } catch {
      throw invalid('startup runtime');
    }
    if (value.runtime.transport_mode !== value.transport_mode) {
      throw invalid('startup runtime transport_mode');
    }
  }
  assertEnum(
    value.author_transport_capability,
    ['manual', 'resume-only', 'live-wait', 'native-push'],
    'startup author transport capability'
  );
  if (value.no_commit_baseline !== null) {
    exactKeys(
      value.no_commit_baseline,
      ['head', 'index_digest', 'worktree_digest', 'changed_paths'],
      'startup no_commit_baseline'
    );
    assertGitObject(value.no_commit_baseline.head, 'startup baseline head');
    assertDigest(value.no_commit_baseline.index_digest, 'startup baseline index_digest');
    assertDigest(value.no_commit_baseline.worktree_digest, 'startup baseline worktree_digest');
    if (!Array.isArray(value.no_commit_baseline.changed_paths))
      throw invalid('startup baseline changed_paths');
    for (const changed of value.no_commit_baseline.changed_paths) {
      exactKeys(changed, ['path', 'status', 'source_path', 'digest'], 'startup changed path');
      assertPath(changed.path, 'startup changed path');
      if (typeof changed.status !== 'string' || changed.status.length !== 2)
        throw invalid('startup changed path status');
      if (changed.source_path !== null) assertPath(changed.source_path, 'startup source path');
      if (changed.digest !== null) assertDigest(changed.digest, 'startup changed path digest');
    }
  }
  if (value.bootstrap !== null) {
    exactKeys(value.bootstrap, ['challenge', 'parameters', 'attestation'], 'startup bootstrap');
    validateChallenge(value.bootstrap.challenge, 'startup bootstrap challenge');
    if (value.bootstrap.challenge.action !== 'pin-verifier')
      throw invalid('startup bootstrap action');
    validateAttestation(value.bootstrap.attestation, 'startup bootstrap attestation');
    try {
      canonicalGrantParameters('pin-verifier', value.bootstrap.parameters);
    } catch {
      throw invalid('startup bootstrap parameters');
    }
    if (
      value.bootstrap.challenge.review_id !== context.review_id ||
      value.bootstrap.challenge.protocol_revision !== 0 ||
      value.bootstrap.challenge.intervention_id !== null ||
      value.bootstrap.challenge.parameters_digest !==
        digestGrantParameters('pin-verifier', value.bootstrap.parameters) ||
      value.bootstrap.attestation.challenge_digest !== digestChallenge(value.bootstrap.challenge)
    ) {
      throw invalid('startup bootstrap authority binding');
    }
  }
}

function validateResponse(value, label) {
  exactKeys(value, ['path', 'digest'], label);
  assertPath(value.path, `${label} path`);
  assertDigest(value.digest, `${label} digest`);
}

function validateClaim(value, label) {
  exactKeys(
    value,
    [
      'claim_id',
      'role',
      'session_fingerprint',
      'host',
      'claimed_at',
      'last_activity_at',
      'expires_at',
      'pid',
    ],
    label
  );
  assertIdentifier(value.claim_id, `${label} claim_id`);
  assertEnum(value.role, ['author', 'reviewer'], `${label} role`);
  assertFingerprint(value.session_fingerprint, `${label} session_fingerprint`);
  assertEnum(value.host, ['codex', 'claude-code', 'grok', 'other'], `${label} host`);
  assertTimestamp(value.claimed_at, `${label} claimed_at`);
  assertTimestamp(value.last_activity_at, `${label} last_activity_at`);
  assertTimestamp(value.expires_at, `${label} expires_at`);
  assertPositiveInteger(value.pid, `${label} pid`);
  if (
    Date.parse(value.last_activity_at) < Date.parse(value.claimed_at) ||
    Date.parse(value.expires_at) <= Date.parse(value.last_activity_at)
  ) {
    throw invalid(`${label} chronology`);
  }
}

function validateAttestation(value, label) {
  exactKeys(
    value,
    ['source', 'strength', 'signer_id', 'signer_fingerprint', 'challenge_digest', 'verified_at'],
    label
  );
  assertEnum(
    value.source,
    ['detached-signature', 'host-approval', 'test-fixture'],
    `${label} source`
  );
  assertEnum(
    value.strength,
    [
      'cryptographic-external',
      'hardware-presence',
      'host-verified',
      'cryptographic-local',
      'unverified-test',
    ],
    `${label} strength`
  );
  assertString(value.signer_id, `${label} signer_id`);
  assertString(value.signer_fingerprint, `${label} signer_fingerprint`);
  assertDigest(value.challenge_digest, `${label} challenge_digest`);
  assertTimestamp(value.verified_at, `${label} verified_at`);
}

function validateGrantParameters(action, value, label) {
  try {
    canonicalGrantParameters(action, value);
  } catch (cause) {
    throw invalid(`${label} parameters`, { cause: cause.code ?? cause.message });
  }
}

function validateAuthority(value, label) {
  exactKeys(value, ['authority_policy', 'challenge_ttl_ms', 'verifier'], label);
  assertEnum(
    value.authority_policy,
    ['prevention-required', 'detection-allowed', 'unavailable'],
    `${label} authority_policy`
  );
  assertPositiveInteger(value.challenge_ttl_ms, `${label} challenge_ttl_ms`);
  if (value.authority_policy === 'unavailable') {
    if (value.verifier !== null) throw invalid(`${label} unavailable verifier`);
    return;
  }
  exactKeys(
    value.verifier,
    [
      'kind',
      'verifier_id',
      'verifier_fingerprint',
      'public_key',
      'assurance_grade',
      'signer_strength',
    ],
    `${label} verifier`
  );
  assertEnum(value.verifier.kind, ['ed25519', 'host'], `${label} verifier kind`);
  assertString(value.verifier.verifier_id, `${label} verifier_id`);
  assertDigest(value.verifier.verifier_fingerprint, `${label} verifier_fingerprint`);
  assertEnum(
    value.verifier.assurance_grade,
    ['hardened', 'mutable-local', 'test-fixture'],
    `${label} assurance_grade`
  );
  assertEnum(
    value.verifier.signer_strength,
    [
      'cryptographic-external',
      'hardware-presence',
      'host-verified',
      'cryptographic-local',
      'unverified-test',
    ],
    `${label} signer_strength`
  );
  if (
    value.verifier.kind === 'ed25519' &&
    ![
      'cryptographic-external',
      'hardware-presence',
      'cryptographic-local',
      'unverified-test',
    ].includes(value.verifier.signer_strength)
  ) {
    throw invalid(`${label} Ed25519 signer_strength`);
  }
  if (
    value.verifier.kind === 'host' &&
    !['host-verified', 'hardware-presence', 'cryptographic-external'].includes(
      value.verifier.signer_strength
    )
  ) {
    throw invalid(`${label} host signer_strength`);
  }
  if (value.verifier.kind === 'ed25519') {
    assertString(value.verifier.public_key, `${label} public_key`);
  } else if (value.verifier.public_key !== null) {
    throw invalid(`${label} host public_key`);
  }
}

function validateTerminal(value, label, { committed }) {
  exactKeys(
    value,
    committed ? ['commit', 'manifest_digest'] : ['snapshot_digest', 'manifest_digest'],
    label
  );
  if (committed) assertGitObject(value.commit, `${label} commit`);
  else assertDigest(value.snapshot_digest, `${label} snapshot_digest`);
  assertDigest(value.manifest_digest, `${label} manifest_digest`);
}

function validatePhases(value, label) {
  exactKeys(value, ['kinds'], label);
  if (
    !Array.isArray(value.kinds) ||
    value.kinds.length === 0 ||
    value.kinds.some((kind) => !['spec', 'plan'].includes(kind)) ||
    new Set(value.kinds).size !== value.kinds.length
  ) {
    throw invalid(`${label} kinds`);
  }
}

function validateChallenge(value, label) {
  exactKeys(
    value,
    [
      'schema',
      'challenge_id',
      'review_id',
      'intervention_id',
      'protocol_revision',
      'action',
      'parameters_digest',
      'nonce',
      'expires_at',
    ],
    label
  );
  if (value.schema !== 'ai-peer-review.grant-challenge/v1') throw invalid(`${label} schema`);
  assertIdentifier(value.challenge_id, `${label} challenge_id`);
  assertIdentifier(value.review_id, `${label} review_id`);
  if (value.intervention_id !== null) {
    assertIdentifier(value.intervention_id, `${label} intervention_id`);
  }
  assertNonNegativeInteger(value.protocol_revision, `${label} protocol_revision`);
  assertEnum(
    value.action,
    ['pin-verifier', 'continue', 'supplement', 'accept-over-objections', 'replace-participant'],
    `${label} action`
  );
  assertDigest(value.parameters_digest, `${label} parameters_digest`);
  if (typeof value.nonce !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.nonce)) {
    throw invalid(`${label} nonce`);
  }
  assertTimestamp(value.expires_at, `${label} expires_at`);
}

function validatePayload(type, payload, valueReviewId) {
  switch (type) {
    case 'review-created':
      assertEnum(payload.commit_mode, ['normal', 'no-commit'], 'review-created commit_mode');
      assertPositiveInteger(payload.max_turns, 'review-created max_turns');
      assertPositiveInteger(payload.claim_ttl_ms, 'review-created claim_ttl_ms');
      if (payload.claim_ttl_ms % (60 * 60 * 1000) !== 0) {
        throw invalid('review-created claim_ttl_ms whole hours');
      }
      validateAuthority(payload.authority, 'review-created authority');
      validateArtifact(payload.artifact, 'review-created artifact', { initial: true });
      validateParticipant(payload.author, 'review-created author');
      if (payload.author.role !== 'author') throw invalid('review-created author role');
      validateStartup(payload.startup);
      if (payload.phases !== undefined) {
        validatePhases(payload.phases, 'review-created phases');
        if (payload.phases.kinds[0] !== payload.startup.context.artifact_kind) {
          throw invalid('review-created phase initial kind');
        }
      }
      if ((payload.commit_mode === 'no-commit') !== (payload.startup.no_commit_baseline !== null)) {
        throw invalid('review-created no-commit baseline');
      }
      if (
        payload.startup.transport_mode === 'resume-only' &&
        payload.startup.author_transport_capability !== 'resume-only'
      ) {
        throw invalid('review-created author transport capability');
      }
      if (
        payload.startup.transport_mode === 'automatic-required' &&
        !['live-wait', 'native-push'].includes(payload.startup.author_transport_capability)
      ) {
        throw invalid('review-created author automatic transport capability');
      }
      if (
        (payload.authority.verifier?.signer_strength === 'unverified-test' ||
          payload.startup.bootstrap?.attestation.strength === 'unverified-test') &&
        payload.commit_mode !== 'no-commit'
      ) {
        throw invalid('review-created test authority commit mode');
      }
      if (payload.startup.context.review_id !== valueReviewId) {
        throw invalid('review-created startup review identity');
      }
      if (payload.startup.bootstrap) {
        const parameters = payload.startup.bootstrap.parameters;
        if (
          parameters.verifier_fingerprint !== payload.authority.verifier?.verifier_fingerprint ||
          parameters.assurance_grade !== payload.authority.verifier?.assurance_grade ||
          parameters.authority_policy !== payload.authority.authority_policy ||
          parameters.artifact_path !== payload.artifact.path ||
          parameters.artifact_kind !== payload.startup.context.artifact_kind ||
          parameters.reviews_root !== payload.startup.context.reviews_root ||
          parameters.path_template !== payload.startup.context.review_path_template ||
          parameters.issue_id !== payload.startup.context.issue ||
          parameters.maximum_turns !== payload.max_turns ||
          parameters.commit_mode !== payload.commit_mode
        ) {
          throw invalid('review-created bootstrap configuration');
        }
      }
      break;
    case 'reviewer-joined':
      validateParticipant(payload.reviewer, 'reviewer-joined reviewer');
      if (payload.reviewer.role !== 'reviewer') throw invalid('reviewer-joined reviewer role');
      assertEnum(
        payload.transport_capability,
        ['manual', 'resume-only', 'live-wait', 'native-push'],
        'reviewer-joined transport capability'
      );
      validateRepositoryBoundary(
        payload.repository_boundary,
        'reviewer-joined repository_boundary'
      );
      break;
    case 'reviewer-revisions-requested':
    case 'reviewer-accepted':
      assertPositiveInteger(payload.turn, `${type} turn`);
      validateResponse(payload.response, `${type} response`);
      assertIdentifierArray(payload.finding_ids, `${type} finding_ids`);
      break;
    case 'author-revision-committed':
    case 'author-closing-round-committed':
      assertPositiveInteger(payload.turn, `${type} turn`);
      validateResponse(payload.response, `${type} response`);
      validateArtifact(payload.artifact, `${type} artifact`);
      assertGitObject(payload.commit, `${type} commit`);
      validateRepositoryBoundary(payload.repository_boundary, `${type} repository_boundary`);
      if (type === 'author-closing-round-committed') {
        assertIdentifier(payload.intervention_id, `${type} intervention_id`);
        if (payload.reason !== 'turn-budget-exhausted') throw invalid(`${type} reason`);
        if (payload.interrupted_state !== 'reviewer-turn')
          throw invalid(`${type} interrupted_state`);
      }
      break;
    case 'author-revision-sealed-no-commit':
    case 'author-closing-round-sealed-no-commit':
      assertPositiveInteger(payload.turn, `${type} turn`);
      validateResponse(payload.response, `${type} response`);
      validateArtifact(payload.artifact, `${type} artifact`);
      validateResponse(payload.snapshot, `${type} snapshot`);
      if (
        payload.snapshot.digest !== payload.artifact.digest ||
        payload.snapshot.path !== `artifacts/turn-${payload.turn}.md`
      ) {
        throw invalid(`${type} snapshot authority`);
      }
      validateRepositoryBoundary(payload.repository_boundary, `${type} repository_boundary`);
      if (type === 'author-closing-round-sealed-no-commit') {
        assertIdentifier(payload.intervention_id, `${type} intervention_id`);
        if (payload.reason !== 'turn-budget-exhausted') throw invalid(`${type} reason`);
        if (payload.interrupted_state !== 'reviewer-turn')
          throw invalid(`${type} interrupted_state`);
      }
      break;
    case 'finalization-started':
      break;
    case 'acceptance-committed':
    case 'override-committed':
      validateTerminal(payload.terminal, `${type} terminal`, { committed: true });
      if (type === 'override-committed') {
        assertIdentifier(payload.intervention_id, `${type} intervention_id`);
        validateGrantParameters('accept-over-objections', payload.parameters, type);
        validateAttestation(payload.attestation, `${type} attestation`);
      }
      break;
    case 'acceptance-sealed-no-commit':
    case 'override-sealed-no-commit':
      validateTerminal(payload.terminal, `${type} terminal`, { committed: false });
      if (type === 'override-sealed-no-commit') {
        assertIdentifier(payload.intervention_id, `${type} intervention_id`);
        validateGrantParameters('accept-over-objections', payload.parameters, type);
        validateAttestation(payload.attestation, `${type} attestation`);
      }
      break;
    case 'phase-acceptance-committed':
    case 'phase-acceptance-sealed-no-commit':
      assertNonNegativeInteger(payload.cursor, `${type} cursor`);
      assertEnum(payload.kind, ['spec', 'plan'], `${type} kind`);
      validateArtifact(payload.artifact, `${type} artifact`);
      validateResponse(payload.manifest, `${type} manifest`);
      if (type === 'phase-acceptance-committed') {
        assertGitObject(payload.commit, `${type} commit`);
      } else {
        validateResponse(payload.snapshot, `${type} snapshot`);
        if (payload.snapshot.digest !== payload.artifact.digest) {
          throw invalid(`${type} snapshot authority`);
        }
      }
      break;
    case 'phase-artifact-committed':
    case 'phase-artifact-sealed-no-commit':
      assertNonNegativeInteger(payload.cursor, `${type} cursor`);
      assertEnum(payload.kind, ['spec', 'plan'], `${type} kind`);
      validateArtifact(payload.artifact, `${type} artifact`);
      if (type === 'phase-artifact-committed') {
        assertGitObject(payload.commit, `${type} commit`);
      } else {
        validateResponse(payload.snapshot, `${type} snapshot`);
        if (payload.snapshot.digest !== payload.artifact.digest) {
          throw invalid(`${type} snapshot authority`);
        }
      }
      validateRepositoryBoundary(payload.repository_boundary, `${type} repository_boundary`);
      break;
    case 'intervention-entered':
      assertIdentifier(payload.intervention_id, `${type} intervention_id`);
      assertEnum(
        payload.reason,
        ['turn-budget-exhausted', 'stale-claim', 'participant-loss'],
        `${type} reason`
      );
      assertEnum(
        payload.interrupted_state,
        ['reviewer-turn', 'author-revision'],
        `${type} interrupted_state`
      );
      break;
    case 'continued-to-reviewer':
    case 'continued-to-author':
      assertIdentifier(payload.intervention_id, `${type} intervention_id`);
      assertPositiveInteger(payload.additional_turns, `${type} additional_turns`);
      assertPositiveInteger(payload.effective_max_turns, `${type} effective_max_turns`);
      validateGrantParameters('continue', payload.parameters, type);
      validateAttestation(payload.attestation, `${type} attestation`);
      break;
    case 'same-session-reclaim':
      assertIdentifier(payload.intervention_id, `${type} intervention_id`);
      validateClaim(payload.old_claim, `${type} old_claim`);
      validateClaim(payload.new_claim, `${type} new_claim`);
      break;
    case 'participant-replaced':
      assertIdentifier(payload.intervention_id, `${type} intervention_id`);
      assertEnum(payload.role, ['author', 'reviewer'], `${type} role`);
      validateClaim(payload.outgoing_claim, `${type} outgoing_claim`);
      validateParticipant(payload.incoming_participant, `${type} incoming_participant`);
      validateGrantParameters('replace-participant', payload.parameters, type);
      validateAttestation(payload.attestation, `${type} attestation`);
      if (
        payload.outgoing_claim.role !== payload.role ||
        payload.incoming_participant.role !== payload.role
      ) {
        throw invalid(`${type} role binding`);
      }
      break;
    case 'abandoned':
      assertIdentifier(payload.intervention_id, `${type} intervention_id`);
      assertString(payload.reason, `${type} reason`);
      assertPathArray(payload.retained_paths, `${type} retained_paths`);
      break;
    case 'superseded':
      assertString(payload.reason, `${type} reason`);
      assertIdentifier(payload.successor_review_id, `${type} successor_review_id`);
      assertPathArray(payload.retained_paths, `${type} retained_paths`);
      break;
    case 'turn-claimed':
      validateClaim(payload.claim, `${type} claim`);
      break;
    case 'identity-changed':
      assertEnum(payload.role, ['author', 'reviewer'], `${type} role`);
      validateParticipant(payload.identity, `${type} identity`);
      if (payload.identity.role !== payload.role) throw invalid(`${type} role binding`);
      break;
    case 'challenge-requested':
      validateChallenge(payload.challenge, `${type} challenge`);
      if (
        payload.challenge.action === 'pin-verifier'
          ? payload.challenge.intervention_id !== null
          : payload.challenge.intervention_id === null
      ) {
        throw invalid(`${type} intervention binding`);
      }
      break;
    case 'challenge-superseded':
    case 'delivery-acknowledged':
      assertIdentifier(
        payload[type === 'challenge-superseded' ? 'challenge_id' : 'delivery_id'],
        `${type} identifier`
      );
      break;
    case 'supplement-registered':
      exactKeys(
        payload.supplement,
        [
          'supplement_id',
          'digest',
          'target_role',
          'target_turn',
          'content_retention',
          'acknowledged_at',
          'parameters',
          'attestation',
        ],
        `${type} supplement`
      );
      assertIdentifier(payload.supplement.supplement_id, `${type} supplement_id`);
      assertDigest(payload.supplement.digest, `${type} digest`);
      assertEnum(payload.supplement.target_role, ['author', 'reviewer'], `${type} target_role`);
      assertPositiveInteger(payload.supplement.target_turn, `${type} target_turn`);
      if (payload.supplement.content_retention !== 'scratch-only')
        throw invalid(`${type} content_retention`);
      if (payload.supplement.acknowledged_at !== null) throw invalid(`${type} acknowledged_at`);
      validateGrantParameters('supplement', payload.supplement.parameters, type);
      validateAttestation(payload.supplement.attestation, `${type} attestation`);
      break;
    case 'delivery-written':
      exactKeys(payload.delivery, ['delivery_id', 'recipient', 'digest'], `${type} delivery`);
      assertIdentifier(payload.delivery.delivery_id, `${type} delivery_id`);
      assertEnum(payload.delivery.recipient, ['author', 'reviewer'], `${type} recipient`);
      assertDigest(payload.delivery.digest, `${type} digest`);
      break;
    default:
      throw invalid('unknown type', { type });
  }
}

export function eventAdvancesRevision(type) {
  if (!Object.hasOwn(EVENT_DEFINITIONS, type)) throw invalid('unknown type', { type });
  const definition = EVENT_DEFINITIONS[type];
  return definition.advancesRevision;
}

export function validateEvent(value) {
  exactKeys(value, TOP_LEVEL_FIELDS, 'envelope');
  if (value.schema !== 'ai-peer-review.event/v1') throw invalid('schema');
  if (typeof value.review_id !== 'string' || !IDENTIFIER_RE.test(value.review_id)) {
    throw invalid('review_id');
  }
  if (!Number.isSafeInteger(value.sequence) || value.sequence <= 0) throw invalid('sequence');
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) throw invalid('revision');
  if (!Object.hasOwn(EVENT_DEFINITIONS, value.type)) {
    throw invalid('unknown type', { type: value.type });
  }
  if (value.actor !== 'system' && !FINGERPRINT_RE.test(value.actor)) throw invalid('actor');
  assertTimestamp(value.at, 'at');
  const definition = EVENT_DEFINITIONS[value.type];
  if (definition.optionalFields) {
    const allowed = new Set([...definition.fields, ...definition.optionalFields]);
    const actual = Object.keys(value.payload);
    if (
      definition.fields.some((field) => !Object.hasOwn(value.payload, field)) ||
      actual.some((field) => !allowed.has(field))
    ) {
      throw invalid(`${value.type} payload fields`, {
        actual: actual.sort(),
        expected: [...definition.fields, ...definition.optionalFields].sort(),
      });
    }
  } else {
    exactKeys(value.payload, definition.fields, `${value.type} payload`);
  }
  assertJsonValue(value.payload);
  validatePayload(value.type, value.payload, value.review_id);
  return true;
}
