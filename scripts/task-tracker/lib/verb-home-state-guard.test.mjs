// #931 — bare state-bound action verb (test/review/close) home-state guard.
// Pure logic, no I/O.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  VERB_HOME_STATE,
  VerbHomeStateError,
  assertVerbHomeState,
} from './verb-home-state-guard.mjs';

const GUARD_SOURCE_PATH = fileURLToPath(new URL('./verb-home-state-guard.mjs', import.meta.url));

test('VERB_HOME_STATE covers exactly test/review/close with their real entry states', () => {
  assert.deepEqual(VERB_HOME_STATE, {
    test: ['develop', 'test'],
    review: ['test', 'review'],
    close: 'review',
  });
});

// #997 — restores the review-state self-loop #931 regressed: review.mjs's
// gate-pass branch is only reachable by re-running the review verb while the
// issue is still in Review, so that re-run must not be refused.
test('assertVerbHomeState allows review to re-run in place from review (self-loop)', () => {
  assert.doesNotThrow(() =>
    assertVerbHomeState({ verb: 'review', currentState: 'review', issueNumber: '7' })
  );
});

test('guard source no longer asserts there is no review-side self-loop', () => {
  const src = readFileSync(GUARD_SOURCE_PATH, 'utf8');
  assert.equal(/no review-side self-loop/i.test(src), false);
});

test('assertVerbHomeState allows test from develop (first entry) or test (re-verify self-loop)', () => {
  assert.doesNotThrow(() =>
    assertVerbHomeState({ verb: 'test', currentState: 'develop', issueNumber: '1' })
  );
  assert.doesNotThrow(() =>
    assertVerbHomeState({ verb: 'test', currentState: 'test', issueNumber: '1' })
  );
});

test('assertVerbHomeState allows review from test', () => {
  assert.doesNotThrow(() =>
    assertVerbHomeState({ verb: 'review', currentState: 'test', issueNumber: '1' })
  );
});

test("assertVerbHomeState allows close only from review (close is review's exit action)", () => {
  assert.doesNotThrow(() =>
    assertVerbHomeState({ verb: 'close', currentState: 'review', issueNumber: '1' })
  );
});

test('assertVerbHomeState throws VerbHomeStateError on a wrong-state run', () => {
  assert.throws(
    () => assertVerbHomeState({ verb: 'test', currentState: 'review', issueNumber: '42' }),
    (err) => {
      assert.ok(err instanceof VerbHomeStateError);
      assert.equal(err.verb, 'test');
      assert.equal(err.currentState, 'review');
      assert.deepEqual(err.homeState, ['develop', 'test']);
      assert.equal(err.issueNumber, '42');
      assert.match(err.message, /#42/);
      assert.match(err.message, /`review`/);
      assert.match(err.message, /`develop` or `test`/);
      assert.match(err.message, /\/task promote #42/);
      return true;
    }
  );
});

test('assertVerbHomeState throws when review runs from an unrelated wrong state', () => {
  assert.throws(
    () => assertVerbHomeState({ verb: 'review', currentState: 'develop', issueNumber: '7' }),
    VerbHomeStateError
  );
});

test('assertVerbHomeState throws when close runs from close instead of review', () => {
  assert.throws(
    () => assertVerbHomeState({ verb: 'close', currentState: 'close', issueNumber: '7' }),
    VerbHomeStateError
  );
});

test('assertVerbHomeState is a no-op when currentState is null (no recorded marker yet)', () => {
  assert.doesNotThrow(() =>
    assertVerbHomeState({ verb: 'test', currentState: null, issueNumber: '1' })
  );
});

test('assertVerbHomeState is a no-op for a verb not in the map', () => {
  assert.doesNotThrow(() =>
    assertVerbHomeState({ verb: 'refine', currentState: 'backlog', issueNumber: '1' })
  );
  assert.doesNotThrow(() =>
    assertVerbHomeState({ verb: 'plan', currentState: 'develop', issueNumber: '1' })
  );
});
