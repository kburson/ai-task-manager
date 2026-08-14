// @story #246
// Tests for scripts/task-tracker/lib/blocked-marker.mjs — the BLOCKED-marker
// foundation: body-marker parse/add/remove/inspect plus label-arg helpers.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BLOCKED_LABEL,
  parseBlockedBy,
  addBlockedBy,
  removeBlockedBy,
  isBlocked,
  blockedLabelAddArgs,
  blockedLabelRemoveArgs,
} from '../../../../task-tracker/lib/blocked-marker.mjs';

// ── constant ─────────────────────────────────────────────────────────────────

test('BLOCKED_LABEL is "BLOCKED"', () => {
  assert.equal(BLOCKED_LABEL, 'BLOCKED');
});

// ── parseBlockedBy ───────────────────────────────────────────────────────────

test('parseBlockedBy: no marker → []', () => {
  assert.deepEqual(parseBlockedBy('## AC\n- [ ] x\n'), []);
  assert.deepEqual(parseBlockedBy(''), []);
  assert.deepEqual(parseBlockedBy(null), []);
  assert.deepEqual(parseBlockedBy(undefined), []);
});

test('parseBlockedBy: single and multi ref', () => {
  assert.deepEqual(parseBlockedBy('x\n<!-- aitm-blocked-by: #247 -->\n'), [247]);
  assert.deepEqual(parseBlockedBy('x\n<!-- aitm-blocked-by: #247, #248 -->\n'), [247, 248]);
});

test('parseBlockedBy: sorts, dedupes, drops non-positive/garbage', () => {
  assert.deepEqual(parseBlockedBy('<!-- aitm-blocked-by: #248, #247, #247 -->'), [247, 248]);
  assert.deepEqual(parseBlockedBy('<!-- aitm-blocked-by: #5, #0, #-3, #x -->'), [5]);
});

test('parseBlockedBy: empty ref list → []', () => {
  assert.deepEqual(parseBlockedBy('<!-- aitm-blocked-by:  -->'), []);
});

// ── parseBlockedBy: new quoted-attribute grammar (#381 dual-read) ────────────

test('parseBlockedBy: new refs="..." form, single and multi', () => {
  assert.deepEqual(parseBlockedBy('x\n<!-- aitm-blocked-by refs="#247" -->\n'), [247]);
  assert.deepEqual(parseBlockedBy('x\n<!-- aitm-blocked-by refs="#247,#248" -->\n'), [247, 248]);
});

test('parseBlockedBy: new form sorts, dedupes, drops garbage', () => {
  assert.deepEqual(parseBlockedBy('<!-- aitm-blocked-by refs="#248,#247,#247" -->'), [247, 248]);
  assert.deepEqual(parseBlockedBy('<!-- aitm-blocked-by refs="#5,#0,#-3,#x" -->'), [5]);
});

test('parseBlockedBy: new form empty refs → []', () => {
  assert.deepEqual(parseBlockedBy('<!-- aitm-blocked-by refs="" -->'), []);
});

test('parseBlockedBy: legacy and new forms yield identical results', () => {
  const legacy = parseBlockedBy('<!-- aitm-blocked-by: #247, #248 -->');
  const neu = parseBlockedBy('<!-- aitm-blocked-by refs="#247,#248" -->');
  assert.deepEqual(legacy, neu);
});

// ── addBlockedBy: create / merge / idempotency ───────────────────────────────

test('addBlockedBy: creates marker at end of body (new grammar)', () => {
  const out = addBlockedBy('## AC\n- [ ] x', 247);
  assert.match(out, /<!-- aitm-blocked-by refs="#247" -->/);
  // appended after existing content
  assert.ok(out.indexOf('aitm-blocked-by') > out.indexOf('## AC'));
  assert.deepEqual(parseBlockedBy(out), [247]);
});

test('addBlockedBy: creates marker for empty body (new grammar)', () => {
  const out = addBlockedBy('', 9);
  assert.equal(out, '<!-- aitm-blocked-by refs="#9" -->\n');
});

