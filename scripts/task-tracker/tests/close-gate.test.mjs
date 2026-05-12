#!/usr/bin/env node
// Unit tests for the shared close-gate predicate (#11).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CLOSE_OWNED_CHECKBOXES, uncheckedPreCloseCheckboxes } from '../close-gate.mjs';

test('returns [] when body has no checkboxes', () => {
  assert.deepEqual(uncheckedPreCloseCheckboxes('## Title\nNo boxes here.'), []);
});

test('returns [] when body has only checked boxes', () => {
  const body = '- [x] done thing\n- [x] another\n';
  assert.deepEqual(uncheckedPreCloseCheckboxes(body), []);
});

test('excludes close-owned labels even when unchecked', () => {
  const owned = [...CLOSE_OWNED_CHECKBOXES];
  const body = owned.map((l) => `- [ ] ${l}`).join('\n');
  assert.deepEqual(uncheckedPreCloseCheckboxes(body), []);
});

test('returns only non-owned unchecked items', () => {
  const body = [
    '- [ ] Real work item',
    '- [x] Already done',
    '- [ ] Issue moved to Done',
    '- [ ] Another real item',
  ].join('\n');
  assert.deepEqual(uncheckedPreCloseCheckboxes(body), [
    '- [ ] Real work item',
    '- [ ] Another real item',
  ]);
});

test('handles null/undefined body without throwing', () => {
  assert.deepEqual(uncheckedPreCloseCheckboxes(null), []);
  assert.deepEqual(uncheckedPreCloseCheckboxes(undefined), []);
});
