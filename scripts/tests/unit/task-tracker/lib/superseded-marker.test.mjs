#!/usr/bin/env node
// @story #401
// Unit tests for scripts/task-tracker/lib/superseded-marker.mjs.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  serializeSupersededBy,
  parseSupersededBy,
  addSupersededBy,
} from '../../../../task-tracker/lib/superseded-marker.mjs';

test('serialize: emits key="value" grammar with normalized #ref', () => {
  const m = serializeSupersededBy({ ref: 399, ts: '2026-06-14T00:00:00.000Z' });
  assert.equal(m, '<!-- aitm-superseded-by refs="#399" ts="2026-06-14T00:00:00.000Z" -->');
  // accepts a string ref with or without '#'
  assert.equal(
    serializeSupersededBy({ ref: '#42', ts: 'x' }),
    '<!-- aitm-superseded-by refs="#42" ts="x" -->'
  );
});

test('serialize: rejects a non-numeric ref', () => {
  assert.throws(() => serializeSupersededBy({ ref: 'abc', ts: 'x' }), /invalid issue ref/);
});

test('parse: round-trips ref + ts', () => {
  const m = serializeSupersededBy({ ref: 399, ts: '2026-06-14T00:00:00.000Z' });
  assert.deepEqual(parseSupersededBy(`top\n${m}\nbottom`), {
    ref: '#399',
    ts: '2026-06-14T00:00:00.000Z',
  });
});

test('parse: returns null when absent', () => {
  assert.equal(parseSupersededBy('no marker here'), null);
});

test('add: appends on first write', () => {
  const out = addSupersededBy('body text', { ref: 7, ts: 'T' });
  assert.match(out, /body text/);
  assert.deepEqual(parseSupersededBy(out), { ref: '#7', ts: 'T' });
});

test('add: replaces in place on re-write (stays unique)', () => {
  const first = addSupersededBy('body', { ref: 7, ts: 'T1' });
  const second = addSupersededBy(first, { ref: 9, ts: 'T2' });
  const matches = second.match(/aitm-superseded-by/g) || [];
  assert.equal(matches.length, 1);
  assert.deepEqual(parseSupersededBy(second), { ref: '#9', ts: 'T2' });
});
