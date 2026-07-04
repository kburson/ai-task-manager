// @story #693
// Schema:2 seconds-precision stage rollups.
// computeStageDurations records durationSec as the primary currency with
// derived minute compat fields; buildStageRollupMarker emits schema:2;
// humanizeSec renders `1h 03m 45s`-style display strings.
import assert from 'node:assert/strict';
import {
  buildStageRollupMarker,
  computeStageDurations,
  humanizeSec,
  upsertStageRollupMarker,
} from '../../timing-rollup.mjs';

// Sub-minute visit registers real seconds instead of rounding to zero.
{
  const r = computeStageDurations(
    [
      '<!-- aitm-entered-develop: 2026-07-01T00:00:00.000Z -->',
      '<!-- aitm-entered-test: 2026-07-01T00:00:42.000Z -->',
    ].join('\n')
  );
  assert.equal(r.visits[0].durationSec, 42);
  assert.equal(r.visits[0].durationMin, 1, 'derived minutes round 42s to 1');
  assert.equal(r.perStageSec.develop, 42);
  assert.equal(r.perStageMin.develop, 1);
  assert.equal(r.totalSec, 42);
  assert.equal(r.totalMin, 1);
}

// Multi-visit accumulation sums perStageSec across visits.
{
  const r = computeStageDurations(
    [
      '<!-- aitm-entered-develop-1: 2026-07-01T00:00:00.000Z -->',
      '<!-- aitm-entered-test-1: 2026-07-01T00:01:30.000Z -->',
      '<!-- aitm-entered-develop-2: 2026-07-01T00:02:00.000Z -->',
      '<!-- aitm-entered-test-2: 2026-07-01T00:02:45.000Z -->',
    ].join('\n')
  );
  assert.equal(r.perStageSec.develop, 90 + 45, 'develop aggregates 90s + 45s');
  assert.equal(r.perStageSec.test, 30);
  assert.equal(r.totalSec, 165);
}

// Trailing open window contributes zero seconds and endMs null.
{
  const r = computeStageDurations('<!-- aitm-entered-review: 2026-07-01T00:00:00.000Z -->');
  assert.equal(r.visits[0].endMs, null);
  assert.equal(r.visits[0].durationSec, 0);
  assert.equal(r.totalSec, 0);
}

// Backwards timestamps degrade to an open visit, same as legacy behavior.
{
  const r = computeStageDurations(
    [
      '<!-- aitm-entered-plan: 2026-07-01T01:00:00.000Z -->',
      '<!-- aitm-entered-develop: 2026-07-01T00:00:00.000Z -->',
    ].join('\n')
  );
  assert.equal(r.visits[0].durationSec, 0, 'backwards window records 0');
  assert.equal(r.visits[0].endMs, null);
}

// Marker payload is schema:2 with second-primary and minute-compat keys.
{
  const r = computeStageDurations(
    [
      '<!-- aitm-entered-refine: 2026-07-01T00:00:00.000Z -->',
      '<!-- aitm-entered-plan: 2026-07-01T00:03:07.000Z -->',
    ].join('\n')
  );
  const line = buildStageRollupMarker(r);
  const payload = JSON.parse(line.match(/aitm-stage-rollup:\s*(\{[\s\S]*?\})\s*-->/)[1]);
  assert.equal(payload.schema, 2);
  assert.equal(payload.perStageSec.refine, 187);
  assert.equal(payload.totalSec, 187);
  assert.equal(payload.perStage.refine, 3, 'compat minutes derived from seconds');
  assert.equal(payload.totalMin, 3);
  assert.deepEqual(payload.visits[0], {
    stage: 'refine',
    visit: 1,
    durationSec: 187,
    durationMin: 3,
  });
}

// Upsert replaces an existing schema:1 marker with the schema:2 line in place.
{
  const legacy =
    '<!-- aitm-entered-refine: 2026-07-01T00:00:00.000Z -->\n' +
    '<!-- aitm-entered-plan: 2026-07-01T00:00:42.000Z -->\n' +
    '<!-- aitm-stage-rollup: {"schema":1,"perStage":{"refine":1},"totalMin":1,"visits":[{"stage":"refine","visit":1,"durationMin":1}]} -->';
  const r = computeStageDurations(legacy);
  const next = upsertStageRollupMarker(legacy, r);
  assert.equal((next.match(/aitm-stage-rollup/g) || []).length, 1, 'replaced, not appended');
  assert.match(next, /"schema":2/);
  assert.doesNotMatch(next, /"schema":1/);
  assert.match(next, /"durationSec":42/);
}

// humanizeSec display contract.
{
  assert.equal(humanizeSec(0), '0s');
  assert.equal(humanizeSec(45), '45s');
  assert.equal(humanizeSec(60), '1m 00s');
  assert.equal(humanizeSec(187), '3m 07s');
  assert.equal(humanizeSec(3600), '1h 00m 00s');
  assert.equal(humanizeSec(3825), '1h 03m 45s');
  assert.equal(humanizeSec(-5), '0s', 'negative clamps to zero');
  assert.equal(humanizeSec('187'), '3m 07s', 'numeric strings coerce');
  assert.equal(humanizeSec(NaN), '0s', 'NaN degrades to zero');
}

console.log('stage-rollup-seconds.test.mjs: ok');
