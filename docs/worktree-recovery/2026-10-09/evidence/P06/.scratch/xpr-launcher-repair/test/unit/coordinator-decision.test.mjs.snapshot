import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalWakeCapsule,
  decideWake,
  wakeOperationKey,
} from '../../src/coordinator/decision.mjs';

const NOW = Date.parse('2026-09-13T12:00:00.000Z');
const REVIEWER = `sha256:${'b'.repeat(64)}`;
const AUTHOR = `sha256:${'a'.repeat(64)}`;
const DIGEST = `sha256:${'d'.repeat(64)}`;

function lease() {
  return {
    schema: 'ai-peer-review.resident-lease/v1',
    process_instance_id: 'reviewer-process-01',
    pid: null,
    opaque_handle: 'codex:reviewer-session',
    host: 'codex',
    adapter_version: '2.0.0',
    heartbeat_sequence: 4,
    observed_at: '2026-09-13T11:59:55.000Z',
    expires_at: '2026-09-13T12:01:00.000Z',
  };
}

function authority(overrides = {}) {
  const protocol = {
    review_id: 'review-decision-01',
    sequence: 7,
    revision: 4,
    state: 'reviewer-turn',
    current_actor: 'reviewer',
    next_action: 'reviewer-submit',
    intervention: null,
    ...overrides.protocol,
  };
  return {
    state: {
      protocol,
      participants: {
        author: { role: 'author', session_fingerprint: AUTHOR },
        reviewer: { role: 'reviewer', session_fingerprint: REVIEWER },
      },
    },
    events: [],
  };
}

function observation(overrides = {}) {
  return {
    session_fingerprint: REVIEWER,
    capability: 'native-push',
    adapter: 'codex-app',
    adapter_version: '2.0.0',
    lease: lease(),
    ...overrides,
  };
}

function delivery(overrides = {}) {
  return {
    delivery_id: 'author-turn-1-to-reviewer',
    recipient: 'reviewer',
    digest: DIGEST,
    sequence: 7,
    revision: 4,
    receipt_verified: true,
    ...overrides,
  };
}

test('derives an immutable pointer capsule and key from durable authority', () => {
  const decision = decideWake({
    authority: authority(),
    delivery: delivery(),
    observation: observation(),
    workspace: '/repo/.scratch/peer-review/review-decision-01',
    platform: 'linux',
    now: NOW,
  });

  assert.equal(decision.kind, 'wake');
  assert.equal(decision.capsule.review_id, 'review-decision-01');
  assert.equal(decision.capsule.expected_revision, 4);
  assert.equal(decision.capsule.target_role, 'reviewer');
  assert.equal(decision.capsule.reason, 'role-actionable');
  assert.match(decision.capsule.next_command, /^peer-review resume /);
  assert.equal(canonicalWakeCapsule(decision).length <= 2048, true);
  assert.match(wakeOperationKey(decision), /^sha256:[0-9a-f]{64}$/);
  assert.equal(Object.isFrozen(decision.capsule), true);
});

test('unchanged acknowledged revisions remain idle without a capsule', () => {
  assert.deepEqual(
    decideWake({
      authority: authority(),
      delivery: delivery(),
      observation: observation(),
      workspace: '/repo/.scratch/peer-review/review-decision-01',
      acknowledgedRevision: 4,
      now: NOW,
    }),
    { kind: 'idle', reason: 'unchanged-revision', revision: 4 }
  );
});

test('fails closed on role, receipt, identity, liveness, and capability mismatches', () => {
  const base = {
    authority: authority(),
    delivery: delivery(),
    observation: observation(),
    workspace: '/repo/.scratch/peer-review/review-decision-01',
    now: NOW,
  };
  for (const input of [
    { ...base, delivery: delivery({ recipient: 'author' }) },
    { ...base, delivery: delivery({ receipt_verified: false }) },
    { ...base, observation: observation({ session_fingerprint: AUTHOR }) },
    {
      ...base,
      observation: observation({ lease: { ...lease(), expires_at: '2026-09-13T12:00:00.000Z' } }),
    },
    { ...base, observation: observation({ capability: 'manual', adapter: undefined }) },
  ]) {
    assert.throws(
      () => decideWake(input),
      (error) => /^APR_/.test(error.code)
    );
  }
});

test('terminal and intervention projections select bounded author pointers', () => {
  const terminal = decideWake({
    authority: authority({
      protocol: { state: 'accepted', current_actor: null, next_action: null, revision: 5 },
    }),
    delivery: null,
    observation: observation({ session_fingerprint: AUTHOR, lease: lease() }),
    workspace: '/repo/.scratch/peer-review/review-decision-01',
    now: NOW,
  });
  assert.equal(terminal.kind, 'terminal');
  assert.equal(terminal.capsule.target_role, 'author');
  assert.equal(terminal.capsule.reason, 'protocol-terminal');

  const intervention = decideWake({
    authority: authority({
      protocol: {
        state: 'intervention-required',
        current_actor: 'human',
        next_action: 'human-intervention',
        revision: 6,
        intervention: { interrupted_state: 'reviewer-turn' },
      },
    }),
    delivery: null,
    observation: observation({ session_fingerprint: AUTHOR }),
    workspace: '/repo/.scratch/peer-review/review-decision-01',
    now: NOW,
  });
  assert.equal(intervention.kind, 'intervention');
  assert.equal(intervention.capsule.target_role, 'author');
  assert.equal(intervention.capsule.reason, 'human-intervention-required');
});

test('rejects caller-selected workspace and oversized command bytes', () => {
  assert.throws(
    () =>
      decideWake({
        authority: authority(),
        delivery: delivery(),
        observation: observation(),
        workspace: `/${'x'.repeat(2200)}`,
        now: NOW,
      }),
    (error) => error.code === 'APR_WAKE_CAPSULE_INVALID'
  );
});
