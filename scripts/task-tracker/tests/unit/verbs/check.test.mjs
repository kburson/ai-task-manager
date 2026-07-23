#!/usr/bin/env node
// @story #163
// Unit tests for scripts/task-tracker/verbs/check.mjs `toggleChecklistLine`.
//
// Covers:
//   1. Prefix-collision: label that is a strict prefix of a longer checklist
//      line toggles the exact-match shorter row, never the longer row. This is
//      the bug fix for #163.
//   2. Round-trip: exact-match unchecked line toggles to [x], then back to [ ].
//   3. Regex metacharacters in the label (backticks, parens, brackets, dots,
//      plus signs) are matched literally.
//   4. Missing label returns status 'not-found' without mutating the body.

import { strict as assert } from 'node:assert';
import test from 'node:test';
import { toggleChecklistLine, toggleChecklistLines } from '../../../verbs/check.mjs';

test('prefix-collision: toggling the shorter label does not touch the longer line', () => {
  const body = [
    '## Verification Commands',
    '- [x] `npm test`, `npm run lint`, `npm run format:check`',
    '',
    '## Acceptance Criteria',
    '- [ ] `npm test`',
  ].join('\n');

  const r = toggleChecklistLine(body, '`npm test`');
  assert.equal(r.status, 'toggled');
  assert.equal(r.alreadyChecked, false);
  // Shorter line flipped to [x]; longer line unchanged.
  assert.match(r.body, /^- \[x\] `npm test`$/m);
  assert.match(r.body, /^- \[x\] `npm test`, `npm run lint`, `npm run format:check`$/m);
  // Longer line is NOT toggled to [ ].
  assert.doesNotMatch(r.body, /^- \[ \] `npm test`, `npm run lint`, `npm run format:check`$/m);
});

test('round-trip: toggling an exact-match unchecked line flips to [x] then back to [ ]', () => {
  const body = '## ACs\n- [ ] all good\n';
  const r1 = toggleChecklistLine(body, 'all good');
  assert.equal(r1.status, 'toggled');
  assert.equal(r1.alreadyChecked, false);
  assert.match(r1.body, /^- \[x\] all good$/m);

  const r2 = toggleChecklistLine(r1.body, 'all good');
  assert.equal(r2.status, 'toggled');
  assert.equal(r2.alreadyChecked, true);
  assert.match(r2.body, /^- \[ \] all good$/m);
});

test('regex metacharacters in the label are matched literally', () => {
  const body = ['- [ ] run `foo.bar(baz)` + `qux[0]`', '- [ ] unrelated'].join('\n');
  const r = toggleChecklistLine(body, 'run `foo.bar(baz)` + `qux[0]`');
  assert.equal(r.status, 'toggled');
  assert.match(r.body, /^- \[x\] run `foo\.bar\(baz\)` \+ `qux\[0\]`$/m);
  assert.match(r.body, /^- \[ \] unrelated$/m);
});

test('missing label returns not-found and does not throw', () => {
  const body = '- [ ] something else\n';
  const r = toggleChecklistLine(body, 'nope');
  assert.equal(r.status, 'not-found');
  assert.equal(r.body, undefined);
});

test('batch: multi-label toggle accumulates in one body', () => {
  const body = ['- [ ] a', '- [ ] b', '- [ ] c'].join('\n');
  const { body: updated, results } = toggleChecklistLines(body, ['a', 'c']);
  // Both requested boxes flipped to [x]; the untouched box stays [ ].
  assert.match(updated, /^- \[x\] a$/m);
  assert.match(updated, /^- \[ \] b$/m);
  assert.match(updated, /^- \[x\] c$/m);
  assert.deepEqual(results, [
    { label: 'a', status: 'toggled', alreadyChecked: false },
    { label: 'c', status: 'toggled', alreadyChecked: false },
  ]);
});

test('batch: mixed found / already-checked / not-found reported independently; not-found does not drop the batch', () => {
  const body = ['- [ ] a', '- [x] b'].join('\n');
  const { body: updated, results } = toggleChecklistLines(body, ['a', 'b', 'zzz']);
  // 'a' newly checked; 'b' was checked so it toggles back to unchecked
  // (alreadyChecked:true); 'zzz' is absent but the batch still processes a & b.
  assert.match(updated, /^- \[x\] a$/m);
  assert.match(updated, /^- \[ \] b$/m);
  assert.deepEqual(results, [
    { label: 'a', status: 'toggled', alreadyChecked: false },
    { label: 'b', status: 'toggled', alreadyChecked: true },
    { label: 'zzz', status: 'not-found', alreadyChecked: false },
  ]);
});

