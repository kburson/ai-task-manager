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
import { toggleChecklistLine } from '../verbs/check.mjs';

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
