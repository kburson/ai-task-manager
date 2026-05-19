#!/usr/bin/env node
// cspell:ignore optout optouts Optouts
// Unit tests for lifecycleSatisfaction + assertLifecycleSatisfied (#179).
// Covers the full {ticked, audited, optout, missing} matrix per key.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  LIFECYCLE_LABELS,
  lifecycleSatisfaction,
  parseLifecycleOptouts,
} from '../lib/lifecycle-dod.mjs';
import { assertLifecycleSatisfied } from '../close-gate.mjs';

function bodyWith(lines = []) {
  return [
    '## Scope',
    'x',
    '## Definition of Done',
    '#### Functional',
    '- [x] Some user-verified item',
    '#### Lifecycle (auto-ticked at Review/Close)',
    ...lines,
  ].join('\n');
}

const ALL_LIFECYCLE_LINES = Object.values(LIFECYCLE_LABELS).map((l) => `- [ ] ${l}`);

test('lifecycleSatisfaction: all missing when labels absent', () => {
  const results = lifecycleSatisfaction(bodyWith([]));
  for (const r of results) assert.equal(r.status, 'missing');
});

test('lifecycleSatisfaction: ticked when checkbox is [x]', () => {
  const lines = Object.values(LIFECYCLE_LABELS).map((l) => `- [x] ${l}`);
  const results = lifecycleSatisfaction(bodyWith(lines));
  for (const r of results) assert.equal(r.status, 'ticked');
});

test('lifecycleSatisfaction: audited when fullAutoApproved & passed-final-review missing', () => {
  const results = lifecycleSatisfaction(bodyWith(ALL_LIFECYCLE_LINES), {
    fullAutoApproved: true,
  });
  const pfr = results.find((r) => r.key === 'passed-final-review');
  assert.equal(pfr.status, 'audited');
  // other keys still missing — audit applies only to passed-final-review.
  const sc = results.find((r) => r.key === 'story-closed');
  assert.equal(sc.status, 'missing');
});

test('lifecycleSatisfaction: optout when marker present and label missing', () => {
  const body = bodyWith([]) + '\n<!-- aitm-lifecycle-optout: timing-flushed -->\n';
  const results = lifecycleSatisfaction(body);
  const tf = results.find((r) => r.key === 'timing-flushed');
  assert.equal(tf.status, 'optout');
});

test('lifecycleSatisfaction: ticked beats audited', () => {
  const lines = [`- [x] ${LIFECYCLE_LABELS['passed-final-review']}`];
  const results = lifecycleSatisfaction(bodyWith(lines), { fullAutoApproved: true });
  const pfr = results.find((r) => r.key === 'passed-final-review');
  assert.equal(pfr.status, 'ticked');
});

test('parseLifecycleOptouts: parses multiple keys, lowercases', () => {
  const body =
    '<!-- aitm-lifecycle-optout: STORY-CLOSED -->\n' +
    '<!-- aitm-lifecycle-optout: timing-flushed -->';
  const out = parseLifecycleOptouts(body);
  assert.equal(out.has('story-closed'), true);
  assert.equal(out.has('timing-flushed'), true);
  assert.equal(out.has('passed-final-review'), false);
});

test('assertLifecycleSatisfied: required + missing → block', () => {
  const gate = assertLifecycleSatisfied({ body: bodyWith(ALL_LIFECYCLE_LINES) });
  assert.equal(gate.block, true);
  assert.match(gate.reason, /lifecycle-incomplete/);
  assert.match(gate.reason, /passed-final-review/);
});

test('assertLifecycleSatisfied: required + all ticked → pass', () => {
  const lines = Object.values(LIFECYCLE_LABELS).map((l) => `- [x] ${l}`);
  const gate = assertLifecycleSatisfied({ body: bodyWith(lines) });
  assert.equal(gate.block, false);
  assert.equal(gate.missing.length, 0);
});

test('assertLifecycleSatisfied: required=false never blocks', () => {
  const gate = assertLifecycleSatisfied({
    body: bodyWith(ALL_LIFECYCLE_LINES),
    required: false,
  });
  assert.equal(gate.block, false);
  // results still expose what's missing for caller WARN emission.
  assert.equal(gate.missing.length, 3);
});

test('assertLifecycleSatisfied: audit marker satisfies passed-final-review only', () => {
  const body =
    bodyWith(ALL_LIFECYCLE_LINES) +
    '\n<!-- aitm-full-auto-approved: 2026-05-19T00:00:00Z signals=test -->';
  const gate = assertLifecycleSatisfied({ body });
  assert.equal(gate.block, true);
  const missingKeys = gate.missing.map((m) => m.key);
  assert.equal(missingKeys.includes('passed-final-review'), false);
  assert.equal(missingKeys.includes('story-closed'), true);
  assert.equal(missingKeys.includes('timing-flushed'), true);
});

test('assertLifecycleSatisfied: opt-outs unblock per key', () => {
  const body =
    bodyWith(ALL_LIFECYCLE_LINES) +
    '\n<!-- aitm-lifecycle-optout: passed-final-review -->' +
    '\n<!-- aitm-lifecycle-optout: story-closed -->' +
    '\n<!-- aitm-lifecycle-optout: timing-flushed -->';
  const gate = assertLifecycleSatisfied({ body });
  assert.equal(gate.block, false);
});
