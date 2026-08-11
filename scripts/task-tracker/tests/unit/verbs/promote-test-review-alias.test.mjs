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

test('the states with no alias are exactly backlog, assigned, refine, plan, done', () => {
  const aliased = Object.keys(ALIAS_VERB).sort();
  assert.deepEqual(aliased, ['develop', 'review', 'test']);
});

test('promote reaches the canonical policy delegate branch whenever the source has one', () => {
  // The delegate/direct fork uses `promotePolicy.delegate`, while `ALIAS_VERB`
  // remains a compatibility export derived from the same policy. Pin the
  // canonical query and fork shape so a refactor cannot quietly reintroduce a
  // hardcoded state list beside it.
  const src = readFileSync(
    fileURLToPath(new URL('../../../verbs/promote.mjs', import.meta.url)),
    'utf8'
  );
  assert.match(src, /const promotePolicy = actionPolicyFor\('promote', recorded\);/);
  assert.match(src, /const aliasVerb = promotePolicy\.delegate \|\| null;/);
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
