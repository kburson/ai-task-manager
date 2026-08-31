// @story #310
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  stampEntryMarker,
  parseEntryMarkers,
  parseEntryMarkersFirstVisit,
  verifyChainIntegrity,
  backfillEntryMarker,
  stripEntryMarkersAfter,
  getStageVisitCount,
  buildReentryAuditMarker,
  buildReentryAuditCommentBody,
  postReentryAuditComment,
  LEGAL_TRANSITIONS,
  STAGES,
} from '../../../../task-tracker/lib/stage-entry-markers.mjs';
import { parseEntryMarkers as parseGrammarEntries } from '../../../../task-tracker/lib/stage-entry-grammar.mjs';
import {
  classifyVisitOrder,
  deterministicBackfillTransitionId,
  parseTransitionCommitComment,
  repairTransitionCommit,
  renderTransitionCommitComment,
  writeTransitionCommit,
} from '../../../../task-tracker/lib/move-state/transition-commit.mjs';

// 13. buildReentryAuditMarker + buildReentryAuditCommentBody — #184
{
  // #380: reentry-audit marker now uses the property grammar.
  assert.equal(
    buildReentryAuditMarker('plan', 2),
    '<!-- aitm-reentry-audit stage="plan" visit="2" -->'
  );
  const body = buildReentryAuditCommentBody({
    stage: 'plan',
    visit: 2,
    ts: '2026-01-01T00:00:00Z',
  });
  assert.match(body, /plan/);
  assert.match(body, /visit 2/);
  assert.match(body, /2026-01-01T00:00:00Z/);
  assert.match(body, /<!-- aitm-reentry-audit stage="plan" visit="2" -->/);
  // Validation
  assert.throws(() => buildReentryAuditCommentBody({ stage: 'plan', visit: 1, ts: 't' }));
  assert.throws(() => buildReentryAuditCommentBody({ stage: 'plan', visit: 2, ts: '' }));
  assert.throws(() => buildReentryAuditCommentBody({ visit: 2, ts: 't' }));
}

// 14. postReentryAuditComment — first-visit is a no-op — #184
{
  const posted = [];
  const listed = [];
  const res = await postReentryAuditComment({
    issueNumber: 1,
    repo: 'o/r',
    stage: 'plan',
    visit: 1,
    ts: '2026-01-01T00:00:00Z',
    postComment: async (args) => {
      posted.push(args);
    },
    listComments: async (args) => {
      listed.push(args);
      return [];
    },
  });
  assert.equal(res.mode, 'first-visit');
  assert.equal(posted.length, 0, 'first-visit posts no comment');
  assert.equal(listed.length, 0, 'first-visit does not list comments');
}

// 15. postReentryAuditComment — second visit posts comment — #184
{
  const posted = [];
  const res = await postReentryAuditComment({
    issueNumber: 42,
    repo: 'o/r',
    stage: 'plan',
    visit: 2,
    ts: '2026-01-02T00:00:00Z',
    postComment: async (args) => {
      posted.push(args);
    },
    listComments: async () => [],
  });
  assert.equal(res.mode, 'posted');
  assert.equal(posted.length, 1, 'one comment posted');
  assert.equal(posted[0].repo, 'o/r');
  assert.equal(posted[0].issueNumber, 42);
  assert.match(posted[0].body, /<!-- aitm-reentry-audit stage="plan" visit="2" -->/);
}

// 16. postReentryAuditComment — repeat-stamp does not duplicate — #184
{
  const posted = [];
  const existing = [
    { body: 'unrelated' },
    { body: 'something <!-- aitm-reentry-audit: plan-2 --> visible' },
  ];
  const res = await postReentryAuditComment({
    issueNumber: 42,
    repo: 'o/r',
    stage: 'plan',
    visit: 2,
    ts: '2026-01-02T00:00:00Z',
    postComment: async (args) => {
      posted.push(args);
    },
    listComments: async () => existing,
  });
  assert.equal(res.mode, 'already-present');
  assert.equal(posted.length, 0, 'no duplicate comment');
}

