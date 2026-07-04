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
  assert.equal(r.visits[0].durationMin, 10);
  assert.equal(r.visits[1].durationMin, 20);
  assert.equal(r.visits[2].durationMin, 0, 'trailing open window contributes 0');
  assert.equal(r.perStageMin.refine, 10);
  assert.equal(r.perStageMin.plan, 20);
  assert.equal(r.perStageMin.develop, 0);
  assert.equal(r.totalMin, 30);
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
  // refine 10 + plan 10 + develop#1 30 + test#1 10 + develop#2 20 + test#2 5 + review(open)=0
  assert.equal(r.perStageMin.refine, 10);
  assert.equal(r.perStageMin.plan, 10);
  assert.equal(r.perStageMin.develop, 50, 'develop aggregates 30+20 across visits');
  assert.equal(r.perStageMin.test, 15, 'test aggregates 10+5 across visits');
  assert.equal(r.perStageMin.review, 0);
  const developVisits = r.visits.filter((v) => v.stage === 'develop');
  assert.equal(developVisits.length, 2);
  assert.equal(developVisits[0].visit, 1);
  assert.equal(developVisits[1].visit, 2);
}

// Empty body: no markers → empty rollup.
{
  const r = computeStageDurations('');
  assert.equal(r.visits.length, 0);
  assert.equal(r.totalMin, 0);
  for (const min of Object.values(r.perStageMin)) assert.equal(min, 0);
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
  assert.equal(payload.perStage.refine, 5, 'derived compat minutes retained until #695');
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
