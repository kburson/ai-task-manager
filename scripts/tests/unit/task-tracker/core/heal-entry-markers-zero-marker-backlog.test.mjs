#!/usr/bin/env node
// @story #784
// #784 — Regression tests for the zero-marker backlog backfill in
// heal-entry-markers.mjs.
//
// Bug: an issue sitting in `backlog` with NO entry markers at all is
// un-promotable. The #252 contiguity guard requires `aitm-entered-backlog`
// before any forward move, but `planStageHeal`'s only backlog-minting branch
// (`hasLater && !hasEntry`, case-(a)) never fires because nothing is "later".
// Control fell through to `skip / no-heal-needed`, so no sanctioned tool could
// stamp the missing marker — a hard deadlock.
//
// Fix: a dedicated `stage === 'backlog' && !hasEntry && !hasLater` branch reuses
// `backlogCreatedAtFallback` to mint backlog at `createdAt + 1s`.
//
// Marker ordering invariant restored:
//   createdAt < aitm-entered-backlog

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { planStageHeal } from '../../../../task-tracker/heal-entry-markers.mjs';
import { backfillEntryMarker } from '../../../../task-tracker/lib/stage-entry-markers.mjs';

const CREATED_AT = '2026-07-11T12:00:00.000Z';
const CREATED_MS = Date.parse(CREATED_AT);

// A body with no stage-entry markers whatsoever — the zero-marker backlog shape.
const ZERO_MARKER_BODY = '## Scope\n\nDo the thing.\n\n<!-- aitm-fields: {} -->\n';

// ---------- 1. dry-run: backlog proposes a fallback backfill ----------

test('planStageHeal: zero-marker backlog → backfill via createdAt fallback', () => {
  const plan = planStageHeal({ stage: 'backlog', body: ZERO_MARKER_BODY, createdAt: CREATED_AT });
  assert.equal(plan.action, 'backfill');
  assert.equal(plan.reason, 'zero-marker-backlog-fallback');
  assert.equal(plan.mode, 'entry+audit');
  // Strictly after createdAt (createdAt + 1s).
  assert.equal(Date.parse(plan.ts), CREATED_MS + 1000);
  assert.ok(Date.parse(plan.ts) > CREATED_MS, 'backlog ts must be strictly after createdAt');
  // No refine marker present → no cascade bump.
  assert.equal(plan.refineBumpTs, null);
});

// ---------- 2. only backlog heals; later stages stay untouched ----------

test('planStageHeal: zero-marker body for a non-backlog stage → no-heal-needed', () => {
  // The zero-marker branch is gated on stage === 'backlog'. A fresh backlog
  // issue must NOT get a phantom refine/plan/etc marker minted.
  for (const stage of ['refine', 'plan', 'develop', 'test', 'review']) {
    const plan = planStageHeal({ stage, body: ZERO_MARKER_BODY, createdAt: CREATED_AT });
    assert.equal(plan.action, 'skip', `${stage} must not be backfilled`);
    assert.equal(plan.reason, 'no-heal-needed');
  }
});

// ---------- 3. apply: writes a well-formed backlog entry + audit marker ----------

test('apply: zero-marker backlog gets a well-formed marker with ts > createdAt', () => {
  const plan = planStageHeal({ stage: 'backlog', body: ZERO_MARKER_BODY, createdAt: CREATED_AT });
  const body = backfillEntryMarker(ZERO_MARKER_BODY, 'backlog', plan.ts, plan.reason);
  // Well-formed entry marker (either grammar).
  assert.match(body, /<!--\s*aitm-entered-backlog(?::\s*[0-9TZ:.-]+|\s+ts="[^"]*")\s*-->/);
  // Audit-trail marker with the #784 reason (property grammar, #380).
  assert.match(
    body,
    /<!--\s*aitm-backfill stage="backlog" reason="zero-marker-backlog-fallback" ts="[^"]+" -->/
  );
  // Strict ordering: createdAt < backlog.
  const m = body.match(/aitm-entered-backlog(?::\s*([0-9TZ:.+-]+)|\s+ts="([^"]+)")/);
  assert.ok(m, 'backlog marker present');
  const backlogMs = Date.parse(m[1] ?? m[2]);
  assert.ok(CREATED_MS < backlogMs, 'createdAt must precede the minted backlog marker');
});

// ---------- 4. unparseable createdAt degrades to no-heal-needed ----------

test('planStageHeal: zero-marker backlog with bad createdAt → no-heal-needed (no throw)', () => {
  const plan = planStageHeal({ stage: 'backlog', body: ZERO_MARKER_BODY, createdAt: 'not-a-date' });
  assert.equal(plan.action, 'skip');
  assert.equal(plan.reason, 'no-heal-needed');
});