// 17. postReentryAuditComment — distinct visit numbers don't collide — #184
{
  const posted = [];
  const existing = [{ body: '<!-- aitm-reentry-audit: plan-2 -->' }];
  const res = await postReentryAuditComment({
    issueNumber: 42,
    repo: 'o/r',
    stage: 'plan',
    visit: 3,
    ts: '2026-01-03T00:00:00Z',
    postComment: async (args) => {
      posted.push(args);
    },
    listComments: async () => existing,
  });
  assert.equal(res.mode, 'posted');
  assert.equal(posted.length, 1);
  assert.match(posted[0].body, /<!-- aitm-reentry-audit stage="plan" visit="3" -->/);
}

// 18. postReentryAuditComment — post failure degrades gracefully (no throw) — #184
{
  const warnings = [];
  const res = await postReentryAuditComment({
    issueNumber: 42,
    repo: 'o/r',
    stage: 'plan',
    visit: 2,
    ts: '2026-01-02T00:00:00Z',
    postComment: async () => {
      throw new Error('network down');
    },
    listComments: async () => [],
    warn: (msg) => warnings.push(msg),
  });
  assert.equal(res.mode, 'error');
  assert.match(res.error, /network down/);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /reentry-audit/);
  assert.match(warnings[0], /FAILED/);
}

// 19. postReentryAuditComment — list failure posts anyway with warning — #184
{
  const posted = [];
  const warnings = [];
  const res = await postReentryAuditComment({
    issueNumber: 42,
    repo: 'o/r',
    stage: 'plan',
    visit: 2,
    ts: '2026-01-02T00:00:00Z',
    postComment: async (args) => {
      posted.push(args);
    },
    listComments: async () => {
      throw new Error('list api down');
    },
    warn: (msg) => warnings.push(msg),
  });
  assert.equal(res.mode, 'posted');
  assert.equal(posted.length, 1);
  assert.ok(warnings.some((w) => /comment list failed/.test(w)));
}

// 20. postReentryAuditComment — argument validation — #184
await assert.rejects(
  postReentryAuditComment({ repo: 'o/r', stage: 'plan', visit: 2, ts: 't' }),
  /issueNumber is required/
);
await assert.rejects(
  postReentryAuditComment({ issueNumber: 1, stage: 'plan', visit: 2, ts: 't' }),
  /repo is required/
);
await assert.rejects(
  postReentryAuditComment({ issueNumber: 1, repo: 'o/r', stage: 'mystery', visit: 2, ts: 't' }),
  /unknown stage/
);
await assert.rejects(
  postReentryAuditComment({ issueNumber: 1, repo: 'o/r', stage: 'plan', visit: 0, ts: 't' }),
  /visit must be a positive integer/
);
await assert.rejects(
  postReentryAuditComment({ issueNumber: 1, repo: 'o/r', stage: 'plan', visit: 2 }),
  /ts is required/
);

// #211 — Legal-arc validator anchors at the latest aitm-entered-develop-N
// marker. Arcs before the most recent develop re-entry belong to a discarded
// earlier attempt and should not block close on a corrected suffix.
{
  // Anchored pass: early illegal `develop -> review` (skipped test) followed
  // by a corrected suffix `review -> develop-2 -> test -> review-2`.
  const repaired =
    '<!-- aitm-entered-refine: 2026-01-01T00:00:00Z -->\n' +
    '<!-- aitm-entered-ready-for-plan: 2026-01-01T12:00:00Z -->\n' +
    '<!-- aitm-entered-plan: 2026-01-02T00:00:00Z -->\n' +
    '<!-- aitm-entered-develop: 2026-01-03T00:00:00Z -->\n' +
    '<!-- aitm-entered-review: 2026-01-04T00:00:00Z -->\n' +
    '<!-- aitm-entered-develop-2: 2026-01-05T00:00:00Z -->\n' +
    '<!-- aitm-entered-test: 2026-01-06T00:00:00Z -->\n' +
    '<!-- aitm-entered-review-2: 2026-01-07T00:00:00Z -->\n';
  const rRepaired = verifyChainIntegrity(repaired, 'review');
  assert.equal(rRepaired.ok, true, 'repaired chain after develop re-entry should pass');
  assert.deepEqual(rRepaired.illegalArcs, []);

  // Anchored fail: latest suffix itself contains an illegal arc.
  const stillBroken =
    '<!-- aitm-entered-develop: 2026-01-01T00:00:00Z -->\n' +
    '<!-- aitm-entered-test: 2026-01-02T00:00:00Z -->\n' +
    '<!-- aitm-entered-develop-2: 2026-01-03T00:00:00Z -->\n' +
    '<!-- aitm-entered-done: 2026-01-04T00:00:00Z -->\n';
  const rBroken = verifyChainIntegrity(stillBroken, 'done');
  assert.equal(rBroken.ok, false, 'illegal arc inside the latest suffix must still fail');
  assert.equal(rBroken.illegalArcs.length, 1);
  assert.equal(rBroken.illegalArcs[0].from, 'develop');
  assert.equal(rBroken.illegalArcs[0].to, 'done');
}

