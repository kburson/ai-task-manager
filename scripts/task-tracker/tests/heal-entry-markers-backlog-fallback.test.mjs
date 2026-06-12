#!/usr/bin/env node
// #272 — Regression tests for the createdAt-anchored backlog fallback in
// heal-entry-markers.mjs.
//
// Context: issues born under the (now removed) `create-issue --status refine`
// defect had `aitm-entered-refine` stamped at ~createdAt and no
// `aitm-entered-backlog` marker. The existing `safeBackfillTs` helper cannot
// produce a feasible timestamp because the floor (latest earlier-stage marker
// or createdAt) postdates the refine marker.
//
// Marker ordering invariant the fallback restores:
//   createdAt < aitm-entered-backlog < aitm-entered-refine < ...
//
// Strategy: stamp backlog at `createdAt + 1s` (smallest interval that keeps
// backlog strictly AFTER createdAt). If refine is at or before backlogTs,
// cascade refine forward to `backlogTs + 1s` (= createdAt + 2s).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { planStageHeal, backlogCreatedAtFallback } from '../heal-entry-markers.mjs';
import { backfillEntryMarker } from '../lib/stage-entry-markers.mjs';

const CREATED_AT = '2026-06-01T12:00:00.000Z';
const CREATED_MS = Date.parse(CREATED_AT);

// ---------- 1. fallback fires when refine is at/after createdAt ----------

test('planStageHeal: refine stamped at createdAt → fallback stamps backlog at createdAt+1s', () => {
  // Refine marker is 0ms after createdAt — exactly the #272 defect shape.
  const refineTs = new Date(CREATED_MS).toISOString();
  const body = `<!-- aitm-entered-refine: ${refineTs} -->\n`;
  const plan = planStageHeal({ stage: 'backlog', body, createdAt: CREATED_AT });
  assert.equal(plan.action, 'backfill');
  assert.equal(plan.reason, 'createdAt-anchored-backlog-fallback');
  assert.equal(Date.parse(plan.ts), CREATED_MS + 1000);
});

test('backlog fallback bumps refine when refine === createdAt (collision)', () => {
  // refine = createdAt → at backlogTs - 1000ms → strictly before backlogTs,
  // so refine must cascade to backlogTs + 1s.
  const refineTs = new Date(CREATED_MS).toISOString();
  const body = `<!-- aitm-entered-refine: ${refineTs} -->\n`;
  const plan = planStageHeal({ stage: 'backlog', body, createdAt: CREATED_AT });
  assert.equal(Date.parse(plan.refineBumpTs), CREATED_MS + 2000);
});

// ---------- 2. when safeBackfillTs has room, the fallback does NOT fire ----------

test('planStageHeal: refine 5s after createdAt → normal path succeeds, fallback skipped', () => {
  // safeBackfillTs has [createdAt..refine) to work with, so the normal
  // pre-gate-traversal path returns a feasible ts and the fallback is unused.
  const refineTs = new Date(CREATED_MS + 5000).toISOString();
  const body = `<!-- aitm-entered-refine: ${refineTs} -->\n`;
  const plan = planStageHeal({ stage: 'backlog', body, createdAt: CREATED_AT });
  assert.equal(plan.action, 'backfill');
  assert.equal(plan.reason, 'pre-gate-traversal');
  assert.equal(plan.refineBumpTs, undefined, 'normal path does not set refineBumpTs');
});

// ---------- 3. pure helper unit tests ----------

test('backlogCreatedAtFallback: refine missing → backlog at createdAt+1s, no bump', () => {
  const res = backlogCreatedAtFallback({ markers: {}, createdAt: CREATED_AT });
  assert.equal(Date.parse(res.backlogTs), CREATED_MS + 1000);
  assert.equal(res.refineBumpTs, null);
});

test('backlogCreatedAtFallback: refine after backlog → no bump', () => {
  const res = backlogCreatedAtFallback({
    markers: { refine: new Date(CREATED_MS + 5000).toISOString() },
    createdAt: CREATED_AT,
  });
  assert.equal(res.refineBumpTs, null);
});

