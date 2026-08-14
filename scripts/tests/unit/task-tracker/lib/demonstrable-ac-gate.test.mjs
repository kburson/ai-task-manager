// @story #523
// Unit tests for the Demonstrable-AC walker: every Acceptance-Criteria checkbox
// line must carry a single targeted `aitm-verified cmd="…"` verifier OR be
// explicitly tagged `invalid — non-demonstrable`. `npm run test:all` is the
// regression floor, not an AC verifier, so an AC whose only declared command is
// `test:all` is NOT demonstrable and must be flagged.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findAcsWithoutVerifierOrInvalidTag } from '../../../../task-tracker/lib/body-invariants.mjs';

const HEAD = '## Acceptance Criteria\n';
const TAIL = '\n<!-- aitm-fields: {} -->\n';

test('AC with a targeted aitm-verified cmd verifier is not flagged', () => {
  const body =
    HEAD +
    '- [ ] Walker returns offending ACs <!-- aitm-verified cmd="`node --test foo.test.mjs`" -->\n' +
    TAIL;
  assert.deepEqual(findAcsWithoutVerifierOrInvalidTag(body), []);
});

test('AC lacking both a verifier and the invalid tag is flagged with reason no-verifier', () => {
  const body = HEAD + '- [ ] Something just asserted in prose, no verifier\n' + TAIL;
  const offenders = findAcsWithoutVerifierOrInvalidTag(body);
  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].reason, 'no-verifier');
  assert.match(offenders[0].label, /Something just asserted/);
});

test('AC tagged "invalid — non-demonstrable" is excluded from the offender list', () => {
  const body =
    HEAD +
    '- [ ] Subjective quality goal — invalid — non-demonstrable <!-- aitm-non-demonstrable -->\n' +
    TAIL;
  assert.deepEqual(findAcsWithoutVerifierOrInvalidTag(body), []);
});

test('AC whose only verifier is npm run test:all is flagged with reason test-all-verifier', () => {
  const body =
    HEAD +
    '- [ ] Regression-floor masquerade <!-- aitm-verified cmd="`npm run test:all`" -->\n' +
    TAIL;
  const offenders = findAcsWithoutVerifierOrInvalidTag(body);
  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].reason, 'test-all-verifier');
});

test('an AC mixing test:all with a targeted verifier is not flagged', () => {
  const body =
    HEAD +
    '- [ ] Mixed <!-- aitm-verified cmd="`node --test x.test.mjs` `npm run test:all`" -->\n' +
    TAIL;
  assert.deepEqual(findAcsWithoutVerifierOrInvalidTag(body), []);
});

test('checkbox lines outside the Acceptance Criteria section are ignored', () => {
  const body =
    '## Definition of Done\n- [ ] Some DoD item with no verifier\n\n' +
    HEAD +
    '- [ ] Demonstrable <!-- aitm-verified cmd="`node --test ok.test.mjs`" -->\n' +
    TAIL;
  assert.deepEqual(findAcsWithoutVerifierOrInvalidTag(body), []);
});

test('multiple offenders are all reported with their line indices', () => {
  const body =
    HEAD +
    '- [ ] First gap\n' +
    '- [ ] Good one <!-- aitm-verified cmd="`node --test g.test.mjs`" -->\n' +
    '- [ ] Second gap\n' +
    TAIL;
  const offenders = findAcsWithoutVerifierOrInvalidTag(body);
  assert.equal(offenders.length, 2);
  assert.ok(offenders[0].lineIndex < offenders[1].lineIndex);
});
