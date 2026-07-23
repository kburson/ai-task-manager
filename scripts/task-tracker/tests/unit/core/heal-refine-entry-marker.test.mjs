#!/usr/bin/env node
// @story #309
// Unit tests for heal-refine-entry-marker.mjs — the one-shot heal that
// backfills `aitm-entered-refine` on issues that traversed Refine before
// stage-entry marker stamping was mandatory.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { needsBackfill } from '../../../heal-refine-entry-marker.mjs';
import { backfillEntryMarker } from '../../../lib/stage-entry-markers.mjs';

test('needsBackfill: true when later-stage marker present and refine-entry absent', () => {
  const body = '## Scope\n\n<!-- aitm-entered-plan: 2026-05-16T18:00:00Z -->\n';
  assert.equal(needsBackfill(body), true);
});

test('needsBackfill: false when refine-entry and audit marker both present', () => {
  const body = [
    '<!-- aitm-entered-refine: 2026-05-16T17:00:00Z -->',
    '<!-- aitm-backfill: refine:pre-gate-refine-traversal:2026-05-16T17:00:00Z -->',
    '<!-- aitm-entered-plan: 2026-05-16T18:00:00Z -->',
  ].join('\n');
  assert.equal(needsBackfill(body), false);
});

test('needsBackfill: true when refine-entry present but audit marker missing (unaudited fabrication)', () => {
  const body = [
    '<!-- aitm-entered-refine: 2026-05-16T17:00:00Z -->',
    '<!-- aitm-entered-plan: 2026-05-16T18:00:00Z -->',
  ].join('\n');
  assert.equal(needsBackfill(body), true);
});

test('needsBackfill: false when refine-entry present and no later-stage markers (still in refine)', () => {
  const body = '<!-- aitm-entered-refine: 2026-05-16T17:00:00Z -->';
  assert.equal(needsBackfill(body), false);
});

test('needsBackfill: false when no later-stage markers (issue still in backlog/refine)', () => {
  assert.equal(needsBackfill('## Scope\n\nstill being refined'), false);
});

test('needsBackfill: triggers on entered-develop alone too', () => {
  assert.equal(needsBackfill('<!-- aitm-entered-develop: 2026-05-16T18:00:00Z -->'), true);
});

test('backfillEntryMarker integration: writes both entry and audit markers', () => {
  const ts = '2026-05-16T12:51:00Z';
  const out = backfillEntryMarker(
    '<!-- aitm-entered-plan: 2026-05-16T18:00:00Z -->\n',
    'refine',
    ts,
    'pre-gate-refine-traversal'
  );
  assert.match(out, /<!-- aitm-entered-refine ts="2026-05-16T12:51:00Z" -->/);
  // #380: backfill audit marker now uses the property grammar.
  assert.match(
    out,
    /<!-- aitm-backfill stage="refine" reason="pre-gate-refine-traversal" ts="2026-05-16T12:51:00Z" -->/
  );
});

test('backfillEntryMarker is idempotent on already-backfilled bodies', () => {
  const ts = '2026-05-16T12:51:00Z';
  const once = backfillEntryMarker('', 'refine', ts, 'pre-gate-refine-traversal');
  const twice = backfillEntryMarker(once, 'refine', '2099-01-01T00:00:00Z', 'different-reason');
  assert.equal(twice, once, 'second call must not duplicate or rewrite markers');
});
