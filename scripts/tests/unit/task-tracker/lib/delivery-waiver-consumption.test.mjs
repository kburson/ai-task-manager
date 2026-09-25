// @story #1787 #1796
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ensureWaiverIntent,
  ensureDeliveryWaiverBurn,
  publishWaivedReceipt,
} from '../../../../task-tracker/lib/delivery-waiver-consumption.mjs';
import { createMemoryJournal } from './delivery-waiver-consumption-fixtures.mjs';
import {
  repository,
  issue,
  operationId,
  intent,
  burn,
  digest,
  intentRecord,
  renderIntent,
  renderReceipt,
  verifiedInitialBurn,
} from './delivery-waiver-consumption-fixtures.mjs';

const comment = (body, id) => ({ body, id, createdAt: '2026-09-25T00:01:00.000Z' });
const intentComments = () => {
  const all = [];
  return {
    all,
    async list() {
      return all;
    },
    async post(body) {
      const c = comment(body, 'C1');
      all.push(c);
      return c;
    },
  };
};

test('reserves intent before one POST and resumes exact confirmed transaction', async () => {
  const journal = createMemoryJournal({ repository, issue });
  const comments = {
    all: [],
    posts: 0,
    async list() {
      return this.all;
    },
    async post(body) {
      this.posts++;
      const c = comment(body, `C${this.posts}`);
      this.all.push(c);
      return c;
    },
  };
  const candidate = { repository, issue, deliveryOperationId: operationId, ...intent };
  const first = await ensureWaiverIntent({ candidate, journal, comments, runId: 'run-a' });
  const second = await ensureWaiverIntent({ candidate, journal, comments, runId: 'run-b' });
  assert.equal(first.comment.id, second.comment.id);
  assert.equal(comments.posts, 1);
  assert.equal((await journal.read()).operations.get(operationId).state, 'intent-confirmed');
});

test('one operation cannot change intent or burn after consumption', async () => {
  const journal = createMemoryJournal({ repository, issue });
  const comments = intentComments();
  const candidate = { repository, issue, deliveryOperationId: operationId, ...intent };
  await ensureWaiverIntent({ candidate, journal, comments, runId: 'run-a' });
  await assert.rejects(
    ensureWaiverIntent({
      candidate: {
        ...candidate,
        intentId: 'other',
        intentBody: renderIntent({ ...intentRecord, intentId: 'other' }),
        intentDigest: digest(renderIntent({ ...intentRecord, intentId: 'other' })),
      },
      journal,
      comments,
      runId: 'run-b',
    }),
    /replay|mismatch/
  );
  const first = await ensureDeliveryWaiverBurn({
    candidate: burn,
    journal,
    verifyInitialBurn: verifiedInitialBurn,
  });
  assert.match(first.burnOid, /^[0-9a-f]{40}$/);
  assert.equal(
    (await ensureDeliveryWaiverBurn({ candidate: burn, journal })).burnOid,
    first.burnOid
  );
  await assert.rejects(
    ensureDeliveryWaiverBurn({ candidate: { ...burn, waiverRevision: 2 }, journal }),
    /replay|mismatch/
  );
});

test('unresolved receipt request is indeterminate and never posts again', async () => {
  const journal = createMemoryJournal({ repository, issue });
  const intentCandidate = { repository, issue, deliveryOperationId: operationId, ...intent };
  await ensureWaiverIntent({
    candidate: intentCandidate,
    journal,
    comments: intentComments(),
    runId: 'run-a',
  });
  await ensureDeliveryWaiverBurn({
    candidate: burn,
    journal,
    verifyInitialBurn: verifiedInitialBurn,
  });
  let posts = 0;
  const comments = {
    async list() {
      return [];
    },
    async post() {
      posts++;
      throw Error('lost response');
    },
  };
  const input = {
    burn,
    burnOid: (await journal.read()).operations.get(operationId).burnOid,
    receiptBody: renderReceipt(),
    receiptDigest: digest(renderReceipt()),
    journal,
    comments,
    runId: 'run-a',
  };
  await assert.rejects(
    publishWaivedReceipt(input),
    (error) =>
      error.category === 'delivery-waiver-ambiguity' &&
      error.outcome === 'indeterminate' &&
      error.pendingStage === 'receipt-requesting'
  );
  await assert.rejects(
    publishWaivedReceipt({ ...input, runId: 'run-b' }),
    /delivery-waiver-ambiguity/
  );
  assert.equal(posts, 1);
});

test('lost intent POST response permits exact readback but never a second POST', async () => {
  const journal = createMemoryJournal({ repository, issue });
  const all = [];
  let posts = 0;
  const comments = {
    async list() {
      return all;
    },
    async post(body) {
      posts++;
      all.push(comment(body, 'C1'));
      throw Error('response lost');
    },
  };
  const candidate = { repository, issue, deliveryOperationId: operationId, ...intent };
  const first = await ensureWaiverIntent({ candidate, journal, comments, runId: 'run-a' });
  const second = await ensureWaiverIntent({ candidate, journal, comments, runId: 'run-b' });
  assert.equal(first.comment.id, 'C1');
  assert.equal(second.comment.id, 'C1');
  assert.equal(posts, 1);
});