test('backlogCreatedAtFallback: refine === backlogTs (boundary) → cascade refine', () => {
  // refine exactly at backlogMs (createdAt + 1s) → not strictly greater, so bump.
  const refineTs = new Date(CREATED_MS + 1000).toISOString();
  const res = backlogCreatedAtFallback({
    markers: { refine: refineTs },
    createdAt: CREATED_AT,
  });
  assert.equal(Date.parse(res.refineBumpTs), CREATED_MS + 2000);
});

test('backlogCreatedAtFallback: refine before createdAt (skewed-clock) → cascade refine', () => {
  // Pathological: refine timestamp predates createdAt. Still must cascade
  // to preserve strict ordering after backlog gets stamped at createdAt+1s.
  const refineTs = new Date(CREATED_MS - 10_000).toISOString();
  const res = backlogCreatedAtFallback({
    markers: { refine: refineTs },
    createdAt: CREATED_AT,
  });
  assert.equal(Date.parse(res.backlogTs), CREATED_MS + 1000);
  assert.equal(Date.parse(res.refineBumpTs), CREATED_MS + 2000);
});

test('backlogCreatedAtFallback: bad createdAt throws', () => {
  assert.throws(() => backlogCreatedAtFallback({ markers: {}, createdAt: 'not-a-date' }));
});

// ---------- 4. no-op when backlog already present ----------

test('planStageHeal: body already has backlog marker → no fallback needed', () => {
  const body = [
    `<!-- aitm-entered-backlog: ${new Date(CREATED_MS + 1000).toISOString()} -->`,
    `<!-- aitm-entered-refine: ${new Date(CREATED_MS + 2000).toISOString()} -->`,
  ].join('\n');
  const plan = planStageHeal({ stage: 'backlog', body, createdAt: CREATED_AT });
  // present + later marker + missing audit → audit-only path (existing behavior).
  assert.equal(plan.action, 'audit-only');
  assert.notEqual(plan.reason, 'createdAt-anchored-backlog-fallback');
});

// ---------- 5. end-to-end body transform ----------

test('apply: writes backlog entry+audit and cascades refine when needed', () => {
  // Defect shape: refine stamped at createdAt, no backlog marker.
  const refineTs = new Date(CREATED_MS).toISOString();
  let body = `## Scope\n\n<!-- aitm-entered-refine: ${refineTs} -->\n`;
  const plan = planStageHeal({ stage: 'backlog', body, createdAt: CREATED_AT });
  // mimic applyStageHeal: write backlog marker, then bump refine.
  body = backfillEntryMarker(body, 'backlog', plan.ts, plan.reason);
  // strip + re-stamp refine
  body = body.replace(/[ \t]*<!--\s*aitm-entered-refine:[^>]*?-->[ \t]*\n?/gi, '');
  body = backfillEntryMarker(body, 'refine', plan.refineBumpTs, 'createdAt-anchored-refine-bump');
  // assertions
  assert.match(body, /<!--\s*aitm-entered-backlog(?::\s*[0-9TZ:.-]+|\s+ts="[^"]*")\s*-->/);
  // #380: backfill audit marker now uses the property grammar.
  assert.match(
    body,
    /<!--\s*aitm-backfill stage="backlog" reason="createdAt-anchored-backlog-fallback" ts="[^"]+" -->/
  );
  assert.match(body, /<!--\s*aitm-entered-refine(?::\s*[0-9TZ:.-]+|\s+ts="[^"]*")\s*-->/);
  // Strict ordering: createdAt < backlog < refine (ts captured under either grammar)
  const TS_BOTH = (stage) =>
    new RegExp(`aitm-entered-${stage}(?::\\s*([0-9TZ:.+-]+)|\\s+ts="([^"]+)")`);
  const backlogMatch = body.match(TS_BOTH('backlog'));
  const refineMatch = body.match(TS_BOTH('refine'));
  assert.ok(backlogMatch && refineMatch, 'both markers present');
  const backlogMs = Date.parse(backlogMatch[1] ?? backlogMatch[2]);
  const refineMs = Date.parse(refineMatch[1] ?? refineMatch[2]);
  assert.ok(CREATED_MS < backlogMs, 'createdAt must precede backlog after heal');
  assert.ok(backlogMs < refineMs, 'backlog must precede refine after heal');
});
