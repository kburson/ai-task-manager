#!/usr/bin/env node
// @story #179
// cspell:ignore optout optouts Optouts
// Unit tests for lifecycleSatisfaction + assertLifecycleSatisfied (#179).
// Covers the full {ticked, audited, optout, missing} matrix per key.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  LIFECYCLE_LABELS,
  lifecycleSatisfaction,
  parseLifecycleOptouts,
} from '../../../lib/lifecycle-dod.mjs';
import { assertLifecycleSatisfied } from '../../../close-gate.mjs';

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

function canonicalBody({ review = [], housekeeping = [] } = {}) {
  return [
    '## Definition of Done',
    '### Functional (verified at Test)',
    '- [x] Some user-verified item',
    '### Lifecycle (verified at Review)',
    ...review,
    '### Housekeeping (verified at Close)',
    ...housekeeping,
  ].join('\n');
}

const ALL_LIFECYCLE_LINES = Object.values(LIFECYCLE_LABELS).map((l) => `- [ ] ${l}`);

test('lifecycleSatisfaction: all absent when labels absent', () => {
  // #809 — a lifecycle label line that is not present at all is `absent`,
  // distinct from `missing` (present but unticked). Back-compat bodies authored
  // before the two-checkbox split lack the "Agent Review Passed" line entirely.
  const results = lifecycleSatisfaction(bodyWith([]));
  for (const r of results) assert.equal(r.status, 'absent');
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

test('assertLifecycleSatisfied: required + passed-final-review missing → block', () => {
  const gate = assertLifecycleSatisfied({ body: bodyWith(ALL_LIFECYCLE_LINES) });
  assert.equal(gate.block, true);
  assert.match(gate.reason, /lifecycle-incomplete/);
  assert.match(gate.reason, /passed-final-review/);
  // close-owned keys must NOT appear in the block reason even though they
  // are still "missing" in results.
  assert.doesNotMatch(gate.reason, /story-closed/);
  assert.doesNotMatch(gate.reason, /timing-flushed/);
});

test('assertLifecycleSatisfied: only close-owned keys missing → pass', () => {
  // Tick passed-final-review; leave the two close-owned keys unticked.
  const lines = [
    `- [x] ${LIFECYCLE_LABELS['passed-final-review']}`,
    `- [ ] ${LIFECYCLE_LABELS['story-closed']}`,
    `- [ ] ${LIFECYCLE_LABELS['timing-flushed']}`,
  ];
  const gate = assertLifecycleSatisfied({ body: bodyWith(lines) });
  assert.equal(gate.block, false);
  assert.equal(gate.missing.length, 0);
  // Full results still expose the unticked close-owned keys for integrity reporting.
  const missingInResults = gate.results.filter((r) => r.status === 'missing').map((r) => r.key);
  assert.deepEqual(missingInResults.sort(), ['story-closed', 'timing-flushed']);
});

// @story #982
test('#982 canonical satisfaction reads review and housekeeping as one logical set', () => {
  const body = canonicalBody({
    review: [
      `- [x] ${LIFECYCLE_LABELS['agent-review-passed']}`,
      `- [x] ${LIFECYCLE_LABELS['passed-final-review']}`,
    ],
    housekeeping: [
      `- [ ] ${LIFECYCLE_LABELS['story-closed']}`,
      `- [ ] ${LIFECYCLE_LABELS['timing-flushed']}`,
    ],
  });

  const gate = assertLifecycleSatisfied({ body });
  assert.equal(gate.block, false);
  assert.equal(gate.missing.length, 0);
  assert.deepEqual(
    gate.results.filter(({ status }) => status === 'missing').map(({ key }) => key),
    ['story-closed', 'timing-flushed']
  );
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
  // `missing` reflects only the keys the gate would actually block on —
  // close-owned keys are filtered. #809 — with all four label lines present but
  // unticked, both the objective (`agent-review-passed`) and subjective
  // (`passed-final-review`) sign-offs block; the two close-owned keys do not.
  const blockingKeys = gate.missing.map((m) => m.key).sort();
  assert.deepEqual(blockingKeys, ['agent-review-passed', 'passed-final-review']);
  const allMissing = gate.results.filter((r) => r.status === 'missing').map((r) => r.key);
  assert.equal(allMissing.length, 4);
});

test('assertLifecycleSatisfied: audit marker satisfies passed-final-review only', () => {
  // #809 — full-auto audits only the SUBJECTIVE `passed-final-review`. The
  // objective `agent-review-passed` gate is ticked for real by `/task review`
  // when the structural gate passes, so a real full-auto body has it ticked;
  // tick it here so the audit-only path is exercised in isolation.
  const lines = ALL_LIFECYCLE_LINES.map((l) =>
    l.includes(LIFECYCLE_LABELS['agent-review-passed']) ? l.replace('[ ]', '[x]') : l
  );
  const body =
    bodyWith(lines) + '\n<!-- aitm-full-auto-approved: 2026-05-19T00:00:00Z signals=test -->';
  const gate = assertLifecycleSatisfied({ body });
  // passed-final-review is audited; agent-review-passed is ticked; close-owned
  // keys are filtered → no block.
  assert.equal(gate.block, false);
  // Full results still expose the unticked close-owned keys.
  const resultMissingKeys = gate.results.filter((r) => r.status === 'missing').map((r) => r.key);
  assert.equal(resultMissingKeys.includes('passed-final-review'), false);
  assert.equal(resultMissingKeys.includes('story-closed'), true);
  assert.equal(resultMissingKeys.includes('timing-flushed'), true);
});

test('assertLifecycleSatisfied: opt-outs unblock per key', () => {
  const body =
    bodyWith(ALL_LIFECYCLE_LINES) +
    '\n<!-- aitm-lifecycle-optout: agent-review-passed -->' +
    '\n<!-- aitm-lifecycle-optout: passed-final-review -->' +
    '\n<!-- aitm-lifecycle-optout: story-closed -->' +
    '\n<!-- aitm-lifecycle-optout: timing-flushed -->';
  const gate = assertLifecycleSatisfied({ body });
  assert.equal(gate.block, false);
});
