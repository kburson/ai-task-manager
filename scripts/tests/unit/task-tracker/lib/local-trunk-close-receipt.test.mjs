// @story #1826
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyCloseDeliveryReceipt } from '../../../../task-tracker/lib/close-delivery-receipt.mjs';
import { formatCloseDeliveryDisclosure } from '../../../../task-tracker/verbs/close.mjs';
import test from 'node:test';

import {
  buildLocalTrunkCloseReceipt,
  renderLocalTrunkCloseReceipt,
  parseLocalTrunkCloseReceipt,
  validateLocalTrunkCloseBurn,
  validateLocalTrunkCloseJournalEntry,
  projectLocalTrunkCloseJournal,
  completeLocalTrunkClose,
} from '../../../../task-tracker/lib/local-trunk-close-receipt.mjs';

const repository = 'owner/repo';
const issue = 1826;
const operation = '00000000000000000000000001';
const grantRecordId = '00000000000000000000000002';
const acceptedSha = 'a'.repeat(40);
const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const burn = Object.freeze({
  schema: 'aitm.local-trunk-close-burn/v1',
  repository,
  issue,
  deliveryOperationId: operation,
  grantRecordId,
  grantRevision: 1,
  scopeIdentity: hash('issue body scope'),
  waiverScopeDigest: hash('scope'),
  waiverReasonDigest: hash('reason'),
  grantDigest: hash('grant envelope'),
  acceptedHeadSha: acceptedSha,
  baseRef: 'trunk',
  resolvedTrunkRef: 'origin/trunk',
  authorizedAt: '2026-09-26T12:00:00.000Z',
});
const burnOid = 'b'.repeat(40);
const entry = (state, sequence, predecessorOid, publication = null) => ({
  schema: 'aitm.local-trunk-close-journal-entry/v1',
  sequence,
  predecessorOid,
  repository,
  issue,
  deliveryOperationId: operation,
  state,
  burn,
  publication,
});
function fakeJournal() {
  const events = [];
  let writes = 0;
  return {
    get writes() {
      return writes;
    },
    async read() {
      return projectLocalTrunkCloseJournal(events, { repository, issue });
    },
    async compareAndAppend({ expectedOid, entry: next }) {
      const before = await this.read();
      if (before.oid !== expectedOid) return { status: 'stale', snapshot: before };
      validateLocalTrunkCloseJournalEntry(next);
      writes += 1;
      const oid = writes === 1 ? burnOid : String(writes).repeat(40).slice(0, 40);
      events.push({ oid, entry: next });
      return { status: 'appended', snapshot: await this.read() };
    },
  };
}
function fakeComments() {
  const values = [];
  let posts = 0;
  return {
    get posts() {
      return posts;
    },
    get values() {
      return values;
    },
    async list() {
      return [...values];
    },
    async post({ body }) {
      posts += 1;
      const comment = { id: `IC_${posts}`, body, createdAt: '2026-09-26T12:00:01.000Z' };
      values.push(comment);
      return comment;
    },
  };
}
const complete = ({
  journal,
  comments,
  runId = 'host-a',
  verifyInitialBurn,
  verifyHistoricalBurn,
  verifyPendingBurn,
} = {}) =>
  completeLocalTrunkClose({
    candidate: burn,
    journal,
    comments,
    runId,
    verifyInitialBurn: verifyInitialBurn ?? (async () => burn),
    verifyHistoricalBurn: verifyHistoricalBurn ?? (async () => true),
    verifyPendingBurn: verifyPendingBurn ?? (async () => true),
  });

test('typed burn and receipt pin the issue, grant, operation, SHA, refs, and burn OID', () => {
  assert.equal(validateLocalTrunkCloseBurn(burn), burn);
  const receipt = buildLocalTrunkCloseReceipt({ burn, burnOid });
  assert.equal(receipt.schema, 'aitm.local-trunk-close-receipt/v1');
  assert.equal(receipt.result, 'authorized-local-trunk-close');
  assert.equal(receipt.burnOid, burnOid);
  assert.equal(receipt.grantRecordId, grantRecordId);
  assert.equal(receipt.acceptedHeadSha, acceptedSha);
  const body = renderLocalTrunkCloseReceipt(receipt);
  assert.ok(body.includes('already on trunk'));
  assert.deepEqual(parseLocalTrunkCloseReceipt(body), receipt);
  assert.throws(() => validateLocalTrunkCloseBurn({ ...burn, mergeCommitSha: acceptedSha }));
  assert.throws(() => buildLocalTrunkCloseReceipt({ burn, burnOid: 'x' }));
  assert.throws(() =>
    parseLocalTrunkCloseReceipt(body.replace('authorized-local-trunk-close', 'delivered'))
  );
});

