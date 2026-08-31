// @story #1117 #1454 #1455 #1456

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
import {
  ACTION_OUTCOMES,
  VERIFY_STATUSES,
  createResidentActionRunner,
} from '../../../../task-tracker/lib/resident-action-runner.mjs';
import { RepositoryAdapter } from '../../../../task-tracker/lib/repository-adapter.mjs';

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

function runnerSnapshot(overrides = {}) {
  return {
    issue: { value: 1117 },
    currentState: { value: 'review' },
    stateVisitId: 'review:1',
    invocation: { issue: 1117, cwd: '/tmp/task-1117', mode: 'online', maxLinks: 3 },
    actionLedger: { status: 'clean', events: [] },
    ...overrides,
  };
}

function runnerRepository({ snapshots = [], now = Date.parse('2026-08-31T12:00:00Z') } = {}) {
  const appended = [];
  let hydrateIndex = 0;
  const repository = new RepositoryAdapter({
    now: () => now,
    hydrateTask: async () => snapshots[Math.min(hydrateIndex++, snapshots.length - 1)],
    resolveCorrelation: ({ action }) => ({ key: `${action.id}:correlation` }),
    withCorrelationIntent: async ({ correlation }, operation) => operation(correlation),
    appendActionEvent: async (event) => {
      appended.push(event);
      return { status: 'appended', event };
    },
  });
  repository.hydrateTask = repository.capabilities.hydrateTask;
  return {
    repository,
    appended,
    get hydrateCalls() {
      return hydrateIndex;
    },
  };
}

function actionDouble({ id = 'review-check', serialization = 'correlation', verify, run } = {}) {
  const calls = { verify: 0, run: 0, contexts: [] };
  return {
    id,
    serialization,
    calls,
    async verify(context, snapshot) {
      calls.verify += 1;
      calls.contexts.push(context);
      return typeof verify === 'function' ? verify(calls.verify, snapshot) : verify;
    },
    async run(context, snapshot, input) {
      calls.run += 1;
      calls.contexts.push(context);
      return typeof run === 'function' ? run(calls.run, snapshot, input) : run;
    },
  };
}

test('runner exports closed status vocabularies and a frozen narrow capability context', async () => {
  assert.deepEqual(VERIFY_STATUSES, ['complete', 'incomplete']);
  assert.deepEqual(ACTION_OUTCOMES, ['complete', 'waiting', 'paused', 'failed']);
  const base = runnerSnapshot();
  const fixture = runnerRepository({ snapshots: [base] });
  const action = actionDouble({ verify: { status: 'complete', evidence: { sha: 'abc' } } });
  await createResidentActionRunner({
    repository: fixture.repository,
    actionContext: { git: { readHead: () => 'abc' }, gh: { raw: true }, lockDirectory: '/tmp/x' },
  }).resume([action], base, { trigger: 'actions-only', writeAuthorized: true });
  const [context] = action.calls.contexts;
  assert.ok(Object.isFrozen(context));
  assert.ok(Object.isFrozen(context.git));
  assert.equal(context.git.readHead(), 'abc');
  assert.equal(context.gh, undefined);
  assert.equal(context.lockDirectory, undefined);
  assert.equal(context.requestTransition, undefined);
});

test('verify-first traversal scans from start and never runs fresh completion', async () => {
  const base = runnerSnapshot();
  const fixture = runnerRepository({ snapshots: [base, base] });
  const first = actionDouble({
    id: 'first',
    verify: { status: 'complete', evidence: { sha: 'a' } },
  });
  const second = actionDouble({
    id: 'second',
    verify: { status: 'complete', evidence: { sha: 'b' } },
  });
  const runner = createResidentActionRunner({ repository: fixture.repository });
  assert.deepEqual(
    await runner.resume([first, second], base, { trigger: 'actions-only', writeAuthorized: true }),
    { status: 'complete' }
  );
  assert.deepEqual(
    await runner.resume([first, second], base, { trigger: 'actions-only', writeAuthorized: true }),
    { status: 'complete' }
  );
  assert.equal(first.calls.verify, 2);
  assert.equal(second.calls.verify, 2);
  assert.equal(first.calls.run + second.calls.run, 0);
});

