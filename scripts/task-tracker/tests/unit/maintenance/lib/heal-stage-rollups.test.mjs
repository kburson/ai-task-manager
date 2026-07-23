// @story #694
// Heal-stage-rollups core: rebuild aitm-stage-rollup markers at schema:2 from
// entry markers (primary) or timing-log ladder rows (fallback), with
// precision:"minute" honesty flags on legacy HH:MM windows and byte-identical
// idempotency on re-run.
import assert from 'node:assert/strict';
import {
  buildHealedMarker,
  healBody,
  parseLadderRows,
  parseRollupMarker,
  rebuildFromEntryMarkers,
  rebuildFromTimingLadder,
} from '../../../../../maintenance/lib/heal-stage-rollups-core.mjs';

const ROLLUP_RE = /<!--\s*aitm-stage-rollup:\s*(\{[\s\S]*?\})\s*-->/;

function ladderComment(rows) {
  return [
    '### ⏱ Timing Log',
    '',
    '| Timestamp | Event | Active | Word Marker |',
    '| --- | --- | --- | --- |',
    ...rows.map(([ts, ev]) => `| ${ts} | ${ev} | 1 | — |`),
  ].join('\n');
}

// 1. schema:1 marker + entry markers → healed to schema:2, seconds recomputed
//    from raw timestamps; the stale schema:1 numbers are not trusted.
{
  const body = [
    '<!-- aitm-fields: {"estimate":2} -->',
    '<!-- aitm-stage-rollup: {"schema":1,"perStage":{"refine":99},"totalMin":99,"visits":[{"stage":"refine","visit":1,"durationMin":99}]} -->',
    '<!-- aitm-entered-refine: 2026-06-01T00:00:00.000Z -->',
    '<!-- aitm-entered-plan: 2026-06-01T00:03:07.000Z -->',
  ].join('\n');
  const { next, changed, summary } = healBody(body);
  assert.equal(changed, true);
  assert.match(summary, /schema:1 -> schema:2/);
  const payload = JSON.parse(ROLLUP_RE.exec(next)[1]);
  assert.equal(payload.schema, 2);
  assert.equal(payload.perStageSec.refine, 187, 'seconds recomputed from timestamps');
  assert.equal(payload.totalSec, 187);
  assert.equal('perStage' in payload, false, 'minute compat keys removed in #695');
  assert.equal('totalMin' in payload, false);
  assert.equal(payload.visits[0].durationSec, 187);
  assert.equal('durationMin' in payload.visits[0], false);
  assert.equal(payload.visits[0].precision, undefined, 'entry markers are second-precision');
  assert.equal((next.match(/aitm-stage-rollup/g) || []).length, 1, 'replaced in place');
  assert.match(next, /aitm-fields/, 'invariant markers preserved');
}

// 2. No entry markers, ladder rows present → fallback rebuild from PHASE_EVENTS
//    boundaries, including a demoted boundary closing a window.
{
  const rows = parseLadderRows(
    ladderComment([
      ['2026-06-01 00:00:00 +00:00', 'refine:started'],
      ['2026-06-01 00:02:00 +00:00', 'refine:completed'],
      ['2026-06-01 00:02:30 +00:00', 'develop:started'],
      ['2026-06-01 00:05:00 +00:00', 'demoted'],
      ['2026-06-01 00:06:00 +00:00', 'develop:started'],
      ['2026-06-01 00:07:30 +00:00', 'test:started'],
      ['2026-06-01 00:09:00 +00:00', 'test:passed'],
    ])
  );
  const r = rebuildFromTimingLadder(rows);
  assert.equal(r.perStageSec.refine, 120);
  assert.equal(r.perStageSec.develop, 150 + 90, 'demoted closes visit 1; visit 2 reopens');
  assert.equal(r.perStageSec.test, 90);
  const developVisits = r.visits.filter((v) => v.stage === 'develop');
  assert.equal(developVisits.length, 2);
  assert.equal(developVisits[0].visit, 1);
  assert.equal(developVisits[1].visit, 2);
  assert.equal(r.totalSec, 120 + 240 + 90);
  // healBody consumes the same rows when the body has no entry markers.
  const body = '## Story\n\nNo markers here.\n<!-- aitm-fields: {} -->';
  const { next, changed } = healBody(body, rows);
  assert.equal(changed, true);
  const payload = JSON.parse(ROLLUP_RE.exec(next)[1]);
  assert.equal(payload.schema, 2);
  assert.equal(payload.totalSec, 450);
}

