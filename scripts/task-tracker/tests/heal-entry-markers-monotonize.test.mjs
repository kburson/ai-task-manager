#!/usr/bin/env node
// Regression tests for heal-entry-markers.mjs HEALABLE_STAGES extension
// (#173): covers develop/test/review in addition to the original refine/plan.
// Validates restamp (out-of-order), backfill (missing-with-later-present),
// audit-only (entry-present-audit-missing), and the no-regression cases.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  checkOnlyExitCode,
  outOfOrderHealableStages,
  planStageHeal,
  safeBackfillTs,
} from '../heal-entry-markers.mjs';
import { parseEntryMarkers, verifyChainIntegrity } from '../lib/stage-entry-markers.mjs';

function bodyWith(markers) {
  return markers.map(([s, ts]) => `<!-- aitm-entered-${s}: ${ts} -->`).join('\n');
}

test('outOfOrderHealableStages flags develop when develop ts > test ts', () => {
  const markers = parseEntryMarkers(
    bodyWith([
      ['refine', '2026-05-18T10:00:00Z'],
      ['plan', '2026-05-18T11:00:00Z'],
      ['develop', '2026-05-18T14:35:00Z'],
      ['test', '2026-05-18T14:30:00Z'],
    ])
  );
  const out = outOfOrderHealableStages(markers);
  assert.ok(out.has('develop'), 'develop should be flagged');
});

test('outOfOrderHealableStages flags test when test ts > review ts (the #170 inversion)', () => {
  const markers = parseEntryMarkers(
    bodyWith([
      ['refine', '2026-05-18T10:00:00Z'],
      ['plan', '2026-05-18T11:00:00Z'],
      ['develop', '2026-05-18T12:00:00Z'],
      ['review', '2026-05-18T14:29:00Z'],
      ['test', '2026-05-18T14:32:00Z'],
    ])
  );
  const out = outOfOrderHealableStages(markers);
  assert.ok(out.has('test'), 'test should be flagged');
});

test('outOfOrderHealableStages: monotonic chain across all five stages flags nothing', () => {
  const markers = parseEntryMarkers(
    bodyWith([
      ['refine', '2026-05-18T10:00:00Z'],
      ['plan', '2026-05-18T11:00:00Z'],
      ['develop', '2026-05-18T12:00:00Z'],
      ['test', '2026-05-18T13:00:00Z'],
      ['review', '2026-05-18T14:00:00Z'],
    ])
  );
  assert.equal(outOfOrderHealableStages(markers).size, 0);
});

test('planStageHeal restamps out-of-order test with safe lower-bound ts', () => {
  const body = bodyWith([
    ['refine', '2026-05-18T10:00:00Z'],
    ['plan', '2026-05-18T11:00:00Z'],
    ['develop', '2026-05-18T12:00:00Z'],
    ['review', '2026-05-18T14:29:00Z'],
    ['test', '2026-05-18T14:32:00Z'],
  ]);
  const plan = planStageHeal({ stage: 'test', body, createdAt: '2026-05-18T09:00:00Z' });
  assert.equal(plan.action, 'restamp');
  assert.equal(plan.reason, 'out-of-order-chain-heal');
  // Restamp ts must be ≤ review (14:29) to restore monotonicity.
  assert.ok(plan.ts < '2026-05-18T14:29:00Z', `expected ${plan.ts} < review ts`);
  // strippedBody must not contain the original test entry.
  assert.ok(!/aitm-entered-test:/.test(plan.strippedBody));
});

test('planStageHeal backfills missing develop when test is present', () => {
  const body = bodyWith([
    ['refine', '2026-05-18T10:00:00Z'],
    ['plan', '2026-05-18T11:00:00Z'],
    ['test', '2026-05-18T13:00:00Z'],
  ]);
  const plan = planStageHeal({ stage: 'develop', body, createdAt: '2026-05-18T09:00:00Z' });
  assert.equal(plan.action, 'backfill');
  assert.equal(plan.reason, 'pre-gate-traversal');
  assert.ok(plan.ts <= '2026-05-18T13:00:00Z');
});