test('unresolved intent request blocks all later POSTs and burn', async () => {
  const journal = createMemoryJournal({ repository, issue });
  let posts = 0;
  const comments = {
    async list() {
      return [];
    },
    async post() {
      posts++;
      throw Error('lost outcome');
    },
  };
  const candidate = { repository, issue, deliveryOperationId: operationId, ...intent };
  await assert.rejects(
    ensureWaiverIntent({ candidate, journal, comments, runId: 'run-a' }),
    (error) =>
      error.outcome === 'indeterminate' &&
      error.pendingStage === 'intent-requesting' &&
      error.approvalBurned === false
  );
  await assert.rejects(
    ensureWaiverIntent({ candidate, journal, comments, runId: 'run-b' }),
    /delivery-waiver-ambiguity/
  );
  await assert.rejects(
    ensureDeliveryWaiverBurn({ candidate: burn, journal, verifyInitialBurn: verifiedInitialBurn }),
    /delivery-waiver-authority/
  );
  assert.equal(posts, 1);
});

test('different operation cannot reserve an already owned original intent', async () => {
  const journal = createMemoryJournal({ repository, issue });
  const all = [];
  const comments = {
    async list() {
      return all;
    },
    async post(body) {
      const c = comment(body, 'C1');
      all.push(c);
      return c;
    },
  };
  const candidate = { repository, issue, deliveryOperationId: operationId, ...intent };
  await ensureWaiverIntent({ candidate, journal, comments, runId: 'run-a' });
  await assert.rejects(
    ensureWaiverIntent({
      candidate: {
        ...candidate,
        deliveryOperationId: 'other-op',
        intentId: 'other-intent',
        intentBody: renderIntent({
          ...intentRecord,
          deliveryOperationId: 'other-op',
          intentId: 'other-intent',
        }),
        intentDigest: digest(
          renderIntent({
            ...intentRecord,
            deliveryOperationId: 'other-op',
            intentId: 'other-intent',
          })
        ),
      },
      journal,
      comments,
      runId: 'run-b',
    }),
    /delivery-waiver-replay/
  );
  assert.equal(all.length, 1);
});

test('unrelated operation advances tip without changing the first burn OID', async () => {
  const journal = createMemoryJournal({ repository, issue });
  const all = [];
  const comments = {
    async list() {
      return all;
    },
    async post(body) {
      const c = comment(body, `C${all.length + 1}`);
      all.push(c);
      return c;
    },
  };
  const first = { repository, issue, deliveryOperationId: operationId, ...intent };
  await ensureWaiverIntent({ candidate: first, journal, comments, runId: 'run-a' });
  const burned = await ensureDeliveryWaiverBurn({
    candidate: burn,
    journal,
    verifyInitialBurn: verifiedInitialBurn,
  });
  const other = {
    ...first,
    deliveryOperationId: 'other-operation',
    originalIntentId: 'other-original',
    originalIntentDigest: digest('other'),
    intentId: 'other-intent',
    intentBody: renderIntent({
      ...intentRecord,
      deliveryOperationId: 'other-operation',
      intentId: 'other-intent',
      originalIntentId: 'other-original',
    }),
    intentDigest: digest(
      renderIntent({
        ...intentRecord,
        deliveryOperationId: 'other-operation',
        intentId: 'other-intent',
        originalIntentId: 'other-original',
      })
    ),
  };
  await ensureWaiverIntent({ candidate: other, journal, comments, runId: 'run-b' });
  const snapshot = await journal.read();
  assert.notEqual(snapshot.oid, burned.burnOid);
  assert.equal(snapshot.operations.get(operationId).burnOid, burned.burnOid);
  assert.equal(
    (await ensureDeliveryWaiverBurn({ candidate: burn, journal })).burnOid,
    burned.burnOid
  );
});

test('a later exact receipt readback resolves the original pending request', async () => {
  const journal = createMemoryJournal({ repository, issue });
  const all = [];
  const comments = {
    async list() {
      return all;
    },
    async post(body) {
      if (body === intent.intentBody) {
        const c = comment(body, 'C1');
        all.push(c);
        return c;
      }
      throw Error('response lost');
    },
  };
  const candidate = { repository, issue, deliveryOperationId: operationId, ...intent };
  await ensureWaiverIntent({ candidate, journal, comments, runId: 'run-a' });
  const consumed = await ensureDeliveryWaiverBurn({
    candidate: burn,
    journal,
    verifyInitialBurn: verifiedInitialBurn,
  });
  const receiptBody = renderReceipt();
  const input = {
    burn,
    burnOid: consumed.burnOid,
    receiptBody,
    receiptDigest: digest(receiptBody),
    journal,
    comments,
    runId: 'run-a',
  };
  await assert.rejects(publishWaivedReceipt(input), /delivery-waiver-ambiguity/);
  all.push(comment(receiptBody, 'C2'));
  const recovered = await publishWaivedReceipt({ ...input, runId: 'run-b' });
  assert.equal(recovered.comment.id, 'C2');
  assert.equal((await journal.read()).operations.get(operationId).state, 'completed');
});

