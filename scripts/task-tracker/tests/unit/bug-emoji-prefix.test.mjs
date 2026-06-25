// @story #507 (updated #545 — bare 🐞 became the bracketed `🐞 [BUG] ` prefix)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ensureBugEmoji, BUG_EMOJI } from '../../../gh/lib/bug-emoji-prefix.mjs';

test('prefixes a bug-labelled title with 🐞 [BUG]', () => {
  assert.equal(ensureBugEmoji('login crashes', ['bug']), '🐞 [BUG] login crashes');
});

test('leaves a non-bug title untouched', () => {
  assert.equal(ensureBugEmoji('add export button', ['enhancement']), 'add export button');
  assert.equal(ensureBugEmoji('add export button', []), 'add export button');
});

test('is idempotent — double application does not double-prefix', () => {
  const once = ensureBugEmoji('login crashes', ['bug']);
  assert.equal(ensureBugEmoji(once, ['bug']), '🐞 [BUG] login crashes');
});

test('migrates an already-🐞 (legacy bare) title to the bracketed prefix', () => {
  assert.equal(ensureBugEmoji('🐞 already', ['bug']), '🐞 [BUG] already');
});

test('matches the bug label case-insensitively', () => {
  assert.equal(ensureBugEmoji('x', ['Bug']), '🐞 [BUG] x');
});

test('exports the canonical emoji constant', () => {
  assert.equal(BUG_EMOJI, '🐞');
});
