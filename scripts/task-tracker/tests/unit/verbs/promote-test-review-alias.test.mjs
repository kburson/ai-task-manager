// @story #881
//
// `promote` delegates a state's forward move to that state's alias verb so the
// alias's gate stack runs. `test` had no alias, so a Test-column promote took
// the bare direct-move branch: the issue landed in Review having never run the
// Agent Review Gate, and the driving agent went straight on to solicit the
// human's `approve` on an agent-unreviewed story (observed on #878, reported as
// `test → review (direct)`).
//
// Delegating `test` to `review` means the Review state's action always runs on
// arrival, whichever path reached the column.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ALIAS_VERB } from '../../../verbs/promote.mjs';

test('test → review delegates to the review verb', () => {
  assert.equal(ALIAS_VERB.test, 'review');
});

test('the other aliases are unchanged', () => {
  assert.equal(ALIAS_VERB.develop, 'test');
  assert.equal(ALIAS_VERB.review, 'close');
});

test('the states with no alias are exactly backlog, on-deck, refine, plan, done', () => {
  const aliased = Object.keys(ALIAS_VERB).sort();
  assert.deepEqual(aliased, ['develop', 'review', 'test']);
});

test('promote reaches the alias branch whenever the source state has one', () => {
  // The delegate/direct fork is a single ternary on `ALIAS_VERB[recorded]`, so
  // membership in the map IS the behavioral difference. Pin the fork's shape so
  // a refactor cannot quietly reintroduce a hardcoded state list beside it.
  const src = readFileSync(
    fileURLToPath(new URL('../../../verbs/promote.mjs', import.meta.url)),
    'utf8'
  );
  assert.match(src, /const aliasVerb = ALIAS_VERB\[recorded\] \|\| null;/);
  assert.match(src, /aliasVerb\s*\n?\s*\?\s*\{/, 'the fork branches on aliasVerb');
});

test('the stale "test has no alias" comment is gone', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../../../verbs/promote.mjs', import.meta.url)),
    'utf8'
  );
  assert.doesNotMatch(
    src,
    /States with no alias \(`backlog`, `refine`, `plan`,\s*\n?\/\/ `test`\)/
  );
});