test('journal projection refuses changed burn, duplicate grant owner, and incomplete history', () => {
  assert.ok(
    validateLocalTrunkCloseJournalEntry(entry('burned', 1, null)).includes(
      'local-trunk-close-journal-entry'
    )
  );
  const first = { oid: burnOid, entry: entry('burned', 1, null) };
  const snapshot = projectLocalTrunkCloseJournal([first], { repository, issue });
  assert.equal(snapshot.operations.get(operation).burnOid, burnOid);
  assert.throws(() =>
    projectLocalTrunkCloseJournal(
      [
        first,
        {
          oid: 'c'.repeat(40),
          entry: {
            ...entry('receipt-requesting', 2, burnOid),
            burn: { ...burn, acceptedHeadSha: 'd'.repeat(40) },
          },
        },
      ],
      { repository, issue }
    )
  );
  assert.throws(() =>
    projectLocalTrunkCloseJournal(
      [
        first,
        {
          oid: 'c'.repeat(40),
          entry: {
            ...entry('burned', 2, burnOid),
            deliveryOperationId: '00000000000000000000000003',
            burn: { ...burn, deliveryOperationId: '00000000000000000000000003' },
          },
        },
      ],
      { repository, issue }
    )
  );
  assert.throws(() =>
    projectLocalTrunkCloseJournal([{ oid: burnOid, entry: entry('completed', 1, null) }], {
      repository,
      issue,
    })
  );
});

test('first close burns once, publishes one exact receipt, and completes before Done', async () => {
  const journal = fakeJournal();
  const comments = fakeComments();
  let liveReads = 0;
  const result = await complete({
    journal,
    comments,
    verifyInitialBurn: async () => {
      liveReads += 1;
      return burn;
    },
  });
  assert.equal(result.outcome, 'authorized-local-trunk-close');
  assert.equal(result.receipt.burnOid, burnOid);
  assert.equal(journal.writes, 3);
  assert.equal(comments.posts, 1);
  assert.equal(liveReads, 1);
  assert.equal((await journal.read()).operations.get(operation).state, 'completed');
});

test('without-barrier revision observed after CAS prevents receipt publication and Done', async () => {
  const journal = fakeJournal();
  const comments = fakeComments();
  let revoked = false;
  const append = journal.compareAndAppend.bind(journal);
  journal.compareAndAppend = async (input) => {
    const result = await append(input);
    if (input.entry.state === 'burned') revoked = true;
    return result;
  };
  await assert.rejects(
    complete({
      journal,
      comments,
      verifyPendingBurn: async () => {
        if (revoked) throw new Error('without-barrier revision during burn');
        return true;
      },
    }),
    (error) => error.message.includes('without-barrier revision during burn')
  );
  assert.equal((await journal.read()).operations.get(operation).state, 'burned');
  assert.equal(comments.posts, 0);
  await assert.rejects(
    complete({
      journal,
      comments,
      runId: 'retry',
      verifyPendingBurn: async () => {
        throw new Error('without-barrier revision');
      },
    })
  );
  assert.equal(comments.posts, 0);
});

test('without-barrier revision during receipt POST leaves journal incomplete and blocks Done', async () => {
  const journal = fakeJournal();
  const comments = fakeComments();
  let revoked = false;
  const post = comments.post.bind(comments);
  comments.post = async (input) => {
    const result = await post(input);
    revoked = true;
    return result;
  };
  await assert.rejects(
    complete({
      journal,
      comments,
      verifyPendingBurn: async () => {
        if (revoked) throw new Error('without-barrier revision during publication');
        return true;
      },
    }),
    (error) => error.message.includes('without-barrier revision during publication')
  );
  assert.equal((await journal.read()).operations.get(operation).state, 'receipt-requesting');
  assert.equal(comments.posts, 1);
});

