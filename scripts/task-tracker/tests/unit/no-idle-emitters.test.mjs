// @story #824
// EPIC #823 (timing model v2) C1 — removal guard.
//
// Timing model v2 retires the `idle` and `active-work` rows and the auto-pause
// writer entirely. This test pins the deletions: it fails while any producer of
// the retired vocabulary survives and passes only once C1's edits land, so a
// future change cannot silently reintroduce an emitter.
//
// It mixes two kinds of assertion:
//   • functional — import the READ-side classifier and prove a legacy `idle`
//     slug no longer opens an idle span and `active-work` is no longer a
//     canonical phase slug;
//   • static — read the three edited source files and assert the removed
//     symbols / emitter literals are gone.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyTimingEvent,
  isDepartureEvent,
  isCanonicalPhaseSlug,
  opensIdleSpan,
  EVENT_CLASS,
} from '../../lib/timing-event-map.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const taskRoot = path.resolve(here, '../..');
const read = (rel) => readFileSync(path.join(taskRoot, rel), 'utf8');

test('READ-side no longer classifies a legacy `idle` slug as a departure', () => {
  assert.equal(isDepartureEvent('idle'), false);
  assert.equal(opensIdleSpan('idle'), false);
  assert.equal(classifyTimingEvent('idle'), EVENT_CLASS.PHASE);
});

test('`active-work` is no longer a canonical/recognized phase slug', () => {
  assert.equal(isCanonicalPhaseSlug('active-work'), false);
  // and it is not itself a departure/reengagement — it is retired vocabulary
  assert.equal(classifyTimingEvent('active-work'), EVENT_CLASS.PHASE);
});

test('AUDIT_PHASE_SLUGS source no longer lists `active-work`', () => {
  const src = read('lib/timing-event-map.mjs');
  const start = src.indexOf('const AUDIT_PHASE_SLUGS');
  const auditBlock = src.slice(start, src.indexOf(']);', start) + 3);
  assert.ok(start >= 0 && auditBlock.length > 0, 'AUDIT_PHASE_SLUGS block located');
  assert.ok(
    !/['"]active-work['"]/.test(auditBlock),
    'active-work must not appear inside AUDIT_PHASE_SLUGS'
  );
});

// ---- C6 (#830): the bare `review` / `review-ready` slugs are retired ---------

test('C6 — `review` and `review-ready` are no longer canonical phase slugs', () => {
  assert.equal(isCanonicalPhaseSlug('review'), false);
  assert.equal(isCanonicalPhaseSlug('review-ready'), false);
  // A legacy log that still carries them classifies them as neutral PHASE (they
  // open an ACTIVE span, never a departure/reengagement) until the heal strips
  // them — so span active/idle accounting is invariant pre-heal.
  assert.equal(classifyTimingEvent('review'), EVENT_CLASS.PHASE);
  assert.equal(classifyTimingEvent('review-ready'), EVENT_CLASS.PHASE);
});

test('C6 — AUDIT_PHASE_SLUGS source no longer lists `review` / `review-ready`', () => {
  const src = read('lib/timing-event-map.mjs');
  const start = src.indexOf('const AUDIT_PHASE_SLUGS');
  const auditBlock = src.slice(start, src.indexOf(']);', start) + 3);
  assert.ok(start >= 0 && auditBlock.length > 0, 'AUDIT_PHASE_SLUGS block located');
  assert.ok(
    !/['"]review['"]/.test(auditBlock),
    'bare `review` must not appear inside AUDIT_PHASE_SLUGS'
  );
  assert.ok(
    !/['"]review-ready['"]/.test(auditBlock),
    '`review-ready` must not appear inside AUDIT_PHASE_SLUGS'
  );
});

test('orphan-finalize.mjs contains no idle/active-work emitter', () => {
  const src = read('orphan-finalize.mjs');
  assert.ok(!src.includes('emitActiveWorkSegment'), 'emitActiveWorkSegment must be removed');
  assert.ok(!/event:\s*['"]active-work['"]/.test(src), "must not post an event: 'active-work' row");
  assert.ok(!/event:\s*['"]idle['"]/.test(src), "must not post an event: 'idle' row");
  // the exported gap helper is retained for consumers
  assert.ok(src.includes('export function computeGapSeconds'), 'computeGapSeconds kept');
});

test('on-stop.mjs no longer writes a pending-pause marker on turn-end', () => {
  const src = read('hooks/on-stop.mjs');
  assert.ok(!src.includes('writeFileSync'), 'the pending-pause auto-writer must be removed');
  assert.ok(!src.includes('mkdirSync'), 'no session-dir creation for a pause marker');
  // exports still present for the marker-cleanup path + tests
  assert.ok(src.includes('export function pendingPausePath'), 'pendingPausePath kept');
  assert.ok(src.includes('export function buildPayload'), 'buildPayload kept');
});
