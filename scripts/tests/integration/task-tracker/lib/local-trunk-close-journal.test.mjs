// @story #1826
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createTwoCloneHarness } from './delivery-waiver-journal-harness.mjs';
import { confirmsJournalEntry } from '../../../../task-tracker/lib/delivery-waiver-journal.mjs';
import {
  completeLocalTrunkClose,
  reserveLocalTrunkRevision,
  reserveLocalTrunkRevisionPost,
} from '../../../../task-tracker/lib/local-trunk-close-receipt.mjs';

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
    verifyPendingBurn: async () => true,
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
    verifyPendingBurn: async () => true,
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

const revision = Object.freeze({
  repository: burn.repository,
  issue: burn.issue,
  deliveryOperationId: burn.deliveryOperationId,
  priorGrantRecordId: burn.grantRecordId,
  revisionRecordId: '00000000000000000000000004',
  revisionGrantId: '00000000000000000000000005',
  revisionCreatedAt: '2026-09-26T12:00:02.000Z',
  revisionOperationId: digest('revocation operation'),
  action: 'revoke',
});

test('revision barrier winning Git CAS blocks the old grant burn on another clone', async (t) => {
  const h = await createTwoCloneHarness(1826, 'local-trunk');
  t.after(h.cleanup);
  const reserved = await reserveLocalTrunkRevision({ candidate: revision, journal: h.hostA });
  assert.equal(reserved.status, 'reserved');
  const retry = await reserveLocalTrunkRevision({
    candidate: {
      ...revision,
      revisionRecordId: '00000000000000000000000006',
      revisionGrantId: '00000000000000000000000007',
      revisionCreatedAt: '2026-09-26T12:00:03.000Z',
    },
    journal: h.hostB,
  });
  assert.equal(retry.status, 'existing');
  assert.equal(retry.barrier.entry.revisionRecordId, revision.revisionRecordId);
  const c = comments();
  await assert.rejects(
    completeLocalTrunkClose({
      candidate: burn,
      journal: h.hostB,
      comments: c,
      runId: 'host-b',
      verifyInitialBurn: async () => burn,
      verifyPendingBurn: async () => true,
    }),
    (error) => error.message.includes('revision-before-burn')
  );
  assert.equal(c.values.length, 0);
  assert.equal((await h.hostA.read()).operations.size, 0);
});

test('burn winning Git CAS remains ordered before a later revision', async (t) => {
  const h = await createTwoCloneHarness(1826, 'local-trunk');
  t.after(h.cleanup);
  const c = comments();
  const first = await completeLocalTrunkClose({
    candidate: burn,
    journal: h.hostA,
    comments: c,
    runId: 'host-a',
    verifyInitialBurn: async () => burn,
    verifyPendingBurn: async () => true,
  });
  const reserved = await reserveLocalTrunkRevision({ candidate: revision, journal: h.hostB });
  assert.equal(reserved.barrier.afterBurn, true);
  const state = await h.hostA.read();
  assert.ok(
    reserved.barrier.entry.sequence > state.operations.get(burn.deliveryOperationId).burnSequence
  );
  const retry = await completeLocalTrunkClose({
    candidate: burn,
    journal: h.hostB,
    comments: c,
    runId: 'host-b',
    verifyHistoricalBurn: async () => true,
  });
  assert.equal(retry.receipt.burnOid, first.receipt.burnOid);
  assert.equal(c.values.length, 1);
});

test('revision POST claim is one-shot across two Git clones', async (t) => {
  const h = await createTwoCloneHarness(1826, 'local-trunk');
  t.after(h.cleanup);
  await reserveLocalTrunkRevision({ candidate: revision, journal: h.hostA });
  const postCandidate = {
    repository: revision.repository,
    issue: revision.issue,
    deliveryOperationId: revision.deliveryOperationId,
    priorGrantRecordId: revision.priorGrantRecordId,
    revisionRecordId: revision.revisionRecordId,
    revisionOperationId: revision.revisionOperationId,
    runId: 'host-a',
  };
  const first = await reserveLocalTrunkRevisionPost({ candidate: postCandidate, journal: h.hostA });
  const retry = await reserveLocalTrunkRevisionPost({
    candidate: { ...postCandidate, runId: 'host-b' },
    journal: h.hostB,
  });
  assert.equal(first.status, 'reserved');
  assert.equal(retry.status, 'existing');
  assert.equal(first.post.oid, retry.post.oid);
  assert.equal(
    (await h.hostB.read()).barriers.get(revision.priorGrantRecordId).post.entry.runId,
    'host-a'
  );
  const laterRevision = {
    ...revision,
    priorGrantRecordId: '00000000000000000000000008',
    revisionRecordId: '00000000000000000000000009',
    revisionGrantId: '00000000000000000000000010',
    revisionOperationId: digest('other revision'),
  };
  await reserveLocalTrunkRevision({ candidate: laterRevision, journal: h.hostB });
  const laterTip = await h.hostA.read();
  assert.notEqual(laterTip.oid, first.post.oid);
  assert.equal(
    confirmsJournalEntry(laterTip, first.post.entry, 'local-trunk'),
    true,
    "the claim owner remains confirmed beneath another clone's later tip"
  );
  assert.equal(
    confirmsJournalEntry(laterTip, { ...first.post.entry, runId: 'host-b' }, 'local-trunk'),
    false
  );
});
