// @story #891
// NON_DEMONSTRABLE_TAG_RE is anchored to the `<!-- aitm-non-demonstrable -->`
// marker, not a plain-prose substring. Before #891 the regex was
// `/invalid\s+[—-]+\s+non-demonstrable/i`, tested against the AC's whole
// visible label — so prose that merely *discussed* the tag (rather than
// genuinely bearing it) satisfied the opt-out. These tests lock in the fix:
// the marker form opts out, the legacy prose form alone no longer does.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NON_DEMONSTRABLE_TAG_RE,
  findAcsWithoutVerifierOrInvalidTag,
} from '../../../lib/body-invariants.mjs';

const HEAD = '## Acceptance Criteria\n\n';
const TAIL = '\n\n## Verification Commands\n\n- `node --test foo.test.mjs`\n';

test('NON_DEMONSTRABLE_TAG_RE matches the canonical marker', () => {
  assert.equal(NON_DEMONSTRABLE_TAG_RE.test('<!-- aitm-non-demonstrable -->'), true);
  assert.equal(NON_DEMONSTRABLE_TAG_RE.test('foo <!--aitm-non-demonstrable-->'), true);
});

test('NON_DEMONSTRABLE_TAG_RE no longer matches bare prose (the #891 bug)', () => {
  assert.equal(NON_DEMONSTRABLE_TAG_RE.test('invalid — non-demonstrable'), false);
  assert.equal(NON_DEMONSTRABLE_TAG_RE.test('tagged `invalid — non-demonstrable`'), false);
});

test('NON_DEMONSTRABLE_TAG_RE does not fire on prose that merely discusses the tag', () => {
  // This is the exact false-positive #891 was filed for: an AC whose label
  // text quotes/describes the opt-out concept without ever carrying the
  // marker must NOT be treated as opted out.
  const discussingProse =
    'Document that reviewers may write invalid — non-demonstrable for subjective goals';
  assert.equal(NON_DEMONSTRABLE_TAG_RE.test(discussingProse), false);
});

test('findAcsWithoutVerifierOrInvalidTag flags a legacy-prose-only AC as an offender', () => {
  const body = HEAD + '- [ ] Subjective quality goal — invalid — non-demonstrable' + TAIL;
  const offenders = findAcsWithoutVerifierOrInvalidTag(body);
  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].reason, 'no-verifier');
});

test('findAcsWithoutVerifierOrInvalidTag honors the marker as a genuine opt-out', () => {
  const body = HEAD + '- [ ] Subjective quality goal <!-- aitm-non-demonstrable -->' + TAIL;
  assert.equal(findAcsWithoutVerifierOrInvalidTag(body).length, 0);
});

test('a real verifier declaration is still demonstrable regardless of the marker change', () => {
  const body =
    HEAD + '- [ ] Verified thing <!-- aitm-verified cmd="`node --test foo.test.mjs`" -->' + TAIL;
  assert.equal(findAcsWithoutVerifierOrInvalidTag(body).length, 0);
});
