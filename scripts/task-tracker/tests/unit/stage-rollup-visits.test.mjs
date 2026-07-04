// @story #182
import assert from 'node:assert/strict';
import {
  computeStageDurations,
  buildStageRollupMarker,
  upsertStageRollupMarker,
} from '../../timing-rollup.mjs';

// Legacy single-visit issue: each stage entered once, no -N suffix.
{
  const body = [
    '<!-- aitm-entered-refine: 2026-05-19T00:00:00.000Z -->',
    '<!-- aitm-entered-plan: 2026-05-19T00:10:00.000Z -->',
    '<!-- aitm-entered-develop: 2026-05-19T00:30:00.000Z -->',
  ].join('\n');
  const r = computeStageDurations(body);
  assert.equal(r.visits.length, 3, 'three windows');
  assert.equal(r.visits[0].stage, 'refine');
  assert.equal(r.visits[0].visit, 1);
  assert.equal(r.visits[0].durationSec, 600);
  assert.equal(r.visits[1].durationSec, 1200);
  assert.equal(r.visits[2].durationSec, 0, 'trailing open window contributes 0');
  assert.equal(r.perStageSec.refine, 600);
  assert.equal(r.perStageSec.plan, 1200);
  assert.equal(r.perStageSec.develop, 0);
  assert.equal(r.totalSec, 1800);
}

// Re-entry case: develop visited twice, test visited twice.
{
  const body = [
    '<!-- aitm-entered-refine: 2026-05-19T00:00:00.000Z -->',
    '<!-- aitm-entered-plan: 2026-05-19T00:10:00.000Z -->',
    '<!-- aitm-entered-develop: 2026-05-19T00:20:00.000Z -->',
    '<!-- aitm-entered-test: 2026-05-19T00:50:00.000Z -->',
    '<!-- aitm-entered-develop-2: 2026-05-19T01:00:00.000Z -->',
    '<!-- aitm-entered-test-2: 2026-05-19T01:20:00.000Z -->',
    '<!-- aitm-entered-review: 2026-05-19T01:25:00.000Z -->',
  ].join('\n');
  const r = computeStageDurations(body);
  // refine 10m + plan 10m + develop#1 30m + test#1 10m + develop#2 20m + test#2 5m + review(open)=0
  assert.equal(r.perStageSec.refine, 600);
  assert.equal(r.perStageSec.plan, 600);
  assert.equal(r.perStageSec.develop, 3000, 'develop aggregates 30m+20m across visits');
  assert.equal(r.perStageSec.test, 900, 'test aggregates 10m+5m across visits');
  assert.equal(r.perStageSec.review, 0);
  const developVisits = r.visits.filter((v) => v.stage === 'develop');
  assert.equal(developVisits.length, 2);
  assert.equal(developVisits[0].visit, 1);
  assert.equal(developVisits[1].visit, 2);
}

// Empty body: no markers → empty rollup.
{
  const r = computeStageDurations('');
  assert.equal(r.visits.length, 0);
  assert.equal(r.totalSec, 0);
  for (const sec of Object.values(r.perStageSec)) assert.equal(sec, 0);
}

// Marker builder is JSON-parseable and round-trips schema.
{
  const r = computeStageDurations(
    [
      '<!-- aitm-entered-refine: 2026-05-19T00:00:00.000Z -->',
      '<!-- aitm-entered-plan: 2026-05-19T00:05:00.000Z -->',
    ].join('\n')
  );
  const line = buildStageRollupMarker(r);
  const payload = JSON.parse(line.match(/<!--\s*aitm-stage-rollup:\s*(\{[\s\S]*?\})\s*-->/)[1]);
  assert.equal(payload.schema, 2);
  assert.equal(payload.perStageSec.refine, 300);
  assert.equal('perStage' in payload, false, 'compat minutes removed in #695');
  assert.equal(payload.visits[0].stage, 'refine');
  assert.equal(payload.visits[0].durationSec, 300);
}

// Upsert is idempotent: replaces existing marker rather than appending.
{
  const initial = '<!-- aitm-entered-refine: 2026-05-19T00:00:00.000Z -->';
  const r1 = computeStageDurations(initial);
  const once = upsertStageRollupMarker(initial, r1);
  const twice = upsertStageRollupMarker(once, r1);
  const matches = once.match(/aitm-stage-rollup/g) || [];
  const matchesTwice = twice.match(/aitm-stage-rollup/g) || [];
  assert.equal(matches.length, 1, 'first upsert adds one marker');
  assert.equal(matchesTwice.length, 1, 'second upsert leaves exactly one marker');
}

console.log('stage-rollup-visits.test.mjs: ok');
