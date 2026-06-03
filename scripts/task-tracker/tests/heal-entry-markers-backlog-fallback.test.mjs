#!/usr/bin/env node
// #272 — Regression tests for the createdAt-anchored backlog fallback in
// heal-entry-markers.mjs.
//
// Context: issues born under the (now removed) `create-issue --status refine`
// defect had `aitm-entered-refine` stamped at ~createdAt and no
// `aitm-entered-backlog` marker. The existing `safeBackfillTs` helper cannot
// produce a feasible timestamp because the floor (latest earlier-stage marker
// or createdAt) postdates the refine marker. The fallback stamps backlog at
// `createdAt - 2s` and, if the refine marker is at or before that, bumps
// refine to `createdAt + 1s` so the chain remains monotone.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { planStageHeal, backlogCreatedAtFallback } from '../heal-entry-markers.mjs';
import { backfillEntryMarker } from '../lib/stage-entry-markers.mjs';

const CREATED_AT = '2026-06-01T12:00:00.000Z';
const CREATED_MS = Date.parse(CREATED_AT);

// ---------- 1. fallback fires when refine is at/after createdAt ----------

test('planStageHeal: refine stamped near createdAt → fallback stamps backlog at createdAt-2s', () => {
  // Refine marker is 0ms after createdAt — exactly the #272 defect shape.
  const refineTs = new Date(CREATED_MS).toISOString();
  const body = `<!-- aitm-entered-refine: ${refineTs} -->\n`;
  const plan = planStageHeal({ stage: 'backlog', body, createdAt: CREATED_AT });
  assert.equal(plan.action, 'backfill');
  assert.equal(plan.reason, 'createdAt-anchored-backlog-fallback');
  assert.equal(Date.parse(plan.ts), CREATED_MS - 2000);
});

test('backlog fallback does not bump refine when refine is strictly after createdAt-2s', () => {
  // refine = createdAt → strictly after createdAt - 2s, so no bump needed.
  const refineTs = new Date(CREATED_MS).toISOString();
  const body = `<!-- aitm-entered-refine: ${refineTs} -->\n`;
  const plan = planStageHeal({ stage: 'backlog', body, createdAt: CREATED_AT });
  assert.equal(plan.refineBumpTs, null, 'no bump when refine > backlog');
});

// ---------- 2. fallback bumps refine when refine is at/before backlog ----------

test('backlog fallback bumps refine when refine is at/before createdAt-2s', () => {
  // Refine stamped well before createdAt (skewed-clock scenario).
  const refineTs = new Date(CREATED_MS - 10_000).toISOString();
  const body = `<!-- aitm-entered-refine: ${refineTs} -->\n`;
  const plan = planStageHeal({ stage: 'backlog', body, createdAt: CREATED_AT });
  assert.equal(plan.action, 'backfill');
  assert.equal(plan.reason, 'createdAt-anchored-backlog-fallback');
  assert.equal(Date.parse(plan.ts), CREATED_MS - 2000);
  assert.equal(Date.parse(plan.refineBumpTs), CREATED_MS + 1000);
});

// ---------- 3. pure helper unit tests ----------

test('backlogCreatedAtFallback: refine missing → backlog at createdAt-2s, no bump', () => {
  const res = backlogCreatedAtFallback({ markers: {}, createdAt: CREATED_AT });
  assert.equal(Date.parse(res.backlogTs), CREATED_MS - 2000);
  assert.equal(res.refineBumpTs, null);
});

test('backlogCreatedAtFallback: refine after backlog → no bump', () => {
  const res = backlogCreatedAtFallback({
    markers: { refine: new Date(CREATED_MS + 5000).toISOString() },
    createdAt: CREATED_AT,
  });
  assert.equal(res.refineBumpTs, null);
});

test('backlogCreatedAtFallback: refine === backlog (boundary) → bump', () => {
  // refine exactly at backlogMs → not strictly greater, so bump.
  const refineTs = new Date(CREATED_MS - 2000).toISOString();
  const res = backlogCreatedAtFallback({
    markers: { refine: refineTs },
    createdAt: CREATED_AT,
  });
  assert.equal(Date.parse(res.refineBumpTs), CREATED_MS + 1000);
});

test('backlogCreatedAtFallback: bad createdAt throws', () => {
  assert.throws(() => backlogCreatedAtFallback({ markers: {}, createdAt: 'not-a-date' }));
});

// ---------- 4. no-op when backlog already present ----------

test('planStageHeal: body already has backlog marker → no fallback needed', () => {
  const body = [
    `<!-- aitm-entered-backlog: ${CREATED_AT} -->`,
    `<!-- aitm-entered-refine: ${new Date(CREATED_MS + 1000).toISOString()} -->`,
  ].join('\n');
  const plan = planStageHeal({ stage: 'backlog', body, createdAt: CREATED_AT });
  // present + later marker + missing audit → audit-only path (existing behavior).
  assert.equal(plan.action, 'audit-only');
  assert.notEqual(plan.reason, 'createdAt-anchored-backlog-fallback');
});

// ---------- 5. end-to-end body transform ----------

test('apply: writes backlog entry+audit and bumps refine when needed', () => {
  const refineMs = CREATED_MS - 10_000;
  const refineTs = new Date(refineMs).toISOString();
  let body = `## Scope\n\n<!-- aitm-entered-refine: ${refineTs} -->\n`;
  const plan = planStageHeal({ stage: 'backlog', body, createdAt: CREATED_AT });
  // mimic applyStageHeal: write backlog marker, then bump refine.
  body = backfillEntryMarker(body, 'backlog', plan.ts, plan.reason);
  // strip + re-stamp refine
  body = body.replace(/[ \t]*<!--\s*aitm-entered-refine:[^>]*?-->[ \t]*\n?/gi, '');
  body = backfillEntryMarker(body, 'refine', plan.refineBumpTs, 'createdAt-anchored-refine-bump');
  // assertions
  assert.match(body, /<!--\s*aitm-entered-backlog:\s*[0-9TZ:.-]+\s*-->/);
  assert.match(
    body,
    /<!--\s*aitm-backfill:\s*backlog:createdAt-anchored-backlog-fallback:[^>]+-->/
  );
  assert.match(body, /<!--\s*aitm-entered-refine:\s*[0-9TZ:.-]+\s*-->/);
  // Backlog ts < refine ts (monotone)
  const backlogMatch = body.match(/aitm-entered-backlog:\s*([^\s-][^\s]*?)\s*-->/);
  const refineMatch = body.match(/aitm-entered-refine:\s*([^\s-][^\s]*?)\s*-->/);
  assert.ok(backlogMatch && refineMatch, 'both markers present');
  assert.ok(
    Date.parse(backlogMatch[1]) < Date.parse(refineMatch[1]),
    'backlog must precede refine after heal'
  );
});