// 3. Minute-precision ladder rows (legacy HH:MM) → durationSec = min*60 and
//    precision:"minute" on the visit; second-precision rows stay unflagged.
{
  const rows = parseLadderRows(
    ladderComment([
      ['2026-05-01 10:00 +00:00', 'plan:started'],
      ['2026-05-01 10:07 +00:00', 'plan:completed'],
      ['2026-05-01 10:08:15 +00:00', 'develop:started'],
      ['2026-05-01 10:09:45 +00:00', 'develop:completed'],
    ])
  );
  assert.equal(rows[0].tsHasSeconds, false);
  assert.equal(rows[2].tsHasSeconds, true);
  const r = rebuildFromTimingLadder(rows);
  const plan = r.visits.find((v) => v.stage === 'plan');
  assert.equal(plan.durationSec, 7 * 60, 'minute windows derive seconds as whole-min*60');
  assert.equal(plan.precision, 'minute');
  assert.equal('durationMin' in plan, false, 'minute compat field removed in #695');
  const dev = r.visits.find((v) => v.stage === 'develop');
  assert.equal(dev.durationSec, 90, 'true second window keeps real seconds');
  assert.equal(dev.precision, undefined);
  // precision passes through the healed marker payload.
  const payload = JSON.parse(ROLLUP_RE.exec(buildHealedMarker(r))[1]);
  assert.equal(payload.visits.find((v) => v.stage === 'plan').precision, 'minute');
  assert.equal(payload.visits.find((v) => v.stage === 'develop').precision, undefined);
}

// 4. Idempotency: healing an already-healed body returns changed:false and the
//    byte-identical input.
{
  const body = [
    '<!-- aitm-fields: {} -->',
    '<!-- aitm-entered-develop: 2026-06-01T00:00:00.000Z -->',
    '<!-- aitm-entered-test: 2026-06-01T00:00:42.000Z -->',
  ].join('\n');
  const first = healBody(body);
  assert.equal(first.changed, true);
  const second = healBody(first.next);
  assert.equal(second.changed, false);
  assert.equal(second.summary, 'already-healed');
  assert.equal(second.next, first.next, 'byte-identical on re-run');
}

// 5. Body with no rollup and no timing evidence → untouched, no marker added.
{
  const body = '## Plain issue\n\nNothing timing-related.';
  const { next, changed, summary } = healBody(body);
  assert.equal(changed, false);
  assert.equal(summary, 'no-evidence');
  assert.equal(next, body);
  // Existing marker but zero rebuild evidence → flagged unrebuildable, untouched.
  const orphan = '<!-- aitm-stage-rollup: {"schema":1,"perStage":{},"totalMin":0,"visits":[]} -->';
  const r2 = healBody(orphan);
  assert.equal(r2.changed, false);
  assert.equal(r2.summary, 'unrebuildable');
  assert.equal(r2.next, orphan);
}

// parseRollupMarker: payload round-trip, absent, and malformed JSON.
{
  assert.equal(parseRollupMarker('no marker'), null);
  assert.equal(parseRollupMarker('<!-- aitm-stage-rollup: {broken -->'), null);
  const p = parseRollupMarker('<!-- aitm-stage-rollup: {"schema":2,"totalSec":5} -->');
  assert.equal(p.schema, 2);
  assert.equal(p.totalSec, 5);
}

// rebuildFromEntryMarkers: null when the body has no entry markers.
{
  assert.equal(rebuildFromEntryMarkers('no markers'), null);
  const r = rebuildFromEntryMarkers('<!-- aitm-entered-review: 2026-06-01T00:00:00.000Z -->');
  assert.equal(r.visits.length, 1);
}

// rebuildFromTimingLadder edge cases: pause/resume rows ignored; unparseable
// timestamps skipped; trailing open window records zero.
{
  const rows = parseLadderRows(
    ladderComment([
      ['2026-06-01 00:00:00 +00:00', 'develop:started'],
      ['2026-06-01 00:01:00 +00:00', 'pause:question'],
      ['2026-06-01 00:02:00 +00:00', 'resume'],
      ['not-a-timestamp', 'test:started'],
      ['2026-06-01 00:04:00 +00:00', 'develop:completed'],
      ['2026-06-01 00:05:00 +00:00', 'review:started'],
    ])
  );
  const r = rebuildFromTimingLadder(rows);
  assert.equal(r.perStageSec.develop, 240, 'pause/resume and bad-ts rows do not split windows');
  const review = r.visits.find((v) => v.stage === 'review');
  assert.equal(review.endMs, null, 'trailing open window');
  assert.equal(review.durationSec, 0);
  assert.equal(rebuildFromTimingLadder([]), null, 'no boundary rows → null');
}

console.log('heal-stage-rollups.test.mjs: ok');
