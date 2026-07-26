// #931 — bare state-bound action verb (test/review/close) home-state guard.
// Pure logic, no I/O.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  VERB_HOME_STATE,
  VerbHomeStateError,
  assertVerbHomeState,
} from './verb-home-state-guard.mjs';

test('VERB_HOME_STATE covers exactly test/review/close with their real entry states', () => {
  assert.deepEqual(VERB_HOME_STATE, {
    test: ['develop', 'test'],
    review: 'test',
    close: 'review',
  });
});

test('assertVerbHomeState allows test from develop (first entry) or test (re-verify self-loop)', () => {
  assert.doesNotThrow(() =>
    assertVerbHomeState({ verb: 'test', currentState: 'develop', issueNumber: '1' })
  );
  assert.doesNotThrow(() =>
    assertVerbHomeState({ verb: 'test', currentState: 'test', issueNumber: '1' })
  );
});

test('assertVerbHomeState allows review only from test', () => {
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

test('assertVerbHomeState throws when review runs from review instead of test', () => {
  assert.throws(
    () => assertVerbHomeState({ verb: 'review', currentState: 'review', issueNumber: '7' }),
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
