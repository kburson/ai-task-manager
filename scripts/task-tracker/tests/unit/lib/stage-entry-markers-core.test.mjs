// @story #310
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
} from '../../../lib/stage-entry-markers.mjs';

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

// #1206: historical On Deck markers stay byte-for-byte readable but project
// to the canonical Assigned stage. New writers must never emit the old slug.
const historicalOnDeck =
  '<!-- aitm-entered-backlog ts="2026-01-01T00:00:00Z" -->\n' +
  '<!-- aitm-entered-on-deck ts="2026-01-02T00:00:00Z" -->\n' +
  '<!-- aitm-entered-refine ts="2026-01-03T00:00:00Z" -->\n';
assert.deepEqual(parseEntryMarkers(historicalOnDeck)[1], {
  stage: 'assigned',
  visit: 1,
  ts: '2026-01-02T00:00:00Z',
});
assert.equal(getStageVisitCount(historicalOnDeck, 'assigned'), 1);
assert.equal(verifyChainIntegrity(historicalOnDeck, 'refine').ok, true);
assert.doesNotMatch(
  stampEntryMarker('', 'assigned', '2026-01-02T00:00:00Z'),
  /aitm-entered-on-deck/
);

// 4. verifyChainIntegrity — no holes, no illegal arcs
let chain = '';
chain = stampEntryMarker(chain, 'backlog', '2026-01-01T00:00:00Z');
chain = stampEntryMarker(chain, 'assigned', '2026-01-02T00:00:00Z');
chain = stampEntryMarker(chain, 'refine', '2026-01-03T00:00:00Z');
chain = stampEntryMarker(chain, 'plan', '2026-01-04T00:00:00Z');
let r = verifyChainIntegrity(chain, 'plan');
assert.equal(r.ok, true);
assert.deepEqual(r.holes, []);
assert.deepEqual(r.illegalArcs, []);
assert.deepEqual(r.presentStages, ['backlog', 'assigned', 'refine', 'plan']);

// 5. One hole: backlog + plan, current=plan
let hole = stampEntryMarker('', 'backlog', '2026-01-01T00:00:00Z');
hole = stampEntryMarker(hole, 'plan', '2026-01-03T00:00:00Z');
r = verifyChainIntegrity(hole, 'plan');
assert.equal(r.ok, false);
assert.deepEqual(r.holes, ['assigned', 'refine']);

// 6. Multiple holes
let holes2 = stampEntryMarker('', 'backlog', '2026-01-01T00:00:00Z');
holes2 = stampEntryMarker(holes2, 'develop', '2026-01-04T00:00:00Z');
r = verifyChainIntegrity(holes2, 'develop');
assert.deepEqual(r.holes, ['assigned', 'refine', 'plan']);

// 7. Legal rollback arcs pass: backlog→assigned→refine→plan→refine-2→plan-2
let rollback = '';
rollback = stampEntryMarker(rollback, 'backlog', '2026-01-01T00:00:00Z');
rollback = stampEntryMarker(rollback, 'assigned', '2026-01-01T12:00:00Z');
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
  ['assigned', '2026-01-01T12:00:00Z'],
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
  ['assigned', '2026-01-01T12:00:00Z'],
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
  'backlog->assigned',
  'assigned->refine',
  'assigned->backlog',
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