test('exact completed retry reuses receipt after expiry without another live grant', async () => {
  const journal = fakeJournal();
  const comments = fakeComments();
  const first = await complete({ journal, comments });
  const retry = await complete({
    journal,
    comments,
    runId: 'host-b',
    verifyInitialBurn: async () => {
      throw new Error('expired live grant');
    },
    verifyHistoricalBurn: async ({ confirmedBurn }) => {
      assert.deepEqual(confirmedBurn, burn);
      return true;
    },
  });
  assert.deepEqual(retry.receipt, first.receipt);
  assert.equal(retry.status, 'existing');
  assert.equal(journal.writes, 3);
  assert.equal(comments.posts, 1);
});

test('revocation before first burn and different issue or operation cannot consume authority', async () => {
  const journal = fakeJournal();
  const comments = fakeComments();
  await assert.rejects(
    complete({
      journal,
      comments,
      verifyInitialBurn: async () => {
        throw new Error('grant revoked');
      },
    }),
    (error) => error.message.includes('grant revoked')
  );
  assert.equal(journal.writes, 0);
  await complete({ journal, comments });
  await assert.rejects(
    completeLocalTrunkClose({
      candidate: { ...burn, issue: issue + 1 },
      journal,
      comments,
      runId: 'host-b',
      verifyInitialBurn: async () => burn,
      verifyHistoricalBurn: async () => true,
    })
  );
  await assert.rejects(
    completeLocalTrunkClose({
      candidate: { ...burn, deliveryOperationId: '00000000000000000000000003' },
      journal,
      comments,
      runId: 'host-b',
      verifyInitialBurn: async () => burn,
      verifyHistoricalBurn: async () => true,
    })
  );
  assert.equal(comments.posts, 1);
});

test('uncertain publication is read back; a competing host cannot post again', async () => {
  const journal = fakeJournal();
  const comments = fakeComments();
  const originalPost = comments.post;
  comments.post = async (input) => {
    await originalPost(input);
    throw new Error('response lost');
  };
  const first = await complete({ journal, comments });
  assert.equal(first.status, 'created');
  assert.equal(comments.posts, 1);
  const retry = await complete({ journal, comments, runId: 'host-b' });
  assert.equal(retry.status, 'existing');
  assert.equal(comments.posts, 1);
});

test('tampered receipt and incomplete journal refuse historical retry', async () => {
  const journal = fakeJournal();
  const comments = fakeComments();
  await complete({ journal, comments });
  comments.values[0].body = comments.values[0].body.replace('already on trunk', 'not on trunk');
  await assert.rejects(complete({ journal, comments, runId: 'host-b' }), (error) =>
    error.message.includes('indeterminate')
  );
  await assert.rejects(
    complete({
      journal: {
        read: async () => {
          throw new Error('truncated history');
        },
      },
      comments,
      runId: 'host-b',
    }),
    (error) => error.message.includes('indeterminate')
  );
});

test('Close accepts only a completed exact local receipt and discloses its distinct result', async () => {
  const journal = fakeJournal();
  const comments = fakeComments();
  const result = await complete({ journal, comments });
  const gateInput = {
    repository,
    issueNumber: issue,
    acceptedSha,
    lineage: { parentIssueNumber: null },
    pullRequests: [],
  };
  const receiptGate = {
    skipped: false,
    mode: 'local-trunk',
    receipt: result.receipt,
    comment: result.comment,
  };
  const verify = (overrides = {}) =>
    verifyCloseDeliveryReceipt({
      gateInput,
      receiptGate,
      testReceiptSha: acceptedSha,
      acceptedReviewSha: acceptedSha,
      deps: { readLocalTrunkJournal: () => journal.read() },
      ...overrides,
    });
  assert.equal((await verify()).mode, 'local-trunk');
  assert.ok(formatCloseDeliveryDisclosure(result.receipt).includes('Local-trunk close authorized'));
  assert.ok(!formatCloseDeliveryDisclosure(result.receipt).includes('waived'));
  await assert.rejects(verify({ testReceiptSha: 'b'.repeat(40) }));
  await assert.rejects(verify({ gateInput: { ...gateInput, pullRequests: [{}] } }));
  await assert.rejects(
    verify({ receiptGate: { ...receiptGate, receipt: { ...result.receipt, grantRevision: 2 } } })
  );
  await assert.rejects(
    verify({ deps: { readLocalTrunkJournal: async () => ({ operations: new Map() }) } })
  );
});
