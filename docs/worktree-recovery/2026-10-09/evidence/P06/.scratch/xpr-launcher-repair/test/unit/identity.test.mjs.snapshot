import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertDistinctParticipants,
  fingerprintSession,
  identityChangeEvent,
  participantIdentity,
  resolveIdentity,
} from '../../src/identity/registry.mjs';
import { codexAdapter } from '../../src/identity/codex.mjs';
import { claudeAdapter } from '../../src/identity/claude.mjs';
import { grokAdapter } from '../../src/identity/grok.mjs';
import { genericAdapter } from '../../src/identity/generic.mjs';
import { reduceEvents } from '../../src/protocol/reducer.mjs';
import {
  event,
  FINGERPRINTS,
  participant,
  reviewerTurnEvents,
} from '../helpers/review-fixture.mjs';

const joinedAt = '2026-09-08T12:00:00.000Z';

function runtime(adapter, sessionId, modelId = 'model-test') {
  return resolveIdentity({
    adapter,
    role: 'author',
    joinedAt,
    runtime: { sessionId, modelId, modelDisplay: `Display ${modelId}` },
    declared: {
      host: 'other',
      provider: 'other',
      sessionId: 'declared-secret',
      modelId: 'declared-model',
      modelDisplay: 'Declared Model',
    },
  });
}

test('fingerprints are deterministic, provider-separated, and disclose no raw session ID', () => {
  const raw = 'runtime-session-secret';
  const first = fingerprintSession('openai', raw);
  assert.equal(first, fingerprintSession('openai', raw));
  assert.notEqual(first, fingerprintSession('anthropic', raw));
  assert.match(first, /^sha256:[0-9a-f]{64}$/);
  assert.doesNotMatch(first, new RegExp(raw));
});

test('resolves runtime identity for every provider and prefers it over declared identity', () => {
  for (const [adapter, host, provider] of [
    ['codex', 'codex', 'openai'],
    ['claude', 'claude-code', 'anthropic'],
    ['grok', 'grok', 'xai'],
  ]) {
    const identity = runtime(adapter, `${adapter}-runtime-secret`);
    assert.equal(identity.host, host);
    assert.equal(identity.provider, provider);
    assert.equal(identity.identity_source, 'runtime');
    assert.equal(identity.model_id, 'model-test');
    assert.equal(JSON.stringify(identity).includes(`${adapter}-runtime-secret`), false);
    assert.equal(JSON.stringify(identity).includes('declared-secret'), false);
  }
});

test('composes a genuine Claude runtime session with declared model metadata', () => {
  const identity = resolveIdentity({
    adapter: 'claude',
    role: 'reviewer',
    joinedAt,
    runtime: { sessionId: 'claude-runtime-session' },
    declaredModel: { modelId: 'claude-opus-5', modelDisplay: 'Claude Opus 5' },
  });

  assert.equal(identity.host, 'claude-code');
  assert.equal(identity.provider, 'anthropic');
  assert.equal(identity.model_id, 'claude-opus-5');
  assert.equal(identity.model_display, 'Claude Opus 5');
  assert.equal(identity.identity_source, 'declared');
  assert.equal(
    identity.session_fingerprint,
    fingerprintSession('anthropic', 'claude-runtime-session')
  );
  assert.equal(JSON.stringify(identity).includes('claude-runtime-session'), false);
});

test('Claude mixed identity fails closed without a runtime session or declared model', () => {
  assert.throws(
    () =>
      resolveIdentity({
        adapter: 'claude',
        role: 'reviewer',
        joinedAt,
        runtime: {},
        declaredModel: { modelId: 'claude-opus-5', modelDisplay: 'Claude Opus 5' },
      }),
    (error) =>
      error.code === 'APR_IDENTITY_REQUIRED' && error.recovery.includes('CLAUDE_CODE_SESSION_ID')
  );

  assert.throws(
    () =>
      resolveIdentity({
        adapter: 'claude',
        role: 'reviewer',
        joinedAt,
        runtime: { sessionId: 'claude-runtime-session' },
      }),
    (error) =>
      error.code === 'APR_IDENTITY_REQUIRED' &&
      error.recovery.includes('hosts.claude.identity.model_id') &&
      error.recovery.includes('hosts.claude.identity.model_display')
  );
});