test('stale resolved evidence reruns, rehydrates after the effect, and verifies finally', async () => {
  const resolved = {
    phase: 'resolved',
    correlation: { key: 'old' },
    evidenceFingerprint: HASH_A,
  };
  const before = runnerSnapshot({ actionLedger: { status: 'clean', events: [resolved] } });
  const after = runnerSnapshot({ actionLedger: { status: 'clean', events: [resolved] } });
  const fixture = runnerRepository({ snapshots: [before, after] });
  const action = actionDouble({
    verify: (call) =>
      call === 1 ? { status: 'incomplete' } : { status: 'complete', evidence: { sha: 'new' } },
    run: { status: 'complete' },
  });
  const result = await createResidentActionRunner({ repository: fixture.repository }).resume(
    [action],
    before,
    { trigger: 'resident-entry', writeAuthorized: true }
  );
  assert.deepEqual(result, { status: 'complete' });
  assert.equal(action.calls.run, 1);
  assert.equal(action.calls.verify, 2);
  assert.ok(fixture.hydrateCalls >= 2);
  assert.equal(fixture.appended.at(-1).phase, 'resolved');
});

test('verified open attempts close as correlated or observed without calling run', async () => {
  for (const [evidenceCorrelation, attribution] of [
    [{ key: 'A' }, 'correlated'],
    [{ key: 'B' }, 'observed'],
  ]) {
    const open = { phase: 'waiting', correlation: { key: 'A' }, deadline: '2026-09-01T00:00:00Z' };
    const base = runnerSnapshot({ actionLedger: { status: 'clean', events: [open] } });
    const fixture = runnerRepository({ snapshots: [base] });
    const action = actionDouble({
      verify: { status: 'complete', evidence: { correlation: evidenceCorrelation } },
    });
    const result = await createResidentActionRunner({ repository: fixture.repository }).resume(
      [action],
      base,
      { trigger: 'actions-only', writeAuthorized: true }
    );
    assert.deepEqual(result, { status: 'complete' });
    assert.equal(action.calls.run, 0);
    assert.equal(fixture.appended[0].phase, 'resolved');
    assert.equal(fixture.appended[0].attribution, attribution);
  }
});

test('waiting deadlines remain read-only before expiry and fail exactly at expiry when authorized', async () => {
  const waiting = {
    phase: 'waiting',
    correlation: { key: 'A' },
    deadline: '2026-08-31T12:00:00.000Z',
  };
  const base = runnerSnapshot({ actionLedger: { status: 'clean', events: [waiting] } });
  const action = actionDouble({ verify: { status: 'incomplete' } });
  const before = runnerRepository({
    snapshots: [base],
    now: Date.parse('2026-08-31T11:59:59.999Z'),
  });
  assert.deepEqual(
    await createResidentActionRunner({ repository: before.repository }).resume([action], base, {
      trigger: 'actions-only',
      writeAuthorized: true,
    }),
    { status: 'waiting', deadline: waiting.deadline, correlation: waiting.correlation }
  );
  assert.equal(before.appended.length, 0);

  const readOnly = runnerRepository({ snapshots: [base] });
  assert.deepEqual(
    await createResidentActionRunner({ repository: readOnly.repository }).resume([action], base, {
      trigger: 'actions-only',
      writeAuthorized: false,
    }),
    {
      status: 'waiting',
      deadline: waiting.deadline,
      correlation: waiting.correlation,
      expired: true,
    }
  );
  assert.equal(readOnly.appended.length, 0);

  const expired = runnerRepository({ snapshots: [base] });
  assert.deepEqual(
    await createResidentActionRunner({ repository: expired.repository }).resume([action], base, {
      trigger: 'actions-only',
      writeAuthorized: true,
    }),
    { status: 'failed', reason: 'waiting-deadline-expired' }
  );
  assert.equal(expired.appended[0].phase, 'failed');
});

test('malformed waiting evidence fails closed', async () => {
  const malformed = runnerSnapshot({
    actionLedger: {
      status: 'clean',
      events: [{ phase: 'waiting', correlation: {}, deadline: 'not-a-date' }],
    },
  });
  const fixture = runnerRepository({ snapshots: [malformed] });
  const action = actionDouble({ verify: { status: 'incomplete' } });
  assert.deepEqual(
    await createResidentActionRunner({ repository: fixture.repository }).resume(
      [action],
      malformed,
      { trigger: 'actions-only', writeAuthorized: true }
    ),
    { status: 'paused', reason: 'malformed-waiting-event' }
  );
  assert.equal(action.calls.run, 0);
});