test('batch: single label behaves like the legacy single-label toggle', () => {
  const body = '- [ ] only\n';
  const { body: updated, results } = toggleChecklistLines(body, ['only']);
  assert.match(updated, /^- \[x\] only$/m);
  assert.deepEqual(results, [{ label: 'only', status: 'toggled', alreadyChecked: false }]);
});

test('batch: empty label list is a no-op returning the body unchanged', () => {
  const body = '- [ ] a\n';
  const { body: updated, results } = toggleChecklistLines(body, []);
  assert.equal(updated, body);
  assert.deepEqual(results, []);
});

// #411 — after ac-stamp / dod-stamp append hidden evidence markers to a
// checkbox line, the visible (bare) label must still match it, the full-line
// argument (label + markers) must still match it for backward-compat, an
// ambiguous stripped-label collision must tick neither line, and the toggled
// line must retain its trailing markers byte-for-byte.

test('#411 bare visible label ticks a marker-bearing line', () => {
  const body = [
    '## Acceptance Criteria',
    '- [ ] all good <!-- aitm-ac-evidence key="abc12345" cmd="`npm test`" exit="0" sha="deadbeef" ts="2026-06-14T00:00:00Z" -->',
  ].join('\n');
  const r = toggleChecklistLine(body, 'all good');
  assert.equal(r.status, 'toggled');
  assert.equal(r.alreadyChecked, false);
  // Glyph flipped, markers preserved verbatim.
  assert.match(
    r.body,
    /^- \[x\] all good <!-- aitm-ac-evidence key="abc12345" cmd="`npm test`" exit="0" sha="deadbeef" ts="2026-06-14T00:00:00Z" -->$/m
  );
});

test('#411 full-line argument (label + markers) still ticks the line (backward compat)', () => {
  const marker =
    '<!-- aitm-ac-evidence key="abc12345" cmd="`npm test`" exit="0" sha="deadbeef" ts="2026-06-14T00:00:00Z" -->';
  const body = ['## Acceptance Criteria', `- [ ] all good ${marker}`].join('\n');
  // Caller reconstructs the whole post-glyph content (the legacy #233 workaround).
  const r = toggleChecklistLine(body, `all good ${marker}`);
  assert.equal(r.status, 'toggled');
  assert.match(
    r.body,
    new RegExp(`^- \\[x\\] all good ${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm')
  );
});

test('#411 marker-bearing line retains its trailing markers after toggle', () => {
  const marker =
    '<!-- aitm-ac-evidence key="abc12345" cmd="`npm test`" exit="0" sha="deadbeef" ts="2026-06-14T00:00:00Z" -->';
  const body = ['## Acceptance Criteria', `- [ ] all good ${marker}`].join('\n');
  const r = toggleChecklistLine(body, 'all good');
  assert.equal(r.status, 'toggled');
  assert.ok(r.body.includes(marker), 'trailing evidence marker must survive byte-for-byte');
});

test('#411 ambiguous: two lines sharing a stripped label yield ambiguous and tick neither', () => {
  const body = [
    '## Acceptance Criteria',
    '- [ ] shared label <!-- aitm-ac-evidence key="aaaaaaaa" cmd="`x`" exit="0" sha="a" ts="t" -->',
    '- [ ] shared label <!-- aitm-ac-evidence key="bbbbbbbb" cmd="`y`" exit="0" sha="b" ts="t" -->',
  ].join('\n');
  const r = toggleChecklistLine(body, 'shared label');
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.count, 2);
  assert.equal(r.body, undefined);
});

test('#411 batch reports ambiguous independently without dropping other labels', () => {
  const body = [
    '## Acceptance Criteria',
    '- [ ] uniq',
    '- [ ] dup <!-- aitm-ac-evidence key="aaaaaaaa" cmd="`x`" exit="0" sha="a" ts="t" -->',
    '- [ ] dup <!-- aitm-ac-evidence key="bbbbbbbb" cmd="`y`" exit="0" sha="b" ts="t" -->',
  ].join('\n');
  const { body: updated, results } = toggleChecklistLines(body, ['uniq', 'dup']);
  assert.match(updated, /^- \[x\] uniq$/m);
  assert.deepEqual(results, [
    { label: 'uniq', status: 'toggled', alreadyChecked: false },
    { label: 'dup', status: 'ambiguous', alreadyChecked: false, count: 2 },
  ]);
});