// #374 — marker-grammar migration: writer emits `ts="<iso>"` form; reader
// tolerates BOTH the new form and the legacy colon form, for a base stage and
// a re-entry-suffixed stage, including a mixed body carrying both grammars.
{
  // serialize — base stage
  const base = stampEntryMarker('', 'develop', '2026-05-01T00:00:00Z');
  assert.match(base, /<!-- aitm-entered-develop ts="2026-05-01T00:00:00Z" -->/);
  assert.doesNotMatch(base, /aitm-entered-develop:/, 'no legacy colon form emitted');

  // serialize — re-entry-suffixed stage
  const reentry = stampEntryMarker(base, 'develop', '2026-05-02T00:00:00Z');
  assert.match(reentry, /<!-- aitm-entered-develop-2 ts="2026-05-02T00:00:00Z" -->/);

  // parse-new — round-trips both base + suffixed new-form markers
  const parsedNew = parseEntryMarkers(reentry);
  assert.deepEqual(parsedNew, [
    { stage: 'develop', visit: 1, ts: '2026-05-01T00:00:00Z' },
    { stage: 'develop', visit: 2, ts: '2026-05-02T00:00:00Z' },
  ]);

  // parse-legacy — colon form, base + suffixed, still parses (back-compat)
  const legacyBody =
    '<!-- aitm-entered-plan: 2026-05-03T00:00:00Z -->\n' +
    '<!-- aitm-entered-plan-2: 2026-05-04T00:00:00Z -->\n';
  assert.deepEqual(parseEntryMarkers(legacyBody), [
    { stage: 'plan', visit: 1, ts: '2026-05-03T00:00:00Z' },
    { stage: 'plan', visit: 2, ts: '2026-05-04T00:00:00Z' },
  ]);

  // parse-mixed — a single body holding both grammars (the migration window)
  const mixed =
    '<!-- aitm-entered-backlog: 2026-05-01T00:00:00Z -->\n' +
    '<!-- aitm-entered-refine ts="2026-05-02T00:00:00Z" -->\n';
  assert.deepEqual(parseEntryMarkers(mixed), [
    { stage: 'backlog', visit: 1, ts: '2026-05-01T00:00:00Z' },
    { stage: 'refine', visit: 1, ts: '2026-05-02T00:00:00Z' },
  ]);

  // detector parity — getStageVisitCount + stripEntryMarkersAfter read the new
  // form, and strip removes a new-form future-stage marker (incl. suffix).
  assert.equal(getStageVisitCount(reentry, 'develop'), 2);
  const futureNew =
    '<!-- aitm-entered-test ts="2026-05-05T00:00:00Z" -->\n' +
    '<!-- aitm-entered-review ts="2026-05-06T00:00:00Z" -->\n' +
    '<!-- aitm-entered-review-2 ts="2026-05-07T00:00:00Z" -->\n';
  const { body: strippedBody, stripped } = stripEntryMarkersAfter(futureNew, 'test');
  assert.deepEqual(stripped, ['review']);
  assert.doesNotMatch(strippedBody, /aitm-entered-review/, 'both review markers stripped');
  assert.match(strippedBody, /aitm-entered-test/, 'test marker preserved');

  // verifyChainIntegrity treats a mixed-grammar chain as a contiguous chain
  const mixedChain =
    '<!-- aitm-entered-backlog: 2026-05-01T00:00:00Z -->\n' +
    '<!-- aitm-entered-refine ts="2026-05-02T00:00:00Z" -->\n' +
    '<!-- aitm-entered-ready-for-plan ts="2026-05-02T12:00:00Z" -->\n' +
    '<!-- aitm-entered-plan ts="2026-05-03T00:00:00Z" -->\n';
  const mr = verifyChainIntegrity(mixedChain, 'plan');
  assert.equal(mr.ok, true, `mixed-grammar chain should pass: ${JSON.stringify(mr)}`);
  assert.deepEqual(mr.holes, []);
}

