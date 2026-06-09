// Tests for lib/body-invariants.mjs — INVARIANT_MARKER_PATTERNS and
// findLostMarkers(base, next).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { INVARIANT_MARKER_PATTERNS, findLostMarkers } from '../lib/body-invariants.mjs';

test('INVARIANT_MARKER_PATTERNS includes the canonical invariant marker set', () => {
  const names = INVARIANT_MARKER_PATTERNS.map((p) => p.name);
  // Spot-check the markers #361 was filed for.
  for (const required of [
    'aitm-fields',
    'aitm-body-version',
    'aitm-stage-rollup',
    'aitm-refine-complete',
    'aitm-plan-approved',
    'aitm-deep-dive-posted',
    'aitm-deep-dive-complete',
    'aitm-last-known-state',
    'aitm-last-known-state-ts',
    'aitm-entered-<stage>',
  ]) {
    assert.ok(names.includes(required), `missing pattern: ${required}`);
  }
});

test('findLostMarkers returns empty list when next preserves all markers', () => {
  const base =
    '## AC\n<!-- aitm-fields: {} -->\n<!-- aitm-body-version: 3 -->\n<!-- aitm-entered-refine: 2026-06-08T00:00:00Z -->\n';
  const next = base; // unchanged
  assert.deepEqual(findLostMarkers(base, next), []);
});

test('findLostMarkers reports a single-kind marker by name when dropped', () => {
  const base = '## AC\n<!-- aitm-fields: {"size":"M"} -->\n<!-- aitm-body-version: 5 -->\n';
  const next = '## AC\n<!-- aitm-body-version: 5 -->\n';
  assert.deepEqual(findLostMarkers(base, next), ['aitm-fields']);
});

test('findLostMarkers reports each lost aitm-entered-<stage> individually', () => {
  const base =
    '## AC\n<!-- aitm-entered-backlog: 2026-06-01T00:00:00Z -->\n<!-- aitm-entered-refine: 2026-06-02T00:00:00Z -->\n<!-- aitm-entered-plan: 2026-06-03T00:00:00Z -->\n';
  // Drop refine and plan; keep backlog.
  const next = '## AC\n<!-- aitm-entered-backlog: 2026-06-01T00:00:00Z -->\n';
  const lost = findLostMarkers(base, next);
  assert.deepEqual(lost.sort(), ['aitm-entered-plan', 'aitm-entered-refine']);
});

test('findLostMarkers reports multiple single-kind markers when several drop', () => {
  const base =
    '## AC\n<!-- aitm-fields: {} -->\n<!-- aitm-body-version: 1 -->\n<!-- aitm-stage-rollup: refine=1 -->\n<!-- aitm-plan-approved: 2026-06-01 -->\n';
  const next = '## AC\n<!-- aitm-fields: {} -->\n'; // drops three
  const lost = findLostMarkers(base, next);
  assert.deepEqual(lost.sort(), ['aitm-body-version', 'aitm-plan-approved', 'aitm-stage-rollup']);
});

test('findLostMarkers tolerates empty/null base/next without throwing', () => {
  assert.deepEqual(findLostMarkers('', ''), []);
  assert.deepEqual(findLostMarkers(null, null), []);
  assert.deepEqual(findLostMarkers(undefined, undefined), []);
});

test('findLostMarkers ignores markers that were never in base', () => {
  const base = '## AC\n';
  const next = '## AC\n<!-- aitm-fields: {} -->\n';
  assert.deepEqual(findLostMarkers(base, next), []);
});
