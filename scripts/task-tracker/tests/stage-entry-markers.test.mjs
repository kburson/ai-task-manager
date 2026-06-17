#!/usr/bin/env node
// @story #140
import { strict as assert } from 'node:assert';
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
} from '../lib/stage-entry-markers.mjs';

// 1. stampEntryMarker adds marker to empty body — writer now emits the #374
//    property-grammar form `aitm-entered-<stage> ts="<iso>"`.
let b = stampEntryMarker('', 'refine', '2026-01-01T00:00:00Z');
assert.match(b, /<!-- aitm-entered-refine ts="2026-01-01T00:00:00Z" -->/);

// stampEntryMarker inserts before field-DB when present
const withFields = 'Body text\n\n<!-- aitm-fields: {"foo":"bar"} -->\n';
b = stampEntryMarker(withFields, 'plan', '2026-01-02T00:00:00Z');
assert.ok(b.indexOf('aitm-entered-plan') < b.indexOf('aitm-fields'));

// 2. Visit-numbered stamping (#181): second visit emits `-2`, third `-3`, etc.
let visitBody = stampEntryMarker('', 'refine', '2026-01-01T00:00:00Z');
visitBody = stampEntryMarker(visitBody, 'refine', '2026-02-02T00:00:00Z');
assert.match(visitBody, /<!-- aitm-entered-refine ts="2026-01-01T00:00:00Z" -->/);
assert.match(visitBody, /<!-- aitm-entered-refine-2 ts="2026-02-02T00:00:00Z" -->/);
visitBody = stampEntryMarker(visitBody, 'refine', '2026-03-03T00:00:00Z');
assert.match(visitBody, /<!-- aitm-entered-refine-3 ts="2026-03-03T00:00:00Z" -->/);

// 2b. First-visit idempotency: re-stamping same stage with same ts is no-op
const onceVisit = stampEntryMarker('', 'refine', '2026-01-01T00:00:00Z');
const twiceSameTs = stampEntryMarker(onceVisit, 'refine', '2026-01-01T00:00:00Z');
assert.equal(onceVisit, twiceSameTs, 'same-ts re-stamp is no-op');

// 3. parseEntryMarkers returns ordered tuples
assert.deepEqual(parseEntryMarkers(''), []);
let multi = '';
for (const s of STAGES) {
  multi = stampEntryMarker(
    multi,
    s,
    `2026-01-${String(STAGES.indexOf(s) + 1).padStart(2, '0')}T00:00:00Z`
  );
}
const parsed = parseEntryMarkers(multi);
assert.equal(parsed.length, 8);
assert.deepEqual(parsed[0], { stage: 'backlog', visit: 1, ts: '2026-01-01T00:00:00Z' });
assert.deepEqual(parsed[7], { stage: 'done', visit: 1, ts: '2026-01-08T00:00:00Z' });

// 3b. parseEntryMarkers captures visit suffixes
const replay = stampEntryMarker(stampEntryMarker('', 'plan', 't1'), 'plan', 't2');
const replayParsed = parseEntryMarkers(replay);
assert.equal(replayParsed.length, 2);
assert.deepEqual(replayParsed[0], { stage: 'plan', visit: 1, ts: 't1' });
assert.deepEqual(replayParsed[1], { stage: 'plan', visit: 2, ts: 't2' });

// 3c. parseEntryMarkersFirstVisit collapses to legacy {stage:ts} map
const firstVisit = parseEntryMarkersFirstVisit(replay);
assert.deepEqual(firstVisit, { plan: 't1' });

// 3d. Legacy bodies without visit suffixes parse as visit:1
const legacy =
  '<!-- aitm-entered-backlog: 2026-01-01T00:00:00Z -->\n' +
  '<!-- aitm-entered-refine: 2026-01-02T00:00:00Z -->\n';
const legacyParsed = parseEntryMarkers(legacy);
assert.equal(legacyParsed.length, 2);
assert.equal(legacyParsed[0].visit, 1);
assert.equal(legacyParsed[1].visit, 1);