console.log('stage-entry-markers.test.mjs: all passed');

test('same-second transition IDs produce distinct visits and idempotent exact replay', () => {
  const base = '<!-- aitm-entered-develop ts="same-second" move="move:one" -->';
  const replay = stampEntryMarker(base, 'develop', 'same-second', 'move:one');
  const next = stampEntryMarker(replay, 'develop', 'same-second', 'move:two');
  assert.equal(replay, base);
  assert.deepEqual(parseGrammarEntries(next), [
    { state: 'develop', visit: 1, ts: 'same-second', move: 'move:one', occurrence: 1 },
    { state: 'develop', visit: 2, ts: 'same-second', move: 'move:two', occurrence: 2 },
  ]);
});

test('transition commit codec and deterministic backfill identity are stable', () => {
  const record = {
    schema: 'aitm.transition-commit/v1',
    transitionId: 'move:one',
    repository: 'o/r',
    issue: 7,
    source: 'develop',
    target: 'test',
    visitMarker: '<!-- marker -->',
    actor: 'agent',
    sentinelFingerprint: `sha256:${'a'.repeat(64)}`,
  };
  assert.deepEqual(parseTransitionCommitComment(renderTransitionCommitComment(record)), record);
  const input = { repository: 'o/r', issue: 7, state: 'test', visit: 2, occurrence: 9 };
  assert.equal(deterministicBackfillTransitionId(input), deterministicBackfillTransitionId(input));
  assert.match(deterministicBackfillTransitionId(input), /^backfill:[a-f0-9]{64}$/);
});

test('transition commit write verifies read-back and replay repair stays idempotent', async () => {
  let createdBody = '';
  let createCount = 0;
  const ctx = {
    SKIP_NETWORK: false,
    transitionId: 'move:one',
    transitionEvidence: {
      visitMarker: '<!-- aitm-entered-test ts="same" move="move:one" -->',
      sentinelMarker: '<!-- aitm-move-complete state=test ts=same move=move:one -->',
    },
    cfg: { repo: 'o/r' },
    issueArg: '7',
    stateArg: 'test',
    resolvedFromState: 'develop',
    actor: 'agent',
    deps: {
      createTransitionComment: async (body) => {
        createCount += 1;
        createdBody = body;
        return { id: 42 };
      },
      readTransitionComment: async () => ({ id: 42, body: createdBody }),
      listTransitionComments: async () => [{ id: 42, body: createdBody }],
    },
  };

  const written = await writeTransitionCommit(ctx, ctx.transitionEvidence);
  assert.equal(written.verified, true);
  assert.equal(written.commentId, '42');
  assert.equal(written.record.transitionId, 'move:one');
  assert.equal(createCount, 1);

  const repaired = await repairTransitionCommit(ctx);
  assert.equal(repaired.status, 'already-present');
  assert.equal(repaired.commentId, '42');
  assert.equal(createCount, 1, 'verified replay must not duplicate the protected comment');
});

test('mixed visit ordering uses occurrence and ordinal, never timestamps', () => {
  const current = { id: 'move:new', state: 'test', visit: 2, occurrence: 5, ts: 'old' };
  const head = { id: 'legacy:test:1:2', state: 'test', visit: 1, occurrence: 2, ts: 'new' };
  assert.deepEqual(classifyVisitOrder({ current, head }), {
    status: 'prior',
    diagnostics: ['commit-provenance-missing'],
  });
  assert.equal(
    classifyVisitOrder({ current, head: { ...head, visit: 3 } }).status,
    'drift',
    'ordinal contradiction must not be hidden by timestamps or occurrence'
  );
});
