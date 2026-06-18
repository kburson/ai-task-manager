#!/usr/bin/env node
// @story #138
// Unit tests for lib/lifecycle-dod.mjs (#138).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  parseLifecycleItems,
  parseFunctionalItems,
  tickLifecycleItem,
  untickLifecycleItem,
  detectLifecyclePretick,
  locateFunctionalSection,
  lifecycleItemState,
  LIFECYCLE_LABELS,
  LIFECYCLE_LABEL_SET,
} from '../../lib/lifecycle-dod.mjs';

const TEMPLATE = [
  '## DoD',
  '',
  '#### Functional (verified at Test)',
  '- [x] All automated tests pass',
  '- [x] Acceptance criteria met',
  '',
  '#### Lifecycle (auto-ticked at Review/Close)',
  '- [ ] Passed final human review',
  '- [ ] Story closed and moved to Done',
  '- [ ] Timing data flushed to issue',
  '',
  '## Pickup Directive',
].join('\n');

test('parseLifecycleItems: returns three keys in order', () => {
  const items = parseLifecycleItems(TEMPLATE);
  assert.equal(items.length, 3);
  assert.deepEqual(
    items.map((i) => i.key),
    ['passed-final-review', 'story-closed', 'timing-flushed']
  );
  assert.ok(items.every((i) => !i.checked));
});

test('parseLifecycleItems: no Lifecycle section → empty array', () => {
  assert.deepEqual(parseLifecycleItems('## Scope\n\nno lifecycle here'), []);
});

test('tickLifecycleItem: ticks story-closed and leaves others alone', () => {
  const out = tickLifecycleItem(TEMPLATE, 'story-closed');
  assert.match(out, /- \[x\] Story closed and moved to Done/);
  assert.match(out, /- \[ \] Passed final human review/);
  assert.match(out, /- \[ \] Timing data flushed to issue/);
});

test('tickLifecycleItem: idempotent (already ticked → unchanged)', () => {
  const ticked = tickLifecycleItem(TEMPLATE, 'story-closed');
  const again = tickLifecycleItem(ticked, 'story-closed');
  assert.equal(again, ticked);
});

test('tickLifecycleItem: missing section → returns body unchanged', () => {
  const body = '## Scope\n\nno lifecycle here.';
  assert.equal(tickLifecycleItem(body, 'story-closed'), body);
});

test('tickLifecycleItem: unknown key → throws', () => {
  assert.throws(() => tickLifecycleItem(TEMPLATE, 'nope'), /unknown lifecycle key/);
});

test('parseFunctionalItems: extracts Functional sub-block items', () => {
  const items = parseFunctionalItems(TEMPLATE);
  assert.equal(items.length, 2);
  assert.equal(items[0].label, 'All automated tests pass');
  assert.ok(items.every((i) => i.checked));
});

test('parseFunctionalItems: no Functional section → empty array', () => {
  assert.deepEqual(parseFunctionalItems('## Scope\n\nno functional here'), []);
});

test('locateFunctionalSection: bounds end at next heading', () => {
  const loc = locateFunctionalSection(TEMPLATE);
  assert.ok(loc);
  assert.ok(loc.section.includes('All automated tests pass'));
  assert.ok(!loc.section.includes('Passed final human review'));
});

test('untickLifecycleItem: reverses a tick (idempotent)', () => {
  const ticked = tickLifecycleItem(TEMPLATE, 'story-closed');
  const reverted = untickLifecycleItem(ticked, 'story-closed');
  assert.match(reverted, /- \[ \] Story closed and moved to Done/);
  const again = untickLifecycleItem(reverted, 'story-closed');
  assert.equal(again, reverted);
});

test('detectLifecyclePretick: ticked items → un-ticked + regressions reported', () => {
  let body = tickLifecycleItem(TEMPLATE, 'story-closed');
  body = tickLifecycleItem(body, 'timing-flushed');
  const r = detectLifecyclePretick(body);
  assert.equal(r.regressions.length, 2);
  assert.deepEqual(r.regressions.map((x) => x.key).sort(), ['story-closed', 'timing-flushed']);
  assert.match(r.body, /- \[ \] Story closed and moved to Done/);
  assert.match(r.body, /- \[ \] Timing data flushed to issue/);
});

test('detectLifecyclePretick: no ticks → empty regressions, body unchanged', () => {
  const r = detectLifecyclePretick(TEMPLATE);
  assert.equal(r.regressions.length, 0);
  assert.equal(r.body, TEMPLATE);
});

test('detectLifecyclePretick: no Lifecycle section (back-compat flat DoD) → no regressions', () => {
  const flat = '## DoD\n\n- [x] All tests pass\n- [x] Lint clean\n';
  const r = detectLifecyclePretick(flat);
  assert.equal(r.regressions.length, 0);
  assert.equal(r.body, flat);
});

test('LIFECYCLE_LABEL_SET: contains all three labels', () => {
  assert.equal(LIFECYCLE_LABEL_SET.size, 3);
  for (const label of Object.values(LIFECYCLE_LABELS)) {
    assert.ok(LIFECYCLE_LABEL_SET.has(label));
  }
});

// #302 — lifecycleItemState: structural inspection without mutation. Lets
// `approve.mjs` distinguish "label genuinely missing" from "box already
// ticked" — both produce a no-op write in tickLifecycleItem.

test('lifecycleItemState: no Lifecycle section → sectionPresent=false', () => {
  const s = lifecycleItemState({ body: '## DoD\n', key: 'passed-final-review' });
  assert.deepEqual(s, { sectionPresent: false, labelFound: false, alreadyTicked: false });
});

test('lifecycleItemState: heading present but label absent (customized DoD)', () => {
  const body = [
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [ ] Story closed and moved to Done',
    '- [ ] Timing data flushed to issue',
    '',
    '## Pickup Directive',
  ].join('\n');
  const s = lifecycleItemState({ body, key: 'passed-final-review' });
  assert.deepEqual(s, { sectionPresent: true, labelFound: false, alreadyTicked: false });
});

test('lifecycleItemState: label present and unticked', () => {
  const s = lifecycleItemState({ body: TEMPLATE, key: 'passed-final-review' });
  assert.deepEqual(s, { sectionPresent: true, labelFound: true, alreadyTicked: false });
});

test('lifecycleItemState: label present and already ticked', () => {
  const ticked = tickLifecycleItem(TEMPLATE, 'passed-final-review');
  const s = lifecycleItemState({ body: ticked, key: 'passed-final-review' });
  assert.deepEqual(s, { sectionPresent: true, labelFound: true, alreadyTicked: true });
});

test('lifecycleItemState: unknown key → throws', () => {
  assert.throws(() => lifecycleItemState({ body: TEMPLATE, key: 'nope' }), /unknown lifecycle key/);
});