test('addBlockedBy: accepts array, unions/dedupes/sorts', () => {
  const out = addBlockedBy('body\n<!-- aitm-blocked-by: #248 -->\n', [247, 248, 250]);
  assert.deepEqual(parseBlockedBy(out), [247, 248, 250]);
});

test('addBlockedBy: idempotent (re-adding present refs is a no-op)', () => {
  const once = addBlockedBy('body', [247, 248]);
  const twice = addBlockedBy(once, [248, 247]);
  assert.equal(once, twice);
  assert.deepEqual(parseBlockedBy(twice), [247, 248]);
});

test('addBlockedBy: empty refs and no existing marker → body unchanged', () => {
  const body = '## AC\n- [ ] x\n';
  assert.equal(addBlockedBy(body, []), body);
});

// ── removeBlockedBy: shrink / empty cleanup / idempotency ────────────────────

test('removeBlockedBy: removes one ref, keeps rest', () => {
  const out = removeBlockedBy('body\n<!-- aitm-blocked-by: #247, #248 -->\n', 247);
  assert.deepEqual(parseBlockedBy(out), [248]);
  assert.match(out, /<!-- aitm-blocked-by refs="#248" -->/);
});

test('removeBlockedBy: full remove deletes the marker line entirely', () => {
  const body = '## AC\n- [ ] x\n\n<!-- aitm-blocked-by: #247 -->\n';
  const out = removeBlockedBy(body, 247);
  assert.deepEqual(parseBlockedBy(out), []);
  assert.doesNotMatch(out, /aitm-blocked-by/);
});

test('removeBlockedBy: removing absent ref is a no-op', () => {
  const body = 'body\n<!-- aitm-blocked-by: #247 -->\n';
  assert.equal(removeBlockedBy(body, 999), body);
});

test('removeBlockedBy: no marker → body unchanged', () => {
  const body = '## AC\n- [ ] x\n';
  assert.equal(removeBlockedBy(body, 247), body);
});

test('removeBlockedBy: idempotent (removing twice yields same body)', () => {
  const body = 'body\n<!-- aitm-blocked-by: #247, #248 -->\n';
  const once = removeBlockedBy(body, 247);
  const twice = removeBlockedBy(once, 247);
  assert.equal(once, twice);
});

// ── round-trip ───────────────────────────────────────────────────────────────

test('round-trip: add → parse → remove → parse', () => {
  let body = '## Scope\nwork\n';
  body = addBlockedBy(body, [247, 248]);
  assert.deepEqual(parseBlockedBy(body), [247, 248]);
  body = removeBlockedBy(body, 247);
  assert.deepEqual(parseBlockedBy(body), [248]);
  body = removeBlockedBy(body, 248);
  assert.deepEqual(parseBlockedBy(body), []);
  assert.doesNotMatch(body, /aitm-blocked-by/);
});

// ── isBlocked transitions ────────────────────────────────────────────────────

test('isBlocked: transitions', () => {
  let body = '## AC\n';
  assert.equal(isBlocked(body), false);
  body = addBlockedBy(body, 247);
  assert.equal(isBlocked(body), true);
  body = addBlockedBy(body, 248);
  assert.equal(isBlocked(body), true);
  body = removeBlockedBy(body, 247);
  assert.equal(isBlocked(body), true);
  body = removeBlockedBy(body, 248);
  assert.equal(isBlocked(body), false);
});

test('isBlocked: empty marker ref list counts as not blocked', () => {
  assert.equal(isBlocked('<!-- aitm-blocked-by:  -->'), false);
});

// ── label-arg helpers ────────────────────────────────────────────────────────

test('blockedLabelAddArgs / blockedLabelRemoveArgs', () => {
  assert.deepEqual(blockedLabelAddArgs(247), ['issue', 'edit', '247', '--add-label', 'BLOCKED']);
  assert.deepEqual(blockedLabelRemoveArgs(248), [
    'issue',
    'edit',
    '248',
    '--remove-label',
    'BLOCKED',
  ]);
  // stringifies non-string issue numbers
  assert.equal(blockedLabelAddArgs(247)[2], '247');
});