// 4. verifyChainIntegrity — no holes, no illegal arcs
let chain = '';
chain = stampEntryMarker(chain, 'backlog', '2026-01-01T00:00:00Z');
chain = stampEntryMarker(chain, 'on-deck', '2026-01-02T00:00:00Z');
chain = stampEntryMarker(chain, 'refine', '2026-01-03T00:00:00Z');
chain = stampEntryMarker(chain, 'plan', '2026-01-04T00:00:00Z');
let r = verifyChainIntegrity(chain, 'plan');
assert.equal(r.ok, true);
assert.deepEqual(r.holes, []);
assert.deepEqual(r.illegalArcs, []);
assert.deepEqual(r.presentStages, ['backlog', 'on-deck', 'refine', 'plan']);

// 5. One hole: backlog + plan, current=plan
let hole = stampEntryMarker('', 'backlog', '2026-01-01T00:00:00Z');
hole = stampEntryMarker(hole, 'plan', '2026-01-03T00:00:00Z');
r = verifyChainIntegrity(hole, 'plan');
assert.equal(r.ok, false);
assert.deepEqual(r.holes, ['on-deck', 'refine']);

// 6. Multiple holes
let holes2 = stampEntryMarker('', 'backlog', '2026-01-01T00:00:00Z');
holes2 = stampEntryMarker(holes2, 'develop', '2026-01-04T00:00:00Z');
r = verifyChainIntegrity(holes2, 'develop');
assert.deepEqual(r.holes, ['on-deck', 'refine', 'plan']);

// 7. Legal rollback arcs pass: backlog→refine→plan→refine-2→plan-2
let rollback = '';
rollback = stampEntryMarker(rollback, 'backlog', '2026-01-01T00:00:00Z');
rollback = stampEntryMarker(rollback, 'on-deck', '2026-01-01T12:00:00Z');
rollback = stampEntryMarker(rollback, 'refine', '2026-01-02T00:00:00Z');
rollback = stampEntryMarker(rollback, 'plan', '2026-01-03T00:00:00Z');
rollback = stampEntryMarker(rollback, 'refine', '2026-01-04T00:00:00Z');
rollback = stampEntryMarker(rollback, 'plan', '2026-01-05T00:00:00Z');
r = verifyChainIntegrity(rollback, 'plan');
assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
assert.deepEqual(r.illegalArcs, []);

// 7b. develop → plan rollback is legal
let devRollback = '';
for (const [s, ts] of [
  ['backlog', '2026-01-01T00:00:00Z'],
  ['on-deck', '2026-01-01T12:00:00Z'],
  ['refine', '2026-01-02T00:00:00Z'],
  ['plan', '2026-01-03T00:00:00Z'],
  ['develop', '2026-01-04T00:00:00Z'],
  ['plan', '2026-01-05T00:00:00Z'],
]) {
  devRollback = stampEntryMarker(devRollback, s, ts);
}
r = verifyChainIntegrity(devRollback, 'plan');
assert.equal(r.ok, true);

// 7c. review → develop rollback (rework) is legal
let reworkChain = '';
for (const [s, ts] of [
  ['backlog', '2026-01-01T00:00:00Z'],
  ['on-deck', '2026-01-01T12:00:00Z'],
  ['refine', '2026-01-02T00:00:00Z'],
  ['plan', '2026-01-03T00:00:00Z'],
  ['develop', '2026-01-04T00:00:00Z'],
  ['test', '2026-01-05T00:00:00Z'],
  ['review', '2026-01-06T00:00:00Z'],
  ['develop', '2026-01-07T00:00:00Z'],
]) {
  reworkChain = stampEntryMarker(reworkChain, s, ts);
}
r = verifyChainIntegrity(reworkChain, 'develop');
assert.equal(r.ok, true);

// 8. Illegal arcs flagged: done → develop
const illegal =
  '<!-- aitm-entered-done: 2026-01-01T00:00:00Z -->\n' +
  '<!-- aitm-entered-develop-2: 2026-01-02T00:00:00Z -->\n';
r = verifyChainIntegrity(illegal, 'develop');
assert.equal(r.ok, false);
assert.equal(r.illegalArcs.length, 1);
assert.equal(r.illegalArcs[0].from, 'done');
assert.equal(r.illegalArcs[0].to, 'develop');

// 8b. Illegal arc: review → refine (skipping develop)
const illegal2 =
  '<!-- aitm-entered-review: 2026-01-01T00:00:00Z -->\n' +
  '<!-- aitm-entered-refine-2: 2026-01-02T00:00:00Z -->\n';
