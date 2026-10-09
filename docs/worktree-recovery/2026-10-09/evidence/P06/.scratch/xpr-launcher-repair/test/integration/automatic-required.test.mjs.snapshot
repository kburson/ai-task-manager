import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { joinReview, startReview } from '../../src/cli/run.mjs';
import { participantIdentity } from '../../src/identity/registry.mjs';
import { inspectReview } from '../../src/protocol/service.mjs';
import { createNativePushTransport } from '../../src/transport/native-push.mjs';
import {
  negotiateAutomaticRequired,
  validateAutomaticParticipant,
} from '../../src/transport/registry.mjs';

const NOW = Date.parse('2026-09-11T09:00:00.000Z');

function repositoryFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'apr-automatic-'));
  execFileSync('git', ['init', '-b', 'trunk'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(root, 'docs/example.md'), '# Example\n');
  writeFileSync(path.join(root, '.git/info/exclude'), '.scratch/peer-review/\n');
  execFileSync('git', ['add', 'docs/example.md'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: root, stdio: 'ignore' });
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function identity(role, session) {
  return participantIdentity({
    role,
    host: 'codex',
    provider: 'openai',
    modelId: 'gpt-test',
    modelDisplay: 'GPT Test',
    sessionId: session,
    source: 'runtime',
    joinedAt: new Date(NOW).toISOString(),
  });
}

function lease(host, overrides = {}) {
  return {
    schema: 'ai-peer-review.resident-lease/v1',
    process_instance_id: `${host}-process-01`,
    pid: null,
    opaque_handle: `${host}:session-01`,
    host,
    adapter_version: '2.0.0',
    heartbeat_sequence: 7,
    observed_at: '2026-09-11T08:59:55.000Z',
    expires_at: '2026-09-11T09:00:30.000Z',
    ...overrides,
  };
}

function participant(capability, host, overrides = {}) {
  return {
    capability,
    adapter_version: '2.0.0',
    lease: lease(host),
    ...overrides,
  };
}

test('accepts two current live-wait participants only after an end-to-end health check', async () => {
  const author = participant('live-wait', 'codex');
  const reviewer = participant('live-wait', 'claude-code');
  let checked;
  const negotiated = await negotiateAutomaticRequired({
    author,
    reviewer,
    now: NOW,
    healthCheck: async (input) => {
      checked = input;
      return { healthy: true, reason: 'round-trip-ok' };
    },
  });

  assert.equal(checked.author.lease.process_instance_id, 'codex-process-01');
  assert.equal(checked.reviewer.lease.process_instance_id, 'claude-code-process-01');
  assert.deepEqual(negotiated, {
    mode: 'automatic-required',
    author_capability: 'live-wait',
    reviewer_capability: 'live-wait',
    adapter_version: '2.0.0',
    health: { healthy: true, reason: 'round-trip-ok' },
  });
  assert.equal(Object.isFrozen(negotiated), true);
});

test('accepts mixed live-wait and official native-push capabilities', async () => {
  const result = await negotiateAutomaticRequired({
    author: participant('live-wait', 'codex'),
    reviewer: participant('native-push', 'codex', { adapter: 'codex-app' }),
    now: NOW,
    healthCheck: async () => ({ healthy: true, reason: 'push-acknowledged' }),
  });
  assert.equal(result.reviewer_capability, 'native-push');
});

test('rejects manual and resume-only participants before health probing', async () => {
  for (const capability of ['manual', 'resume-only']) {
    let probed = false;
    await assert.rejects(
      negotiateAutomaticRequired({
        author: participant(capability, 'codex'),
        reviewer: participant('live-wait', 'claude-code'),
        now: NOW,
        healthCheck: async () => {
          probed = true;
          return { healthy: true };
        },
      }),
      (error) => {
        assert.equal(error.code, 'APR_TRANSPORT_UNAVAILABLE');
        assert.equal(error.details.reason, 'non-automatic-capability');
        assert.match(error.recovery, /manual/);
        return true;
      }
    );
    assert.equal(probed, false);
  }
});

test('rejects missing or unhealthy end-to-end health evidence', async () => {
  const input = {
    author: participant('live-wait', 'codex'),
    reviewer: participant('live-wait', 'claude-code'),
    now: NOW,
  };
  await assert.rejects(negotiateAutomaticRequired(input), {
    code: 'APR_TRANSPORT_UNAVAILABLE',
  });
  await assert.rejects(
    negotiateAutomaticRequired({
      ...input,
      healthCheck: async () => ({ healthy: false, reason: 'timeout' }),
    }),
    (error) => {
      assert.equal(error.code, 'APR_TRANSPORT_UNAVAILABLE');
      assert.equal(error.details.reason, 'timeout');
      return true;
    }
  );
});

test('rejects stale resident liveness and incompatible adapter versions', async () => {
  await assert.rejects(
    negotiateAutomaticRequired({
      author: participant('live-wait', 'codex', {
        lease: lease('codex', { expires_at: '2026-09-11T09:00:00.000Z' }),
      }),
      reviewer: participant('live-wait', 'claude-code'),
      now: NOW,
      healthCheck: async () => ({ healthy: true }),
    }),
    (error) => error.code === 'APR_TRANSPORT_UNAVAILABLE' && error.details.reason === 'expired'
  );
  await assert.rejects(
    negotiateAutomaticRequired({
      author: participant('live-wait', 'codex'),
      reviewer: participant('live-wait', 'claude-code', {
        adapter_version: '2.1.0',
        lease: lease('claude-code', { adapter_version: '2.1.0' }),
      }),
      now: NOW,
      healthCheck: async () => ({ healthy: true }),
    }),
    (error) =>
      error.code === 'APR_TRANSPORT_UNAVAILABLE' &&
      error.details.reason === 'incompatible-adapter-version'
  );
});

test('validates a closed automatic participant observation', () => {
  const validated = validateAutomaticParticipant(participant('live-wait', 'codex'), NOW);
  assert.equal(validated.capability, 'live-wait');
  assert.equal(validated.lease.capability, 'resident-liveness');
  assert.equal(Object.isFrozen(validated), true);

  assert.throws(
    () =>
      validateAutomaticParticipant(
        participant('native-push', 'codex', { adapter: 'generic', unexpected: true }),
        NOW
      ),
    (error) =>
      error.code === 'APR_TRANSPORT_UNAVAILABLE' && error.details.reason === 'invalid-observation'
  );
});

test('official native-push delivers through its injected host API', async () => {
  const calls = [];
  const transport = createNativePushTransport({
    adapter: 'codex-app',
    lease: lease('codex'),
    now: NOW,
    dispatch: async (input) => {
      calls.push(input);
      return { acknowledged: true, delivery_id: 'delivery-01' };
    },
  });
  const delivered = await transport.deliver({ invitation: '/repo/reviewer-invitation.md' });

  assert.deepEqual(calls, [
    {
      opaque_handle: 'codex:session-01',
      invitation: '/repo/reviewer-invitation.md',
    },
  ]);
  assert.deepEqual(delivered, {
    schema: 'ai-peer-review.delivery/v1',
    status: 'delivered',
    transport: 'native-push',
  });
});

test('official native-push delivers one exact wake capsule and reconciles its operation', async () => {
  const dispatches = [];
  const reconciliations = [];
  const transport = createNativePushTransport({
    adapter: 'codex-app',
    lease: lease('codex'),
    now: NOW,
    dispatch: async (input) => {
      dispatches.push(input);
      return { acknowledged: true };
    },
    reconcile: async (input) => {
      reconciliations.push(input);
      return { status: 'not-submitted', reason: 'no-host-operation' };
    },
  });
  const operation = {
    operation_id: `sha256:${'1'.repeat(64)}`,
    capsule_text: '{"schema":"ai-peer-review.wake-capsule/v1"}\n',
    capsule_digest: `sha256:${'2'.repeat(64)}`,
    expected_revision: 4,
    target_role: 'reviewer',
    target_session_fingerprint: `sha256:${'3'.repeat(64)}`,
  };

  assert.equal((await transport.deliver(operation)).status, 'delivered');
  assert.deepEqual(dispatches, [
    {
      opaque_handle: 'codex:session-01',
      operation_id: operation.operation_id,
      capsule_text: operation.capsule_text,
      capsule_digest: operation.capsule_digest,
      expected_revision: 4,
      target_role: 'reviewer',
      target_session_fingerprint: operation.target_session_fingerprint,
    },
  ]);
  assert.deepEqual(await transport.reconcile(operation), {
    status: 'not-submitted',
    reason: 'no-host-operation',
  });
  assert.deepEqual(reconciliations, [
    {
      opaque_handle: 'codex:session-01',
      operation_id: operation.operation_id,
      capsule_digest: operation.capsule_digest,
      expected_revision: 4,
      target_role: 'reviewer',
      target_session_fingerprint: operation.target_session_fingerprint,
    },
  ]);
});

test('native-push failure preserves delivery-pending and manual recovery', async () => {
  const transport = createNativePushTransport({
    adapter: 'codex-app',
    lease: lease('codex'),
    now: NOW,
    dispatch: async () => {
      throw new Error('host unavailable');
    },
  });
  const result = await transport.deliver({
    invitation: "/repo/reviewer's invitation.md",
  });
  assert.equal(result.status, 'delivery-pending');
  assert.equal(result.transport, 'native-push');
  assert.equal(result.reason, 'native-push-failed');
  assert.equal(result.manual.available, true);
  assert.match(result.manual.command, /peer-review join/);
});

test('native-push refuses generic adapters, diagnostic PIDs, and unacknowledged dispatch', async () => {
  for (const input of [
    { adapter: 'generic', lease: lease('other') },
    { adapter: 'codex-app', lease: lease('codex', { pid: 42, opaque_handle: null }) },
  ]) {
    assert.throws(
      () => createNativePushTransport({ ...input, now: NOW, dispatch: async () => ({}) }),
      { code: 'APR_TRANSPORT_UNAVAILABLE' }
    );
  }

  const transport = createNativePushTransport({
    adapter: 'codex-app',
    lease: lease('codex'),
    now: NOW,
    dispatch: async () => ({ acknowledged: false }),
  });
  assert.equal(
    (await transport.deliver({ invitation: '/repo/invitation.md' })).status,
    'delivery-pending'
  );
});

test('start seals automatic-required with a current non-manual author observation', async (t) => {
  const fx = repositoryFixture();
  t.after(fx.cleanup);
  const author = participant('live-wait', 'codex');
  const started = await startReview({
    cwd: fx.root,
    artifact: 'docs/example.md',
    artifactKind: 'spec',
    identity: identity('author', 'author-auto'),
    reviewId: 'review-automatic-required',
    transportMode: 'automatic-required',
    transportObservation: author,
    now: NOW,
  });

  assert.equal(started.review.transport_mode, 'automatic-required');
  assert.equal(started.review.author_transport_capability, 'live-wait');
  assert.equal(
    inspectReview(started.paths.workspace).protocol.startup.author_transport_capability,
    'live-wait'
  );
});

test('automatic-required join mutates only after current two-party health passes', async (t) => {
  const fx = repositoryFixture();
  t.after(fx.cleanup);
  const author = participant('live-wait', 'codex');
  const reviewer = participant('native-push', 'codex', { adapter: 'codex-app' });
  const started = await startReview({
    cwd: fx.root,
    artifact: 'docs/example.md',
    artifactKind: 'plan',
    identity: identity('author', 'author-auto-join'),
    reviewId: 'review-automatic-join',
    transportMode: 'automatic-required',
    transportObservation: author,
    now: NOW,
  });

  await assert.rejects(
    joinReview({
      cwd: fx.root,
      invitation: started.paths.reviewer_invitation,
      identity: identity('reviewer', 'reviewer-auto-join'),
      authorTransportObservation: author,
      transportObservation: reviewer,
      transportHealthCheck: async () => ({ healthy: false, reason: 'timeout' }),
      now: NOW,
    }),
    (error) => error.code === 'APR_TRANSPORT_UNAVAILABLE' && error.details.reason === 'timeout'
  );
  assert.equal(inspectReview(started.paths.workspace).protocol.state, 'awaiting-reviewer');

  const joined = await joinReview({
    cwd: fx.root,
    invitation: started.paths.reviewer_invitation,
    identity: identity('reviewer', 'reviewer-auto-join'),
    authorTransportObservation: author,
    transportObservation: reviewer,
    transportHealthCheck: async () => ({ healthy: true, reason: 'round-trip-ok' }),
    now: NOW,
  });
  assert.equal(joined.state, 'reviewer-turn');
  assert.deepEqual(inspectReview(started.paths.workspace).protocol.transports, {
    author: 'live-wait',
    reviewer: 'native-push',
  });
});

test('automatic-required start and join fail closed without resident observations', async (t) => {
  const fx = repositoryFixture();
  t.after(fx.cleanup);
  await assert.rejects(
    startReview({
      cwd: fx.root,
      artifact: 'docs/example.md',
      artifactKind: 'spec',
      identity: identity('author', 'author-auto-missing'),
      reviewId: 'review-automatic-missing',
      transportMode: 'automatic-required',
      now: NOW,
    }),
    { code: 'APR_TRANSPORT_UNAVAILABLE' }
  );
});
