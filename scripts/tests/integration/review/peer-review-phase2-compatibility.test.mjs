// @story #1549 #1609
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const adapterPath = path.join(repoRoot, 'scripts/task-tracker/lib/peer-review-adapter.mjs');
const rootPackage = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const packageJson = JSON.parse(
  readFileSync(path.join(repoRoot, 'node_modules/ai-peer-review/package.json'), 'utf8')
);
const now = Date.parse('2026-09-11T12:00:00Z');

function lease({
  instance,
  host = 'codex',
  pid = 200,
  opaqueHandle = null,
  adapterVersion = '0.2.0',
  expiresAt = '2026-09-11T12:05:00Z',
} = {}) {
  return {
    schema: 'ai-peer-review.resident-lease/v1',
    process_instance_id: instance,
    pid,
    opaque_handle: opaqueHandle,
    host,
    adapter_version: adapterVersion,
    heartbeat_sequence: 1,
    observed_at: '2026-09-11T11:59:00Z',
    expires_at: expiresAt,
  };
}

test('AITM pins the exact verified Phase 2 package and exposes only its public API', async () => {
  const { installedPeerReviewApi } = await import(adapterPath);

  assert.equal(rootPackage.dependencies['ai-peer-review'], '0.2.1');
  assert.equal(packageJson.name, 'ai-peer-review');
  assert.equal(packageJson.version, '0.2.1');
  assert.equal(packageJson.exports, './src/public-api.mjs');
  assert.equal(Object.isFrozen(installedPeerReviewApi), true);
  assert.deepEqual(Object.keys(installedPeerReviewApi).sort(), [
    'createNativePushTransport',
    'negotiateAutomaticRequired',
    'residentHealth',
    'statusReview',
    'validateAutomaticParticipant',
    'validateResidentLease',
  ]);
  for (const implementation of Object.values(installedPeerReviewApi)) {
    assert.equal(typeof implementation, 'function');
  }
});

test('Phase 2 resident and automatic policy remains package-owned and opt-in', async () => {
  const { installedPeerReviewApi } = await import(adapterPath);
  const authorLease = lease({ instance: 'author-process', pid: 201 });
  const reviewerLease = lease({ instance: 'reviewer-process', pid: 202 });

  const validated = installedPeerReviewApi.validateResidentLease(authorLease, now);
  assert.equal(validated.capability, 'resident-liveness');
  assert.equal(Object.isFrozen(validated), true);
  assert.deepEqual(
    installedPeerReviewApi.residentHealth(
      authorLease,
      { host: 'codex', adapter_version: '0.2.0' },
      now
    ),
    { healthy: true, reason: 'ok', lease: validated }
  );
  assert.equal(
    installedPeerReviewApi.residentHealth(
      authorLease,
      { host: 'codex', adapter_version: '0.1.0' },
      now
    ).reason,
    'adapter-downgrade'
  );
  assert.throws(
    () =>
      installedPeerReviewApi.validateResidentLease(
        lease({ instance: 'expired', expiresAt: '2026-09-11T12:00:00Z' }),
        now
      ),
    (error) => error.code === 'APR_PARTICIPANT_LOSS' && error.details.reason === 'expired'
  );

  const author = { capability: 'live-wait', adapter_version: '0.2.0', lease: authorLease };
  const reviewer = { capability: 'live-wait', adapter_version: '0.2.0', lease: reviewerLease };
  const automatic = await installedPeerReviewApi.negotiateAutomaticRequired({
    author,
    reviewer,
    now,
    healthCheck: async (participants) => {
      assert.equal(Object.isFrozen(participants), true);
      return { healthy: true, reason: 'round-trip-ok' };
    },
  });
  assert.deepEqual(automatic, {
    mode: 'automatic-required',
    author_capability: 'live-wait',
    reviewer_capability: 'live-wait',
    adapter_version: '0.2.0',
    health: { healthy: true, reason: 'round-trip-ok' },
  });
  for (const capability of ['manual', 'resume-only']) {
    assert.throws(
      () =>
        installedPeerReviewApi.validateAutomaticParticipant({
          capability,
          adapter_version: '0.2.0',
          lease: authorLease,
        }),
      (error) =>
        error.code === 'APR_TRANSPORT_UNAVAILABLE' &&
        error.details.reason === 'non-automatic-capability'
    );
  }
});

test('Phase 2 native-push delegates official delivery and preserves manual recovery', async () => {
  const { installedPeerReviewApi } = await import(adapterPath);
  const nativeLease = lease({
    instance: 'codex-native-process',
    pid: null,
    opaqueHandle: 'official-thread-handle',
  });
  const delivered = installedPeerReviewApi.createNativePushTransport({
    adapter: 'codex-app',
    lease: nativeLease,
    now,
    dispatch: async (request) => {
      assert.deepEqual(request, {
        opaque_handle: 'official-thread-handle',
        invitation: '/repo/reviews/invitation.md',
      });
      return { acknowledged: true };
    },
  });
  assert.deepEqual(await delivered.deliver({ invitation: '/repo/reviews/invitation.md' }), {
    schema: 'ai-peer-review.delivery/v1',
    status: 'delivered',
    transport: 'native-push',
  });

  const pending = installedPeerReviewApi.createNativePushTransport({
    adapter: 'codex-app',
    lease: nativeLease,
    now,
    dispatch: async () => ({ acknowledged: false }),
  });
  const result = await pending.deliver({ invitation: '/repo/reviews/invitation.md' });
  assert.equal(result.status, 'delivery-pending');
  assert.equal(result.transport, 'native-push');
  assert.equal(result.manual.available, true);
  assert.match(result.manual.command, /peer-review join/);
});
