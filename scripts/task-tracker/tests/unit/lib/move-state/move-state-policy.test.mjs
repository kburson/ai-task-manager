#!/usr/bin/env node
// @story #848 AC7
//
// `refusalVerbHint(targetState)` NAMES a verb to reach for. That naming is
// only trustworthy if the named verb can actually perform the move — before
// #848, `refusalVerbHint('backlog')` named `/task demote`, but `demote`'s
// `DEMOTE_TARGET` is hardcoded to `develop` and its `LEGAL_FROM` never
// includes any state whose backward target is `backlog`; the hint was a
// dead end.
//
// This test asserts the agreement directly, by reading each verb module's
// exported `LEGAL_FROM`/`*_TARGET` constants (no shelling out, no live
// board): for every state in `BACKWARD_TARGETS`, the verb `refusalVerbHint`
// names for that state must (a) declare that exact state as its target, and
// (b) have a non-empty `LEGAL_FROM` whose every member's backward targets
// (per `state-machine.mjs`) include that state. Before `park.mjs` existed,
// this failed red — there was no verb reachable from `/task park` at all.

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { refusalVerbHint, BACKWARD_TARGETS } from '../../../../lib/move-state/policy.mjs';
import { backwardTargets } from '../../../../state-machine.mjs';

// Maps a `/task <verb>` hint string to the module declaring its
// target/legal-source constants. Extend this map alongside any future
// backward-target verb.
const VERB_MODULES = {
  park: () => import('../../../../verbs/park.mjs'),
  demote: () => import('../../../../verbs/demote.mjs'),
};

function verbNameFromHint(hint) {
  const m = String(hint).match(/^\/task (\S+)/);
  return m ? m[1] : null;
}

test('BACKWARD_TARGETS is non-empty (sanity — otherwise this test vacuously passes)', () => {
  assert.ok(BACKWARD_TARGETS.size > 0);
});

test('every BACKWARD_TARGETS state has a refusalVerbHint verb that can actually declare it legal', async () => {
  for (const target of BACKWARD_TARGETS) {
    const hint = refusalVerbHint(target);
    const verbName = verbNameFromHint(hint);
    assert.ok(verbName, `refusalVerbHint("${target}") returned an unparseable hint: "${hint}"`);

    const loader = VERB_MODULES[verbName];
    assert.ok(
      loader,
      `refusalVerbHint("${target}") names "/task ${verbName}", but no verb module is ` +
        `registered in VERB_MODULES for this test to check — add it to VERB_MODULES`
    );

    const mod = await loader();
    // Every backward-target verb exports its target as `<NAME>_TARGET` and its
    // legal sources as `LEGAL_FROM`. park.mjs → PARK_TARGET; demote.mjs → DEMOTE_TARGET.
    const verbTarget = mod.PARK_TARGET ?? mod.DEMOTE_TARGET;
    assert.equal(
      verbTarget,
      target,
      `"/task ${verbName}" (named by refusalVerbHint("${target}")) declares its own target ` +
        `as "${verbTarget}", not "${target}" — the hint points at a verb that can't reach ` +
        `this state`
    );

    assert.ok(
      mod.LEGAL_FROM instanceof Set && mod.LEGAL_FROM.size > 0,
      `"/task ${verbName}" must export a non-empty LEGAL_FROM Set`
    );
    for (const from of mod.LEGAL_FROM) {
      assert.ok(
        backwardTargets(from).includes(target),
        `"/task ${verbName}" declares ${from} as a legal source, but state-machine.mjs's ` +
          `BACKWARD map does not list "${target}" among ${from}'s backward targets — ` +
          `the verb and the matrix have drifted apart`
      );
    }
  }
});

test('demote is unaffected by #848: still hardcoded to develop, from test/review only', async () => {
  const { DEMOTE_TARGET, LEGAL_FROM } = await import('../../../../verbs/demote.mjs');
  assert.equal(DEMOTE_TARGET, 'develop');
  assert.deepEqual([...LEGAL_FROM].sort(), ['review', 'test']);
});
