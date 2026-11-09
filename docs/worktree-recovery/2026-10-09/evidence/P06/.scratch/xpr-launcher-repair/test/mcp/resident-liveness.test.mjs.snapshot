import assert from 'node:assert/strict';
import test from 'node:test';

import {
  refreshResidentLease,
  residentHealth,
  residentLivenessEvent,
  validateResidentLease,
} from '../../src/transport/resident.mjs';
import { reduceEvents } from '../../src/protocol/reducer.mjs';
import { claim, event, FINGERPRINTS, reviewerTurnEvents } from '../helpers/review-fixture.mjs';

const NOW = Date.parse('2026-09-11T09:00:00.000Z');

function lease(overrides = {}) {
  return {
    schema: 'ai-peer-review.resident-lease/v1',
    process_instance_id: 'process-01',
    pid: 4242,
    opaque_handle: null,
    host: 'codex',
    adapter_version: '2.0.0',
    heartbeat_sequence: 1,
    observed_at: '2026-09-11T08:59:55.000Z',
    expires_at: '2026-09-11T09:00:30.000Z',
    ...overrides,
  };
}

test('validates one closed current resident lease without probing its PID', () => {
  const input = lease();
  const validated = validateResidentLease(input, NOW);
  assert.deepEqual(validated, { ...input, capability: 'resident-liveness' });
  assert.equal(Object.isFrozen(validated), true);
});

test('accepts one official opaque handle instead of a diagnostic PID', () => {
  const validated = validateResidentLease(
    lease({ pid: null, opaque_handle: 'host-process:opaque-01' }),
    NOW
  );
  assert.equal(validated.opaque_handle, 'host-process:opaque-01');
});

test('accepts the package ISO timestamp form for the observation clock', () => {
  assert.equal(
    validateResidentLease(lease(), '2026-09-11T09:00:00.000Z').process_instance_id,
    'process-01'
  );
});

test('rejects incomplete unknown stale and ambiguous resident observations', () => {
  const cases = [
    { value: { ...lease(), host: undefined }, reason: 'incomplete' },
    { value: { ...lease(), unexpected: true }, reason: 'unknown-fields' },
    { value: lease({ pid: null, opaque_handle: null }), reason: 'ambiguous-handle' },
    { value: lease({ opaque_handle: 'also-present' }), reason: 'ambiguous-handle' },
    { value: lease({ pid: 0 }), reason: 'ambiguous-handle' },
    { value: lease({ heartbeat_sequence: 0 }), reason: 'incomplete' },
    { value: lease({ observed_at: 'invalid' }), reason: 'incomplete' },
    {
      value: lease({ expires_at: '2026-09-11T08:59:55.000Z' }),
      reason: 'expired',
    },
    {
      value: lease({ expires_at: '2026-09-11T09:00:00.000Z' }),
      reason: 'expired',
    },
  ];
  for (const { value, reason } of cases) {
    assert.throws(
      () => validateResidentLease(value, NOW),
      (error) => {
        assert.equal(error.code, 'APR_PARTICIPANT_LOSS');
        assert.equal(error.details.reason, reason);
        assert.equal(error.recovery, 'peer-review status <workspace> --next');
        return true;
      }
    );
  }
});

test('refreshes only the same resident instance with a later heartbeat', () => {
  const previous = validateResidentLease(lease(), NOW);
  const next = refreshResidentLease(
    previous,
    lease({
      heartbeat_sequence: 2,
      observed_at: '2026-09-11T09:00:05.000Z',
      expires_at: '2026-09-11T09:00:35.000Z',
    }),
    Date.parse('2026-09-11T09:00:06.000Z')
  );
  assert.equal(next.heartbeat_sequence, 2);
  assert.equal(Object.isFrozen(next), true);
});

test('rejects PID reuse process replacement downgrade and non-advancing heartbeats', () => {
  const previous = validateResidentLease(lease(), NOW);
  const changed = [
    [lease({ process_instance_id: 'process-02', heartbeat_sequence: 2 }), 'participant-loss'],
    [lease({ pid: 4243, heartbeat_sequence: 2 }), 'participant-loss'],
    [lease({ host: 'claude-code', heartbeat_sequence: 2 }), 'participant-loss'],
    [lease({ adapter_version: '1.9.0', heartbeat_sequence: 2 }), 'adapter-downgrade'],
    [lease({ heartbeat_sequence: 1 }), 'participant-loss'],
    [
      lease({
        heartbeat_sequence: 2,
        observed_at: '2026-09-11T08:59:54.000Z',
      }),
      'participant-loss',
    ],
  ];
  for (const [candidate, reason] of changed) {
    assert.throws(
      () => refreshResidentLease(previous, candidate, NOW),
      (error) => {
        assert.equal(error.code, 'APR_PARTICIPANT_LOSS');
        assert.equal(error.details.reason, reason);
        return true;
      }
    );
  }
});

test('classifies current expiry downgrade and participant-loss without liveness mutation', () => {
  const current = lease();
  assert.deepEqual(residentHealth(current, { host: 'codex', adapter_version: '2.0.0' }, NOW), {
    healthy: true,
    reason: 'ok',
    lease: validateResidentLease(current, NOW),
  });
  assert.deepEqual(residentHealth(current, { host: 'codex', adapter_version: '2.1.0' }, NOW), {
    healthy: false,
    reason: 'adapter-downgrade',
    lease: null,
  });
  assert.deepEqual(
    residentHealth(current, { host: 'claude-code', adapter_version: '2.0.0' }, NOW),
    { healthy: false, reason: 'participant-loss', lease: null }
  );
  assert.deepEqual(
    residentHealth(
      current,
      { host: 'codex', adapter_version: '2.0.0' },
      Date.parse(current.expires_at)
    ),
    { healthy: false, reason: 'expired', lease: null }
  );
});

test('derives the existing participant-loss intervention for an expired active resident', () => {
  const prefix = reviewerTurnEvents().map((item, index) =>
    index === 0
      ? {
          ...item,
          payload: {
            ...item.payload,
            startup: {
              ...item.payload.startup,
              transport_mode: 'automatic-required',
              author_transport_capability: 'live-wait',
            },
          },
        }
      : index === 1
        ? { ...item, payload: { ...item.payload, transport_capability: 'live-wait' } }
        : item
  );
  prefix.push(
    event('turn-claimed', {
      sequence: prefix.length + 1,
      revision: prefix.at(-1).revision,
      actor: FINGERPRINTS.reviewer,
      payload: { claim: claim('reviewer') },
    })
  );
  const state = reduceEvents(prefix);
  const intervention = residentLivenessEvent(
    state,
    'reviewer',
    lease({ expires_at: '2026-09-11T09:00:00.000Z' }),
    { host: 'codex', adapter_version: '2.0.0' },
    NOW
  );
  const reduced = reduceEvents([...prefix, intervention]);
  assert.equal(intervention.type, 'intervention-entered');
  assert.equal(intervention.payload.reason, 'participant-loss');
  assert.equal(intervention.payload.interrupted_state, 'reviewer-turn');
  assert.equal(reduced.protocol.state, 'intervention-required');
  assert.equal(reduced.protocol.intervention.reason, 'participant-loss');
});
