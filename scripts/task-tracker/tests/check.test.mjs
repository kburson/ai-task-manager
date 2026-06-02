#!/usr/bin/env node
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
import { toggleChecklistLine, toggleChecklistLines } from '../verbs/check.mjs';

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
