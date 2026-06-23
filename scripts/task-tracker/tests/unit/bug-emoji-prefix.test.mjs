// @story #507
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ensureBugEmoji, BUG_EMOJI } from '../../../gh/lib/bug-emoji-prefix.mjs';

test('prefixes a bug-labelled title with 🐞', () => {
  assert.equal(ensureBugEmoji('login crashes', ['bug']), '🐞 login crashes');
});

test('leaves a non-bug title untouched', () => {
  assert.equal(ensureBugEmoji('add export button', ['enhancement']), 'add export button');
  assert.equal(ensureBugEmoji('add export button', []), 'add export button');
});

test('is idempotent — double application does not double-prefix', () => {
  const once = ensureBugEmoji('login crashes', ['bug']);
  assert.equal(ensureBugEmoji(once, ['bug']), '🐞 login crashes');
});

test('treats an already-🐞 title as already-prefixed', () => {
  assert.equal(ensureBugEmoji('🐞 already', ['bug']), '🐞 already');
});

test('matches the bug label case-insensitively', () => {
  assert.equal(ensureBugEmoji('x', ['Bug']), '🐞 x');
});

test('exports the canonical emoji constant', () => {
  assert.equal(BUG_EMOJI, '🐞');
});
