// @story #1787 #1796
import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createTwoCloneHarness,
  gitInput,
  runBurnWorker,
  runBurnCrashWorker,
  runPublicationWorker,
  listSharedComments,
} from './delivery-waiver-journal-harness.mjs';
import {
  createDeliveryWaiverJournal,
  validateDeliveryWaiverJournalEntry,
} from '../../../../task-tracker/lib/delivery-waiver-journal.mjs';
import {
  ensureWaiverIntent,
  ensureDeliveryWaiverBurn,
  publishWaivedReceipt,
} from '../../../../task-tracker/lib/delivery-waiver-consumption.mjs';
import {
  createWorkflowExceptionEnvelope,
  WORKFLOW_EXCEPTION_SCHEMA_V2,
} from '../../../../task-tracker/lib/workflow-policy/exception-record.mjs';
import {
  repository,
  issue,
  operationId,
  intent,
  burn,
  digest,
  verifiedInitialBurn,
  grant,
  renderReceipt,
  renderIntent,
  intentRecord,
} from '../../../unit/task-tracker/lib/delivery-waiver-consumption-fixtures.mjs';

function comments() {
  const all = [];
  let posts = 0;
  return {
    get posts() {
      return posts;
    },
    async list() {
      return all;
    },
    async post(body) {
      posts++;
      const c = { body, id: `C${posts}`, createdAt: '2026-09-25T00:01:00.000Z' };
      all.push(c);
      return c;
    },
  };
}

test('two clones share one durable intent, burn OID, and receipt', async (t) => {
  const h = await createTwoCloneHarness();
  t.after(h.cleanup);
  const c = comments();
  const candidate = { repository, issue, deliveryOperationId: operationId, ...intent };
  const a = await ensureWaiverIntent({ candidate, journal: h.hostA, comments: c, runId: 'host-a' });
  const b = await ensureWaiverIntent({ candidate, journal: h.hostB, comments: c, runId: 'host-b' });
  assert.equal(a.comment.id, b.comment.id);
  assert.equal(c.posts, 1);
  const first = await ensureDeliveryWaiverBurn({
    candidate: burn,
    journal: h.hostA,
    verifyInitialBurn: verifiedInitialBurn,
  });
  const second = await ensureDeliveryWaiverBurn({ candidate: burn, journal: h.hostB });
  assert.equal(first.burnOid, second.burnOid);
  const receiptBody = renderReceipt();
  await publishWaivedReceipt({
    burn,
    burnOid: first.burnOid,
    receiptBody,
    receiptDigest: digest(receiptBody),
    journal: h.hostA,
    comments: c,
    runId: 'host-a',
  });
  await publishWaivedReceipt({
    burn,
    burnOid: first.burnOid,
    receiptBody,
    receiptDigest: digest(receiptBody),
    journal: h.hostB,
    comments: c,
    runId: 'host-b',
  });
  assert.equal(c.posts, 2);
  assert.equal((await h.hostB.read()).operations.get(operationId).burnOid, first.burnOid);
});

test('remote identity mismatch refuses before a push', async (t) => {
  const h = await createTwoCloneHarness();
  t.after(h.cleanup);
  const wrong = createDeliveryWaiverJournal({
    cwd: h.a,
    repository: 'someone/else',
    issue,
    allowLocalRemote: true,
  });
  await assert.rejects(wrong.read(), /remote-identity/);
  assert.equal(await h.git(h.a, ['ls-remote', 'origin', h.hostA.ref]), '');
});