test('planStageHeal audit-only on review entry with no audit marker and later marker present', () => {
  const body = [
    '<!-- aitm-entered-review: 2026-05-18T14:00:00Z -->',
    '<!-- aitm-entered-done: 2026-05-18T15:00:00Z -->',
  ].join('\n');
  const plan = planStageHeal({ stage: 'review', body, createdAt: '2026-05-18T09:00:00Z' });
  assert.equal(plan.action, 'audit-only');
  assert.equal(plan.ts, '2026-05-18T14:00:00Z');
});

test('planStageHeal skip on monotonic chain (no regression for any stage)', () => {
  const body = bodyWith([
    ['refine', '2026-05-18T10:00:00Z'],
    ['plan', '2026-05-18T11:00:00Z'],
    ['develop', '2026-05-18T12:00:00Z'],
    ['test', '2026-05-18T13:00:00Z'],
    ['review', '2026-05-18T14:00:00Z'],
  ]);
  for (const stage of ['refine', 'plan', 'develop', 'test', 'review']) {
    const plan = planStageHeal({ stage, body, createdAt: '2026-05-18T09:00:00Z' });
    // Each healthy stage either has the audit marker or doesn't need one;
    // since none of these are audited, expect 'audit-only' or 'skip'. The
    // key invariant: never 'restamp' on a monotonic chain.
    assert.notEqual(plan.action, 'restamp', `${stage} must not restamp a monotonic chain`);
  }
});

test('safeBackfillTs for test stays strictly below review ts', () => {
  const markers = parseEntryMarkers(
    bodyWith([
      ['develop', '2026-05-18T12:00:00Z'],
      ['review', '2026-05-18T14:29:00Z'],
    ])
  );
  const ts = safeBackfillTs({ stage: 'test', markers, createdAt: '2026-05-18T09:00:00Z' });
  assert.ok(ts < '2026-05-18T14:29:00Z');
});

test('refine/plan regression: previous heal behavior unchanged for early stages', () => {
  const body = '<!-- aitm-entered-plan: 2026-05-18T11:00:00Z -->';
  const plan = planStageHeal({ stage: 'refine', body, createdAt: '2026-05-18T09:00:00Z' });
  assert.equal(plan.action, 'backfill');
  assert.equal(plan.reason, 'pre-gate-traversal');
});

test('checkOnlyExitCode: 0 when all results are skip (clean backlog)', () => {
  assert.equal(checkOnlyExitCode([{ action: 'skip' }, { action: 'skip' }]), 0);
});

test('checkOnlyExitCode: 1 when any result is plan (anomaly present)', () => {
  assert.equal(checkOnlyExitCode([{ action: 'skip' }, { action: 'plan', stagesActed: [] }]), 1);
});

test('checkOnlyExitCode: 2 when any result is error (precedence over plan)', () => {
  assert.equal(checkOnlyExitCode([{ action: 'plan' }, { action: 'error', reason: 'boom' }]), 2);
});

test('verifyChainIntegrity passes after restamping out-of-order test (full round-trip)', async () => {
  const { backfillEntryMarker } = await import('../lib/stage-entry-markers.mjs');
  const { stripStageMarkers } = await import('../heal-entry-markers.mjs');
  const body = bodyWith([
    ['refine', '2026-05-18T10:00:00Z'],
    ['plan', '2026-05-18T11:00:00Z'],
    ['develop', '2026-05-18T12:00:00Z'],
    ['review', '2026-05-18T14:29:00Z'],
    ['test', '2026-05-18T14:32:00Z'],
  ]);
  const plan = planStageHeal({ stage: 'test', body, createdAt: '2026-05-18T09:00:00Z' });
  assert.equal(plan.action, 'restamp');
  const healed = backfillEntryMarker(plan.strippedBody, 'test', plan.ts, plan.reason);
  const result = verifyChainIntegrity(healed, 'review');
  assert.ok(result.ok, `chain should be monotonic after heal: ${JSON.stringify(result)}`);
});
