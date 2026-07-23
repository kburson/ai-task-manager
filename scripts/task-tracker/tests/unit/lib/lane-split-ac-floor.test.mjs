#!/usr/bin/env node
// @story #934
// AC4 — the AC-verifier floor treats the slow lane and the fast lane exactly as
// it already treats `npm run test:all`: a broad whole-suite command is NOT a
// per-AC demonstrable verifier. `findAcsWithoutVerifierOrInvalidTag` flags an AC
// whose only declared verifier is `npm test`, `npm run test:slow`, or
// `npm run test:all` with reason `test-all-verifier`, and does NOT flag an AC
// carrying a targeted `node --test <file>` verifier.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { findAcsWithoutVerifierOrInvalidTag } from '../../../lib/body-invariants.mjs';

function acBody(verifierCmd) {
  return [
    '## Acceptance Criteria',
    '',
    `- [ ] Something is true <!-- aitm-verified cmd="\`${verifierCmd}\`" -->`,
    '',
    '<!-- aitm-fields: {} -->',
    '',
  ].join('\n');
}

test('an AC whose only verifier is the fast lane is flagged test-all-verifier', () => {
  const offenders = findAcsWithoutVerifierOrInvalidTag(acBody('npm test'));
  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].reason, 'test-all-verifier');
});

test('an AC whose only verifier is the slow lane is flagged test-all-verifier', () => {
  const offenders = findAcsWithoutVerifierOrInvalidTag(acBody('npm run test:slow'));
  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].reason, 'test-all-verifier');
});

test('an AC whose only verifier is the legacy floor is still flagged', () => {
  const offenders = findAcsWithoutVerifierOrInvalidTag(acBody('npm run test:all'));
  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].reason, 'test-all-verifier');
});

test('a targeted node --test AC is NOT flagged', () => {
  const offenders = findAcsWithoutVerifierOrInvalidTag(
    acBody('node --test scripts/task-tracker/tests/unit/lane-split-seed.test.mjs')
  );
  assert.deepEqual(offenders, []);
});
