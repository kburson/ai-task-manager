// @story #1117 #1454 #1455

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  INLINE_HEAD_MARKER_LIMIT,
  INLINE_BODY_LIMIT,
  advanceActionLedgerHead,
  appendActionEvent,
  auditActionLedger,
  collectSupersededSpillHeads,
  createGenesisHead,
  deriveActionAttempt,
  recordLedgerDamageCarry,
  reconcileActionLedger,
  recoverOrphanedEvent,
} from '../../../../task-tracker/lib/resident-action-ledger-write.mjs';
import {
  fingerprint,
  parseBodyLedgerHead,
  renderSpillHeadComment,
} from '../../../../task-tracker/lib/resident-action-ledger-codec.mjs';
import { stampBodyVersion } from '../../../../task-tracker/lib/body-version.mjs';
import { mutateIssueBody } from '../../../../task-tracker/lib/issue-body-mutate.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;

function memoryWriter(body = '## Issue\n') {
  let current = body;
  let nextId = 100;
  const comments = new Map();
  return {
    get body() {
      return current;
    },
    comments,
    deps: {
      fetchBody: async () => current,
      pushBody: async (_repo, _issue, next) => {
        current = next;
      },
      createComment: async (_issue, commentBody) => {
        const id = String(nextId++);
        comments.set(id, commentBody);
        return { id, body: commentBody };
      },
      readComment: async (_issue, id) =>
        comments.has(String(id)) ? { id: String(id), body: comments.get(String(id)) } : null,
    },
  };
}

test('genesis heads are canonical and inline within the operational budgets', () => {
  const head = createGenesisHead({ visit: 'review:1', definition: HASH_A });
  assert.equal(head.mode, 'inline');
  assert.equal(head.visit, 'review:1');
  assert.deepEqual(head.actions, {});
  assert.equal(INLINE_HEAD_MARKER_LIMIT, 8192);
  assert.equal(INLINE_BODY_LIMIT, 57344);
});

test('advanceActionLedgerHead writes and verifies an inline head', async () => {
  const server = memoryWriter();
  const nextHead = createGenesisHead({ visit: 'review:1', definition: HASH_A });
  const result = await advanceActionLedgerHead({
    issue: 1117,
    repo: 'o/r',
    expectedHead: null,
    nextHead,
    deps: server.deps,
  });
  assert.equal(result.mode, 'inline');
  assert.equal(parseBodyLedgerHead(server.body).visit, 'review:1');
  assert.equal(server.comments.size, 0);
});

test('advanceActionLedgerHead accepts a canonically equivalent expected head', async () => {
  const first = createGenesisHead({ visit: 'review:1', definition: HASH_A });
  const server = memoryWriter(`## Issue\n${first.marker}`);
  const result = await advanceActionLedgerHead({
    issue: 1117,
    repo: 'o/r',
    expectedHead: first,
    nextHead: createGenesisHead({ visit: 'review:2', definition: HASH_A }),
    deps: server.deps,
  });
  assert.equal(result.mode, 'inline');
  assert.equal(parseBodyLedgerHead(server.body).visit, 'review:2');
});

test('large bodies spill automatically and verify the protected head twice', async () => {
  const server = memoryWriter('x'.repeat(INLINE_BODY_LIMIT));
  const nextHead = {
    ...createGenesisHead({ visit: 'review:1', definition: HASH_A }),
    actions: {
      review: { commentId: '9', hash: HASH_A, attemptId: 1, phase: 'intent' },
    },
  };
  const result = await advanceActionLedgerHead({
    issue: 1117,
    repo: 'o/r',
    expectedHead: null,
    nextHead,
    deps: server.deps,
  });
  assert.equal(result.mode, 'spill');
  assert.equal(server.comments.size, 1);
  const bodyHead = parseBodyLedgerHead(server.body);
  const [commentId, expectedHash] = bodyHead.head.split(/:(?=sha256:)/);
  assert.equal(fingerprint(server.comments.get(commentId)), expectedHash);
  assert.equal(result.commentVerifications, 2);
});

test('stale expected heads fail against the fresh mutation base', async () => {
  const first = createGenesisHead({ visit: 'review:1', definition: HASH_A });
  const server = memoryWriter(`## Issue\n${first.marker}`);
  await assert.rejects(
    () =>
      advanceActionLedgerHead({
        issue: 1117,
        repo: 'o/r',
        expectedHead: null,
        nextHead: createGenesisHead({ visit: 'review:2', definition: HASH_A }),
        deps: server.deps,
      }),
    /stale-expected-head/
  );
});