r = verifyChainIntegrity(illegal2, 'refine');
assert.equal(r.ok, false);
assert.equal(r.illegalArcs[0].from, 'review');
assert.equal(r.illegalArcs[0].to, 'refine');

// 9. LEGAL_TRANSITIONS exported and contains expected entries
assert.ok(LEGAL_TRANSITIONS instanceof Set);
for (const arc of [
  'backlog->on-deck',
  'on-deck->refine',
  'on-deck->backlog',
  'refine->plan',
  'plan->develop',
  'develop->test',
  'test->review',
  'review->done',
  'review->develop',
  'test->develop',
  'develop->plan',
  'develop->refine',
  'plan->refine',
  'plan->backlog',
  'refine->backlog',
]) {
  assert.ok(LEGAL_TRANSITIONS.has(arc), `expected legal arc: ${arc}`);
}
assert.ok(!LEGAL_TRANSITIONS.has('done->develop'));
assert.ok(!LEGAL_TRANSITIONS.has('review->refine'));

// Empty body → ok
r = verifyChainIntegrity('', 'develop');
assert.equal(r.ok, true);
assert.deepEqual(r.presentStages, []);
assert.deepEqual(r.illegalArcs, []);

// 10. backfillEntryMarker writes marker AND audit comment
const bf = backfillEntryMarker('', 'refine', '2026-01-02T00:00:00Z', 'recovered-from-drift');
assert.match(bf, /<!-- aitm-entered-refine ts="2026-01-02T00:00:00Z" -->/);
// #380: backfill audit marker now uses the property grammar.
assert.match(
  bf,
  /<!-- aitm-backfill stage="refine" reason="recovered-from-drift" ts="2026-01-02T00:00:00Z" -->/
);

// 10b. Backfill idempotency
const bf2 = backfillEntryMarker(bf, 'refine', '2026-02-02T00:00:00Z', 'different-reason');
assert.equal(bf, bf2, 'second backfill of same stage is no-op');

// Unknown stage throws
assert.throws(() => stampEntryMarker('', 'mystery', '2026-01-01T00:00:00Z'));
assert.throws(() => verifyChainIntegrity('', 'mystery'));
assert.throws(() => backfillEntryMarker('', 'mystery', 'ts', 'r'));
assert.throws(() => stampEntryMarker('', 'refine', ''));

// 11. stripEntryMarkersAfter still functional (kept for emergency use)
{
  let body148 = stampEntryMarker('', 'review', '2026-01-06T00:00:00Z');
  body148 = stampEntryMarker(body148, 'done', '2026-01-07T00:00:00Z');
  const { body: out, stripped } = stripEntryMarkersAfter(body148, 'review');
  assert.deepEqual(stripped, ['done']);
  assert.doesNotMatch(out, /aitm-entered-done/);
  assert.match(out, /aitm-entered-review/);
}
assert.throws(() => stripEntryMarkersAfter('', 'mystery'));

// 12. getStageVisitCount — #184
{
  assert.equal(getStageVisitCount('', 'refine'), 0, 'empty body → 0 visits');
  let cnt = stampEntryMarker('', 'refine', '2026-01-01T00:00:00Z');
  assert.equal(getStageVisitCount(cnt, 'refine'), 1, 'one visit');
  cnt = stampEntryMarker(cnt, 'refine', '2026-02-02T00:00:00Z');
  assert.equal(getStageVisitCount(cnt, 'refine'), 2, 'second visit');
  cnt = stampEntryMarker(cnt, 'refine', '2026-03-03T00:00:00Z');
  assert.equal(getStageVisitCount(cnt, 'refine'), 3, 'third visit');
  assert.equal(getStageVisitCount(cnt, 'plan'), 0, 'other stage unaffected');
  assert.throws(() => getStageVisitCount('', 'mystery'));
}

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
    '<!-- aitm-entered-on-deck ts="2026-05-01T12:00:00Z" -->\n' +
    '<!-- aitm-entered-refine ts="2026-05-02T00:00:00Z" -->\n' +
    '<!-- aitm-entered-plan ts="2026-05-03T00:00:00Z" -->\n';
  const mr = verifyChainIntegrity(mixedChain, 'plan');
  assert.equal(mr.ok, true, `mixed-grammar chain should pass: ${JSON.stringify(mr)}`);
  assert.deepEqual(mr.holes, []);
}

console.log('stage-entry-markers.test.mjs: all passed');
