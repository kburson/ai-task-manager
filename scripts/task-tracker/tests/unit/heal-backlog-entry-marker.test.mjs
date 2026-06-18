#!/usr/bin/env node
// @story #253
// Regression tests for the backlog-entry-marker backfill in heal-entry-markers.mjs (#253).
//
// The #252 contiguity guard checks the full prior-stage prefix (STAGES[0..toIdx-1])
// on every forward move past Refine, so `aitm-entered-backlog` (STAGES[0]) is now a
// required marker. Issues created before create-issue.mjs stamped the initial-state
// marker (e.g. #237, #230) carry `aitm-entered-refine` but lack the backlog marker.
// #253 added `backlog` to HEALABLE_STAGES so the existing case-(a) backfill repairs
// them. These tests cover the backfill case AND the no-false-heal case.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { planStageHeal, safeBackfillTs } from '../../heal-entry-markers.mjs';
import { backfillEntryMarker } from '../../lib/stage-entry-markers.mjs';

const CREATED_AT = '2026-05-30T08:00:00.000Z';
const REFINE_TS = '2026-05-31T09:00:00.000Z';

// ---------- 1. backlog backfill candidate (the #237/#230 shape) ----------

test('planStageHeal: backlog absent + refine present → backfill candidate', () => {
  const body = `## Scope\n\n<!-- aitm-entered-refine: ${REFINE_TS} -->\n`;
  const plan = planStageHeal({ stage: 'backlog', body, createdAt: CREATED_AT });
  assert.equal(plan.action, 'backfill');
  assert.equal(plan.mode, 'entry+audit');
  assert.equal(plan.reason, 'pre-gate-traversal');
});

// ---------- 2. conservative lower-bound timestamp (>= createdAt, < refine) ----------

test('backlog backfill ts is a conservative lower bound (createdAt <= ts < refineTs)', () => {
  const body = `<!-- aitm-entered-refine: ${REFINE_TS} -->\n`;
  const plan = planStageHeal({ stage: 'backlog', body, createdAt: CREATED_AT });
  const tsMs = Date.parse(plan.ts);
  assert.ok(Number.isFinite(tsMs), 'ts must be a valid date');
  assert.ok(tsMs >= Date.parse(CREATED_AT), 'ts must be >= createdAt');
  assert.ok(tsMs < Date.parse(REFINE_TS), 'ts must be strictly < the earliest later-stage marker');
});

test('safeBackfillTs handles stageIdx 0: no earlier stage → floor is createdAt', () => {
  const ts = safeBackfillTs({
    stage: 'backlog',
    markers: { refine: REFINE_TS },
    createdAt: CREATED_AT,
  });
  // stageIdx 0 → offset 0 → candidate = createdMs (well below refineTs, no clamp)
  assert.equal(Date.parse(ts), Date.parse(CREATED_AT));
});

// ---------- 3. apply writes both entry + audit markers ----------

test('backfillEntryMarker writes aitm-entered-backlog and aitm-backfill:backlog audit marker', () => {
  const ts = '2026-05-30T08:00:00.000Z';
  const out = backfillEntryMarker(
    `<!-- aitm-entered-refine: ${REFINE_TS} -->\n`,
    'backlog',
    ts,
    'pre-gate-traversal'
  );
  assert.match(out, /<!-- aitm-entered-backlog ts="2026-05-30T08:00:00.000Z" -->/);
  // #380: backfill audit marker now uses the property grammar.
  assert.match(
    out,
    /<!-- aitm-backfill stage="backlog" reason="pre-gate-traversal" ts="2026-05-30T08:00:00.000Z" -->/
  );
});

// ---------- 4. no-false-heal: clean backlog-only issue is NOT a candidate ----------

test('planStageHeal: clean backlog-only issue (no later marker) → skip', () => {
  const body = `<!-- aitm-entered-backlog: ${CREATED_AT} -->\n`;
  const plan = planStageHeal({ stage: 'backlog', body, createdAt: CREATED_AT });
  assert.equal(plan.action, 'skip');
});

test('planStageHeal: empty body / no markers → skip (nothing to bound against)', () => {
  const plan = planStageHeal({
    stage: 'backlog',
    body: '## Scope\n\nstill in backlog',
    createdAt: CREATED_AT,
  });
  assert.equal(plan.action, 'skip');
});

// ---------- 5. other stages unaffected by the backlog addition ----------

test('planStageHeal: backlog present + refine absent + plan present → refine still backfills', () => {
  const body = [
    `<!-- aitm-entered-backlog: ${CREATED_AT} -->`,
    '<!-- aitm-entered-plan: 2026-06-01T10:00:00.000Z -->',
  ].join('\n');
  // refine is absent with a later marker (plan) present → case-(a) backfill, exactly as before #253.
  const refine = planStageHeal({ stage: 'refine', body, createdAt: CREATED_AT });
  assert.equal(refine.action, 'backfill', 'refine still healable as before');
  // backlog is present with a later marker and no audit marker → case-(b) audit-only.
  // This is the tool's pre-existing behavior (identical to a legitimately-stamped refine
  // marker that lacks an audit trail); the backlog addition extends it, it does not change it.
  const backlog = planStageHeal({ stage: 'backlog', body, createdAt: CREATED_AT });
  assert.equal(backlog.action, 'audit-only', 'present-but-unaudited backlog → audit-only (case b)');
});
