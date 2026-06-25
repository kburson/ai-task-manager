// @story #545 — kind/epic title-prefix helper (AC1, AC4, AC5).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureKindPrefix,
  ensureEpicPrefix,
  KIND_PREFIXES,
  EPIC_PREFIX,
} from '../../../gh/lib/kind-prefix.mjs';

test('maps each kind label to its bracketed prefix (AC1)', () => {
  assert.equal(ensureKindPrefix('login crashes', ['bug']), '🐞 [BUG] login crashes');
  assert.equal(ensureKindPrefix('export fails', ['beta-defect']), '🐞 [Defect] export fails');
  assert.equal(ensureKindPrefix('dark mode', ['beta-feature']), '🙏 [Feature Request] dark mode');
  assert.equal(ensureKindPrefix('what if', ['idea']), '🤓 [Idea] what if');
});

test('matches the literal map constants (AC1)', () => {
  assert.equal(ensureKindPrefix('x', ['bug']), `${KIND_PREFIXES.bug}x`);
  assert.equal(ensureKindPrefix('x', ['idea']), `${KIND_PREFIXES.idea}x`);
});

test('leaves a title without a kind label untouched', () => {
  assert.equal(ensureKindPrefix('add export button', ['enhancement']), 'add export button');
  assert.equal(ensureKindPrefix('add export button', []), 'add export button');
});

test('matches kind labels case-insensitively', () => {
  assert.equal(ensureKindPrefix('x', ['Bug']), '🐞 [BUG] x');
  assert.equal(ensureKindPrefix('x', ['Beta-Feature']), '🙏 [Feature Request] x');
});

test('honors KIND_PREFIXES key order as precedence (first match wins)', () => {
  // bug precedes beta-feature in the map → bug prefix is chosen.
  assert.equal(ensureKindPrefix('x', ['beta-feature', 'bug']), '🐞 [BUG] x');
});

test('is idempotent — re-applying does not double-stamp (AC5)', () => {
  const once = ensureKindPrefix('login crashes', ['bug']);
  assert.equal(ensureKindPrefix(once, ['bug']), '🐞 [BUG] login crashes');
});

test('re-stamps when the kind changes, stripping the prior prefix (AC5)', () => {
  const asBug = ensureKindPrefix('thing', ['bug']);
  assert.equal(ensureKindPrefix(asBug, ['idea']), '🤓 [Idea] thing');
});

test('migrates the legacy bare-🐞 prefix without doubling (AC5)', () => {
  assert.equal(ensureKindPrefix('🐞 already', ['bug']), '🐞 [BUG] already');
});

test('ensureEpicPrefix stamps the ZWJ epic glyph (AC4)', () => {
  assert.equal(ensureEpicPrefix('platform work'), `${EPIC_PREFIX}platform work`);
  assert.ok(EPIC_PREFIX.startsWith('🧑‍🧒‍🧒'));
});

test('ensureEpicPrefix is idempotent across the ZWJ sequence (AC4, AC5)', () => {
  const once = ensureEpicPrefix('platform work');
  assert.equal(ensureEpicPrefix(once), `${EPIC_PREFIX}platform work`);
});

test('ensureEpicPrefix replaces the legacy EPIC: convention (AC4)', () => {
  assert.equal(ensureEpicPrefix('EPIC: platform work'), `${EPIC_PREFIX}platform work`);
});

test('epic and kind prefixes interchange cleanly (AC5)', () => {
  const asEpic = ensureEpicPrefix('thing');
  assert.equal(ensureKindPrefix(asEpic, ['bug']), '🐞 [BUG] thing');
  const asBug = ensureKindPrefix('thing', ['bug']);
  assert.equal(ensureEpicPrefix(asBug), `${EPIC_PREFIX}thing`);
});