test('stale expected heads are rechecked against a retry base', async () => {
  const first = createGenesisHead({ visit: 'review:1', definition: HASH_A });
  const next = createGenesisHead({ visit: 'review:2', definition: HASH_A });
  let body = stampBodyVersion(`header\n${first.marker}\nfooter`, 1);
  let pushed = false;
  const deps = {
    fetchBody: async () => body,
    pushBody: async (_repo, _issue, candidate) => {
      body = candidate;
      if (!pushed) {
        pushed = true;
        body = stampBodyVersion(`header\n${next.marker}\nfooter`, 3);
      }
    },
  };
  await assert.rejects(
    () =>
      mutateIssueBody({
        issueNumber: 1117,
        repo: 'o/r',
        mutate: (base) => base.replace('header', 'header changed'),
        allowMarkerAdvance: ['aitm-resident-action-ledger-head'],
        validateFreshBase: (base) => {
          if (parseBodyLedgerHead(base)?.visit !== first.visit) {
            throw new Error('stale-expected-head');
          }
        },
        deps,
      }),
    /stale-expected-head/
  );
});

test('failed attempts advance ordinal while open attempts reuse it', () => {
  assert.deepEqual(
    deriveActionAttempt({
      actionHead: { attemptId: 1, phase: 'intent' },
      correlation: { key: 'A' },
      verifyStatus: 'incomplete',
    }),
    { attemptId: 1, correlation: { key: 'A' }, phase: 'intent' }
  );
  assert.equal(
    deriveActionAttempt({
      actionHead: { attemptId: 1, phase: 'failed' },
      correlation: { key: 'B' },
      verifyStatus: 'incomplete',
    }).attemptId,
    2
  );
});

test('append creates genesis, preserves action union, and exact retry no-ops', async () => {
  const server = memoryWriter();
  server.deps.findEventById = async (_issue, eventId) => {
    for (const [id, body] of server.comments) {
      if (body.includes(`id="${eventId}"`)) return { id, body };
    }
    return null;
  };
  const input = {
    repository: 'o/r',
    issue: 1117,
    state: 'review',
    stateVisitId: 'review:1',
    actionId: 'review-agent-validation',
    phase: 'intent',
    correlation: { key: 'A' },
    definition: HASH_A,
    ts: '2026-08-31T00:00:00.000Z',
    deps: server.deps,
  };
  const first = await appendActionEvent(input);
  const retry = await appendActionEvent(input);
  await appendActionEvent({
    ...input,
    actionId: 'second-action',
    correlation: { key: 'B' },
    definition: HASH_B,
  });
  assert.equal(first.event.attemptId, 1);
  assert.equal(retry.status, 'no-op');
  assert.equal(server.comments.size, 2);
  const head = parseBodyLedgerHead(server.body);
  assert.ok(head.actions['review-agent-validation']);
  assert.ok(head.actions['second-action']);
  assert.equal(head.definition, HASH_B);
});

test('append fails closed when the current event was altered', async () => {
  const server = memoryWriter();
  const input = {
    repository: 'o/r',
    issue: 1117,
    state: 'review',
    stateVisitId: 'review:1',
    actionId: 'review-agent-validation',
    phase: 'intent',
    correlation: { key: 'A' },
    definition: HASH_A,
    ts: '2026-08-31T00:00:00.000Z',
    deps: server.deps,
  };
  await appendActionEvent(input);
  const [id] = server.comments.keys();
  server.comments.set(id, `${server.comments.get(id)} altered`);
  await assert.rejects(
    () => appendActionEvent({ ...input, phase: 'waiting' }),
    /resident-action-current-event-damaged/
  );
});