test('complete Claude runtime metadata wins over configured model metadata', () => {
  const identity = resolveIdentity({
    adapter: 'claude',
    role: 'reviewer',
    joinedAt,
    runtime: {
      sessionId: 'claude-runtime-session',
      modelId: 'runtime-model',
      modelDisplay: 'Runtime Model',
    },
    declaredModel: { modelId: 'configured-model', modelDisplay: 'Configured Model' },
  });

  assert.equal(identity.model_id, 'runtime-model');
  assert.equal(identity.model_display, 'Runtime Model');
  assert.equal(identity.identity_source, 'runtime');
});

test('Claude declared-model refresh retains session identity and records truthful source', () => {
  const prior = resolveIdentity({
    adapter: 'claude',
    role: 'reviewer',
    joinedAt,
    runtime: { sessionId: 'stable-claude-session' },
    declaredModel: { modelId: 'claude-old', modelDisplay: 'Claude Old' },
  });
  const current = resolveIdentity({
    adapter: 'claude',
    role: 'reviewer',
    joinedAt: '2026-09-08T13:00:00.000Z',
    runtime: { sessionId: 'stable-claude-session' },
    declaredModel: { modelId: 'claude-new', modelDisplay: 'Claude New' },
  });
  const review = { protocol: { review_id: 'review-claude', sequence: 4, revision: 2 } };

  assert.equal(current.session_fingerprint, prior.session_fingerprint);
  assert.equal(current.identity_source, 'declared');
  const changed = identityChangeEvent(review, prior, current, new Date(joinedAt));
  assert.equal(changed.type, 'identity-changed');
  assert.equal(changed.payload.identity.model_id, 'claude-new');
  assert.equal(changed.payload.identity.identity_source, 'declared');
});

test('labels declared fallback and generic capabilities conservatively', () => {
  const identity = resolveIdentity({
    adapter: 'codex',
    role: 'reviewer',
    joinedAt,
    runtime: {},
    declared: {
      host: 'other',
      provider: 'other',
      sessionId: 'manual-secret',
      modelId: 'manual-model',
      modelDisplay: 'Manual Model',
    },
  });
  assert.equal(identity.identity_source, 'declared');
  assert.deepEqual(genericAdapter.capabilities, ['manual', 'staleness-only']);
  for (const adapter of [codexAdapter, claudeAdapter, grokAdapter]) {
    assert.equal(Object.isFrozen(adapter), true);
  }
});

test('fails closed when multiple runtime providers are active', () => {
  assert.throws(
    () =>
      resolveIdentity({
        role: 'author',
        joinedAt,
        providers: {
          codex: { sessionId: 'codex-secret', modelId: 'gpt', modelDisplay: 'GPT' },
          claude: { sessionId: 'claude-secret', modelId: 'opus', modelDisplay: 'Opus' },
        },
      }),
    (error) => error.code === 'APR_IDENTITY_AMBIGUOUS'
  );
});

test('detects one injected official environment session and rejects ambiguous signals', () => {
  const identity = resolveIdentity({
    role: 'author',
    joinedAt,
    env: { CODEX_THREAD_ID: 'env-secret' },
    runtime: { modelId: 'gpt-env', modelDisplay: 'GPT Env' },
  });
  assert.equal(identity.host, 'codex');
  assert.equal(identity.model_id, 'gpt-env');
  assert.equal(JSON.stringify(identity).includes('env-secret'), false);

  assert.throws(
    () =>
      resolveIdentity({
        role: 'author',
        joinedAt,
        env: { CODEX_THREAD_ID: 'codex-secret', GROK_SESSION_ID: 'grok-secret' },
        runtime: { modelId: 'ambiguous', modelDisplay: 'Ambiguous' },
      }),
    (error) => error.code === 'APR_IDENTITY_AMBIGUOUS'
  );
});