test('separate processes race two burn grants and retain one immutable burn', async (t) => {
  const h = await createTwoCloneHarness();
  t.after(h.cleanup);
  const c = comments();
  await ensureWaiverIntent({
    candidate: { repository, issue, deliveryOperationId: operationId, ...intent },
    journal: h.hostA,
    comments: c,
    runId: 'seed',
  });
  const revised = { ...burn, waiverRevision: 2, grantDigest: digest('revised grant') };
  const results = await Promise.allSettled([
    runBurnWorker({ cwd: h.a, burn }),
    runBurnWorker({ cwd: h.b, burn: revised }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const stored = (await h.hostA.read()).operations.get(operationId);
  assert.equal(stored.state, 'burned');
  assert.equal(stored.burnOid, results.find((r) => r.status === 'fulfilled').value.burnOid);
});

test('burn push crash checkpoints reconcile one burn and never publish a receipt', async (t) => {
  for (const crashAt of ['before-burn-push', 'after-burn-push']) {
    const h = await createTwoCloneHarness();
    t.after(h.cleanup);
    const c = comments();
    await ensureWaiverIntent({
      candidate: { repository, issue, deliveryOperationId: operationId, ...intent },
      journal: h.hostA,
      comments: c,
      runId: 'seed',
    });
    const first = await runBurnCrashWorker({ cwd: h.a, burn, crashAt });
    assert.notEqual(first.code, 0, crashAt);
    const before = (await h.hostB.read()).operations.get(operationId);
    assert.equal(before.state, crashAt === 'before-burn-push' ? 'intent-confirmed' : 'burned');
    const retry = await ensureDeliveryWaiverBurn({
      candidate: burn,
      journal: h.hostB,
      verifyInitialBurn: crashAt === 'before-burn-push' ? verifiedInitialBurn : undefined,
      expectedBurnOid: before.burnOid ?? null,
    });
    const final = await h.hostA.read();
    assert.equal(final.operations.get(operationId).burnOid, retry.burnOid);
    assert.equal(final.sequence, 3, crashAt);
    assert.equal(final.operations.get(operationId).publication, null);
    assert.equal(c.posts, 1, 'only the v3 intent was published');
  }
});

test('lost burn push response reconciles exactly one remote burn', async (t) => {
  const h = await createTwoCloneHarness();
  t.after(h.cleanup);
  const c = comments();
  await ensureWaiverIntent({
    candidate: { repository, issue, deliveryOperationId: operationId, ...intent },
    journal: h.hostA,
    comments: c,
    runId: 'seed',
  });
  const lostResponse = {
    read: () => h.hostA.read(),
    async compareAndAppend(input) {
      await h.hostA.compareAndAppend(input);
      throw new Error('transport response lost after acceptance');
    },
  };
  await assert.rejects(
    ensureDeliveryWaiverBurn({
      candidate: burn,
      journal: lostResponse,
      verifyInitialBurn: verifiedInitialBurn,
    }),
    (error) => error.outcome === 'indeterminate' && error.pendingStage === 'burned'
  );
  const accepted = (await h.hostB.read()).operations.get(operationId);
  const retry = await ensureDeliveryWaiverBurn({
    candidate: burn,
    journal: h.hostB,
    expectedBurnOid: accepted.burnOid,
  });
  assert.equal(retry.status, 'existing');
  assert.equal((await h.hostB.read()).sequence, 3);
  assert.equal(c.posts, 1);
  assert.equal(accepted.publication, null);
});

test('fresh authority refuses expired or revoked grant after intent reservation', async (t) => {
  const revokedGrant = createWorkflowExceptionEnvelope({
    schema: WORKFLOW_EXCEPTION_SCHEMA_V2,
    repository,
    issue,
    exceptionId: grant.payload.exceptionId,
    revision: 2,
    status: 'revoked',
    scopeIdentity: grant.payload.scopeIdentity,
    requirementIds: grant.payload.requirementIds,
    constraints: grant.payload.constraints,
    reason: grant.payload.reason,
    authorization: grant.payload.approvalEvidence,
    expiresAt: grant.payload.expiresAt,
    operationId: digest('revocation write'),
    predecessor: grant.recordId,
    supersedes: grant.recordId,
    createdAt: '2026-09-25T00:01:00.000Z',
    recordId: '01M2H000000000000000000006',
    grantId: '01M2H000000000000000000007',
    scopeKind: 'delivery',
    deliveryScope: grant.payload.deliveryScope,
    waiverScopeDigest: grant.payload.waiverScopeDigest,
  });
  for (const change of ['expired', 'revoked']) {
    const h = await createTwoCloneHarness();
    t.after(h.cleanup);
    const c = comments();
    await ensureWaiverIntent({
      candidate: { repository, issue, deliveryOperationId: operationId, ...intent },
      journal: h.hostA,
      comments: c,
      runId: 'seed',
    });
    const candidate =
      change === 'expired' ? { ...burn, authorizedAt: grant.payload.expiresAt } : burn;
    const verifyInitialBurn = async () => {
      const verified = await verifiedInitialBurn();
      return change === 'expired'
        ? { ...verified, authorizedAt: candidate.authorizedAt }
        : { ...verified, waiver: { ...verified.waiver, outcome: 'revoked', grant: revokedGrant } };
    };
    await assert.rejects(
      ensureDeliveryWaiverBurn({ candidate, journal: h.hostB, verifyInitialBurn }),
      (error) => error.category === 'delivery-waiver-authority',
      change
    );
    const after = await h.hostA.read();
    assert.equal(after.sequence, 2, change);
    assert.equal(after.operations.get(operationId).state, 'intent-confirmed');
    assert.equal(after.operations.get(operationId).burn, null);
    assert.equal(c.posts, 1, 'receipt must not be posted');
  }
});

test('two operations racing one original intent yield one reservation and one POST', async (t) => {
  const h = await createTwoCloneHarness();
  t.after(h.cleanup);
  const c = comments();
  const first = { repository, issue, deliveryOperationId: operationId, ...intent };
  const second = {
    ...first,
    deliveryOperationId: 'different-operation',
    intentId: 'different-intent',
    intentBody: renderIntent({
      ...intentRecord,
      deliveryOperationId: 'different-operation',
      intentId: 'different-intent',
    }),
    intentDigest: digest(
      renderIntent({
        ...intentRecord,
        deliveryOperationId: 'different-operation',
        intentId: 'different-intent',
      })
    ),
  };
  const results = await Promise.allSettled([
    ensureWaiverIntent({ candidate: first, journal: h.hostA, comments: c, runId: 'host-a' }),
    ensureWaiverIntent({ candidate: second, journal: h.hostB, comments: c, runId: 'host-b' }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(c.posts, 1);
  assert.equal((await h.hostA.read()).originalIntentOwners.size, 1);
});

test('branch write refusal leaves no journal ref or provider comment', async (t) => {
  const h = await createTwoCloneHarness();
  t.after(h.cleanup);
  await writeFile(join(h.bare, 'hooks', 'update'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const c = comments();
  const candidate = { repository, issue, deliveryOperationId: operationId, ...intent };
  await assert.rejects(
    ensureWaiverIntent({ candidate, journal: h.hostA, comments: c, runId: 'run-a' }),
    (error) => error.outcome === 'indeterminate' && error.pendingStage === 'intent-requesting'
  );
  assert.equal(c.posts, 0);
  assert.equal(await h.git(h.a, ['ls-remote', 'origin', h.hostA.ref]), '');
});

test('validated reader refuses a force reset of a seen journal', async (t) => {
  const h = await createTwoCloneHarness();
  t.after(h.cleanup);
  const c = comments();
  const candidate = { repository, issue, deliveryOperationId: operationId, ...intent };
  await ensureWaiverIntent({ candidate, journal: h.hostA, comments: c, runId: 'run-a' });
  const root = await h.git(h.a, [
    'rev-list',
    '--max-parents=0',
    await h.git(h.a, ['rev-parse', 'FETCH_HEAD']),
  ]);
  await h.git(h.a, ['push', '--force', 'origin', `${root}:${h.hostA.ref}`]);
  await assert.rejects(h.hostA.read(), /history-reset/);
});

test('reader rejects an unknown schema anywhere in remote history', async (t) => {
  const h = await createTwoCloneHarness();
  t.after(h.cleanup);
  const c = comments();
  await ensureWaiverIntent({
    candidate: { repository, issue, deliveryOperationId: operationId, ...intent },
    journal: h.hostA,
    comments: c,
    runId: 'seed',
  });
  const before = await h.hostA.read();
  const prior = before.operations.get(operationId).entry;
  const invalid = {
    ...prior,
    schema: 'aitm.delivery-waiver-journal-entry/v999',
    sequence: before.sequence + 1,
    predecessorOid: before.oid,
  };
  const body = JSON.stringify(invalid);
  const blob = await gitInput(h.a, ['hash-object', '-w', '--stdin'], body);
  const tree = await gitInput(h.a, ['mktree'], `100644 blob ${blob}\tentry.json\n`);
  const commit = await h.git(h.a, ['commit-tree', tree, '-p', before.oid, '-m', 'invalid schema']);
  await h.git(h.a, ['push', '--force', 'origin', `${commit}:${h.hostA.ref}`]);
  await assert.rejects(h.hostB.read(), /entry-schema/);
});

test('production adapter rejects a local remote without explicit test allowance', async (t) => {
  const h = await createTwoCloneHarness();
  t.after(h.cleanup);
  const strict = createDeliveryWaiverJournal({ cwd: h.a, repository, issue });
  await assert.rejects(strict.read(), /remote-identity/);
});

test('same owner and repository on a different host cannot be journal authority', async (t) => {
  const h = await createTwoCloneHarness();
  t.after(h.cleanup);
  await h.git(h.a, ['remote', 'set-url', 'origin', 'ssh://git@wrong.example/example/project.git']);
  await assert.rejects(h.hostA.read(), /remote-identity/);
});

test('configured second push URL refuses before any journal I/O', async (t) => {
  const h = await createTwoCloneHarness();
  t.after(h.cleanup);
  await h.git(h.a, ['remote', 'set-url', '--add', '--push', 'origin', h.bare]);
  await h.git(h.a, [
    'remote',
    'set-url',
    '--add',
    '--push',
    'origin',
    join(h.root, 'wrong', 'project.git'),
  ]);
  await assert.rejects(h.hostA.read(), /remote-identity/);
});

test('fresh clone does not recreate deleted journal when exact intent comment survives', async (t) => {
  const h = await createTwoCloneHarness();
  t.after(h.cleanup);
  const c = comments();
  const candidate = { repository, issue, deliveryOperationId: operationId, ...intent };
  await ensureWaiverIntent({ candidate, journal: h.hostA, comments: c, runId: 'host-a' });
  await h.git(h.a, ['push', 'origin', `:${h.hostA.ref}`]);
  const fresh = createDeliveryWaiverJournal({
    cwd: h.b,
    repository,
    issue,
    allowLocalRemote: true,
  });
  await assert.rejects(
    ensureWaiverIntent({ candidate, journal: fresh, comments: c, runId: 'host-b' }),
    (error) => error.outcome === 'indeterminate' && error.pendingStage === 'intent-requesting'
  );
  const competingBody = renderIntent({
    ...intentRecord,
    deliveryOperationId: 'different-operation',
    intentId: 'different-intent',
  });
  const competing = {
    ...candidate,
    deliveryOperationId: 'different-operation',
    intentId: 'different-intent',
    intentBody: competingBody,
    intentDigest: digest(competingBody),
  };
  await assert.rejects(
    ensureWaiverIntent({ candidate: competing, journal: fresh, comments: c, runId: 'host-c' }),
    (error) => error.outcome === 'indeterminate'
  );
  assert.equal(c.posts, 1);
  assert.equal(await h.git(h.a, ['ls-remote', 'origin', h.hostA.ref]), '');
});

test('fresh clone rejects a pinned burn OID missing from rewound history', async (t) => {
  const h = await createTwoCloneHarness();
  t.after(h.cleanup);
  const c = comments();
  const candidate = { repository, issue, deliveryOperationId: operationId, ...intent };
  await ensureWaiverIntent({ candidate, journal: h.hostA, comments: c, runId: 'seed' });
  const consumed = await ensureDeliveryWaiverBurn({
    candidate: burn,
    journal: h.hostA,
    verifyInitialBurn: verifiedInitialBurn,
  });
  const root = await h.git(h.a, ['rev-list', '--max-parents=0', consumed.burnOid]);
  await h.git(h.a, ['push', '--force', 'origin', `${root}:${h.hostA.ref}`]);
  const fresh = createDeliveryWaiverJournal({
    cwd: h.b,
    repository,
    issue,
    allowLocalRemote: true,
  });
  await assert.rejects(
    ensureDeliveryWaiverBurn({
      candidate: burn,
      journal: fresh,
      expectedBurnOid: consumed.burnOid,
      verifyInitialBurn: verifiedInitialBurn,
    }),
    (error) => error.outcome === 'indeterminate' && error.pendingStage === 'burned'
  );
  assert.equal((await fresh.read()).operations.get(operationId).burn, null);
});

test('separate processes publish one v3 intent and one v4 receipt across two clones', async (t) => {
  const h = await createTwoCloneHarness();
  t.after(h.cleanup);
  const candidate = { repository, issue, deliveryOperationId: operationId, ...intent };
  const intentResults = await Promise.all([
    runPublicationWorker({
      kind: 'intent',
      cwd: h.a,
      repository,
      issue,
      candidate,
      commentsDir: h.commentsDir,
      runId: 'host-a',
    }),
    runPublicationWorker({
      kind: 'intent',
      cwd: h.b,
      repository,
      issue,
      candidate,
      commentsDir: h.commentsDir,
      runId: 'host-b',
    }),
  ]);
  assert.equal(intentResults.filter((result) => result.code === 0).length >= 1, true);
  assert.equal((await listSharedComments(h.commentsDir)).length, 1);
  const consumed = await ensureDeliveryWaiverBurn({
    candidate: burn,
    journal: h.hostA,
    verifyInitialBurn: verifiedInitialBurn,
  });
  const receiptBody = renderReceipt();
  const receipt = {
    kind: 'receipt',
    repository,
    issue,
    burn,
    burnOid: consumed.burnOid,
    receiptBody,
    receiptDigest: digest(receiptBody),
    commentsDir: h.commentsDir,
  };
  const receiptResults = await Promise.all([
    runPublicationWorker({ ...receipt, cwd: h.a, runId: 'host-a' }),
    runPublicationWorker({ ...receipt, cwd: h.b, runId: 'host-b' }),
  ]);
  assert.equal(receiptResults.filter((result) => result.code === 0).length >= 1, true);
  assert.equal((await listSharedComments(h.commentsDir)).length, 2);
  assert.equal((await h.hostB.read()).operations.get(operationId).state, 'completed');
});

for (const kind of ['intent', 'receipt']) {
  test(`${kind} request survives process crashes without a second POST`, async (t) => {
    const checkpoints = [
      ['before-request-push', true, false],
      ['after-request-push', false, true],
      ['before-post', false, true],
      ['after-post', true, false],
      ['before-final-push', true, false],
      ['after-final-push', true, false],
    ];
    for (const [crashAt, expectedReceipt, unresolved] of checkpoints) {
      const h = await createTwoCloneHarness();
      t.after(h.cleanup);
      const candidate = { repository, issue, deliveryOperationId: operationId, ...intent };
      let options = { kind, repository, issue, commentsDir: h.commentsDir };
      if (kind === 'intent') options = { ...options, candidate };
      else {
        const seeded = await runPublicationWorker({
          ...options,
          kind: 'intent',
          cwd: h.a,
          candidate,
          runId: 'seed',
        });
        assert.equal(seeded.code, 0, seeded.error);
        const consumed = await ensureDeliveryWaiverBurn({
          candidate: burn,
          journal: h.hostA,
          verifyInitialBurn: verifiedInitialBurn,
        });
        const receiptBody = renderReceipt();
        options = {
          ...options,
          burn,
          burnOid: consumed.burnOid,
          receiptBody,
          receiptDigest: digest(receiptBody),
        };
      }
      const first = await runPublicationWorker({
        ...options,
        cwd: h.a,
        runId: 'crash-run',
        crashAt,
      });
      assert.notEqual(first.code, 0, crashAt);
      const retry = await runPublicationWorker({ ...options, cwd: h.b, runId: 'retry-run' });
      assert.equal(retry.code === 0, expectedReceipt, `${kind}:${crashAt}:${retry.error}`);
      if (unresolved) assert.match(retry.error, /delivery-waiver-ambiguity:indeterminate/);
      const comments = await listSharedComments(h.commentsDir);
      assert.equal(
        comments.length,
        (kind === 'receipt' ? 1 : 0) + (expectedReceipt ? 1 : 0),
        `${kind}:${crashAt}`
      );
    }
  });
}
