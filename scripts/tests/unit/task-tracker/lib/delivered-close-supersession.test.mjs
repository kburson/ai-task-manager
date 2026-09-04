// @story #1466
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizeDeliveredCloseRestart,
  DELIVERED_CLOSE_RESTART_REASON,
  ensureDeliveredCloseSupersession,
  parseDeliveredCloseSupersessionComment,
  renderDeliveredCloseSupersessionComment,
  replaceStaleDeliveredCloseTransaction,
  resolveDeliveredCloseSupersession,
} from '../../../../task-tracker/lib/delivered-close-supersession.mjs';
import {
  readDeliveredCloseTransactions,
  upsertDeliveredCloseTransaction,
} from '../../../../task-tracker/lib/close-convergence.mjs';

const OLD_SHA = 'a'.repeat(40);
const NEW_SHA = 'b'.repeat(40);

function staleTransaction(completedSteps = ['timing']) {
  return {
    schema: 'aitm.delivered-close/v1',
    transactionId: 'old-tx',
    issueNumber: 1461,
    acceptedSha: OLD_SHA,
    reviewAuthority: 'gate-bypassed',
    completedSteps,
  };
}

function restartInput(overrides = {}) {
  return {
    repository: 'kburson/ai-task-manager',
    issueNumber: 1461,
    oldTransaction: staleTransaction(),
    newAcceptedSha: NEW_SHA,
    newReviewAuthority: 'gate-bypassed',
    live: {
      boardState: 'review',
      issueClosed: false,
      terminalDisposition: null,
      labels: ['ToDo'],
      bindingStatus: 'pending',
    },
    ...overrides,
  };
}

test('authorizes a stale transaction whose durable and live state are pre-terminal', () => {
  const authorization = authorizeDeliveredCloseRestart(restartInput());

  assert.equal(authorization.repository, 'kburson/ai-task-manager');
  assert.equal(authorization.issueNumber, 1461);
  assert.equal(authorization.newAcceptedSha, NEW_SHA);
  assert.equal(authorization.newReviewAuthority, 'gate-bypassed');
  assert.equal(authorization.reason, DELIVERED_CLOSE_RESTART_REASON);
  assert.deepEqual(authorization.oldTransaction.completedSteps, ['timing']);
  assert.equal(Object.isFrozen(authorization), true);
});

test('refuses stale transaction authority with fields outside the exact v1 contract', () => {
  assert.throws(
    () =>
      authorizeDeliveredCloseRestart(
        restartInput({ oldTransaction: { ...staleTransaction(), untrusted: true } })
      ),
    /delivered-close-supersession:old-transaction/
  );
});

test('accepts only contiguous pre-terminal prefixes and exact live Review state', () => {
  for (const prefix of [
    [],
    ['timing'],
    ['timing', 'estimation'],
    ['timing', 'estimation', 'lifecycle'],
  ]) {
    assert.doesNotThrow(() =>
      authorizeDeliveredCloseRestart(restartInput({ oldTransaction: staleTransaction(prefix) }))
    );
  }
  for (const completedSteps of [
    ['estimation'],
    ['timing', 'lifecycle'],
    ['timing', 'estimation', 'lifecycle', 'board'],
  ]) {
    assert.throws(
      () =>
        authorizeDeliveredCloseRestart(
          restartInput({ oldTransaction: staleTransaction(completedSteps) })
        ),
      /terminal-prefix/
    );
  }
  for (const live of [
    { ...restartInput().live, boardState: 'done' },
    { ...restartInput().live, issueClosed: true },
    { ...restartInput().live, terminalDisposition: 'Delivered' },
    { ...restartInput().live, labels: [] },
    { ...restartInput().live, bindingStatus: 'released' },
  ]) {
    assert.throws(
      () => authorizeDeliveredCloseRestart(restartInput({ live })),
      /live-terminal-state/
    );
  }
});

test('renders and parses one immutable provider-correlated supersession comment', () => {
  const authorization = authorizeDeliveredCloseRestart(restartInput());
  const resolution = resolveDeliveredCloseSupersession({
    authorization,
    comments: [],
    randomUUIDFn: () => 'replacement-tx',
  });
  assert.equal(resolution.action, 'create');
  const body = renderDeliveredCloseSupersessionComment(resolution.record);
  const evidence = parseDeliveredCloseSupersessionComment(
    {
      id: 77,
      body,
      user: { login: 'kburson' },
      created_at: '2026-08-31T21:00:00Z',
      updated_at: '2026-08-31T21:00:00Z',
      issue_url: 'https://api.github.com/repos/kburson/ai-task-manager/issues/1461',
    },
    { repository: 'kburson/ai-task-manager', issueNumber: 1461 }
  );
  assert.equal(evidence.commentId, '77');
  assert.equal(evidence.authorLogin, 'kburson');
  assert.equal(evidence.createdAt, '2026-08-31T21:00:00.000Z');
  assert.equal(evidence.record.replacementTransactionId, 'replacement-tx');
});

