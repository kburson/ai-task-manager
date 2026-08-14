// @story #309
// Tests for scripts/task-tracker/lib/body-version.mjs (#289 / epic #288).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BODY_VERSION_MARKER_RE,
  parseBodyVersion,
  stampBodyVersion,
  bumpBodyVersion,
} from '../../../../task-tracker/lib/body-version.mjs';

// ── parseBodyVersion ─────────────────────────────────────────────────────────

test('parseBodyVersion: absent marker → 0', () => {
  assert.equal(parseBodyVersion('# title\n\nbody text'), 0);
});

test('parseBodyVersion: present legacy colon marker → integer N', () => {
  const body = 'body\n\n<!-- aitm-body-version: 7 -->\n';
  assert.equal(parseBodyVersion(body), 7);
});

test('parseBodyVersion: present new property marker → integer N (#376)', () => {
  const body = 'body\n\n<!-- aitm-body-version version="7" -->\n';
  assert.equal(parseBodyVersion(body), 7);
});

test('parseBodyVersion: tolerates whitespace variants (legacy)', () => {
  assert.equal(parseBodyVersion('<!--  aitm-body-version:   12  -->'), 12);
});

test('parseBodyVersion: tolerates whitespace variants (new property, #376)', () => {
  assert.equal(parseBodyVersion('<!--   aitm-body-version version="12"   -->'), 12);
});

test('parseBodyVersion: first marker wins when both grammars present (#376)', () => {
  // Legacy appears before new → legacy N is returned (first match).
  const both = '<!-- aitm-body-version: 3 -->\n\n<!-- aitm-body-version version="9" -->';
  assert.equal(parseBodyVersion(both), 3);
});

test('parseBodyVersion: null/undefined → 0', () => {
  assert.equal(parseBodyVersion(null), 0);
  assert.equal(parseBodyVersion(undefined), 0);
  assert.equal(parseBodyVersion(''), 0);
});

// ── stampBodyVersion ─────────────────────────────────────────────────────────

test('stampBodyVersion: appends marker at tail when absent (writes new grammar, #376)', () => {
  const out = stampBodyVersion('# title\n\nbody', 1);
  assert.match(out, BODY_VERSION_MARKER_RE);
  assert.equal(parseBodyVersion(out), 1);
  // Should end with the new property-grammar marker on its own line.
  assert.ok(out.trimEnd().endsWith('<!-- aitm-body-version version="1" -->'));
});

test('stampBodyVersion: appends with one leading blank line for separation (#376)', () => {
  const out = stampBodyVersion('body', 3);
  assert.ok(out.includes('body\n\n<!-- aitm-body-version version="3" -->'));
});

test('stampBodyVersion: replaces marker in place, preserves surrounding text (#376)', () => {
  const before = 'head\n\n<!-- aitm-body-version version="4" -->\n\ntail';
  const after = stampBodyVersion(before, 9);
  assert.equal(after, 'head\n\n<!-- aitm-body-version version="9" -->\n\ntail');
});

test('stampBodyVersion: rewrites a legacy colon marker to the new grammar in place (#376)', () => {
  const before = 'head\n\n<!-- aitm-body-version: 4 -->\n\ntail';
  const after = stampBodyVersion(before, 9);
  assert.equal(after, 'head\n\n<!-- aitm-body-version version="9" -->\n\ntail');
  // No residual legacy colon marker remains.
  assert.ok(!/aitm-body-version:\s*\d/.test(after));
});

test('stampBodyVersion: round-trips parse(stamp(x)) === x under the new writer (#376)', () => {
  for (const n of [0, 1, 2, 42, 1000]) {
    assert.equal(parseBodyVersion(stampBodyVersion('body', n)), n);
  }
});

test('stampBodyVersion: rejects non-integer / negative versions', () => {
  assert.throws(() => stampBodyVersion('body', 1.5), TypeError);
  assert.throws(() => stampBodyVersion('body', -1), TypeError);
  assert.throws(() => stampBodyVersion('body', 'x'), TypeError);
});

test('stampBodyVersion: idempotent for same N (stamp twice → equal)', () => {
  const once = stampBodyVersion('body text', 2);
  const twice = stampBodyVersion(once, 2);
  assert.equal(once, twice);
});

// ── bumpBodyVersion ──────────────────────────────────────────────────────────

test('bumpBodyVersion: absent → stamps version 1', () => {
  const out = bumpBodyVersion('plain body');
  assert.equal(parseBodyVersion(out), 1);
});

test('bumpBodyVersion: present N → stamps N+1', () => {
  const before = 'body\n\n<!-- aitm-body-version: 5 -->\n';
  const after = bumpBodyVersion(before);
  assert.equal(parseBodyVersion(after), 6);
});

test('bumpBodyVersion: preserves rest of body', () => {
  const before = 'head text\n\n<!-- aitm-body-version: 10 -->\n\nfooter';
  const after = bumpBodyVersion(before);
  assert.ok(after.includes('head text'));
  assert.ok(after.includes('footer'));
  assert.equal(parseBodyVersion(after), 11);
});