test('first burn refuses without a current authority and full verification port', async () => {
  const journal = createMemoryJournal({ repository, issue });
  const candidate = { repository, issue, deliveryOperationId: operationId, ...intent };
  await ensureWaiverIntent({ candidate, journal, comments: intentComments(), runId: 'seed' });
  const writes = journal.writes;
  await assert.rejects(
    ensureDeliveryWaiverBurn({ candidate: burn, journal }),
    /delivery-waiver-authority/
  );
  assert.equal(journal.writes, writes);
});

test('v3 readback refuses a divergent comment with the same intent and operation', async () => {
  const journal = createMemoryJournal({ repository, issue });
  let posts = 0;
  const conflicting = renderIntent({ ...intentRecord, commitTitle: 'changed' });
  const comments = {
    async list() {
      return [comment(conflicting, 'C1')];
    },
    async post() {
      posts++;
      return comment(intent.intentBody, 'C2');
    },
  };
  const candidate = { repository, issue, deliveryOperationId: operationId, ...intent };
  await assert.rejects(
    ensureWaiverIntent({ candidate, journal, comments, runId: 'run-a' }),
    (error) => error.outcome === 'indeterminate'
  );
  assert.equal(posts, 0);
});

test('v4 readback refuses a divergent receipt for the same operation', async () => {
  const journal = createMemoryJournal({ repository, issue });
  const candidate = { repository, issue, deliveryOperationId: operationId, ...intent };
  await ensureWaiverIntent({ candidate, journal, comments: intentComments(), runId: 'seed' });
  const consumed = await ensureDeliveryWaiverBurn({
    candidate: burn,
    journal,
    verifyInitialBurn: verifiedInitialBurn,
  });
  const receiptBody = renderReceipt();
  const conflict = renderReceipt({ mergeCommitSha: 'c'.repeat(40) });
  let posts = 0;
  const comments = {
    async list() {
      return [comment(conflict, 'C2')];
    },
    async post() {
      posts++;
      return comment(receiptBody, 'C3');
    },
  };
  await assert.rejects(
    publishWaivedReceipt({
      burn,
      burnOid: consumed.burnOid,
      receiptBody,
      receiptDigest: digest(receiptBody),
      journal,
      comments,
      runId: 'run-a',
    }),
    (error) => error.outcome === 'indeterminate'
  );
  assert.equal(posts, 0);
});

test('first burn rejects stale grant or failed non-waived verification without CAS', async () => {
  const journal = createMemoryJournal({ repository, issue });
  const candidate = { repository, issue, deliveryOperationId: operationId, ...intent };
  await ensureWaiverIntent({ candidate, journal, comments: intentComments(), runId: 'seed' });
  const writes = journal.writes;
  const valid = await verifiedInitialBurn();
  await assert.rejects(
    ensureDeliveryWaiverBurn({
      candidate: burn,
      journal,
      verifyInitialBurn: async () => ({
        ...valid,
        waiver: { ...valid.waiver, outcome: 'missing' },
      }),
    }),
    /delivery-waiver-authority/
  );
  await assert.rejects(
    ensureDeliveryWaiverBurn({
      candidate: burn,
      journal,
      verifyInitialBurn: async () => ({
        ...valid,
        verification: {
          ...valid.verification,
          deliveryDisposition: 'failed',
        },
      }),
    }),
    /delivery-waiver-authority/
  );
  assert.equal(journal.writes, writes);
  await ensureDeliveryWaiverBurn({
    candidate: burn,
    journal,
    verifyInitialBurn: verifiedInitialBurn,
  });
  let liveChecks = 0;
  await ensureDeliveryWaiverBurn({
    candidate: burn,
    journal,
    verifyInitialBurn: async () => {
      liveChecks++;
      throw Error('expired grant');
    },
  });
  assert.equal(liveChecks, 0);
});

test('completed operation still reconciles its exact intent beside the v4 receipt', async () => {
  const journal = createMemoryJournal({ repository, issue });
  const all = [];
  const comments = {
    async list() {
      return all;
    },
    async post(body) {
      const c = comment(body, `C${all.length + 1}`);
      all.push(c);
      return c;
    },
  };
  const candidate = { repository, issue, deliveryOperationId: operationId, ...intent };
  await ensureWaiverIntent({ candidate, journal, comments, runId: 'run-a' });
  const consumed = await ensureDeliveryWaiverBurn({
    candidate: burn,
    journal,
    verifyInitialBurn: verifiedInitialBurn,
  });
  const receiptBody = renderReceipt();
  await publishWaivedReceipt({
    burn,
    burnOid: consumed.burnOid,
    receiptBody,
    receiptDigest: digest(receiptBody),
    journal,
    comments,
    runId: 'run-a',
  });
  const existing = await ensureWaiverIntent({ candidate, journal, comments, runId: 'run-b' });
  assert.equal(existing.comment.id, 'C1');
  assert.equal(all.length, 2);
});