test('orphan recovery consumes every page and refuses ambiguity', async () => {
  const pages = [[{ id: '1', body: 'noise' }], [{ id: '2', body: 'candidate' }]];
  let calls = 0;
  const recovered = await recoverOrphanedEvent({
    expectedEventId: 'event-A',
    listCommentsPage: async ({ cursor }) => ({
      comments: pages[calls++],
      nextCursor: cursor == null ? 'page-2' : null,
    }),
    parseCandidate: (comment) =>
      comment.body === 'candidate' ? { eventId: 'event-A', comment } : null,
  });
  assert.equal(calls, 2);
  assert.equal(recovered.status, 'recovered');

  const ambiguous = await recoverOrphanedEvent({
    expectedEventId: 'event-A',
    listCommentsPage: async () => ({
      comments: [
        { id: '2', body: 'candidate' },
        { id: '3', body: 'candidate' },
      ],
      nextCursor: null,
    }),
    parseCandidate: (comment) => ({ eventId: 'event-A', comment }),
  });
  assert.equal(ambiguous.status, 'damaged');
  assert.equal(ambiguous.reason, 'ledger-orphan-ambiguous');
});

test('interrupted orphan scan pauses without claiming damage', async () => {
  const result = await recoverOrphanedEvent({
    expectedEventId: 'event-A',
    listCommentsPage: async () => {
      throw new Error('cancelled');
    },
  });
  assert.deepEqual(result, { status: 'paused', reason: 'ledger-orphan-scan-interrupted' });
});

test('reconcile requires declared human approval and leaves proof unproven', async () => {
  const head = {
    ...createGenesisHead({ visit: 'review:1', definition: HASH_A }),
    actions: {
      'review-agent-validation': {
        commentId: '9',
        hash: HASH_A,
        attemptId: 1,
        phase: 'failed',
      },
    },
  };
  await assert.rejects(() => reconcileActionLedger({ head }), /human-approval-required/);
  const comments = [];
  let advanced = null;
  const result = await reconcileActionLedger({
    head,
    approvedBy: 'kendrick',
    reason: 'deleted event',
    affectedActionIds: ['review-agent-validation'],
    evidence: { missing: ['9'] },
    deps: {
      withIssueLock: async (_options, operation) => operation(),
      createComment: async (_issue, body) => {
        comments.push(body);
        return { id: '50', body };
      },
      readComment: async () => ({ id: '50', body: comments[0] }),
      advanceHead: async (input) => {
        advanced = input;
      },
    },
  });
  assert.equal(result.head.actions['review-agent-validation'].proof, 'unproven');
  assert.equal(result.correction.schema, 'aitm.resident-action-ledger-correction/v1');
  assert.match(comments[0], /Do not edit or delete/);
  assert.match(advanced.nextHead.commit, /^50:sha256:/);

  let carryBody = '';
  const carry = await recordLedgerDamageCarry({
    issue: 1117,
    snapshot: { status: 'damaged' },
    movementIntent: { target: 'review' },
    deps: {
      createComment: async (_issue, body) => {
        carryBody = body;
        return { id: '51', body };
      },
      readComment: async (_issue, id) => ({ id, body: carryBody }),
      now: () => 0,
    },
  });
  assert.match(carryBody, /aitm-resident-action-ledger-damage-carry/);
  assert.equal(carry.commentId, '51');
});

test('audit paginates fully and spill GC requires fresh unreachable proof', async () => {
  let pages = 0;
  const audit = await auditActionLedger({
    listCommentsPage: async ({ cursor }) => ({
      comments: cursor ? [{ id: '2', body: 'b' }] : [{ id: '1', body: 'a' }],
      nextCursor: cursor ? null : 'next',
    }),
    inspectComment: (comment) => ({ id: comment.id, status: 'observed' }),
    onPage: () => {
      pages += 1;
    },
  });
  assert.equal(pages, 2);
  assert.equal(audit.records.length, 2);

  const current = await collectSupersededSpillHeads({
    candidateCommentId: '20',
    readIssueBody: async () =>
      '<!-- aitm-resident-action-ledger-head mode="spill" visit="review:1" head="20:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" -->',
    deleteComment: async () => assert.fail('current head must not be deleted'),
  });
  assert.equal(current.status, 'retained');
  assert.equal(current.reason, 'spill-head-current');

  const warning = await collectSupersededSpillHeads({
    candidateCommentId: '19',
    successorCommentId: '20',
    readIssueBody: async () => '',
    readComment: async (id) => ({
      id,
      body: renderSpillHeadComment({
        schema: 'aitm.resident-action-head/v1',
        visit: 'review:1',
        commit: null,
        definition: HASH_A,
        audit: null,
        actions: {},
      }),
    }),
    deleteComment: async () => {
      throw new Error('provider refusal');
    },
  });
  assert.equal(warning.warnings[0].code, 'orphaned-spill-snapshot');
});