test('distinctness follows session fingerprints, not provider or model', () => {
  const author = runtime('codex', 'session-author', 'same-model');
  const reviewer = { ...runtime('codex', 'session-reviewer', 'same-model'), role: 'reviewer' };
  assert.equal(assertDistinctParticipants(author, reviewer), true);
  assert.throws(
    () => assertDistinctParticipants(author, { ...author, role: 'reviewer' }),
    (error) => error.code === 'APR_IDENTITY_CONFLICT'
  );
});

test('model refresh emits an identity-change event without exposing raw IDs', () => {
  const prior = runtime('codex', 'stable-session', 'gpt-old');
  const current = {
    ...runtime('codex', 'stable-session', 'gpt-new'),
    joined_at: '2026-09-08T13:00:00.000Z',
  };
  const review = {
    protocol: { review_id: 'review-01', sequence: 4, revision: 2 },
  };
  const changed = identityChangeEvent(review, prior, current, new Date(joinedAt));
  assert.equal(changed.type, 'identity-changed');
  assert.equal(changed.revision, 2);
  assert.equal(changed.payload.identity.model_id, 'gpt-new');
  assert.equal(changed.payload.identity.joined_at, prior.joined_at);
  assert.equal(JSON.stringify(changed).includes('stable-session'), false);
  assert.equal(identityChangeEvent(review, current, { ...current }, new Date(joinedAt)), null);
});

test('participantIdentity returns a closed Task 4-compatible participant', () => {
  const identity = participantIdentity({
    role: 'author',
    host: 'codex',
    provider: 'openai',
    modelId: 'gpt-test',
    modelDisplay: 'GPT Test',
    sessionId: 'secret',
    source: 'runtime',
    joinedAt,
  });
  assert.deepEqual(Object.keys(identity).sort(), [
    'host',
    'identity_source',
    'joined_at',
    'model_display',
    'model_id',
    'provider',
    'role',
    'session_fingerprint',
  ]);
  assert.equal(Object.isFrozen(identity), true);
});

test('event authority rejects duplicate participants and fingerprint-changing refreshes', () => {
  const created = event('review-created');
  const duplicate = event('reviewer-joined', {
    sequence: 2,
    revision: 2,
    payload: { reviewer: participant('reviewer', FINGERPRINTS.author) },
  });
  assert.throws(
    () => reduceEvents([created, duplicate]),
    (error) => error.code === 'APR_INVALID_TRANSITION'
  );

  const reviewerTurn = reviewerTurnEvents();
  const replacement = event('identity-changed', {
    sequence: reviewerTurn.length + 1,
    revision: reviewerTurn.at(-1).revision,
    actor: FINGERPRINTS.replacement,
    payload: {
      role: 'reviewer',
      identity: participant('reviewer', FINGERPRINTS.replacement),
    },
  });
  assert.throws(
    () => reduceEvents([...reviewerTurn, replacement]),
    (error) => error.code === 'APR_INVALID_TRANSITION'
  );

  const rewrittenJoin = event('identity-changed', {
    sequence: reviewerTurn.length + 1,
    revision: reviewerTurn.at(-1).revision,
    actor: FINGERPRINTS.reviewer,
    payload: {
      role: 'reviewer',
      identity: {
        ...participant('reviewer'),
        model_id: 'gpt-refreshed',
        joined_at: '2026-09-08T13:00:00.000Z',
      },
    },
  });
  assert.throws(
    () => reduceEvents([...reviewerTurn, rewrittenJoin]),
    (error) => error.code === 'APR_INVALID_TRANSITION'
  );
});