test('reuses one exact supersession and refuses conflicting old-transaction claims', () => {
  const authorization = authorizeDeliveredCloseRestart(restartInput());
  const created = resolveDeliveredCloseSupersession({
    authorization,
    comments: [],
    randomUUIDFn: () => 'replacement-tx',
  });
  const exact = {
    id: 77,
    body: renderDeliveredCloseSupersessionComment(created.record),
    user: { login: 'kburson' },
    created_at: '2026-08-31T21:00:00Z',
    updated_at: '2026-08-31T21:00:00Z',
    issue_url: 'https://api.github.com/repos/kburson/ai-task-manager/issues/1461',
  };
  const reused = resolveDeliveredCloseSupersession({ authorization, comments: [exact] });
  assert.equal(reused.action, 'reuse');
  assert.equal(reused.record.replacementTransactionId, 'replacement-tx');

  const conflictingAuthorization = authorizeDeliveredCloseRestart(
    restartInput({ newAcceptedSha: 'c'.repeat(40) })
  );
  const conflictRecord = resolveDeliveredCloseSupersession({
    authorization: conflictingAuthorization,
    comments: [],
    randomUUIDFn: () => 'other-replacement-tx',
  }).record;
  assert.throws(
    () =>
      resolveDeliveredCloseSupersession({
        authorization,
        comments: [
          exact,
          { ...exact, id: 78, body: renderDeliveredCloseSupersessionComment(conflictRecord) },
        ],
      }),
    /conflicting-evidence/
  );
});

test('replaces only the exact stale body transaction and adopts exact lost-response state', () => {
  const authorization = authorizeDeliveredCloseRestart(restartInput());
  const { record } = resolveDeliveredCloseSupersession({
    authorization,
    comments: [],
    randomUUIDFn: () => 'replacement-tx',
  });
  const staleBody = upsertDeliveredCloseTransaction('body', staleTransaction());
  const replaced = replaceStaleDeliveredCloseTransaction(staleBody, authorization, record);
  assert.equal(replaced.status, 'replaced');
  assert.equal(replaced.transaction.transactionId, 'replacement-tx');
  assert.equal(replaced.transaction.acceptedSha, NEW_SHA);
  assert.deepEqual(replaced.transaction.completedSteps, []);
  assert.deepEqual(readDeliveredCloseTransactions(replaced.body), [replaced.transaction]);

  const adopted = replaceStaleDeliveredCloseTransaction(replaced.body, authorization, record);
  assert.equal(adopted.status, 'already-replaced');
  assert.equal(adopted.body, replaced.body);

  const progressedTransaction = {
    ...replaced.transaction,
    completedSteps: ['timing', 'estimation'],
  };
  const progressedBody = upsertDeliveredCloseTransaction(replaced.body, progressedTransaction);
  const resumed = replaceStaleDeliveredCloseTransaction(progressedBody, authorization, record);
  assert.equal(resumed.status, 'already-replaced');
  assert.equal(resumed.body, progressedBody);
  assert.deepEqual(resumed.transaction.completedSteps, ['timing', 'estimation']);

  assert.throws(
    () => replaceStaleDeliveredCloseTransaction('body', authorization, record),
    /stale-body/
  );
});

test('persists audit evidence in list-create-read order and reuses it on retry', async () => {
  const authorization = authorizeDeliveredCloseRestart(restartInput());
  const comments = [];
  const order = [];
  const deps = {
    randomUUIDFn: () => 'replacement-tx',
    listComments: async () => {
      order.push('list');
      return comments;
    },
    createComment: async (body) => {
      order.push('create');
      const comment = {
        id: 77,
        body,
        user: { login: 'kburson' },
        created_at: '2026-08-31T21:00:00Z',
        updated_at: '2026-08-31T21:00:00Z',
        issue_url: 'https://api.github.com/repos/kburson/ai-task-manager/issues/1461',
      };
      comments.push(comment);
      return comment;
    },
    readComment: async (id) => {
      order.push('read');
      return comments.find((comment) => String(comment.id) === String(id));
    },
  };
  const created = await ensureDeliveredCloseSupersession({ authorization, deps });
  assert.equal(created.record.replacementTransactionId, 'replacement-tx');
  assert.deepEqual(order, ['list', 'create', 'read']);

  order.length = 0;
  const reused = await ensureDeliveredCloseSupersession({ authorization, deps });
  assert.equal(reused.record.replacementTransactionId, 'replacement-tx');
  assert.deepEqual(order, ['list']);
});

test('refuses a comment that carries more than one supersession marker', () => {
  const authorization = authorizeDeliveredCloseRestart(restartInput());
  const { record } = resolveDeliveredCloseSupersession({
    authorization,
    comments: [],
    randomUUIDFn: () => 'replacement-tx',
  });
  const body = renderDeliveredCloseSupersessionComment(record);
  const marker = body.split('\n').at(-1);
  assert.throws(
    () =>
      parseDeliveredCloseSupersessionComment(
        {
          id: 77,
          body: `${body}\n${marker}`,
          user: { login: 'kburson' },
          created_at: '2026-08-31T21:00:00Z',
          updated_at: '2026-08-31T21:00:00Z',
          issue_url: 'https://api.github.com/repos/kburson/ai-task-manager/issues/1461',
        },
        { repository: 'kburson/ai-task-manager', issueNumber: 1461 }
      ),
    /malformed-comment/
  );
});
