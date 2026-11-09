import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { EVENT_TYPES, eventAdvancesRevision, validateEvent } from '../../src/protocol/events.mjs';
import { event } from '../helpers/review-fixture.mjs';

test('schema artifacts identify the three closed v1 projections', () => {
  for (const [file, id] of [
    ['schemas/event-v1.json', 'ai-peer-review.event/v1'],
    ['schemas/protocol-v1.json', 'ai-peer-review.protocol/v1'],
    ['schemas/participants-v1.json', 'ai-peer-review.participants/v1'],
    ['schemas/runtime-v1.json', 'ai-peer-review.runtime/v1'],
  ]) {
    const schema = JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url)));
    assert.equal(schema.$id, id);
    assert.equal(schema.additionalProperties, false);
  }
});

test('event schema closes every event payload and nested object contract', () => {
  const schema = JSON.parse(readFileSync(new URL('../../schemas/event-v1.json', import.meta.url)));
  const schemaTypes = schema.oneOf.map((branch) => branch.properties.type.const);
  assert.deepEqual(schemaTypes.sort(), [...EVENT_TYPES].sort());
  assert.equal(schema.properties.actor.anyOf[1].$ref, '#/$defs/digest');
  for (const [name, definition] of Object.entries(schema.$defs)) {
    if (definition.type === 'object') {
      assert.equal(definition.additionalProperties, false, name);
    }
  }
});

test('accepts every closed event type with its canonical payload', () => {
  assert.equal(EVENT_TYPES.includes('superseded'), true);
  for (const type of EVENT_TYPES) assert.equal(validateEvent(event(type)), true, type);
});

test('rejects unknown event fields, types, and payload fields', () => {
  const valid = event('review-created');
  for (const invalid of [
    { ...valid, extra: true },
    { ...valid, type: 'future-event' },
    { ...valid, payload: { ...valid.payload, unexpected: true } },
  ]) {
    assert.throws(
      () => validateEvent(invalid),
      (error) => error.code === 'APR_EVENT_INVALID'
    );
  }
});

test('accepts optional sibling startup runtime but keeps legacy startup valid', () => {
  const created = event('review-created');
  const legacy = structuredClone(created);
  const runtime = {
    schema: 'ai-peer-review.runtime/v1',
    classification: 'XPR',
    ownership: 'broker',
    transport_mode: 'manual',
    reviewer: {
      selector: 'claude',
      provider: 'anthropic',
      host: 'claude-code',
      model_id: 'fixture-opus',
      model_display: 'Fixture Opus',
      effort: 'high',
    },
    adapter_version: '1.0.0',
    project_root_digest: 'a'.repeat(64),
  };
  assert.equal(validateEvent(legacy), true);
  assert.equal(
    validateEvent({
      ...created,
      payload: { ...created.payload, startup: { ...created.payload.startup, runtime } },
    }),
    true
  );
  assert.throws(
    () =>
      validateEvent({
        ...created,
        payload: {
          ...created.payload,
          startup: { ...created.payload.startup, runtime: { ...runtime, unexpected: true } },
        },
      }),
    (error) => error.code === 'APR_EVENT_INVALID'
  );
  assert.throws(
    () =>
      validateEvent({
        ...created,
        payload: {
          ...created.payload,
          startup: {
            ...created.payload.startup,
            transport_mode: 'resume-only',
            author_transport_capability: 'resume-only',
            runtime,
          },
        },
      }),
    (error) => error.code === 'APR_EVENT_INVALID'
  );
});

test('rejects malformed startup objects with the stable event error', () => {
  const created = event('review-created');
  assert.throws(
    () => validateEvent({ ...created, payload: { ...created.payload, startup: null } }),
    (error) => error.code === 'APR_EVENT_INVALID'
  );
});

test('rejects prototype-key event types with the stable event error', () => {
  for (const type of ['toString', 'constructor', '__proto__']) {
    assert.throws(
      () => validateEvent({ ...event('review-created'), type }),
      (error) => error.code === 'APR_EVENT_INVALID'
    );
    assert.throws(
      () => eventAdvancesRevision(type),
      (error) => error.code === 'APR_EVENT_INVALID'
    );
  }
});

test('rejects malformed envelope identifiers, integers, actors, and times', () => {
  const valid = event('review-created');
  for (const patch of [
    { review_id: '../escape' },
    { sequence: 0 },
    { revision: -1 },
    { actor: '' },
    { at: 'tomorrow' },
    { at: '2026-02-30T12:00:00.000Z' },
  ]) {
    assert.throws(
      () => validateEvent({ ...valid, ...patch }),
      (error) => error.code === 'APR_EVENT_INVALID'
    );
  }
  assert.equal(validateEvent({ ...valid, at: '2028-02-29T12:00:00Z' }), true);
});

test('rejects malformed nested payload values with one stable error code', () => {
  const noCommit = event('review-created');
  noCommit.payload.commit_mode = 'no-commit';
  noCommit.payload.startup.no_commit_baseline = {
    head: '1'.repeat(40),
    index_digest: `sha256:${'2'.repeat(64)}`,
    worktree_digest: `sha256:${'3'.repeat(64)}`,
    changed_paths: [],
  };
  const cases = [
    event('review-created', { payload: { max_turns: 'unbounded' } }),
    event('review-created', {
      payload: {
        startup: {
          ...event('review-created').payload.startup,
          no_commit_baseline: noCommit.payload.startup.no_commit_baseline,
        },
      },
    }),
    event('review-created', {
      payload: {
        authority: {
          authority_policy: 'detection-allowed',
          challenge_ttl_ms: 15 * 60 * 1000,
          verifier: {
            kind: 'ed25519',
            verifier_id: 'test:fixture-a',
            verifier_fingerprint: `sha256:${'4'.repeat(64)}`,
            public_key: 'test key',
            assurance_grade: 'test-fixture',
            signer_strength: 'unverified-test',
          },
        },
      },
    }),
    event('reviewer-accepted', { payload: { turn: Number.MAX_SAFE_INTEGER + 1 } }),
    event('turn-claimed', { payload: { claim: null } }),
    event('turn-claimed', {
      payload: { claim: { ...event('turn-claimed').payload.claim, unexpected: true } },
    }),
    event('reviewer-joined', {
      payload: {
        reviewer: { ...event('reviewer-joined').payload.reviewer, identity_source: 'guessed' },
      },
    }),
    event('delivery-written', {
      payload: {
        delivery: { delivery_id: '../escape', recipient: 'reviewer', digest: 'not-a-digest' },
      },
    }),
  ];

  for (const invalid of cases) {
    assert.throws(
      () => validateEvent(invalid),
      (error) => error.code === 'APR_EVENT_INVALID'
    );
  }
});

test('no-commit handoff events bind the canonical snapshot path and artifact digest', () => {
  for (const type of [
    'author-revision-sealed-no-commit',
    'author-closing-round-sealed-no-commit',
  ]) {
    const valid = event(type);
    valid.payload.snapshot.digest = valid.payload.artifact.digest;
    assert.equal(validateEvent(valid), true);
    for (const snapshot of [
      { ...valid.payload.snapshot, path: `artifacts/turn-${valid.payload.turn + 1}.md` },
      { ...valid.payload.snapshot, digest: `sha256:${'f'.repeat(64)}` },
    ]) {
      assert.throws(
        () => validateEvent({ ...valid, payload: { ...valid.payload, snapshot } }),
        (error) => error.code === 'APR_EVENT_INVALID'
      );
    }
  }
});