test('correlation intent revalidates visit immediately before provider effect', async () => {
  const before = runnerSnapshot({ stateVisitId: 'review:1' });
  const changed = runnerSnapshot({ stateVisitId: 'review:2' });
  const fixture = runnerRepository({ snapshots: [before, changed] });
  const action = actionDouble({ verify: { status: 'incomplete' }, run: { status: 'complete' } });
  const result = await createResidentActionRunner({ repository: fixture.repository }).resume(
    [action],
    before,
    { trigger: 'resident-entry', writeAuthorized: true }
  );
  assert.deepEqual(result, { status: 'paused', reason: 'stale-state-visit' });
  assert.equal(action.calls.run, 0);
});

test('correlation serialization shares one winner and lock contention pauses', async () => {
  const base = runnerSnapshot();
  let winner;
  const seen = [];
  const capabilities = {
    now: () => Date.parse('2026-08-31T12:00:00Z'),
    hydrateTask: async () => base,
    resolveCorrelation: () => ({ key: Math.random().toString(16) }),
    withCorrelationIntent: async ({ correlation }, operation) => {
      winner ??= correlation;
      return operation(winner);
    },
    appendActionEvent: async () => ({ status: 'appended' }),
  };
  const repository = new RepositoryAdapter(capabilities);
  repository.hydrateTask = capabilities.hydrateTask;
  const action = actionDouble({
    verify: (call) => (call <= 2 ? { status: 'incomplete' } : { status: 'complete' }),
    run: (_call, _snapshot, input) => {
      seen.push(input.correlation);
      return { status: 'complete' };
    },
  });
  const runner = createResidentActionRunner({ repository });
  await Promise.all([
    runner.resume([action], base, { trigger: 'actions-only', writeAuthorized: true }),
    runner.resume([action], base, { trigger: 'actions-only', writeAuthorized: true }),
  ]);
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[0], seen[1]);

  const blocked = new RepositoryAdapter({
    hydrateTask: async () => base,
    resolveCorrelation: () => ({ key: 'A' }),
    withCorrelationIntent: async () => {
      const error = new Error('lock busy');
      error.code = 'EBUSY';
      throw error;
    },
  });
  blocked.hydrateTask = blocked.capabilities.hydrateTask;
  assert.deepEqual(
    await createResidentActionRunner({ repository: blocked }).resume(
      [actionDouble({ verify: { status: 'incomplete' } })],
      base,
      {
        trigger: 'actions-only',
        writeAuthorized: true,
      }
    ),
    { status: 'paused', reason: 'action-lock-contention' }
  );
});

test('waiting outcomes require correlation and ISO deadline', async () => {
  const base = runnerSnapshot();
  const fixture = runnerRepository({ snapshots: [base, base] });
  const action = actionDouble({ verify: { status: 'incomplete' }, run: { status: 'waiting' } });
  assert.deepEqual(
    await createResidentActionRunner({ repository: fixture.repository }).resume([action], base, {
      trigger: 'actions-only',
      writeAuthorized: true,
    }),
    { status: 'paused', reason: 'invalid-waiting-outcome' }
  );
  assert.equal(
    fixture.appended.some((event) => event.phase === 'waiting'),
    false
  );
});

test('waiting is returned only after the durable event is rehydrated and verified', async () => {
  const base = runnerSnapshot();
  const deadline = '2026-09-01T00:00:00.000Z';
  const durable = runnerSnapshot({
    actionLedger: {
      status: 'clean',
      events: [{ phase: 'waiting', correlation: { key: 'review-check:correlation' }, deadline }],
    },
  });
  const fixture = runnerRepository({ snapshots: [base, base, base, durable] });
  const action = actionDouble({
    verify: { status: 'incomplete' },
    run: { status: 'waiting', deadline },
  });
  assert.deepEqual(
    await createResidentActionRunner({ repository: fixture.repository }).resume([action], base, {
      trigger: 'actions-only',
      writeAuthorized: true,
    }),
    { status: 'waiting', deadline, correlation: { key: 'review-check:correlation' } }
  );
});
