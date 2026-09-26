// @story #1826
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createTwoCloneHarness } from './delivery-waiver-journal-harness.mjs';
import { completeLocalTrunkClose } from '../../../../task-tracker/lib/local-trunk-close-receipt.mjs';

const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const burn = Object.freeze({
  schema: 'aitm.local-trunk-close-burn/v1',
  repository: 'example/project',
  issue: 1826,
  deliveryOperationId: '00000000000000000000000001',
  grantRecordId: '00000000000000000000000002',
  grantRevision: 1,
  scopeIdentity: digest('scope'),
  waiverScopeDigest: digest('waiver scope'),
  waiverReasonDigest: digest('reason'),
  grantDigest: digest('grant'),
  acceptedHeadSha: 'a'.repeat(40),
  baseRef: 'trunk',
  resolvedTrunkRef: 'origin/trunk',
  authorizedAt: '2026-09-26T12:00:00.000Z',
});

function comments() {
  const values = [];
  return {
    values,
    list: async () => [...values],
    async post({ body }) {
      const comment = { id: `C${values.length + 1}`, body, createdAt: '2026-09-26T12:00:01.000Z' };
      values.push(comment);
      return comment;
    },
  };
}

test('two Git clones share one local-trunk burn and exact receipt', async (t) => {
  const h = await createTwoCloneHarness(1826, 'local-trunk');
  t.after(h.cleanup);
  const c = comments();
  const first = await completeLocalTrunkClose({
    candidate: burn,
    journal: h.hostA,
    comments: c,
    runId: 'host-a',
    verifyInitialBurn: async () => burn,
  });
  const retry = await completeLocalTrunkClose({
    candidate: burn,
    journal: h.hostB,
    comments: c,
    runId: 'host-b',
    verifyHistoricalBurn: async () => true,
  });
  assert.equal(first.receipt.burnOid, retry.receipt.burnOid);
  assert.equal(retry.status, 'existing');
  assert.equal(c.values.length, 1);
  assert.equal((await h.hostB.read()).operations.get(burn.deliveryOperationId).state, 'completed');
  assert.ok((await h.git(h.a, ['ls-remote', 'origin', h.hostA.ref])).includes(h.hostA.ref));
});

test('different operation cannot replay one grant across Git clones', async (t) => {
  const h = await createTwoCloneHarness(1826, 'local-trunk');
  t.after(h.cleanup);
  const c = comments();
  await completeLocalTrunkClose({
    candidate: burn,
    journal: h.hostA,
    comments: c,
    runId: 'host-a',
    verifyInitialBurn: async () => burn,
  });
  const other = { ...burn, deliveryOperationId: '00000000000000000000000003' };
  await assert.rejects(
    completeLocalTrunkClose({
      candidate: other,
      journal: h.hostB,
      comments: c,
      runId: 'host-b',
      verifyInitialBurn: async () => other,
    }),
    (error) => error.message.includes('grant-replay')
  );
  assert.equal(c.values.length, 1);
});
