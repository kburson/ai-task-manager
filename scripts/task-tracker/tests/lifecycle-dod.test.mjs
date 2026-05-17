#!/usr/bin/env node
// Unit tests for lib/lifecycle-dod.mjs (#138).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  parseLifecycleItems,
  tickLifecycleItem,
  LIFECYCLE_LABELS,
  LIFECYCLE_LABEL_SET,
} from '../lib/lifecycle-dod.mjs';

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

test('LIFECYCLE_LABEL_SET: contains all three labels', () => {
  assert.equal(LIFECYCLE_LABEL_SET.size, 3);
  for (const label of Object.values(LIFECYCLE_LABELS)) {
    assert.ok(LIFECYCLE_LABEL_SET.has(label));
  }
});
